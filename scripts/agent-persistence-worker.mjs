import assert from "node:assert/strict";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { resolve } from "node:path";
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
const fetch = async (_url, init) => {
  assert.ok(String(init.body).includes("Do not invent preferences"));
  return Response.json({ id: crypto.randomUUID(), object: "chat.completion", created: 0,
    choices: [{ index: 0, message: { role: "assistant", content: "Persisted." }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } });
};
try {
  if (mode === "write") {
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch, tools: [], checkpointer: saver, skillsDirectory: rootDir });
    await agent.invoke({ messages: [new HumanMessage({ id: "stable-input", content: "Persist this" })], pinnedSkills: ["coach-context-check"],
      files: { "/workspace/proof.txt": { content: ["durable-file"], created_at: "2026-11-07T00:00:00Z", modified_at: "2026-11-07T00:00:00Z" } } }, config);
  } else if (mode === "read") {
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch, tools: [], checkpointer: saver, skillsDirectory: rootDir });
    const state = await agent.graph.getState(config);
    assert.equal(state.values.messages.filter(message => message.id === "stable-input").length, 1);
    assert.deepEqual(state.values.files["/workspace/proof.txt"].content, ["durable-file"]);
    assert.ok(state.values.messages.some(message => message.content === "Persisted."));
    assert.equal(state.values.skillsMetadata[0].name, "coach-context-check");
    assert.deepEqual(state.values.pinnedSkills, []);
    assert.deepEqual(Object.keys(state.values.files), ["/workspace/proof.txt"]);
    const pins = state.values.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill");
    assert.equal(pins.length, 1);
    const resumed = await agent.invoke({ messages: [new HumanMessage("Continue after restart")] }, config);
    assert.equal(resumed.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill").length, 1);
    console.log("PASS: native skill metadata and consumed pins survive PostgreSQL restart in a fresh process");
  } else throw Error("Unknown worker mode");
  console.log(`PASS: fresh process ${mode}`);
} finally { await pool.end(); }
