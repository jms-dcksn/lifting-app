import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { tool } from "langchain";
import { z } from "zod";
import { Client } from "langsmith";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createCoachHarness } from "./harness";
import { AGENT_SYSTEM_PROMPT } from "./prompt";
import { bindAgentTools } from "./tools";

function provider(replies: Array<string | { name: string; args: Record<string, unknown> }>, includeUsage = true) {
  const requests: Array<Record<string, unknown>> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    const reply = replies.shift();
    if (!reply) throw Error(`Unexpected ${body.stream ? "stream" : "summary"} call ${requests.length}`);
    const message = typeof reply === "string" ? { content: reply } : {
      tool_calls: [{ index: 0, id: "call-1", type: "function", function: { name: reply.name, arguments: JSON.stringify(reply.args) } }],
    };
    const usage = includeUsage ? { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } : undefined;
    if (!body.stream) return Response.json({ id: "fixture", object: "chat.completion", created: 0,
      choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: "stop" }], usage });
    const chunks = [
      { choices: [{ index: 0, delta: { role: "assistant", ...message }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage },
    ].map((chunk) => ({ id: "fixture", object: "chat.completion.chunk", created: 0, ...chunk }));
    return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } });
  });
  return { fetch, requests };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("gated Coach harness", () => {
  it("continues across model calls without usage reports and caps each response independently", async () => {
    const source = provider([{ name: "evidence", args: {} }, "Answer."], false);
    const evidence = tool(async () => "Evidence", { name: "evidence", description: "Read evidence", schema: z.object({}) });
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [evidence] });
    await agent.invoke({ messages: [new HumanMessage("Inspect")] });
    expect(source.requests).toHaveLength(2);
    for (const request of source.requests) expect(request.max_completion_tokens ?? request.max_tokens).toBe(4000);
  });
  it("runs registered domain tools, preserves confirm-only actions, and transports real SDK traces", async () => {
    const databaseFetch = vi.fn<typeof globalThis.fetch>(async () => { throw Error("No database call expected"); });
    const supabase = createClient<Database>("https://fixture.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: databaseFetch },
    });
    const tools = bindAgentTools(supabase, "owned-fixture");
    const traces: string[] = [];
    const client = new Client({ apiKey: "fixture", apiUrl: "https://fixture.invalid", autoBatchTracing: false,
      fetchImplementation: async (_url, init) => {
        traces.push(init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : String(init?.body ?? ""));
        return Response.json({});
      } });
    for (const request of [
      { name: "calculateE1rm", args: { weight: 100, reps: 5, rir: 2, unit: "kg", loadConvention: "total_external" }, expected: "estimatedOneRepMax" },
      { name: "startNextWorkout", args: {}, expected: "confirm" },
    ]) {
      const source = provider([request, "Grounded response."]);
      const prepared = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools });
      await prepared.agent.invoke({ messages: [new HumanMessage("Inspect this")] }, {
        metadata: { thread_id: "owned-thread", app: "lifting-app", source: "experiment" },
        callbacks: [new LangChainTracer({ client, projectName: "offline-fixture" })],
      });
      expect(JSON.stringify(source.requests[1]?.messages)).toContain(request.expected);
    }
    await awaitAllCallbacks();
    await client.awaitPendingTraceBatches();
    expect(databaseFetch).not.toHaveBeenCalled();
    expect(traces.join("\n")).toContain("owned-thread");
    expect(traces.join("\n")).toContain("lifting-app");
    expect(traces.join("\n")).toContain("startNextWorkout");
  });

  it("keeps Coach instructions and actual domain tools without delegation, shell or write tools", async () => {
    const { fetch, requests } = provider([{ name: "fixtureEvidence", args: {} }, "Grounded answer."]);
    const evidence = tool(async () => "owned fixture evidence", { name: "fixtureEvidence", description: "Reads evidence", schema: z.object({}) });
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch, tools: [evidence] });
    const run = await agent.streamEvents({ messages: [new HumanMessage("Inspect")] }, { version: "v3", metadata: { thread_id: "fixture" } });
    const text: string[] = [];
    const events: string[] = [];
    await Promise.all([
      (async () => { for await (const entry of run.messages) for await (const token of entry.text) text.push(token); })(),
      (async () => { for await (const event of run) if (event.method === "tools") events.push(z.object({ event: z.string() }).parse(event.params.data).event); })(),
      (async () => { for await (const call of run.toolCalls) void call.output.catch(() => {}); })(),
      run.output,
    ]);
    expect(text.join("")).toBe("Grounded answer.");
    expect(events).toEqual(["tool-started", "tool-finished"]);
    expect(JSON.stringify(requests[0]?.messages)).toContain(JSON.stringify(AGENT_SYSTEM_PROMPT).slice(1, -1));
    const names = z.array(z.object({ function: z.object({ name: z.string() }) })).parse(requests[0]?.tools).map(t => t.function.name);
    expect(names).toContain("fixtureEvidence");
    expect(names).toContain("read_file");
    for (const name of ["task", "execute", "write_todos", "write_file", "edit_file", "delete"]) expect(names).not.toContain(name);
    expect(JSON.stringify(requests[0]?.messages)).not.toMatch(/general-purpose|subagent_usage|write_todos/);
    expect(requests).toHaveLength(2);
  });

  it("uses native summarization defaults, includes history and restores files through a fresh harness", async () => {
    vi.stubEnv("AGENT_MODEL", "fixture/unknown-model");
    const saver = new MemorySaver();
    const first = provider(["Summary of earlier messages.", "Current answer."]);
    const prepared = createCoachHarness({ apiKey: "fixture", fetch: first.fetch, tools: [], checkpointer: saver });
    const history = Array.from({ length: 8 }, (_, index) => new HumanMessage(`Earlier question ${index}: ${"x".repeat(100_000)}`));
    const config = { configurable: { thread_id: "summary" } };
    const output = await prepared.agent.invoke({ messages: history }, config);
    expect(first.requests).toHaveLength(2);
    for (const request of first.requests) expect(request.max_completion_tokens ?? request.max_tokens).toBe(4000);
    const summaryInput = JSON.stringify(first.requests[0]?.messages);
    expect(summaryInput).toContain("Earlier question 1:");
    expect(summaryInput).not.toContain("{messages}");
    expect(summaryInput).not.toContain("{conversation}");
    const path = Object.keys(output.files ?? {}).find(path => path.startsWith("/conversation_history/"));
    expect(path).toBeDefined();
    if (!path) throw Error("Missing history path");
    const second = provider([]);
    const restored = await createCoachHarness({ apiKey: "fixture", fetch: second.fetch, tools: [], checkpointer: saver }).agent.graph.getState(config);
    expect(JSON.stringify(restored.values.files?.[path])).toContain("Earlier question 0");
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it("cancels a native summarizer request through the same execution signal", async () => {
    vi.stubEnv("AGENT_MODEL", "fixture/unknown-model");
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      expect(String(init?.body)).toContain("Coach conversation summary (v1).");
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      started();
    }));
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch, tools: [], signal: controller.signal });
    const history = Array.from({ length: 8 }, () => new HumanMessage("x".repeat(100_000)));
    const result = agent.invoke({ messages: history });
    const assertion = expect(result).rejects.toThrow();
    await ready;
    controller.abort(new Error("Cancelled"));
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("propagates cancellation and a shared deadline to a pending provider request", async () => {
    for (const mode of ["cancel", "deadline"] as const) {
      const controller = new AbortController();
      let started!: () => void;
      const ready = new Promise<void>(resolve => { started = resolve; });
      const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        started();
      }));
      const { agent } = createCoachHarness({ apiKey: "fixture", fetch, tools: [], signal: controller.signal, timeoutMs: mode === "deadline" ? 50 : 1000 });
      const result = agent.invoke({ messages: [new HumanMessage("Hello")] });
      const assertion = expect(result).rejects.toThrow();
      await ready;
      if (mode === "cancel") controller.abort(new Error("Cancelled"));
      await assertion;
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
});
