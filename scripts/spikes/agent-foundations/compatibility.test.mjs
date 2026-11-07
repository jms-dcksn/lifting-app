import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { createMiddleware, tool, toolCallLimitMiddleware } from "langchain";
import {
  createDeepAgent, createFilesystemMiddleware, createSummarizationMiddleware,
  StateBackend,
} from "deepagents";
import { z } from "zod";

// Import only dependency-free app policy; never load environment files or credentials.
import { AGENT_SYSTEM_PROMPT } from "../../../src/lib/agent/prompt.ts";
import { AI_GATEWAY_BASE_URL, DEFAULT_AGENT_MODEL, TOOL_CALL_BUDGET } from "../../../src/lib/agent/policy.ts";

const threadId = "0199a3b2-5c1e-7d4a-9f00-000000000247";
process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";
globalThis.fetch = async () => { throw new Error("Network disabled in the compatibility spike"); };
const config = { configurable: { thread_id: threadId }, metadata: { thread_id: threadId }, recursionLimit: 40 };
const backend = (runtime) => new StateBackend(runtime);
const stamp = "2026-11-07T00:00:00.000Z";
const skillPath = "/skills/fixture/SKILL.md";
const skillBody = "---\nname: fixture\ndescription: Synthetic compatibility workflow.\n---\nFIXTURE_INSTRUCTIONS_ONLY_ON_LOAD";
const files = { [skillPath]: { content: skillBody.split("\n"), created_at: stamp, modified_at: stamp } };

function fixtureModel(replies) {
  const requests = [];
  const queue = [...replies];
  const model = new ChatOpenAI({
    model: DEFAULT_AGENT_MODEL, apiKey: "fixture-only", temperature: 0, maxRetries: 0,
    configuration: {
      baseURL: AI_GATEWAY_BASE_URL,
      fetch: async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url: String(url), body });
        const reply = queue.shift();
        assert.ok(reply, "unexpected model call (including summarization)");
        const message = typeof reply === "string" ? { content: reply } : reply;
        if (!body.stream) return Response.json({
          id: "fixture", object: "chat.completion", created: 0, model: DEFAULT_AGENT_MODEL,
          choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        const chunks = [
          { delta: { role: "assistant", ...message }, finish_reason: null },
          { delta: {}, finish_reason: message.tool_calls ? "tool_calls" : "stop" },
        ].map((choice) => ({ id: "fixture", object: "chat.completion.chunk", created: 0,
          model: DEFAULT_AGENT_MODEL, choices: [{ index: 0, ...choice }] }));
        return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
          { headers: { "Content-Type": "text/event-stream" } });
      },
    },
  });
  return { model, requests };
}

function call(name, args, id = "call-1") {
  return { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] };
}

function harness(model, { summary = {}, ...options } = {}) {
  return createDeepAgent({
    model, systemPrompt: AGENT_SYSTEM_PROMPT, backend,
    subagents: [], skills: ["/skills/"],
    ...options,
    middleware: [
      // The full harness adds a general-purpose agent even with subagents: [].
      createMiddleware({ name: "subAgentMiddleware" }),
      createFilesystemMiddleware({ backend, tools: ["read_file", "ls", "glob", "grep", "write_file"],
        toolTokenLimitBeforeEvict: 200, grepMaxCount: 20,
        permissions: [{ operations: ["write"], paths: ["/skills/**"], mode: "deny" }] }),
      createSummarizationMiddleware({ backend, model, trigger: { type: "tokens", value: 6000 }, keep: { type: "messages", value: 4 }, trimTokensToSummarize: 6000, ...summary }),
      toolCallLimitMiddleware({ runLimit: TOOL_CALL_BUDGET, exitBehavior: "continue" }),
    ],
  });
}

