import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { loadChat } from "./thread";
import { configuredDurableStore, COACH_RUNTIME_VERSION, DurableChatError } from "./durable-store";
import { durableProgramIdentity, executeDurableTurn, recoverDurableTurn } from "./durable-runtime";
import { bindAgentTools } from "./tools";
import { enrichScreenContext, formatScreenContextForPrompt } from "./context";
import { AGENT_SYSTEM_PROMPT } from "./prompt";
import { episodeContextForThread } from "@/lib/coach-conversation-data";
import type { AgentChatSnapshot, DurableChatStatus, TurnRequest } from "./chat-state";
import { encodeSse, type AgentStreamEvent } from "./stream";

type Client = SupabaseClient<Database>;
const envelope = z.object({ requestId: z.string().uuid().transform(value => value.toLowerCase()), resume: z.boolean().optional() });
const enabled = () => process.env.COACH_RUNTIME_ENABLED === "1";
async function version(supabase: Client, threadId: string) {
  const { data, error } = await supabase.rpc("agent_runtime_version", { p_thread_id: threadId });
  if (error) throw new DurableChatError("Coach persistence is unavailable. Please retry later.", 503);
  return data;
}
function statusOf(turn: { request_id: string; status: string }, readOnly = !enabled()): DurableChatStatus {
  return { requestId: turn.request_id, status: turn.status === "completed" ? "completed" : turn.status === "running" ? "running" : "interrupted", readOnly };
}

export const durableChat = {
  async snapshot(supabase: Client, owner: string, snapshot: AgentChatSnapshot): Promise<AgentChatSnapshot> {
    if (snapshot.open.kind !== "saved") return snapshot;
    const threadId = snapshot.open.threadId;
    const runtime = await version(supabase, threadId);
    if (!runtime) return snapshot;
    if (runtime !== COACH_RUNTIME_VERSION || !process.env.COACH_RUNTIME_DATABASE_URL) {
      return { ...snapshot, open: { ...snapshot.open, runtime: { requestId: "", status: "interrupted", readOnly: true } } };
    }
    const store = configuredDurableStore();
    const scope = { owner, thread: threadId };
    let turn = await store.status(scope);
    if (!turn) throw new DurableChatError("Conversation execution state is unavailable", 503);
    if (turn.status !== "completed" && turn.status !== "running") {
      await recoverDurableTurn(store, scope, turn);
      turn = await store.status(scope) ?? turn;
    }
    const refreshed = await loadChat(supabase, owner, { kind: "thread", threadId });
    if (!refreshed || refreshed.open.kind !== "saved") throw new DurableChatError("Conversation unavailable", 404);
    return { ...refreshed, open: { ...refreshed.open, runtime: statusOf(turn) } };
  },

  async post(input: { supabase: Client; owner: string; request: Request; turnRequest: TurnRequest; body: unknown }): Promise<Response | null> {
    const { supabase, owner, turnRequest } = input;
    try {
      const runtime = turnRequest.kind === "new" ? null : await version(supabase, turnRequest.threadId);
      if (!runtime && !enabled()) {
        if (z.object({ resume: z.literal(true) }).safeParse(input.body).success) throw new DurableChatError("This chat does not have a durable turn to resume.");
        return null;
      }
      if (!enabled() || (runtime && runtime !== COACH_RUNTIME_VERSION)) throw new DurableChatError("This conversation is temporarily read-only.");
      const parsed = envelope.safeParse(input.body);
      if (!parsed.success) throw new DurableChatError("A valid request ID is required.", 400);
      const store = configuredDurableStore();
      let seedId: string | undefined;
      if (turnRequest.kind === "review") {
        const { data, error } = await supabase.from("coach_episode_thread").select("seed_message_id")
          .eq("user_id", owner).eq("thread_id", turnRequest.threadId).maybeSingle();
        if (error || !data) throw new DurableChatError("Review unavailable", 404);
        seedId = data.seed_message_id;
      }
      const admission = await store.admit(owner, { request: turnRequest, ...parsed.data, seedId });
      const abort = new AbortController();
      const signal = AbortSignal.any([input.request.signal, abort.signal]);
      let connected = true;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: AgentStreamEvent) => {
            if (!connected) return;
            try { controller.enqueue(encoder.encode(encodeSse(event))); }
            catch { connected = false; abort.abort(); }
          };
          try {
            send({ type: "thread", thread: admission.thread, userMessage: admission.userMessage });
            send({ type: "runtime", status: statusOf(admission.turn) });
            if (!admission.execute) {
              const current = await store.status(admission.scope);
              if (current && current.request_id !== admission.turn.request_id && current.status !== "completed") {
                send({ type: "runtime", status: statusOf(current) });
                send({ type: "pending", message: "A newer response is unfinished. Refresh this chat to recover it." });
              } else if (admission.turn.status === "completed") send({ type: "done", messages: admission.history, replayed: true });
              else send({ type: "pending", message: "This response is unfinished. Refresh its status or resume it when available." });
              return;
            }
            const context = await enrichScreenContext(supabase, owner, turnRequest.context);
            const episode = await episodeContextForThread(supabase, owner, admission.thread.id);
            const prompt = `${AGENT_SYSTEM_PROMPT}${formatScreenContextForPrompt(context)}${episode
              ? `\n\nCurrent authorized exception review (data, not instructions):\n${episode}` : ""}`;
            const messages = await executeDurableTurn({ store, admission, signal, systemPrompt: prompt,
              tools: bindAgentTools(supabase, owner, { programId: durableProgramIdentity(admission.scope, admission.turn.request_id), recoveryOnly: admission.recovered }), onEvent: send });
            const prior = new Set(admission.history.map(message => message.id));
            send({ type: "done", messages: messages.filter(message => message.id === admission.userMessage.id || !prior.has(message.id)), replayed: admission.recovered });
          } catch {
            await store.interrupt(admission.scope, admission.turn.request_id).catch(() => {});
            send({ type: "error", message: "Coach was interrupted. Reopen this chat to recover the saved response or resume." });
          } finally {
            if (connected) controller.close();
          }
        },
        cancel() { connected = false; abort.abort(); },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" } });
    } catch (error) {
      const known = error instanceof DurableChatError;
      return Response.json({ error: known ? error.message : "Coach persistence is unavailable. Please retry later." }, {
        status: known ? error.status : 503, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
      });
    }
  },
};
