import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { emptyCheckpoint } from "@langchain/langgraph-checkpoint";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

// Called only with the parent runner's newly created, disposable cluster.
export async function proveSliceBSchema(admin, adminUrl) {
  const a = "10000000-0000-4000-8000-000000000001";
  const b = "10000000-0000-4000-8000-000000000002";
  const threadA = "20000000-0000-4000-8000-000000000001";
  const threadB = "20000000-0000-4000-8000-000000000002";
  const inputA = "30000000-0000-4000-8000-000000000001";
  const inputB = "30000000-0000-4000-8000-000000000002";
  await admin.query(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;`);
  for (const name of ["20260920181553_agent_threads.sql", "20260927170000_agent_multi_thread.sql"]) {
    await admin.query(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
  }
  await admin.query(await readFile(new URL("./slice-b-schema.sql", import.meta.url), "utf8"));
  await admin.query("create table public.training_fixture(id int)");
  await admin.query("insert into auth.users values ($1), ($2)", [a, b]);
  await admin.query("insert into public.agent_thread(id,user_id,title) values ($1,$2,'A'), ($3,$4,'B')", [threadA, a, threadB, b]);
  await admin.query(`insert into public.agent_message(id,thread_id,user_id,role,parts)
    values ($1,$2,$3,'user','[]'), ($4,$5,$6,'user','[]')`, [inputA, threadA, a, inputB, threadB, b]);
  await admin.query(`insert into coach_runtime.thread(conversation_id,owner_id,runtime_version)
    values ($1,$2,'coach-deep-v1'), ($3,$4,'coach-deep-v1')`, [threadA, a, threadB, b]);
  const url = new URL(adminUrl);
  url.username = "coach_agent_runtime";
  // The draft provisions NOLOGIN. Only this disposable fixture enables login.
  const password = decodeURIComponent(url.password);
  assert.match(password, /^[0-9a-f]+$/);
  await admin.query(`alter role coach_agent_runtime login password '${password}'`);
  const pools = [];
  function scoped(owner, thread) {
    const pool = new pg.Pool({ connectionString: url.href, max: 1,
      options: `-c coach.owner=${owner} -c coach.thread=${thread}` });
    pools.push(pool);
    return { pool, saver: new PostgresSaver(pool, undefined, { schema: "coach_runtime" }) };
  }
  const ownerA = scoped(a, threadA);
  const ownerB = scoped(b, threadB);
  const wrong = scoped(b, threadA);
  const configA = { configurable: { thread_id: threadA } };
  const configB = { configurable: { thread_id: threadB } };
  try {
    const checkpoint = emptyCheckpoint();
    checkpoint.channel_values = { proof: "persisted" };
    checkpoint.channel_versions = { proof: "1" };
    const metadata = { source: "input", step: -1, parents: {} };
    const storedA = await ownerA.saver.put(configA, checkpoint, metadata, checkpoint.channel_versions);
    await ownerA.saver.putWrites(storedA, [["proof", "pending"]], "fixture-task");
    await ownerB.saver.put(configB, checkpoint, metadata, checkpoint.channel_versions);
    assert.ok(await ownerA.saver.getTuple(configA));
    assert.ok(await ownerB.saver.getTuple(configB));
    assert.equal(await wrong.saver.getTuple(configA), undefined);
    assert.equal(await ownerA.saver.getTuple(configB), undefined);
    const listed = [];
    for await (const state of ownerA.saver.list(undefined)) listed.push(state);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].config.configurable.thread_id, threadA);
    await assert.rejects(ownerA.saver.put(configB, checkpoint, metadata, {}), /row-level security/);
    await assert.rejects(ownerA.saver.putWrites({ configurable: { thread_id: threadB, checkpoint_id: checkpoint.id } }, [["proof", "forbidden"]], "fixture-task"), /row-level security/);
    await ownerA.saver.deleteThread(threadB);
    assert.ok(await ownerB.saver.getTuple(configB));
    assert.equal((await ownerA.pool.query("select * from public.agent_message")).rowCount, 1);
    assert.equal((await wrong.pool.query("select * from public.agent_message")).rowCount, 0);
    assert.equal((await wrong.pool.query("update public.agent_thread set title='forbidden' returning id")).rowCount, 0);
    await assert.rejects(ownerA.pool.query("insert into public.agent_message(thread_id,user_id,role,parts) values ($1,$2,'user','[]')", [threadB, a]), /row-level security/);
    await assert.rejects(ownerA.pool.query("select * from public.training_fixture"), /permission denied/);
    await assert.rejects(ownerA.pool.query("select * from auth.users"), /permission denied/);
    await assert.rejects(ownerA.pool.query("select * from coach_runtime.checkpoint_migrations"), /permission denied/);
    await assert.rejects(ownerA.saver.setup(), /permission denied/);
    const role = await ownerA.pool.query("select rolsuper, rolbypassrls from pg_roles where rolname=current_user");
    assert.deepEqual(role.rows[0], { rolsuper: false, rolbypassrls: false });
    console.log("PASS: Slice B draft supports native saver; non-bypass role isolates conversations and cannot access training/auth data or run setup");

    const request = "40000000-0000-4000-8000-000000000001";
    const insert = `insert into coach_runtime.turn(request_id,owner_id,conversation_id,payload_hash,input_message_id,status,epoch)
      values ($1,$2,$3,$4,$5,'accepted',1)`;
    await assert.rejects(ownerA.pool.query(insert, [request, a, threadA, "a".repeat(64), inputB]), /foreign key/);
    await ownerA.pool.query(insert, [request, a, threadA, "a".repeat(64), inputA]);
    await assert.rejects(ownerA.pool.query(insert, [request, a, threadA, "a".repeat(64), inputA]), /duplicate key/);
    await assert.rejects(ownerA.pool.query(insert, ["40000000-0000-4000-8000-000000000002", a, threadA, "b".repeat(64), inputA]), /coach_one_unresolved_turn/);
    await assert.rejects(ownerA.pool.query("update coach_runtime.turn set status='running' where request_id=$1", [request]), /check constraint/);
    await assert.rejects(ownerA.pool.query("update coach_runtime.turn set status='completed' where request_id=$1", [request]), /check constraint/);
    await assert.rejects(ownerA.pool.query("update coach_runtime.thread set bootstrap_version=1 where conversation_id=$1", [threadA]), /check constraint/);
    assert.equal((await wrong.pool.query("select * from coach_runtime.turn")).rowCount, 0);
    console.log("PASS: draft rejects cross-thread input, duplicate/unresolved sends and incomplete bootstrap/completion records");

    await ownerA.pool.query("update coach_runtime.turn set status='running',lease_until=now()+interval '90 seconds' where request_id=$1", [request]);
    await ownerA.pool.query(`update coach_runtime.turn set status='completed',lease_until=null,
      committed_checkpoint_id=$2,projected_checkpoint_id=$2 where request_id=$1`, [request, checkpoint.id]);
    await ownerA.pool.query(insert, ["40000000-0000-4000-8000-000000000002", a, threadA, "b".repeat(64), inputA]);
    assert.equal((await ownerA.pool.query("select * from coach_runtime.turn")).rowCount, 2);
    console.log("PASS: completed/projected work permits the next distinct accepted turn");

    for (const table of ["checkpoints", "checkpoint_blobs", "checkpoint_writes"]) {
      assert.ok((await admin.query(`select * from coach_runtime.${table} where thread_id=$1`, [threadA])).rowCount > 0);
    }
    await admin.query("delete from auth.users where id=$1", [a]);
    for (const table of ["thread", "turn", "checkpoints", "checkpoint_blobs", "checkpoint_writes"]) {
      const column = table === "turn" || table === "thread" ? "conversation_id" : "thread_id";
      assert.equal((await admin.query(`select * from coach_runtime.${table} where ${column}=$1`, [threadA])).rowCount, 0);
    }
    assert.ok(await ownerB.saver.getTuple(configB));
    console.log("PASS: account deletion cascades runtime state without deleting another owner's checkpoint");
  } finally {
    await Promise.all(pools.map(pool => pool.end()));
  }
}