test("Gateway adapter preserves system policy, answer streaming, actual tool events and trace metadata", async () => {
  const { model, requests } = fixtureModel([call("weeklyCoach", {}), "Three sessions completed."]);
  const starts = [];
  const metadataSeen = [];
  const record = (kind, metadata) => { starts.push(kind); metadataSeen.push(metadata); };
  const callbacks = [{
    handleChainStart: (...args) => record("chain", args[5]),
    handleChatModelStart: (...args) => record("model", args[6]),
    handleToolStart: (...args) => record("tool", args[5]),
  }];
  const owner = "synthetic-owner";
  const weeklyCoach = tool(async () => ({ owner, completedSessions: 3 }), {
    name: "weeklyCoach", description: "Synthetic owner-bound domain result.", schema: z.object({}),
  });
  const agent = harness(model, { tools: [weeklyCoach] });
  const run = await agent.streamEvents({ messages: [new HumanMessage("How was my week?")] }, { ...config, callbacks, version: "v3" });
  const text = [];
  const events = [];
  await Promise.all([
    (async () => { for await (const message of run.messages) for await (const token of message.text) text.push(token); })(),
    (async () => { for await (const event of run) if (event.method === "tools") events.push(event.params.data); })(),
    (async () => { for await (const entry of run.toolCalls) void entry.output.catch(() => {}); })(),
    run.output,
  ]);
  await awaitAllCallbacks();
  assert.equal(text.join(""), "Three sessions completed.");
  assert.deepEqual(events.map((event) => [event.event, event.tool_call_id]), [["tool-started", "call-1"], ["tool-finished", "call-1"]]);
  assert.deepEqual(new Set(starts), new Set(["chain", "model", "tool"]));
  assert.ok(metadataSeen.every((metadata) => metadata.thread_id === threadId));
  assert.equal(requests[0].url, `${AI_GATEWAY_BASE_URL}/chat/completions`);
  assert.ok(requests[0].body.messages.some((message) => ["system", "developer"].includes(message.role)
    && (typeof message.content === "string" ? message.content : message.content.map((part) => part.text ?? "").join("")).includes(AGENT_SYSTEM_PROMPT)));
  assert.ok(requests[1].body.messages.some((message) => message.role === "tool" && message.content.includes(owner)));
  const toolNames = requests[0].body.tools.map((entry) => entry.function.name);
  assert.ok(toolNames.includes("weeklyCoach"));
  assert.ok(!toolNames.includes("task") && !toolNames.includes("execute") && !toolNames.includes("write_todos"));
});

test("fresh agent construction restores native message IDs, metadata and files; replayed input ID does not append twice", async () => {
  const saver = new MemorySaver();
  const first = fixtureModel(["Saved context."]);
  await harness(first.model, { checkpointer: saver }).invoke({
    messages: [new HumanMessage({ id: "input-1", content: "Remember this thread.", additional_kwargs: { fixture: "preserve" } })], files,
  }, config);
  const second = fixtureModel(["Continued."]);
  const agent = harness(second.model, { checkpointer: saver });
  const output = await agent.invoke({ messages: [new HumanMessage({ id: "input-2", content: "Continue." })] }, config);
  assert.equal(output.messages.filter((message) => message.id === "input-1").length, 1);
  assert.equal(output.messages[0].additional_kwargs.fixture, "preserve");
  assert.equal(output.files[skillPath].content.join("\n"), skillBody);
  await agent.updateState(config, { messages: [new HumanMessage({ id: "input-2", content: "Continue." })] });
  assert.equal((await agent.getState(config)).values.messages.filter((message) => message.id === "input-2").length, 1);
  const other = await agent.getState({ configurable: { thread_id: "different-thread" } });
  assert.deepEqual(other.values, {});
});

