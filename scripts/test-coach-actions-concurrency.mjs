import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import { prerequisite } from "./verification-plan.mjs";
import { verifyCoachRuntimeRole } from "./test-fixtures/coach-role.mjs";
const blocked = prerequisite("database", process.env); if (blocked) throw Error(blocked);
const clients = Array.from({ length: 3 }, () => new pg.Client({ connectionString: process.env.COACH_TEST_DATABASE_URL }));
await Promise.all(clients.map(c => c.connect()));
const [admin, first, second] = clients;
const owner = randomUUID(), other = randomUUID(), program = randomUUID(), day = randomUUID(), slot = randomUUID(), episode = randomUUID();
const keyId = `actions-${randomUUID()}`, key = Buffer.alloc(32, 0x33);
async function begin(db, id = owner) { await db.query("begin"); await db.query("set local role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]); }
async function command(operation, extra) {
  const { rows: [state] } = await admin.query("select source_revision,state_version from public.coach_refresh_state where user_id=$1", [owner]);
  const now = new Date(); const payload = JSON.stringify({ owner, operation, version: "episodes-v1", policyVersion: "1.0", keyId,
    issuedAt: now.toISOString(), expiresAt: new Date(+now + 60000).toISOString(), sourceRevision: state.source_revision, stateVersion: state.state_version, preferencesVersion: 0, ...extra });
  return [payload, createHmac("sha256", key).update(payload).digest("hex")];
}
async function call(db, name, cmd) { return (await db.query(`select public.${name}($1,$2) as r`, cmd)).rows[0].r; }
async function action(intent, extra = {}) { return command("confirm_action", { intent, intentFingerprint: JSON.stringify(intent), slotId: slot, exerciseId: "db-bench", offeredAction: "rep_change", ladderStep: 0, repMin: 12, repMax: 15, ...extra }); }
function intent(action = "rep_change", revision = 1) { return { episodeId: episode, occurrence: 1, revision, requestId: randomUUID(), action, replacementId: action === "swap" ? "db-incline-bench" : null, sessionId: null, scope: "program" }; }
async function reset(extra = {}) {
  const data = { contextKey: "test-lift", family: "lift_performance", occurrence: 1, revision: 1, state: "open", validity: "current", evidence: {
    name: "Bench", candidate: { scope: { kind: "lift", slotId: slot, context: { programId: program, exerciseId: "db-bench" } },
      signals: [{ reason: "confirmed_plateau", action: "rep_change", repBand: { repMin: 12, repMax: 15 } }] } },
    fingerprint: "fixture", frontier: [], attentionHistory: [], terminalReason: null, snoozeSourceIds: null, ...extra };
  await admin.query("delete from public.coach_action_receipt where user_id=$1", [owner]);
  await admin.query("delete from public.movement_adaptation where user_id=$1", [owner]);
  await admin.query("update public.coach_episode set data=$1,revision=1,state='open',validity='current' where id=$2", [data, episode]);
}
try {
  await verifyCoachRuntimeRole(admin);
  await admin.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [owner, `${owner}@example.test`, other, `${other}@example.test`]);
  await admin.query("insert into private.coach_command_key values($1,$2,now()-interval '1 hour',now()+interval '1 hour')", [keyId, key]);
  await admin.query("insert into public.program(id,user_id,name,weeks,is_active,style) values($1,$2,'Actions',6,true,'fluid')", [program, owner]);
  await admin.query("insert into public.program_day(id,user_id,program_id,position,name) values($1,$2,$3,0,'Upper')", [day, owner, program]);
  await admin.query("insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values($1,$2,$3,0,'db-bench','horizontal_press',3,6,10,2)", [slot, owner, day]);
  await admin.query("insert into public.coach_episode(id,user_id,context_key,family,occurrence,revision,state,validity,data) values($1,$2,'test-lift','lift_performance',1,1,'open','current','{}')", [episode, owner]);
  await reset();
  const open = await command("open_episode", { episodeId: episode, revision: 1 });
  await begin(first); const a = await call(first, "open_coach_episode", open);
  await begin(second); const competing = call(second, "open_coach_episode", open);
  await first.query("commit"); const b = await competing; await second.query("commit");
  assert.equal(a.threadId, b.threadId);
  assert.equal((await admin.query("select count(*)::int n from public.agent_message where thread_id=$1", [a.threadId])).rows[0].n, 1);
  console.log("PASS simultaneous opens reuse one owned thread and seed");
  await begin(first, other);
  assert.equal((await first.query("select count(*)::int n from public.coach_episode_thread")).rows[0].n, 0);
  await assert.rejects(call(first, "open_coach_episode", open), /Invalid Coach command/); await first.query("rollback");
  console.log("PASS other owner cannot read links or replay an owner's command");
  const choice = intent(); const cmd = await action(choice);
  await begin(first); const result = await call(first, "commit_coach_episode_action", cmd); assert.equal(result.status, "ready");
  await begin(second); const retry = call(second, "commit_coach_episode_action", cmd);
  await first.query("commit"); assert.deepEqual(await retry, result); await second.query("commit");
  assert.equal((await admin.query("select count(*)::int n from public.movement_adaptation where user_id=$1", [owner])).rows[0].n, 1);
  assert.equal((await admin.query("select count(*)::int n from public.coach_action_receipt where user_id=$1", [owner])).rows[0].n, 1);
  console.log("PASS simultaneous confirmation and lost-response replay apply once");
  const expiredPayload = { ...JSON.parse(cmd[0]), issuedAt: new Date(Date.now()-120000).toISOString(), expiresAt: new Date(Date.now()-60000).toISOString() };
  const expiredText = JSON.stringify(expiredPayload);
  const expired = [expiredText, createHmac("sha256",key).update(expiredText).digest("hex")];
  await begin(first); assert.deepEqual(await call(first,"commit_coach_episode_action",expired),result); await first.query("commit");
  const forged = [expiredText, "0".repeat(64)];
  await begin(first); await assert.rejects(call(first,"commit_coach_episode_action",forged),/Invalid Coach command/); await first.query("rollback");
  console.log("PASS expired-command receipt replay still requires owner and MAC integrity");
  await begin(first); const conflict = await action({ ...choice, action: "keep_going" });
  assert.equal((await call(first, "commit_coach_episode_action", conflict)).status, "request_conflict"); await first.query("rollback");
  await begin(first); assert.equal((await call(first, "commit_coach_episode_action", await action(intent()))).status, "stale_action"); await first.query("rollback");
  console.log("PASS conflicting intent and consumed revision reject");
  await reset(); const stale = await action(intent());
  await admin.query("update public.program_slot set target_rir=3 where id=$1", [slot]);
  await begin(first); assert.equal((await call(first, "commit_coach_episode_action", stale)).status, "stale_action"); await first.query("rollback");
  const session = randomUUID(); const preWorkout = await action(intent());
  await admin.query("insert into public.workout_session(id,user_id,program_id,program_day_id,week_index) values($1,$2,$3,$4,1)", [session, owner, program, day]);
  await begin(first); const scopeCmd = await action(intent());
  assert.equal((await call(first, "commit_coach_episode_action", scopeCmd)).status, "scope_changed"); await first.query("rollback");
  await begin(first); assert.equal((await call(first, "commit_coach_episode_action", preWorkout)).status, "stale_action"); await first.query("rollback");
  console.log("PASS source edits and newly opened workouts reject old scope");
  const racing = await action({ ...intent(), sessionId: session });
  await begin(first);
  await first.query("insert into public.set_log(user_id,session_id,program_slot_id,exercise_id,weight,reps,rir,set_index) values($1,$2,$3,'db-bench',40,8,2,0)",[owner,session,slot]);
  await begin(second); const actionRace=call(second,"commit_coach_episode_action",racing);
  await first.query("commit"); assert.equal((await actionRace).status,"stale_action"); await second.query("commit");
  console.log("PASS a competing set write wins before confirmation and invalidates its source");
  // A transaction failure after the adaptation insertion must roll back all training writes.
  await admin.query(`create function private.fail_test_receipt() returns trigger language plpgsql as $$ begin raise exception 'injected receipt failure'; end $$;
    create trigger fail_test_receipt before insert on public.coach_action_receipt for each row execute function private.fail_test_receipt()`);
  await reset();
  await begin(first); await assert.rejects(call(first, "commit_coach_episode_action", await action({ ...intent(), sessionId: session })), /injected receipt failure/); await first.query("rollback");
  assert.equal((await admin.query("select count(*)::int n from public.movement_adaptation where user_id=$1", [owner])).rows[0].n, 0);
  await admin.query("drop trigger fail_test_receipt on public.coach_action_receipt; drop function private.fail_test_receipt()");
  console.log("PASS failed receipt insertion rolls back adaptation and episode transition");
  await begin(first); const kept = await call(first, "commit_coach_episode_action", await action({ ...intent("keep_going"), sessionId: session })); await first.query("commit");
  assert.equal(kept.receipt.status, "snoozed");
  assert.equal((await admin.query("select data->>'state' s from public.coach_episode where id=$1", [episode])).rows[0].s, "open");
  console.log("PASS Keep going records dismiss and snooze without a structural change");
  await reset({ evidence: { candidate: { scope: { kind: "lift", slotId: slot, context: { programId: program, exerciseId: "db-bench" } }, signals: [{ reason: "confirmed_plateau", action: "swap" }] } } });
  await begin(first); const swapped = await call(first, "commit_coach_episode_action", await action({ ...intent("swap"), sessionId: session }, { offeredAction: "swap", replacementId: "db-incline-bench" })); await first.query("commit");
  assert.equal(swapped.receipt.status, "applied");
  assert.equal((await admin.query("select exercise_swaps->$1 as choice from public.workout_session where id=$2", [slot, session])).rows[0].choice, "db-incline-bench");
  assert.equal((await admin.query("select exercise_id from public.program_slot where id=$1", [slot])).rows[0].exercise_id, "db-bench");
  console.log("PASS open-workout replacement commits adaptation and slot choice together");
} finally {
  await Promise.all([first, second].map(c => c.query("rollback").catch(() => {})));
  await admin.query("drop trigger if exists fail_test_receipt on public.coach_action_receipt; drop function if exists private.fail_test_receipt()");
  await admin.query("delete from auth.users where id=any($1)", [[owner, other]]);
  await admin.query("delete from private.coach_command_key where key_id=$1", [keyId]);
  await Promise.all(clients.map(c => c.end()));
}
