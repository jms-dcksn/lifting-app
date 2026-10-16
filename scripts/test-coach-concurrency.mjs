// Real competing transactions; run only against a disposable loopback database.
import pg from "pg";
import { createHmac, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const url = process.env.COACH_TEST_DATABASE_URL;
if (!url || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname))
  throw Error("Set COACH_TEST_DATABASE_URL to a disposable local database.");
const owner = randomUUID();
const keyId = `test-${randomUUID()}`;
const key = Buffer.alloc(32, 0x22);
const clients = await Promise.all(
  [0, 1, 2].map(async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    return c;
  }),
);
const [admin, a, b] = clients;
async function begin(c) {
  await c.query("begin");
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
}
async function snapshot() {
  const { rows } = await admin.query(
    "select source_revision,state_version from public.coach_refresh_state where user_id=$1",
    [owner],
  );
  return rows[0] ?? { source_revision: "0", state_version: "0" };
}
function command(state, { episodes = [], notices = [], ...extra } = {}) {
  const now = new Date();
  const payload = JSON.stringify({
    owner,
    operation: "refresh",
    version: "episodes-v1",
    policyVersion: "1.0",
    keyId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(+now + 60000).toISOString(),
    sourceRevision: state.source_revision,
    stateVersion: state.state_version,
    preferencesVersion: 0,
    episodes,
    notices,
    allowArrival: true,
    ...extra,
  });
  return [payload, createHmac("sha256", key).update(payload).digest("hex")];
}
async function reconcile(c, cmd) {
  return (
    await c.query(
      "select public.reconcile_coach_episodes($1,$2) as result",
      cmd,
    )
  ).rows[0].result;
}
try {
  await admin.query("insert into auth.users(id,email) values($1,$2)", [
    owner,
    `${owner}@example.test`,
  ]);
  await admin.query(
    "insert into private.coach_command_key values($1,$2,now()-interval '1 hour',now()+interval '1 hour')",
    [keyId, key],
  );
  const session = randomUUID();
  await admin.query(
    "insert into public.workout_session(id,user_id) values($1,$2)",
    [session, owner],
  );
  const state = await snapshot();
  const episode = {
    contextKey: "session_pain:v1",
    family: "session_pain",
    occurrence: 1,
    revision: 1,
    state: "open",
    validity: "current",
    evidence: null,
    fingerprint: "test",
    frontier: [session],
    attentionHistory: ["pain:session"],
    terminalReason: null,
    snoozeSourceIds: null,
  };
  const notice = {
    contextKey: episode.contextKey,
    occurrence: 1,
    attentionKey: "pain:session",
    category: "pain",
    title: "Pain review",
    body: "Synthetic test",
    evidence: { test: true },
  };
  const cmd = command(state, { episodes: [episode], notices: [notice] });
  await Promise.all([begin(a), begin(b)]);
  const first = await reconcile(a, cmd);
  assert.equal(first.status, "ready");
  // b is genuinely blocked on a's owner-state row until commit.
  let finished = false;
  const second = reconcile(b, cmd).then((r) => {
    finished = true;
    return r;
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(finished, false, "second transaction waits on first");
  await a.query("commit");
  assert.equal((await second).status, "refresh_required");
  await b.query("commit");
  let counts = await admin.query(
    "select count(*)::int as n from public.coach_notice where user_id=$1",
    [owner],
  );
  assert.equal(counts.rows[0].n, 1);
  // Lost response/retry reloads and returns the existing identity, never a second notice.
  await begin(b);
  assert.equal(
    (
      await reconcile(
        b,
        command(await snapshot(), { episodes: [episode], notices: [notice] }),
      )
    ).status,
    "ready",
  );
  await b.query("commit");
  counts = await admin.query(
    "select count(*)::int as n from public.coach_notice where user_id=$1",
    [owner],
  );
  assert.equal(counts.rows[0].n, 1);
  // Source write wins before evaluation commits: old snapshot cannot replace it.
  const stale = command(await snapshot(), {
    episodes: [episode],
    notices: [notice],
  });
  await begin(a);
  await a.query("update public.workout_session set joint_pain=$1 where id=$2", [
    "significant",
    session,
  ]);
  await begin(b);
  const race = reconcile(b, stale);
  await a.query("commit");
  assert.equal((await race).status, "refresh_required");
  await b.query("commit");
  // Rollback restores the source revision too.
  const before = await snapshot();
  await begin(a);
  await a.query(
    "update public.workout_session set joint_pain=null where id=$1",
    [session],
  );
  await a.query("rollback");
  assert.deepEqual(await snapshot(), before);
  // RPC lock audit: source state must be held before a swap/save takes slot/session locks.
  const { rows: defs } = await admin.query(
    "select pg_get_functiondef(oid) as d from pg_proc where pronamespace='public'::regnamespace and proname=any($1)",
    [
      [
        "save_program",
        "set_active_program",
        "swap_session_exercise",
        "swap_program_slot_exercise",
      ],
    ],
  );
  for (const { d } of defs)
    assert.match(d, /begin\s+perform private\.lock_coach_source\(\)/i);
  // Same source, preference change: stale preference snapshot is rejected.
  const preferences = {
    pain: false,
    reduction: true,
    plateau: true,
    decline: true,
    quietEnabled: false,
    quietStart: 1320,
    quietEnd: 420,
    timeZone: "America/Chicago",
  };
  const oldPrefs = command(await snapshot());
  await begin(a);
  await a.query("select public.save_coach_preferences($1,0)", [preferences]);
  await a.query("commit");
  await begin(b);
  assert.equal((await reconcile(b, oldPrefs)).status, "refresh_required");
  await b.query("commit");
  console.log(
    "Coach concurrency: competing refreshes, lost response, source-write race, rollback, RPC lock order and preference race passed.",
  );
} finally {
  await Promise.allSettled([a.query("rollback"), b.query("rollback")]);
  await admin.query("delete from auth.users where id=$1", [owner]);
  await admin.query("delete from private.coach_command_key where key_id=$1", [
    keyId,
  ]);
  await Promise.all(clients.map((c) => c.end()));
}
