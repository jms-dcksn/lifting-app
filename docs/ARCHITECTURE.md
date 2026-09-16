# Architecture

Read this when changing the engine, catalog, persistence, program loading, or auth.
[Decisions](DECISIONS.md) records rationale; feature contracts linked from
[AGENTS.md](../AGENTS.md) own detailed behavior. Versions and commands live in `package.json`.

## Strength and exercise identity

`src/lib/strength/` is framework-free TypeScript. Active-session targets run client-side
from hydrated catalog, stats, and first-set history; writes and cache rebuilds run server-side.

- `e1rm.ts` converts weight/reps/RIR through the RPE/RIR load model and inverts it for target
  loads. Preserve this model rather than replacing it with a bare Epley/Brzycki formula.
- `coefficients.ts` owns seeded exercises and population coefficients. `recommend.ts` pools
  reference-lift strength by movement pattern and uses Bayesian shrinkage (`PRIOR_WEIGHT`).
- `catalog.ts` merges seeds with the owner's machine variants and custom exercises; seeds
  win ID collisions. Use the merged catalog in screens and stat rebuilds. `exercise_id` is
  a text slug, intentionally not a foreign key. `exercise-id.ts` owns variant/custom IDs.
- Log barbell/machine total load, one dumbbell's load, and bodyweight added load (negative
  for assistance, including dips/pull-ups). `effectiveLoad()` returns null for unknown
  bodyweight. Live loads use `getCurrentBodyweight()` (newest observation, then profile
  baseline); historical edits and records recover bodyweight from the saved set's e1RM.
- A generic machine template has no absolute load identity. `resolveVariant` in
  `src/app/(app)/exercise/actions.ts` find-or-creates a brand/type variant under the per-user
  unique index; `createCustomExercise` creates custom definitions. Canonical variant ids are
  `base__brand__machinetype`, but `exercise.id` is a global primary key, so a second owner of
  the same brand/type gets an owned id rather than crashing the picker. Session/planner pickers
  resolve machines before logging; the program builder can store generic templates.
- Machines require calibration because stack/leverage units do not transfer from free
  weights. `recomputeAndUpsertStat` in `src/app/(app)/session/actions.ts` anchors the personal
  coefficient against other variants' pattern strength during the first session, then
  holds it fixed. Distinct working-set sessions supply `coeff_confidence_n`. Later progress
  moves pattern strength rather than continuously re-calibrating the coefficient.
- `recompute.ts` rebuilds demonstrated strength from working sets; `user_exercise_stat`
  remains a derived cache. Record baselines use saved sets, not this mutable cache.

`progression.ts` owns `startingWeight()`, `sessionTarget()`, and
`selectProgressionReference()`. Active sessions and weekly Coach proposals share them:

1. Group first-set history by exact exercise. The latest exact slot/exercise exposure anchors
   a bounded window; choose the highest-e1RM performance at or after it. With no same-slot
   exposure, use the best of four recent exposures. Ties favor recency; unavailable e1RM
   falls back to recent performance. An old all-time best cannot override this window.
2. No usable reference delegates to the recommender at `rep_min`. A first set below the
   floor recalibrates load without increasing it; reaching `rep_max` adds the exercise's
   increment and resets reps to the floor; otherwise hold weight and target one more rep.
3. The bump test is reps-only. Coach effort reductions use first-set RIR; hard back-off
   sets must not lower an accurately loaded top set.

