import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PROGRAM_TEMPLATES } from "../src/lib/program-templates";
import { buildProgramTreeFromTemplate } from "../src/lib/program-from-template";
import { resolvePrescription } from "../src/lib/periodization";
import { editorSlot, type WorkoutEditorPlan } from "../src/lib/workout-editor";
import type { Pattern } from "../src/lib/strength/coefficients";
import { prerequisite } from "./verification-plan.mjs";

const blocked = prerequisite("database", process.env);
if (blocked) throw Error(blocked);

async function main() {
  const db = new pg.Client({ connectionString: process.env.COACH_TEST_DATABASE_URL });
  await db.connect();
  let starts = 0;
  try {
    for (const template of PROGRAM_TEMPLATES) {
      for (const style of ["classic", "fluid"] as const) {
        await db.query("begin");
        try {
          const owner = randomUUID();
          const tree = buildProgramTreeFromTemplate(template, { programId: randomUUID(), isActive: true, style });
          await db.query("insert into auth.users(id,email) values($1,$2)", [owner, `compat-${owner}@example.test`]);
          await db.query("set local role authenticated");
          await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)", [owner]);
          // Use the same program writer as the gallery, without resolving equipment or saving editor changes.
          await db.query("select public.save_program($1)", [tree]);
          const phases = tree.phases.map((phase, position) => ({ ...phase, position }));
          for (const [completed, day] of tree.days.entries()) {
            const label = `${template.id}/${style}/${day.name}`;
            const plan: WorkoutEditorPlan = {
              version: 1,
              slots: day.slots.map(slot => editorSlot({
                ...slot, pattern: slot.pattern as Pattern, restSeconds: slot.restSeconds ?? 90,
                prescription: resolvePrescription(slot, 1, phases), effectiveTarget: { target: null },
              })),
            };
            const source = (await db.query("select source_revision from public.coach_refresh_state where user_id=$1", [owner])).rows[0].source_revision;
            const args = [tree.id, day.id, completed, source, 0, plan];
            const start = () => db.query("select public.start_workout_plan($1,$2,$3,$4,$5,$6) id", args);
            const session = (await start()).rows[0].id;
            assert.equal((await start()).rows[0].id, session, `${label}: retry resumes the same session`);
            const captured = (await db.query("select plan_snapshot from public.workout_session where id=$1", [session])).rows[0].plan_snapshot;
            assert.deepEqual(captured, plan, `${label}: capture preserves unresolved exercise identities and sets`);
            assert.equal(Number((await db.query("select count(*) n from public.set_log where user_id=$1", [owner])).rows[0].n), 0, `${label}: Start invents no performance evidence`);
            await db.query("update public.workout_session set finished_at=now() where id=$1", [session]);
            starts++;
          }
          console.log(`PASS untouched program starts: ${template.id}/${style} (${tree.days.length} days)`);
        } catch (error) {
          throw new Error(`Untouched program compatibility failed: ${template.id}/${style}`, { cause: error });
        } finally {
          // Synthetic users, programs and sessions never survive a test, including a failed Start.
          await db.query("rollback");
        }
      }
    }
    assert.ok(starts > 0, "The template compatibility matrix must exercise at least one day");
    console.log(`PASS ${starts} untouched program days start and resume through authenticated RPCs`);
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
