import "server-only";
import { z } from "zod";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { ToolsEventData } from "@langchain/langgraph";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { createCoachHarness } from "./harness";
import { bootstrapMessages, closeIncompleteCalls, projectionMessages, stableUuid } from "./durable-messages";
import { checkExecution, ownedTransaction, scopedSaver, type DurableStore, type DurableTurn, type OwnedScope } from "./durable-store";
import { agentTraceMetadata } from "./policy";
import type { AgentStreamEvent } from "./stream";

type Admission = Awaited<ReturnType<DurableStore["admit"]>>;
const nativeState = z.object({ messages: z.array(z.custom<BaseMessage>(value =>
  typeof value === "object" && value !== null && "getType" in value && typeof value.getType === "function")) });

/** Reads only. Native intermediate checkpoints retain unprojected messages through compaction. */
export async function recoverDurableTurn(store: DurableStore, scope: OwnedScope, turn: DurableTurn) {
  const saver = scopedSaver(store.pool, { owner: scope.owner, thread: scope.thread });
  const config = { configurable: { thread_id: scope.thread } };
  const latest = await saver.getTuple(config);
  if (!latest || latest.metadata?.source !== "loop") return null;
  const readOnly = createCoachHarness({ tools: [], checkpointer: saver, apiKey: "checkpoint-reader",
    fetch: async () => { throw new Error("Recovery must not call a model"); } });
  const state = await readOnly.agent.graph.getState(config);
  if (state.next.length) return null;
  const snapshots = [];
  let ownsInput = false;
  for await (const tuple of saver.list(config)) {
    if (tuple.config.configurable?.checkpoint_ns) continue;
    const messages = nativeState.parse(tuple.checkpoint.channel_values).messages;
    const hasInput = messages.some(message => message.id === `ui:${turn.input_message_id}`);
    if (ownsInput && !hasInput && tuple.metadata?.source === "input") break;
    if (hasInput) ownsInput = true;
    snapshots.push(messages);
  }
  if (!ownsInput) return null;
  const projected = new Map<string, ReturnType<typeof projectionMessages>[number]>();
  for (const messages of snapshots.reverse()) for (const row of projectionMessages(scope.thread, messages)) projected.set(row.id, row);
  return store.project(scope, turn, latest.checkpoint.id, [...projected.values()]);
}

export async function executeDurableTurn(input: {
  store: DurableStore;
  admission: Admission;
  systemPrompt: string;
  tools: StructuredToolInterface[];
  signal?: AbortSignal;
  onEvent: (event: AgentStreamEvent) => void;
  harness?: typeof createCoachHarness;
}) {
  const { store, admission, onEvent } = input;
  const { scope, turn } = admission;
  const saver = scopedSaver(store.pool, scope);
  const prepared = (input.harness ?? createCoachHarness)({ tools: input.tools, systemPrompt: input.systemPrompt, checkpointer: saver, signal: input.signal,
    beforeTool: () => ownedTransaction(store.pool, scope, client => checkExecution(client, scope)) });
  const config = { configurable: { thread_id: scope.thread }, metadata: { ...agentTraceMetadata(), thread_id: scope.thread }, durability: "sync" as const };
  try {
    if (admission.recovered) {
      const completed = await recoverDurableTurn(store, scope, turn);
      if (completed) return completed;
    }
    if (admission.binding.bootstrap_version === null) {
      const initialized = await prepared.agent.graph.updateState(config, { messages: bootstrapMessages(admission.history) });
      const checkpointId = z.string().parse(initialized.configurable?.checkpoint_id);
      await store.bootstrap(scope, checkpointId);
    }
    // New input starts execution from the current state; never resume pending tool tasks.
    const state = await prepared.agent.graph.getState(config);
    const messages = nativeState.parse(state.values).messages;
    const repaired = closeIncompleteCalls(messages);
    const existing = new Set(messages);
    const repairs = repaired.filter(message => !existing.has(message));
    const user = new HumanMessage({ id: `ui:${admission.userMessage.id}`,
      content: bootstrapMessages([admission.userMessage]).at(0)?.content ?? " " });
    const run = await prepared.agent.streamEvents({ messages: [...repairs, user] }, { ...config, version: "v3" });
    const results = await Promise.allSettled([
      run.output,
      (async () => { for await (const message of run.messages) for await (const token of message.text) if (token) onEvent({ type: "text", text: token }); })(),
      (async () => {
        for await (const event of run) {
          if (event.method !== "tools" || event.params.namespace.length > run.path.length + 1) continue;
          const data = event.params.data as ToolsEventData;
          if (data.event === "tool-started") onEvent({ type: "tool-start", callId: data.tool_call_id, name: data.tool_name });
          else if (data.event === "tool-finished" || data.event === "tool-error") onEvent({ type: "tool-end", callId: data.tool_call_id,
            outcome: data.event === "tool-error" ? "error" : "complete" });
        }
      })(),
      (async () => { for await (const call of run.toolCalls) void call.output.catch(() => {}); })(),
    ]);
    for (const result of results) if (result.status === "rejected") throw result.reason;
    const saved = await recoverDurableTurn(store, scope, turn);
    if (!saved) throw new Error("Coach response is saved incompletely. Reopen this chat to recover.");
    return saved;
  } catch (error) {
    await store.interrupt(scope, turn.request_id, prepared.signal.aborted ? "interrupted" : "failed").catch(() => {});
    throw error;
  }
}

export function durableProgramIdentity(scope: OwnedScope, requestId: string) {
  return stableUuid(`draft:${scope.owner}:${scope.thread}:${requestId}`);
}
