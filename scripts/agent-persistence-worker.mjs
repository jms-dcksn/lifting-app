import assert from "node:assert/strict";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { HumanMessage } from "@langchain/core/messages";
import { createCoachHarness } from "../src/lib/agent/harness.ts";
import { FencedTestPool } from "./agent-persistence-pool.mjs";

globalThis.fetch = async () => { throw Error("Worker network is disabled"); };
const scope = JSON.parse(process.env.AGENT_TEST_SCOPE);
const pool = new FencedTestPool(process.env.AGENT_TEST_DB_URL, scope);
const saver = new PostgresSaver(pool, undefined, { schema: "coach_checkpoint_test" });
const config = { configurable: { thread_id: scope.thread } };
const mode = process.argv[2];
try {
  if (mode === "write") {
    const fetch = async () => Response.json({ id: "fixture", object: "chat.completion", created: 0,
      choices: [{ index: 0, message: { role: "assistant", content: "Persisted." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } });
    const { agent } = createCoachHarness({ apiKey: "fixture", fetch, tools: [], checkpointer: saver });
    await agent.invoke({ messages: [new HumanMessage({ id: "stable-input", content: "Persist this" })],
      files: { "/workspace/proof.txt": { content: ["durable-file"], created_at: "2026-11-07T00:00:00Z", modified_at: "2026-11-07T00:00:00Z" } } }, config);
  } else if (mode === "read") {
    const { agent } = createCoachHarness({ apiKey: "fixture", tools: [], checkpointer: saver });
    const state = await agent.graph.getState(config);
    assert.equal(state.values.messages.filter(message => message.id === "stable-input").length, 1);
    assert.deepEqual(state.values.files["/workspace/proof.txt"].content, ["durable-file"]);
    assert.ok(state.values.messages.some(message => message.content === "Persisted."));
  } else throw Error("Unknown worker mode");
  console.log(`PASS: fresh process ${mode}`);
} finally { await pool.end(); }