`plateau.ts` owns Fluid detection, rep-band changes, and swap ranking; `fluid.ts` loads
adaptation context. Manual swaps preserve rep ranges and reset plateau state, unlike coach
`swap` interventions. Follow [swap persistence](EXERCISE-SWAPS.md). Coach, Fluid and monthly review share
`stall-report.ts` and the complete owner-scoped history/context loader in `stall-data.ts`;
see the [shared stall contract](MONTHLY-PROGRESS.md#shared-stall-contract).

## Programs and prescriptions

`program.ts` assembles complete programs and ordered phases. `listProgramSummaries()` uses
batched program/day/slot queries; `program-summary.ts` sorts active first, then newest.
The builder preserves day/slot IDs with upsert/delete-missing, maintaining set-history links.
Saving activates the program; the partial unique index allows at most one active program.
Clones are inactive drafts. Template creation activates only for an account without programs.

`program-templates.ts` owns shared templates; adding one needs no seed or migration.
Use its descriptions for transcription approximations (percentage work, reverse pyramids,
rest-pause), and its tests for catalog/pattern and week-range validation. Existing program
copies are independent of template edits unless an explicit, scoped data migration is
applied (as for the September 14 Strong Foundations variety revision). [Strong Foundations](STRONG-FOUNDATIONS.md) owns
that template's time budget and coaching rationale.

Classic programs resolve effective sets and RIR through `periodization.ts`; fractional set
counts round up with a minimum of one. RIR ranges display in full and use the upper bound
for recommendations. Fluid programs fold adaptations and do not resolve classic phases.
The next day/week derives from finished sessions for the active program, then creation
stores `program_day_id` and `week_index` on the session for historical prescriptions.
`loadNextWorkout` shares this sequence and prescription path across Home, planner, and Start.
See [planning](WORKOUT-PLANNING.md) for cookie identity and atomic session insertion.
Per-slot `restSeconds` overrides the profile default; save, clone, and loading preserve it.

Program routes: `/program` is the summary gallery, `/program/[id]` the read-only detail,
`/program/[id]?mode=edit` edits, and `/program/new` creates. Edit save/cancel returns to detail.

## Data and auth boundaries

Migrations in `supabase/migrations/` and types in `src/lib/supabase/types.ts` describe the
schema. New user-owned tables follow ownership RLS. The signup trigger creates a profile;
profile/catalog read errors must surface instead of rendering invented empty state.

`src/lib/supabase/client.ts` and `server.ts` use the public publishable key and cookie-based
SSR. Email magic-link login exchanges its code in `src/app/auth/callback/route.ts`.
`createClient()`, `getCatalogMap()`, and `getCurrentBodyweight()` are wrapped in React
`cache()`, so a request loads each once. `cache()` keys on argument identity, so the shared
client instance is what lets layout, page, and action calls hit the same entry; keep it
memoized. The Coach API's elevated client is separate and unaffected.
`src/proxy.ts` calls `updateSession()` from `src/lib/supabase/middleware.ts` on matched
requests and propagates refreshed cookies. It does not redirect unauthenticated users:
the app layout and authenticated actions enforce access via `getClaims()`.

The sole elevated application read path is `GET /api/coach/v1/weekly`:
route → `createCoachWeeklyHandler()` → `loadCoachWeekly()` → server-only secret client.
Every query retains an explicit `COACH_API_USER_ID` predicate because the secret bypasses
RLS. Preserve capability auth and no-store/noindex responses. Configuration, privacy,
and rotation live in [Coach report](COACH-REPORT.md#weekly-coach-api) and [deployment](../DEPLOY.md).

## History and reporting

- In-session quick history uses `exerciseFamilyIds()` to include explicitly linked machine
  variants, returns ten latest sets from previous workouts, and loads only when opened.
  This family grouping is for browsing; progression and records use exact exercise identity.
- Per-exercise `/history/[exerciseId]` compares session-best e1RM with the previous exposure.
  The Progress hub uses `analytics.ts` for volume, balance, trends, and its legacy records
  feed. Pattern-strength replay does not replay historical personal machine coefficients.
- Live PR pills and completion recaps share `strength/records.ts` through the paginated
  `loadWorkoutRecords`. Compare against history finished before the session's start.
  Read [workout records](DECISIONS.md#workout-records) before changing eligibility or precision.
- Coach snapshot/export and weekly API share `coach-check-in.ts` plus deterministic proposals
  in `coach-recommendations.ts`. Accept/dismiss/defer persists review state, not prescriptions.
- Weight calendar, trend, and monthly loaders have separate complete-history and date-window
  contracts. Follow their feature docs rather than reusing a capped dashboard query.
- Monthly PR totals replay canonical workout records; monthly strength compares stored eligible
  e1RMs. Flat monthly changes are descriptive, not a stall diagnosis.