test("skills advertise metadata, load instructions on demand, and consume pins", async () => {
  const discovered = fixtureModel(["No workflow needed."]);
  await harness(discovered.model).invoke({ messages: [new HumanMessage("Hello")], files }, config);
  const discoveryPrompt = JSON.stringify(discovered.requests[0].body.messages);
  assert.ok(discoveryPrompt.includes("Synthetic compatibility workflow"));
  assert.ok(!discoveryPrompt.includes("FIXTURE_INSTRUCTIONS_ONLY_ON_LOAD"));
  const loaded = fixtureModel([call("read_file", { file_path: skillPath }), "Loaded."]);
  await harness(loaded.model).invoke({ messages: [new HumanMessage("Load fixture")], files }, config);
  assert.ok(JSON.stringify(loaded.requests[1].body.messages).includes("FIXTURE_INSTRUCTIONS_ONLY_ON_LOAD"));
  const pinned = fixtureModel(["Pinned."]);
  const output = await harness(pinned.model).invoke({ messages: [new HumanMessage("Resume")], files, pinnedSkills: ["fixture"] }, config);
  assert.ok(JSON.stringify(pinned.requests[0].body.messages).includes("FIXTURE_INSTRUCTIONS_ONLY_ON_LOAD"));
  assert.deepEqual(output.pinnedSkills, []);
});

test("skill writes are denied by filesystem middleware", async () => {
  const { model } = fixtureModel([call("write_file", { file_path: "/skills/injected/SKILL.md", content: "untrusted" }), "Denied."]);
  const output = await harness(model).invoke({ messages: [new HumanMessage("Write a skill")], files }, config);
  assert.equal(output.files["/skills/injected/SKILL.md"], undefined);
  assert.ok(output.messages.some((message) => message.type === "tool" && /denied|not allowed|permission/i.test(String(message.content))));
});

test("oversized tool output offloads and can be read after fresh construction", async (context) => {
  const saver = new MemorySaver();
  const payload = `RECOVERABLE_FIXTURE_${"x".repeat(4000)}`;
  const evidence = tool(async () => payload, { name: "evidence", description: "Synthetic oversized evidence.", schema: z.object({}) });
  const first = fixtureModel([call("evidence", {}), "Offloaded."]);
  const output = await harness(first.model, { checkpointer: saver, tools: [evidence] }).invoke({ messages: [new HumanMessage("Get evidence")] }, config);
  const path = Object.keys(output.files).find((path) => path.includes("tool_results"));
  assert.ok(path, "offloaded file reference exists");
  assert.ok(output.files[path].content.includes(payload));
  const modelResult = first.requests[1].body.messages.find((message) => message.role === "tool").content;
  assert.ok(modelResult.length < payload.length);
  context.diagnostic(`offload: payload=${payload.length} chars; model tool result=${modelResult.length} chars; file=${output.files[path].content.length} chars`);
  const second = fixtureModel([call("read_file", { file_path: path, offset: 0, limit: 1 }, "read-1"), "Recovered."]);
  await harness(second.model, { checkpointer: saver }).invoke({ messages: [new HumanMessage("Read it back")] }, config);
  assert.ok(JSON.stringify(second.requests[1].body.messages).includes("RECOVERABLE_FIXTURE"));
});

test("native checkpoint serializer round-trips tool identities and custom message metadata", async () => {
  const saver = new MemorySaver();
  const original = new AIMessage({ id: "assistant-id", content: "", tool_calls: [{ id: "tool-id", name: "fixture", args: {}, type: "tool_call" }], additional_kwargs: { fixture: "marker" } });
  const [type, bytes] = await saver.serde.dumpsTyped(original);
  const restored = await saver.serde.loadsTyped(type, bytes);
  assert.equal(restored.id, original.id);
  assert.deepEqual(restored.tool_calls, original.tool_calls);
  assert.deepEqual(restored.additional_kwargs, original.additional_kwargs);
});

test("Postgres saver and separate Store exports exist without opening connections", async () => {
  assert.equal(typeof PostgresSaver.prototype.getTuple, "function");
  assert.equal(typeof PostgresSaver.prototype.deleteThread, "function");
  assert.equal(typeof PostgresStore.prototype.get, "function");
  assert.equal(typeof PostgresStore.prototype.delete, "function");
  const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url)));
  assert.equal(pkg.dependencies.deepagents, "1.16.0");
});

