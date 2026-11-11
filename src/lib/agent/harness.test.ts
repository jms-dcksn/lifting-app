import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { HumanMessage, RemoveMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { tool } from "langchain";
import { z } from "zod";
import { Client } from "langsmith";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createCoachSkills } from "./skills";
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
      tool_calls: [{ index: 0, id: `call-${requests.length}`, type: "function", function: { name: reply.name, arguments: JSON.stringify(reply.args) } }],
    };
    const usage = includeUsage ? { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } : undefined;
    if (!body.stream) return Response.json({ id: `fixture-${requests.length}`, object: "chat.completion", created: 0,
      choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: "stop" }], usage });
    const chunks = [
      { choices: [{ index: 0, delta: { role: "assistant", ...message }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage },
    ].map((chunk) => ({ id: `fixture-${requests.length}`, object: "chat.completion.chunk", created: 0, ...chunk }));
    return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } });
  });
  return { fetch, requests };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("gated Coach harness", () => {
  it("discovers bundled skills without loading instructions or starting a workflow", async () => {
    const source = provider(["Hello."]);
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [],
      skills: { rootDir: resolve("src/lib/agent/__fixtures__/skills") } });
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
    const rootDir = resolve("src/lib/agent/__fixtures__/skills");
    const source = provider([
      { name: "read_file", args: { file_path: "/skills/coach-context-check/SKILL.md" } },
      { name: "read_file", args: { file_path: "/skills/coach-context-check/references/checklist.md" } },
      "Goal: strength. Constraints: unknown. Open questions: schedule.", "Continue checklist.",
    ]);
    const saver = new MemorySaver();
    const config = { configurable: { thread_id: "skill-read" } };
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [], checkpointer: saver, skills: { rootDir } });
    const output = await agent.invoke({ messages: [new HumanMessage("Use the checklist skill")] }, config);
    expect(JSON.stringify(source.requests[1]?.messages)).toContain("Do not invent preferences");
    expect(JSON.stringify(source.requests[2]?.messages)).toContain("# Checklist format");
    expect(Object.keys(output.files ?? {})).toEqual([]);
    const required = createCoachSkills({ rootDir }).skills;
    const resumed = await createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [], checkpointer: saver, skills: { rootDir, required } })
      .agent.invoke({ messages: [new HumanMessage("Continue")] }, config);
    expect(resumed.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill")).toHaveLength(0);
  });

  it("restores a required skill after reopening and trimming without repeatedly pinning it", async () => {
    const rootDir = resolve("src/lib/agent/__fixtures__/skills");
    const required = createCoachSkills({ rootDir }).skills;
    const saver = new MemorySaver();
    const config = { configurable: { thread_id: "skills" } };
    const first = provider(["Checklist."]);
    const prepared = createCoachHarness({ apiKey: "fixture", fetch: first.fetch, tools: [], checkpointer: saver, skills: { rootDir, required } });
    const output = await prepared.agent.invoke({ messages: [new HumanMessage("Inspect")] }, config);
    expect(JSON.stringify(first.requests[0]?.messages)).toContain("Do not invent preferences");
    expect(output.pinnedSkills).toEqual([]);
    const second = provider(["Again.", "Restored."]);
    const reopened = createCoachHarness({ apiKey: "fixture", fetch: second.fetch, tools: [], checkpointer: saver, skills: { rootDir, required } });
    const result = await reopened.agent.invoke({ messages: [new HumanMessage("Continue")] }, config);
    const pins = result.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill");
    expect(pins).toHaveLength(1);
    await reopened.agent.graph.updateState(config, { messages: pins.map(message => { if (!message.id) throw new Error("Missing pin ID"); return new RemoveMessage({ id: message.id }); }) });
    const resumed = await reopened.agent.invoke({ messages: [new HumanMessage("Resume")] }, config);
    expect(resumed.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill")).toHaveLength(1);
    expect(JSON.stringify(second.requests[1]?.messages)).toContain("Do not invent preferences");
  });

  it("invalidates discovery after a bundle change and refuses outdated required references before a model call", async () => {
    const rootDir = mkdtempSync(resolve(tmpdir(), "coach-skills-"));
    try {
      cpSync(resolve("src/lib/agent/__fixtures__/skills"), rootDir, { recursive: true });
      const required = createCoachSkills({ rootDir }).skills;
      const saver = new MemorySaver();
      const config = { configurable: { thread_id: "changed-skills" } };
      const first = provider([{ name: "read_file", args: { file_path: "/skills/coach-context-check/references/checklist.md" } }, "Checklist."]);
      await createCoachHarness({ apiKey: "fixture", fetch: first.fetch, tools: [], checkpointer: saver, skills: { rootDir, required } })
        .agent.invoke({ messages: [new HumanMessage("Inspect")] }, config);
      const skillPath = resolve(rootDir, "coach-context-check/SKILL.md");
      writeFileSync(skillPath, readFileSync(skillPath, "utf8").replace("Review the user's stated goal", "Inspect the user's stated goal") + "\nRevised instructions.\n");
      const source = provider(["Updated."]);
      expect(() => createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [], skills: { rootDir, required } }))
        .toThrow("Required skill unavailable or changed");
      expect(() => createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [],
        skills: { rootDir, required: createCoachSkills({ rootDir }).skills.map(skill => ({ ...skill, version: "outdated" })) } }))
        .toThrow("Required skill unavailable or changed");
      expect(source.fetch).not.toHaveBeenCalled();
      const current = createCoachSkills({ rootDir }).skills;
      const result = await createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [], checkpointer: saver, skills: { rootDir, required: current } })
        .agent.invoke({ messages: [new HumanMessage("Continue")] }, config);
      const prompt = JSON.stringify(source.requests[0]?.messages);
      expect(prompt).toContain("Inspect the user's stated goal");
      expect(prompt).toContain("Revised instructions.");
      expect(prompt).not.toContain("# Checklist format");
      expect(result.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill")).toHaveLength(1);
      writeFileSync(resolve(rootDir, "manifest.json"), '{"skills":[]}');
      expect(() => createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [], skills: { rootDir, required: current } }))
        .toThrow("Required skill unavailable or changed");
      const ordinary = provider(["Ordinary chat."]);
      await createCoachHarness({ apiKey: "fixture", fetch: ordinary.fetch, tools: [], checkpointer: saver, skills: { rootDir } })
        .agent.invoke({ messages: [new HumanMessage("Hello")] }, config);
      expect(JSON.stringify(ordinary.requests[0]?.messages)).not.toContain("Revised instructions.");
    } finally { rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("preserves the compacted context window when a deployment replaces old skill pins", async () => {
    vi.stubEnv("AGENT_MODEL", "fixture/unknown-model");
    const rootDir = mkdtempSync(resolve(tmpdir(), "compacted-skills-"));
    try {
      cpSync(resolve("src/lib/agent/__fixtures__/skills"), rootDir, { recursive: true });
      const saver = new MemorySaver();
      const config = { configurable: { thread_id: "compacted-deployment" } };
      const source = provider(["Seed.", "Summary.", "Compacted.", "Updated."]);
      const prepared = createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [], checkpointer: saver,
        skills: { rootDir, required: createCoachSkills({ rootDir }).skills } });
      await prepared.agent.invoke({ messages: [new HumanMessage("Begin")] }, config);
      await prepared.agent.invoke({ messages: [new HumanMessage("x".repeat(800_000)),
        ...Array.from({ length: 6 }, (_, index) => new HumanMessage(`Keep marker ${index}`))] }, config);
      expect(JSON.stringify(source.requests[2]?.messages)).toContain("Keep marker 0");
      const path = resolve(rootDir, "coach-context-check/SKILL.md");
      writeFileSync(path, readFileSync(path, "utf8") + "\nCurrent deployment instructions.\n");
      await createCoachHarness({ apiKey: "fixture", fetch: source.fetch, tools: [], checkpointer: saver,
        skills: { rootDir, required: createCoachSkills({ rootDir }).skills } })
        .agent.invoke({ messages: [new HumanMessage("Latest question")] }, config);
      const prompt = JSON.stringify(source.requests[3]?.messages);
      expect(prompt).toContain("Keep marker 0");
      expect(prompt).toContain("Latest question");
      expect(prompt).toContain("Current deployment instructions.");
    } finally { rmSync(rootDir, { recursive: true, force: true }); }
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

  it("uses native summarization defaults, includes history and restores files through a fresh harness", async () => {
    vi.stubEnv("AGENT_MODEL", "fixture/unknown-model");
    const saver = new MemorySaver();
    const first = provider(["Initial response.", "Summary of earlier messages.", "Current answer."]);
    const rootDir = resolve("src/lib/agent/__fixtures__/skills");
    const required = createCoachSkills({ rootDir }).skills;
    const prepared = createCoachHarness({ apiKey: "fixture", fetch: first.fetch, tools: [], checkpointer: saver, skills: { rootDir, required } });
    const history = Array.from({ length: 8 }, (_, index) => new HumanMessage(`Earlier question ${index}: ${"x".repeat(100_000)}`));
    const config = { configurable: { thread_id: "summary" } };
    await prepared.agent.invoke({ messages: [new HumanMessage("Start this checklist")] }, config);
    const output = await prepared.agent.invoke({ messages: history }, config);
    expect(first.requests).toHaveLength(3);
    expect(output.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill")).toHaveLength(1);
    for (const request of first.requests) expect(request.max_completion_tokens ?? request.max_tokens).toBe(4000);
    const summaryInput = JSON.stringify(first.requests[1]?.messages);
    expect(summaryInput).toContain("Earlier question 1:");
    expect(summaryInput).not.toContain("{messages}");
    expect(summaryInput).not.toContain("{conversation}");
    expect(JSON.stringify(first.requests[2]?.messages)).toContain("Do not invent preferences");
    const path = Object.keys(output.files ?? {}).find(path => path.startsWith("/conversation_history/"));
    expect(path).toBeDefined();
    if (!path) throw Error("Missing history path");
    const second = provider([]);
    const restored = await createCoachHarness({ apiKey: "fixture", fetch: second.fetch, tools: [], checkpointer: saver }).agent.graph.getState(config);
    expect(JSON.stringify(restored.values.files?.[path])).toContain("Earlier question 0");
    expect(second.fetch).not.toHaveBeenCalled();
    const followup = provider(["Follow-up answer."]);
    const reopened = await createCoachHarness({ apiKey: "fixture", fetch: followup.fetch, tools: [], checkpointer: saver, skills: { rootDir, required } })
      .agent.invoke({ messages: [new HumanMessage("Continue the checklist")] }, config);
    expect(followup.requests).toHaveLength(1);
    expect(JSON.stringify(followup.requests[0]?.messages)).toContain("Do not invent preferences");
    expect(reopened.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill")).toHaveLength(1);
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
