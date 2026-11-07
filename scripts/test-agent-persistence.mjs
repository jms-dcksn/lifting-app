import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { FencedTestPool } from "./agent-persistence-pool.mjs";

// No URL input: this runner owns the disposable cluster, credentials and cleanup.
const packagePath = process.env.AGENT_TEST_PG_MODULE;
if (!packagePath) {
  console.error("BLOCKED: set AGENT_TEST_PG_MODULE to an installed embedded-postgres/dist/index.js");
  process.exit(1);
}
const { default: EmbeddedPostgres } = await import(pathToFileURL(packagePath).href);
const server = createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const port = address.port;
await new Promise(resolve => server.close(resolve));
const directory = await mkdtemp(join(tmpdir(), "coach-persistence-"));
const password = randomBytes(24).toString("hex");
const cluster = new EmbeddedPostgres({ databaseDir: join(directory, "data"), user: "postgres", password,
  port, persistent: true, createPostgresUser: false, postgresFlags: ["-h", "127.0.0.1", "-k", directory],
  onLog: () => {}, onError: message => console.error(String(message)) });
const adminUrl = `postgres://postgres:${password}@127.0.0.1:${port}/postgres`;
const runtimeUrl = `postgres://coach_runtime:${password}@127.0.0.1:${port}/postgres`;
let started = false;
let admin;
const pools = [];
const scope = { owner: "owner-a", thread: "thread-a", epoch: 1 };
function worker(mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/agent-persistence-worker.mjs", mode], {
      stdio: "inherit", env: { ...process.env, LANGSMITH_TRACING: "false", LANGCHAIN_TRACING_V2: "false",
        AGENT_TEST_DB_URL: runtimeUrl, AGENT_TEST_SCOPE: JSON.stringify(scope) },
    });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(Error(`Worker ${mode} failed (${code})`)));
  });
}
function saverFor(binding) {
  const pool = new FencedTestPool(runtimeUrl, binding);
  pools.push(pool);
  return new PostgresSaver(pool, undefined, { schema: "coach_checkpoint_test" });
}
try {
  await cluster.initialise();
  await cluster.start();
  started = true;
  admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  console.log(`Local PostgreSQL: ${(await admin.query("SHOW server_version")).rows[0].server_version}`);
  await new PostgresSaver(admin, undefined, { schema: "coach_checkpoint_test" }).setup();
  await admin.query(`
    CREATE ROLE coach_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE coach_checkpoint_test.thread_binding (thread_id text PRIMARY KEY, owner_id text NOT NULL, epoch integer NOT NULL);
    INSERT INTO coach_checkpoint_test.thread_binding VALUES ('thread-a', 'owner-a', 1), ('thread-b', 'owner-b', 1);
    GRANT USAGE ON SCHEMA coach_checkpoint_test TO coach_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA coach_checkpoint_test TO coach_runtime;
    REVOKE ALL ON coach_checkpoint_test.checkpoint_migrations FROM coach_runtime;
    ALTER TABLE coach_checkpoint_test.thread_binding ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_binding ON coach_checkpoint_test.thread_binding FOR SELECT TO coach_runtime
      USING (owner_id = current_setting('coach.owner', true));
    CREATE POLICY lock_binding ON coach_checkpoint_test.thread_binding FOR UPDATE TO coach_runtime
      USING (owner_id = current_setting('coach.owner', true)) WITH CHECK (false);
  `);
  for (const table of ["checkpoints", "checkpoint_blobs", "checkpoint_writes"]) {
    await admin.query(`ALTER TABLE coach_checkpoint_test.${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY scoped_state ON coach_checkpoint_test.${table} TO coach_runtime
      USING (thread_id = current_setting('coach.thread', true))
      WITH CHECK (thread_id = current_setting('coach.thread', true));`);
  }
  await worker("write");
  await admin.end(); admin = undefined;
  await cluster.stop(); started = false;
  await cluster.start(); started = true;
  admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  await worker("read");
  console.log("PASS: real PostgreSQL stop/start preserves harness messages and files");

  const a = saverFor(scope);
  const config = { configurable: { thread_id: scope.thread } };
  const original = await a.getTuple(config);
  assert.ok(original);
  const b = saverFor({ owner: "owner-b", thread: "thread-b", epoch: 1 });
  const bConfig = { configurable: { thread_id: "thread-b" } };
  await b.put(bConfig, original.checkpoint, original.metadata, original.checkpoint.channel_versions);
  assert.ok(await b.getTuple(bConfig), "another owner has real stored state before isolation checks");
  assert.equal(await a.getTuple({ configurable: { thread_id: "thread-b" } }), undefined);
  await assert.rejects(saverFor({ ...scope, owner: "owner-b" }).getTuple(config), /unavailable|stale/);
  const all = []; for await (const tuple of a.list(undefined)) all.push(tuple);
  assert.ok(all.length > 0 && all.every(tuple => tuple.config.configurable.thread_id === "thread-a"));
  await assert.rejects(a.put({ configurable: { thread_id: "thread-b" } }, original.checkpoint, original.metadata, {}), /row-level security/);
  await assert.rejects(a.putWrites({ configurable: { thread_id: "thread-b", checkpoint_id: original.checkpoint.id } }, [["proof", "forbidden"]], "task"), /row-level security/);
  await a.deleteThread("thread-b");
  assert.ok(await b.getTuple(bConfig), "another owner's state survives unauthorized deletion");
  const raw = new pg.Pool({ connectionString: runtimeUrl });
  try {
    const role = await raw.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user");
    assert.deepEqual(role.rows[0], { rolsuper: false, rolbypassrls: false });
    assert.equal((await raw.query("SELECT * FROM coach_checkpoint_test.checkpoints")).rowCount, 0);
    await assert.rejects(raw.query("CREATE TABLE coach_checkpoint_test.forbidden(id int)"), /permission denied/);
  } finally { await raw.end(); }
  console.log("PASS: non-owner/non-bypass role denies cross-owner read/list/write and schema creation");

  const held = await pools[0].connect();
  await held.query("BEGIN");
  const contender = await admin.connect();
  try {
    await contender.query("SET lock_timeout='100ms'");
    await assert.rejects(contender.query("UPDATE coach_checkpoint_test.thread_binding SET epoch=2 WHERE thread_id='thread-a'"), /lock timeout/);
  } finally { contender.release(); }
  await held.query("COMMIT"); held.release();
  await admin.query("UPDATE coach_checkpoint_test.thread_binding SET epoch=2 WHERE thread_id='thread-a'");
  await assert.rejects(a.put(config, original.checkpoint, original.metadata, {}), /stale/);
  await assert.rejects(a.putWrites(config, [["proof", "stale"]], "task"), /stale/);
  await assert.rejects(a.deleteThread(scope.thread), /stale/);
  const current = saverFor({ ...scope, epoch: 2 });
  await current.putWrites(original.config, [["proof", "current"]], "task");
  await current.deleteThread(scope.thread);
  assert.equal(await current.getTuple(config), undefined);
  for (const table of ["checkpoints", "checkpoint_blobs", "checkpoint_writes"]) {
    assert.equal((await admin.query(`SELECT count(*)::int AS n FROM coach_checkpoint_test.${table} WHERE thread_id='thread-a'`)).rows[0].n, 0);
  }
  console.log("PASS: takeover serializes with writes; stale checkpoint/pending-write/delete rejected; current cleanup removes all state");
} finally {
  await Promise.all(pools.map(pool => pool.end()));
  if (admin) await admin.end();
  if (started) await cluster.stop();
  await rm(directory, { recursive: true, force: true });
}
