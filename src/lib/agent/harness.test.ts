import { resolve } from "node:path";
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

let providerSequence = 0;
type ProviderCall = { name: string; args: Record<string, unknown> };
function provider(replies: Array<string | ProviderCall | ProviderCall[]>, includeUsage = true) {
  const instance = ++providerSequence;
  const requests: Array<Record<string, unknown>> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    const reply = replies.shift();
    if (!reply) throw Error(`Unexpected ${body.stream ? "stream" : "summary"} call ${requests.length}`);
    const message = typeof reply === "string" ? { content: reply } : {
      tool_calls: (Array.isArray(reply) ? reply : [reply]).map((call, index) => ({ index, id: `call-${instance}-${requests.length}${index ? `-${index}` : ""}`, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } })),
    };
    const usage = includeUsage ? { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } : undefined;
    if (!body.stream) return Response.json({ id: `fixture-${instance}-${requests.length}`, object: "chat.completion", created: 0,
      choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: "stop" }], usage });
    const chunks = [
      { choices: [{ index: 0, delta: { role: "assistant", ...message }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage },
    ].map((chunk) => ({ id: `fixture-${instance}-${requests.length}`, object: "chat.completion.chunk", created: 0, ...chunk }));
    return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } });
  });
  return { fetch, requests };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("gated Coach harness", () => {
  it("allows 24 tool calls then asks for a final answer without tools", async () => {
    const evidence = tool(vi.fn(async () => "Owned evidence"), { name: "evidence", description: "Read evidence", schema: z.object({}) });
    const source = provider([...Array.from({ length: 24 }, () => ({ name: "evidence", args: {} })), "Here is the review."]);
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [evidence] });
    const output = await agent.invoke({ messages: [new HumanMessage("Review")] });
    expect(output.messages.at(-1)?.content).toBe("Here is the review.");
    expect(source.requests).toHaveLength(25);
    expect(source.requests.at(-1)?.tools ?? []).toEqual([]);
  });

  it("returns a visible explanation when a parallel batch exhausts the tool limit", async () => {
    const execute = vi.fn(async () => "Owned evidence");
    const evidence = tool(execute, { name: "evidence", description: "Read evidence", schema: z.object({}) });
    const source = provider([Array.from({ length: 25 }, () => ({ name: "evidence", args: {} })), "Review from available evidence."]);
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [evidence] });
    const output = await agent.invoke({ messages: [new HumanMessage("Review")] });
    expect(execute).toHaveBeenCalledTimes(24);
    expect(output.messages.at(-1)?.content).toBe("Review from available evidence.");
  });

  it("never leaves an empty reply if the model requests tools after access is disabled", async () => {
    const execute = vi.fn(async () => "Evidence");
    const evidence = tool(execute, { name: "evidence", description: "Read evidence", schema: z.object({}) });
    const source = provider([Array.from({ length: 24 }, () => ({ name: "evidence", args: {} })), { name: "evidence", args: {} }]);
    const output = await createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [evidence] }).agent.invoke({ messages: [new HumanMessage("Review")] });
    expect(execute).toHaveBeenCalledTimes(24);
    expect(output.messages.at(-1)?.content).toContain("couldn’t finish");
  });

  it("keeps a normal weekly report inline", async () => {
    const content = JSON.stringify({ report: "x".repeat(53_000) });
    const evidence = tool(async () => content, { name: "evidence", description: "Read evidence", schema: z.object({}) });
    const source = provider([{ name: "evidence", args: {} }, "Review."]);
    const output = await createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [evidence] }).agent.invoke({ messages: [new HumanMessage("Review")] });
    expect(Object.keys(output.files ?? {})).toEqual([]);
    expect(JSON.stringify(source.requests[1]?.messages)).toContain(content.slice(20, 100));
  });

  it("discovers the checklist skill from the default deployed directory", async () => {
    const source = provider(["Hello."]);
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [] });
    const output = await agent.invoke({ messages: [new HumanMessage("Hello")] });
    expect(output.skillsMetadata?.map(skill => skill.name)).toEqual(["coach-context-check"]);
    expect(JSON.stringify(source.requests[0]?.messages)).toContain("/skills/coach-context-check/SKILL.md");
  });
  it("discovers bundled skills without loading instructions or starting a workflow", async () => {
    const source = provider(["Hello."]);
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [],
      skillsDirectory: resolve("src/lib/agent/skills") });
    const output = await agent.invoke({ messages: [new HumanMessage("Hello")] });
    const prompt = JSON.stringify(source.requests[0]?.messages);
    expect(prompt).toContain("coach-context-check");
    expect(prompt).toContain("/skills/coach-context-check/SKILL.md");
    expect(prompt).not.toContain("Do not invent preferences");
    expect(prompt).not.toContain("# Checklist format");
    expect(output.pinnedSkills).toEqual([]);
    expect(Object.keys(output.files ?? {})).toEqual([]);
    expect(source.fetch).toHaveBeenCalledTimes(1);
  });
  it("loads skill instructions and references on demand through the real read_file tool", async () => {
    const rootDir = resolve("src/lib/agent/skills");
    const source = provider([
      { name: "read_file", args: { file_path: "/skills/coach-context-check/SKILL.md" } },
      { name: "read_file", args: { file_path: "/skills/coach-context-check/references/checklist.md" } },
      "Goal: strength. Constraints: unknown. Open questions: schedule.",
    ]);
    const saver = new MemorySaver();
    const config = { configurable: { thread_id: "skill-read" } };
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [], checkpointer: saver, skillsDirectory: rootDir });
    const output = await agent.invoke({ messages: [new HumanMessage("Use the checklist skill")] }, config);
    expect(JSON.stringify(source.requests[1]?.messages)).toContain("Do not invent preferences");
    expect(JSON.stringify(source.requests[2]?.messages)).toContain("# Checklist format");
    expect(Object.keys(output.files ?? {})).toEqual([]);
  });

  it("consumes native pins and preserves skill metadata through a fresh harness", async () => {
    const skillsDirectory = resolve("src/lib/agent/skills");
    const saver = new MemorySaver();
    const config = { configurable: { thread_id: "skills" } };
    const first = provider(["Checklist."]);
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: first.fetch, tools: [], checkpointer: saver, skillsDirectory });
    const output = await agent.invoke({ messages: [new HumanMessage("Inspect")], pinnedSkills: ["coach-context-check"] }, config);
    expect(JSON.stringify(first.requests[0]?.messages)).toContain("Do not invent preferences");
    expect(output.pinnedSkills).toEqual([]);
    const second = provider([{ name: "read_file", args: { file_path: "/skills/coach-context-check/references/checklist.md" } }, "Checklist continued."]);
    const reopened = createCoachHarness({ apiKey: "fixture", fetch: second.fetch, tools: [], checkpointer: saver, skillsDirectory });
    const result = await reopened.agent.invoke({ messages: [new HumanMessage("Continue")] }, config);
    expect(result.skillsMetadata?.map(skill => skill.name)).toEqual(["coach-context-check"]);
    expect(result.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill")).toHaveLength(1);
    expect(JSON.stringify(second.requests[1]?.messages)).toContain("# Checklist format");
  });

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

  it("rejects oversized offloads without advertising a missing file", async () => {
    const source = provider([{ name: "evidence", args: {} }, "Could not save the evidence."]);
    const evidence = tool(async () => "x".repeat(256 * 1024 + 1), { name: "evidence", description: "Read evidence", schema: z.object({}) });
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [evidence] });
    const result = await agent.invoke({ messages: [new HumanMessage("Inspect")] });
    expect(JSON.stringify(source.requests[1]?.messages)).toContain("could not be saved");
    expect(Object.keys(result.files ?? {})).toEqual([]);
  });

  it("counts concurrent automatic offloads against the same thread quota", async () => {
    const source = provider([[{ name: "evidence", args: {} }, { name: "evidence", args: {} }], "Done."]);
    const evidence = tool(async () => "x".repeat(81_000), { name: "evidence", description: "Read evidence", schema: z.object({}) });
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [evidence] });
    const files = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`/workspace/${i}.txt`, { content: "proof", mimeType: "text/plain", created_at: "2026-11-11", modified_at: "2026-11-11" }]));
    const result = await agent.invoke({ messages: [new HumanMessage("Inspect")], files });
    expect(Object.keys(result.files ?? {})).toHaveLength(32);
    expect(JSON.stringify(source.requests[1]?.messages)).toContain("32 files");
  });

  it("reopens offloaded evidence through bounded reads without exposing another thread", async () => {
    const saver = new MemorySaver();
    const config = { configurable: { thread_id: "offload" } };
    const content = Array.from({ length: 5000 }, (_, i) => `Evidence row ${i}: owned source facts`).join("\n");
    const evidence = tool(async () => content, { name: "evidence", description: "Read evidence", schema: z.object({}) });
    const first = provider([{ name: "evidence", args: {} }, "Saved."]);
    const result = await createCoachHarness({ apiKey: "fixture", fetch: first.fetch, tools: [evidence], checkpointer: saver }).agent.invoke({ messages: [new HumanMessage("Inspect")] }, config);
    const path = Object.keys(result.files ?? {})[0];
    expect(path).toMatch(/^\/large_tool_results\/call-\d+-1.txt$/);
    const second = provider([{ name: "read_file", args: { file_path: path, limit: 10000 } }, "Read."]);
    const reopened = createCoachHarness({ apiKey: "fixture", fetch: second.fetch, tools: [], checkpointer: saver });
    await reopened.agent.invoke({ messages: [new HumanMessage("Read saved evidence")] }, config);
    const messages = JSON.stringify(second.requests[1]?.messages);
    expect(messages).toContain("Evidence row 199:");
    expect(messages).not.toContain("Evidence row 200:");
    const other = provider([{ name: "read_file", args: { file_path: path } }, "Unavailable."]);
    await createCoachHarness({ apiKey: "fixture", fetch: other.fetch, tools: [], checkpointer: saver }).agent.invoke({ messages: [new HumanMessage("Read")] }, { configurable: { thread_id: "other" } });
    expect(JSON.stringify(other.requests[1]?.messages)).toContain("not found");
    expect(JSON.stringify(other.requests)).not.toContain("owned source facts");
  });

  it("summarizes without a history link when the history exceeds the file quota", async () => {
    vi.stubEnv("AGENT_MODEL", "fixture/unknown-model");
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const source = provider(["Summary.", "Answer."]);
      const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [] });
      const messages = Array.from({ length: 8 }, (_, i) => new HumanMessage(`Original ${i}: ${"x".repeat(160_000)}`));
      const result = await agent.invoke({ messages });
      expect(Object.keys(result.files ?? {})).toEqual([]);
      expect(JSON.stringify(source.requests[1]?.messages)).not.toContain("/conversation_history/");
      expect(result.messages.some(message => String(message.content).startsWith("Original 0:"))).toBe(true);
      expect(warnings).toHaveBeenCalled();
    } finally { warnings.mockRestore(); }
  });

  it("uses native summarization defaults, includes history and restores files through a fresh harness", async () => {
    vi.stubEnv("AGENT_MODEL", "fixture/unknown-model");
    const saver = new MemorySaver();
    const first = provider(["Summary of earlier messages.", "Current answer."]);
    const prepared = createCoachHarness({ apiKey: "fixture", fetch: first.fetch, tools: [], checkpointer: saver });
    const history = Array.from({ length: 8 }, (_, index) => new HumanMessage(`Earlier question ${index}: ${"x".repeat(index < 2 ? 10_000 : 120_000)}`));
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