test("explicit summarization retains recent context but its advertised StateBackend history is missing", async (context) => {
  const { model, requests } = fixtureModel(["Synthetic summary of earlier context.", "Current answer."]);
  const messages = Array.from({ length: 4 }, (_, index) => [
    new HumanMessage({ id: `human-${index}`, content: `Earlier question ${index}` }),
    new AIMessage({ id: `answer-${index}`, content: `Earlier answer ${index}` }),
  ]).flat();
  messages.push(new HumanMessage("Current question"));
  const output = await harness(model, { summary: { trigger: { type: "messages", value: 6 }, keep: { type: "messages", value: 2 } } }).invoke({ messages }, config);
  assert.equal(requests.length, 2, "summary is an additional model call");
  assert.ok(!Object.keys(output.files).some((path) => path.startsWith("/conversation_history/")));
  assert.ok(JSON.stringify(requests[1].body.messages).includes("/conversation_history/"));
  assert.ok(JSON.stringify(requests[1].body.messages).includes("Synthetic summary"));
  assert.ok(JSON.stringify(requests[1].body.messages).includes("Current question"));
  context.diagnostic("Native summarization advertises a history file but does not merge StateBackend filesUpdate; not migration-ready for recoverable summarized history.");
});

test("tool budget includes filesystem reads and prevents a ninth execution", async () => {
  const { model } = fixtureModel([
    ...Array.from({ length: TOOL_CALL_BUDGET + 1 }, (_, index) => call("read_file", { file_path: skillPath }, `read-${index}`)),
    "Budget reached.",
  ]);
  const output = await harness(model).invoke({ messages: [new HumanMessage("Read repeatedly")], files }, config);
  const results = output.messages.filter((message) => message.type === "tool");
  assert.equal(results.length, TOOL_CALL_BUDGET + 1);
  assert.match(String(results.at(-1).content), /limit|exceeded/i);
});

test("tool failures emit the real error lifecycle; unavailable checkpoints prevent model execution", async () => {
  const failed = fixtureModel([call("failingEvidence", {}), "Unavailable."]);
  const failingEvidence = tool(async () => { throw new Error("synthetic tool failure"); }, {
    name: "failingEvidence", description: "Fails deterministically.", schema: z.object({}),
  });
  const run = await harness(failed.model, { tools: [failingEvidence] }).streamEvents({ messages: [new HumanMessage("Inspect")] }, { ...config, version: "v3" });
  const events = [];
  const outcomes = await Promise.allSettled([
    (async () => { for await (const event of run) if (event.method === "tools") events.push(event.params.data.event); })(),
    (async () => { for await (const entry of run.toolCalls) void entry.output.catch(() => {}); })(),
    run.output,
  ]);
  assert.ok(outcomes.some((outcome) => outcome.status === "rejected"));
  assert.deepEqual(events, ["tool-started", "tool-error"]);
  class UnavailableSaver extends MemorySaver {
    async getTuple() { throw new Error("synthetic checkpoint outage"); }
  }
  const unavailable = fixtureModel(["Must not run."]);
  await assert.rejects(harness(unavailable.model, { checkpointer: new UnavailableSaver() }).invoke({ messages: [new HumanMessage("Hello")] }, config), /checkpoint outage/);
  assert.equal(unavailable.requests.length, 0);
});

test("missing native pin behavior is measured rather than treated as required-skill validation", async (context) => {
  const { model, requests } = fixtureModel(["Continued without the missing skill."]);
  const output = await harness(model).invoke({ messages: [new HumanMessage("Resume")], files, pinnedSkills: ["missing-skill"] }, config);
  assert.equal(requests.length, 1);
  assert.deepEqual(output.pinnedSkills, []);
  context.diagnostic("Native missing pin does not fail: application must validate required workflow skill/version before invoking.");
});
