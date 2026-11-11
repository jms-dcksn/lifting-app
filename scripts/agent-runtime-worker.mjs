import assert from "node:assert/strict";
import pg from "pg";
import { resolve } from "node:path";
import { createCoachSkills } from "../src/lib/agent/skills.ts";
import { createDurableStore, ownedTransaction, scopedSaver } from "../src/lib/agent/durable-store.ts";
import { executeDurableTurn, recoverDurableTurn } from "../src/lib/agent/durable-runtime.ts";
import { createCoachHarness } from "../src/lib/agent/harness.ts";
import { stableUuid } from "../src/lib/agent/durable-messages.ts";

globalThis.fetch = async () => { throw Error("Network disabled in runtime proof"); };
const url = new URL(process.env.AGENT_TEST_DURABLE_URL);
assert.equal(url.hostname, "127.0.0.1");
const pool = new pg.Pool({ connectionString: url.href, max: 2 });
const store = createDurableStore(pool);
const owner = "10000000-0000-4000-8000-000000000002";
const requestId = "50000000-0000-4000-8000-000000000001";
const request = { kind: "new", text: "A durable question", context: { pathname: "/coach", activeProgramId: null, openSessionId: null, focusedExerciseId: null } };
const rootDir = resolve("src/lib/agent/__fixtures__/skills");
const skills = { rootDir, required: createCoachSkills({ rootDir }).skills };
let calls = 0;
const harness = input => createCoachHarness({ ...input, skills, apiKey: "fixture", fetch: async (_url, init) => {
  if (process.argv[2] === "interrupt") {
    process.stdout.write("PENDING_RUNTIME_PROVIDER\n");
    return new Promise(() => {});
  }
  calls += 1;
  const id = crypto.randomUUID();
  const body = JSON.parse(String(init.body));
  assert.ok(JSON.stringify(body.messages).includes("Do not invent preferences"));
  const message = { role: "assistant", content: "A durable answer" };
  const usage = { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 };
  if (!body.stream) return Response.json({ id, object: "chat.completion", created: 0,
    choices: [{ index: 0, message, finish_reason: "stop" }], usage });
  const data = [{ choices: [{ index: 0, delta: message, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage }];
  return new Response(data.map(chunk => `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 0, ...chunk })}\n\n`).join("") + "data: [DONE]\n\n");
} });
const execute = admission => executeDurableTurn({ store, admission, harness, tools: [], systemPrompt: "Fixture", onEvent: () => {} });
try {
  if (process.argv[2] === "write") {
    const parallel = await Promise.all([store.admit(owner, { requestId, request }), store.admit(owner, { requestId, request })]);
    assert.equal(parallel.filter(turn => turn.execute).length, 1);
    const admission = parallel.find(turn => turn.execute);
    assert.equal(admission.execute, true);
    const duplicate = await store.admit(owner, { requestId, request });
    assert.equal(duplicate.execute, false);
    const originalNow = Date.now;
    try {
      Date.now = () => originalNow() + 3_600_000;
      assert.equal((await store.admit(owner, { requestId, request, resume: true })).execute, false);
    } finally { Date.now = originalNow; }
    await assert.rejects(store.admit(owner, { requestId, request: { ...request, text: "Changed" } }), /different input/);
    await assert.rejects(store.admit(owner, { requestId: crypto.randomUUID(), request: {
      kind: "continue", threadId: admission.thread.id, text: "Competing send", context: request.context } }), /unfinished response/);
    const saved = await execute(admission);
    assert.equal(calls, 1);
    assert.equal(saved.filter(row => row.role === "user").length, 1);
    assert.equal(saved.filter(row => row.role === "assistant").length, 1);
    assert.equal((await store.status(admission.scope)).status, "completed");
    const retry = await store.admit(owner, { requestId, request });
    assert.equal(retry.execute, false);
    assert.deepEqual(retry.history, saved);

    const contenders = await Promise.allSettled([1, 2].map(() => store.admit(owner, { requestId: crypto.randomUUID(), request: {
      kind: "continue", threadId: admission.thread.id, text: "Projection can fail", context: request.context } })));
    assert.equal(contenders.filter(value => value.status === "fulfilled").length, 1);
    const winner = contenders.find(value => value.status === "fulfilled");
    const failures = winner.value;
    const broken = { ...store, project: async () => { throw Error("projection outage"); } };
    await assert.rejects(executeDurableTurn({ store: broken, admission: failures, harness, tools: [], systemPrompt: "Fixture", onEvent: () => {} }), /projection outage/);
    const before = calls;
    const interrupted = await store.status(failures.scope);
    assert.equal(interrupted.status, "failed");
    const repaired = await recoverDurableTurn(store, failures.scope, interrupted);
    assert.ok(repaired);
    assert.equal(calls, before);
    assert.equal(repaired.filter(row => row.role === "assistant").length, 2);
    assert.deepEqual(await recoverDurableTurn(store, failures.scope, interrupted), repaired);

    const active = await store.admit(owner, { requestId: crypto.randomUUID(), request: {
      kind: "continue", threadId: admission.thread.id, text: "Reclaim safely", context: request.context } });
    await ownedTransaction(pool, active.scope, client => client.query("update coach_runtime.turn set lease_until=clock_timestamp()-interval '1 second' where request_id=$1", [active.turn.request_id]));
    try {
      Date.now = () => originalNow() - 3_600_000;
      assert.equal((await store.status(active.scope)).status, "interrupted");
    } finally { Date.now = originalNow; }
    const reclaimed = await store.admit(owner, { requestId: active.turn.request_id,
      request: { kind: "continue", threadId: admission.thread.id, text: "", context: request.context }, resume: true });
    assert.ok(reclaimed.scope.epoch > active.scope.epoch);
    const stale = scopedSaver(pool, active.scope);
    const latest = await scopedSaver(pool, reclaimed.scope).getTuple({ configurable: { thread_id: admission.thread.id } });
    const current = scopedSaver(pool, reclaimed.scope);
    const foreignThread = "20000000-0000-4000-8000-000000000002";
    assert.equal(await current.getTuple({ configurable: { thread_id: foreignThread } }), undefined);
    const listed = []; for await (const tuple of current.list(undefined)) listed.push(tuple);
    assert.ok(listed.every(tuple => tuple.config.configurable.thread_id === admission.thread.id));
    await assert.rejects(current.put({ configurable: { thread_id: foreignThread } }, latest.checkpoint, latest.metadata, {}), /row-level security/);
    await current.deleteThread(foreignThread);
    assert.ok(await scopedSaver(pool, { owner, thread: foreignThread }).getTuple({ configurable: { thread_id: foreignThread } }));
    await assert.rejects(store.admit("10000000-0000-4000-8000-000000000001", { requestId: active.turn.request_id,
      request: { kind: "continue", threadId: admission.thread.id, text: "", context: request.context }, resume: true }), /unavailable/);
    await assert.rejects(stale.put(latest.config, latest.checkpoint, latest.metadata, {}), /claim expired/);
    await assert.rejects(stale.putWrites(latest.config, [["x", "stale"]], "task"), /claim expired/);
    await assert.rejects(stale.deleteThread(admission.thread.id), /claim expired/);
    await assert.rejects(store.project(active.scope, active.turn, latest.checkpoint.id, []), /claim changed/);
    await execute(reclaimed);
    for (const review of [false, true]) {
      const legacyThread = crypto.randomUUID();
      const seed = crypto.randomUUID();
      const scope = { owner, thread: legacyThread };
      await ownedTransaction(pool, scope, async client => {
        await client.query("insert into public.agent_thread(id,user_id,title) values($1,$2,'Historical thread')", [legacyThread, owner]);
        await client.query(`insert into public.agent_message(id,thread_id,user_id,role,parts) values($1,$2,$3,'user',$4)`,
          [seed, legacyThread, owner, JSON.stringify([{ type: "text", text: review ? "Opened a Coach exception review (evidence revision 1). Use the current authorized review context; this message does not confirm a training change." : "An unanswered historical question" }])]);
      });
      const imported = await store.admit(owner, { requestId: crypto.randomUUID(), request: review
        ? { kind: "review", threadId: legacyThread, context: request.context }
        : { kind: "continue", threadId: legacyThread, text: "Continue that question", context: request.context }, seedId: review ? seed : undefined });
      const output = await execute(imported);
      assert.equal(output.filter(row => row.role === "user").length, review ? 1 : 2);
      assert.ok(output.some(row => row.id === seed));
      assert.ok((await scopedSaver(pool, scope).getTuple({ configurable: { thread_id: legacyThread } })).checkpoint.channel_values.messages.some(message => message.id === `ui:${seed}`));
    }
    console.log("PASS: production admission, duplicate/conflicting sends, real native execution, projection-only recovery and stale-worker fencing");
  } else if (process.argv[2] === "interrupt") {
    const admission = await store.admit(owner, { requestId: "50000000-0000-4000-8000-000000000002", request });
    await execute(admission);
    throw Error("Expected this worker to be killed while the provider is pending");
  } else if (process.argv[2] === "resume") {
    const interruptedRequest = "50000000-0000-4000-8000-000000000002";
    const thread = stableUuid(`thread:${owner}:${interruptedRequest}`);
    const scope = { owner, thread };
    const interrupted = await store.status(scope);
    assert.equal(interrupted.status, "interrupted");
    assert.equal(await recoverDurableTurn(store, scope, interrupted), null);
    assert.equal(calls, 0);
    const admission = await store.admit(owner, { requestId: interruptedRequest, request: { kind: "continue", threadId: thread, text: "", context: request.context }, resume: true });
    const output = await execute(admission);
    assert.equal(output.filter(row => row.role === "user").length, 1);
    assert.equal(output.filter(row => row.role === "assistant").length, 1);
    assert.equal(calls, 1);
    console.log("PASS: killed pending worker resumes explicitly after database restart without duplicate input or automatic generation");
  } else {
    const replay = await store.admit(owner, { requestId, request });
    assert.equal(replay.execute, false);
    assert.equal(replay.history.filter(row => row.role === "user").length, 3);
    assert.equal(replay.history.filter(row => row.role === "assistant").length, 3);
    assert.equal(calls, 0);
    const state = await scopedSaver(pool, { owner, thread: replay.thread.id }).getTuple({ configurable: { thread_id: replay.thread.id } });
    assert.ok(state);
    assert.equal(state.checkpoint.channel_values.skillsMetadata[0].name, "coach-context-check");
    assert.equal(state.checkpoint.channel_values.messages.filter(message => message.additional_kwargs.lc_source === "pinned_skill").length, 1);
    console.log("PASS: production checkpoints retain skill metadata and one native pin without projecting internal instructions");
    console.log("PASS: fresh process after PostgreSQL restart restores production runtime state and UI projection without generation");
  }
} finally { await pool.end(); }
