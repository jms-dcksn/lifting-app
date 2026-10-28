---
name: blast-radius
description: Use before shipping a change that might break a caller the diff does not show. Prove the one safety fact by running code.
---

# Blast radius

Adapted from Lauren Tan's pstack (MIT). See ../PSTACK-LICENSE and ../NOTICE.

Find what a change breaks somewhere else, before it ships. Listing direct callers is not the job. Those are a search. The job is the breakage a search will not show, and the one fact that makes the change safe.

You are one agent. Do not fan the question out to other models. Do not wait for a human on a reversible check.

## Do not trust the writeup

A blast-radius note can sound right and still be false. For each fact the change's safety depends on, get as far down this list as is cheap, and say where you stopped.

1. You said so. Worthless on its own.
2. You pointed at the line. A real `file:line`, or the library's own source.
3. You showed the bad case cannot happen, step by step.
4. You ran it. A test or script that calls the real code and fails if you are wrong.
5. You reproduced it in the running app.

Step 4 is the usual bar: one small test that imports the same module the app ships and calls the function you are worried about.

## Steps

1. Read the diff. Name the symbols it adds, changes, and deletes, including behavior the diff does not spell out.
2. Find the one fact the change is safe because of. Example: "this call only drops already-dead cache entries." If that fact holds, most scary cases clear at once.
3. Look where search stops. Read the library you call at its pinned version. Follow JSON shapes, database columns, RPC argument lists, feature flags, and code three hops downstream.
4. Keep only risks you can give a real chance and a real cost. Cite `file:line`. A search that finds nothing is still an answer. Never invent a caller.
5. Prove the one fact. Run the test or script. Paste the command and the result. If you could not run it, mark the fact unproven.

## In this repo

- **Migrations.** A file in `supabase/migrations/<version>_*.sql` is not applied by merging. Production `npm run build` runs `scripts/check-hosted-migrations.ts`, which asks `deployment_applied_migration_versions` which of those version prefixes are already in `supabase_migrations.schema_migrations`. A missing or misnamed file fails the build and leaves the previous deployment serving. Server Components and RPCs that read a new column are wrong until a human has pushed. Prove the SQL on a local disposable database when you can. Do not run it on the hosted database.
- **Progression and targets.** A change in `src/lib` to session targets, e1RM, or `resolveExactWorkoutTarget()` moves every consumer that must share those helpers (Home, planner, Coach, review). The break search misses is a UI or agent path that recomputes the number instead of calling the helper.
- **Server Components calling Supabase RPCs.** The signed-in client and RLS are the authority. A changed argument or return shape breaks every caller and the ownership tests under `supabase/tests/`. Prove that fact with the existing Vitest or local pgTAP seam, not with a paragraph.

## What to hand back

- **What it does.** What changed, including the part that is not obvious.
- **The one fact it is safe because of.** State it, say which step you reached, and show the proof. If you could not prove it, write unproven.
- **Risks.** How it breaks, the `file:line`, how likely, how bad, and the check. Paste proof for the ones that matter.
- **Cleared.** What you checked and why it is fine.
- **Before merge.** The cheapest test that would catch the real bug. You still do not merge.
