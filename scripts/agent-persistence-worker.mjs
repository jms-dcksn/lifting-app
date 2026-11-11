import assert from "node:assert/strict";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { resolve } from "node:path";
import { tool } from "langchain";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import { createCoachHarness } from "../src/lib/agent/harness.ts";
import { FencedTestPool } from "./agent-persistence-pool.mjs";

globalThis.fetch = async () => { throw Error("Worker network is disabled"); };
const scope = JSON.parse(process.env.AGENT_TEST_SCOPE);
const pool = new FencedTestPool(process.env.AGENT_TEST_DB_URL, scope);
const saver = new PostgresSaver(pool, undefined, { schema: "coach_checkpoint_test" });
const config = { configurable: { thread_id: scope.thread } };
const mode = process.argv[2];
const rootDir = resolve("src/lib/agent/__fixtures__/skills");
const replies = [];
const requests = [];
process.env.AGENT_MODEL = "fixture/unknown-model";
const fetch = async (_url, init) => {
  const body = JSON.parse(String(init.body));
  requests.push(body);
  const reply = JSON.stringify(body.messages).includes("Coach conversation summary (v1).") ? "Summary of earlier messages." : replies.shift() ?? "Persisted.";
  const message = typeof reply === "string" ? { role: "assistant", content: reply } : { role: "assistant", tool_calls: [{ id: `durable-call-${requests.length}`, type: "function", function: { name: reply.name, arguments: JSON.stringify(reply.args) } }] };
  return Response.json({ id: crypto.randomUUID(), object: "chat.completion", created: 0,
    choices: [{ index: 0, message, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } });
};
try {
  if (mode === "write") {
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch, tools: [], checkpointer: saver, skillsDirectory: rootDir });
    await agent.invoke({ messages: [new HumanMessage({ id: "stable-input", content: "Persist this" })], pinnedSkills: ["coach-context-check"],
      files: { "/workspace/proof.txt": { content: ["durable-file"], created_at: "2026-11-07T00:00:00Z", modified_at: "2026-11-07T00:00:00Z" } } }, config);
    assert.ok(JSON.stringify(requests[0].messages).includes("Do not invent preferences"));
    const evidence = tool(async () => Array.from({ length: 1000 }, (_, i) => `Evidence row ${i}: owned facts`).join("\n"), {
      name: "evidence", description: "Read evidence", schema: z.object({}),
    });
    replies.push({ name: "evidence", args: {} }, "Evidence saved.");
    await createCoachHarness({ apiKey: "fixture", fetch, tools: [evidence], checkpointer: saver }).agent.invoke({ messages: [new HumanMessage("Inspect evidence")] }, config);
    replies.push("Summary saved.");
    await createCoachHarness({ apiKey: "fixture", fetch, tools: [], checkpointer: saver }).agent.invoke({ messages: Array.from({ length: 8 }, (_, i) => new HumanMessage(`Earlier question ${i}: ${"x".repeat(i < 2 ? 1000 : 120_000)}`)) }, config);
  } else if (mode === "read") {
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch, tools: [], checkpointer: saver, skillsDirectory: rootDir });
    const state = await agent.graph.getState(config);
    assert.equal(state.values.messages.filter(message => message.id === "stable-input").length, 1);
    assert.deepEqual(state.values.files["/workspace/proof.txt"].content, ["durable-file"]);
    assert.ok(state.values.messages.some(message => message.content === "Persisted."));
    assert.equal(state.values.skillsMetadata[0].name, "coach-context-check");
    assert.deepEqual(state.values.pinnedSkills, []);
    const paths = Object.keys(state.values.files);
    const evidencePath = paths.find(path => path.startsWith("/large_tool_results/"));
    const historyPath = paths.find(path => path.startsWith("/conversation_history/"));
    assert.ok(evidencePath);
    assert.ok(historyPath);
    assert.equal(paths.length, 3);
    assert.ok(JSON.stringify(state.values.files[historyPath]).includes("Earlier question 0:"));
    const pins = state.values.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill");
    assert.equal(pins.length, 1);
    replies.push({ name: "read_file", args: { file_path: evidencePath, limit: 10000 } }, "Read after restart.");
    const resumed = await agent.invoke({ messages: [new HumanMessage("Continue after restart")] }, config);
    assert.equal(resumed.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill").length, 1);
    const toolRead = JSON.stringify(requests.at(-1).messages);
    assert.ok(toolRead.includes("Evidence row 199:"));
    assert.ok(!toolRead.includes("Evidence row 200:"));
    console.log("PASS: offloaded evidence and summary history survive PostgreSQL restart; real read_file remains bounded");
    console.log("PASS: native skill metadata and consumed pins survive PostgreSQL restart in a fresh process");
  } else throw Error("Unknown worker mode");
  console.log(`PASS: fresh process ${mode}`);
} finally { await pool.end(); }
