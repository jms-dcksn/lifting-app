# Architecture

The high-level visual map of experiences, request path, data ownership, and performance
choices is [architecture.html](architecture.html). Read the rest of this document when
changing the engine, catalog, persistence, program loading, or auth. [Decisions](DECISIONS.md)
records rationale; feature contracts linked from [AGENTS.md](../AGENTS.md) own detailed
behavior. Versions and commands live in `package.json`.

## Strength and exercise identity

`src/lib/strength/` is framework-free TypeScript. Active-session targets run client-side
from hydrated catalog, stats, and first-set history; writes and cache rebuilds run server-side.

- `e1rm.ts` converts weight/reps/RIR through the RPE/RIR load model and inverts it for target
  loads. Preserve this model rather than replacing it with a bare Epley/Brzycki formula.
- `coefficients.ts` and `exercise-variations.ts` own the 162 shared templates and population
  coefficients. See [catalog inventory and model rules](EXERCISE-CATALOG.md). `recommend.ts` pools
  reference-lift strength by movement pattern and uses Bayesian shrinkage (`PRIOR_WEIGHT`).
  The expanded machine catalog includes supported-arm curls/extensions, lever pulldown,
  pullover, incline/decline press, seated dip, low row, lying/kneeling leg curls and separate
  seated calf raise/footplate calf extension. Pullover uses `vertical_pull`; seated dip uses
  `horizontal_press`, matching the existing weighted dip. All require station resolution
  and calibration. Existing custom exercises retain their own identities and history.
- `catalog.ts` merges seeds with the owner's station variants and custom exercises; seeds
  win ID collisions. Use the merged catalog in screens and stat rebuilds. `exercise_id` is
  a text slug, intentionally not a foreign key. `exercise-id.ts` owns variant/custom IDs.
- Log barbell/machine total load, one dumbbell's load, and bodyweight added load (negative
  for assistance, including dips/pull-ups). `effectiveLoad()` returns null for unknown
  bodyweight. Live loads use `getCurrentBodyweight()` (newest observation, then profile
  baseline); historical edits and records recover bodyweight from the saved set's e1RM.
- A generic station template has no absolute load identity. `resolveVariant` in
  `src/app/(app)/exercise/actions.ts` find-or-creates a brand × station-tag × optional-model
  variant under the per-user unique index; `createCustomExercise` creates custom definitions. Canonical variant
  ids remain `base__brand__tag` when model is unknown; models append a lossless
  `__model-<UTF-8 hex>` suffix. Known model names normalize to registry keys; custom models
  normalize whitespace/case. `station_model` participates in owner-local uniqueness.
  `exercise.id` is a global primary key, so a second owner of the same station gets an
  owned ID rather than crashing the picker. Session/planner pickers
  pass `resolveStations` so every `needsStation` template opens a station form before
  logging; the program builder can store generic templates. Seeded rows carry
  `stationProfile` (`machine | cable | bench | rack | platform | none`);
  `needsStation()` is `stationProfile !== "none"`. `StationTag` (`selectorized | plate_loaded |
  bench | rack | platform`) is the variant-id third segment. `resolveVariant` accepts every
  `needsStation` profile, inherits `equipment` and `needs_calibration` from the template
  (cables calibrate; barbell stations do not), locks cables to `selectorized`, stores
  `bench`/`rack`/`platform` sentinels in `machine_type`, and rejects tag/profile mismatches.
  Cable and barbell-station brands are required. Session, planner, swap, and extra-pin
  writes reject unresolved station templates. Picker copy is profile-specific
  (**Choose bench** / Choose cable / Choose rack / Choose platform / Choose machine).
  See [station composition](superpowers/specs/2026-09-21-station-composition-design.md).
- Machines and cable brand variants require calibration because stack/leverage units do
  not transfer from free weights. `recomputeAndUpsertStat` in
  `src/app/(app)/session/actions.ts` anchors the personal coefficient against other
  exact-id stats' pattern strength during the first session, then holds it fixed.
  Barbell bench/rack/platform variants skip that branch (ordinary lb). Distinct
  working-set sessions supply `coeff_confidence_n`. Later progress moves pattern
  strength rather than continuously re-calibrating the coefficient. Leftover flat
  template `set_log` rows are not rewritten; a new cable variant still calibrates.
- New flys, hip adduction, hip extension, ankle dorsiflexion and torso rotation use separate
  patterns; existing seed patterns stay unchanged. Rep-only ab-wheel/leg-raise/glute-ham
  work logs zero load and null e1RM, progresses reps, and earns rep PRs only. It contributes
  sets/hard sets but no tonnage or pooled strength. Assisted machine movements use bodyweight
  equipment plus a machine station; positive assistance in the UI stores negative added
  load. Progression reduces assistance to zero. `load-mode.ts` owns shared validation and
  formatting; `catalog.ts` restores template load modes on DB variants.
- `recompute.ts` rebuilds demonstrated strength from working sets; `user_exercise_stat`
  remains a derived cache. Record baselines use saved sets, not this mutable cache.

`progression.ts` owns `startingWeight()`, `sessionTarget()`, and
`selectProgressionReference()`. Active sessions and weekly Coach proposals share them:

1. Group first-set history by exact exercise. The latest exact slot/exercise exposure anchors
   a bounded window; choose the highest-e1RM performance at or after it. With no same-slot
   exposure, use the best of four recent exposures. Ties favor recency; unavailable e1RM
   falls back to recent performance. An old all-time best cannot override this window.
2. No usable reference delegates to the recommender at `rep_min`. At 4+ target RIR,
   recalculate load from the selected performance's e1RM at its prior rep count clamped
   to the prescribed range, capped at the prior load. Missing RIR defaults to 2. Bodyweight
   loads include current bodyweight before converting back to rounded added/assisted load;
   unknown or non-positive effective load yields no recovery target.
3. Below 4 target RIR, a first set below the
   floor recalibrates load without increasing it; reaching `rep_max` adds the exercise's
   increment and resets reps to the floor; otherwise hold weight and target one more rep.
4. The bump test is reps-only. Coach effort reductions use first-set RIR; hard back-off
   sets must not lower an accurately loaded top set.

`effective-workout-target.ts` composes `sessionTarget()` with the existing
`strength/effort.ts` reduction for two consecutive comparable first-set misses. Recovery/deload
wins; effort evidence must match current exact stall context, including phase/adaptation and
equipment instance. It returns nullable target, reason, reference/source evidence and
`current_target` suggestion status. Home/planner, active-session initial entry and next/weekly
Coach share it. See [effective targets](AI-COACH.md#effective-workout-targets-211).

`workout-target-data.ts` reuses complete owner-scoped stall history with first-set indexes.
Its projection retains the four-exposure fallback and each rendered slot's anchor/best per
exact identity plus the current effort pair, keeping the browser payload bounded. Open
sessions use pre-start history and preserve entered/logged values. Planner/agent resolve
stored open-session context instead of the completed-count phase; missing choices stay explicit.

Grouping by exact exercise stays. Card 3 of the
[2026-09-29 rollup spec](superpowers/specs/2026-09-29-non-machine-movement-rollup-design.md)
would widen ordinary-pound families only on the word `family`. That card is not approved.

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
`deleteProgram` removes an owned program row; schema cascades days/slots/phases and sets
session program FKs null. `set_log` stays. Deleting the active program does not auto-activate
another.

`program-templates.ts` owns shared templates; adding one needs no seed or migration.
Use its descriptions for transcription approximations (percentage work, reverse pyramids,
rest-pause), and its tests for catalog/pattern and week-range validation. Existing program
copies are independent of template edits unless an explicit, scoped data migration is
applied (as for the September 14 Strong Foundations variety revision). [Strong Foundations](STRONG-FOUNDATIONS.md) owns
that template's time budget and coaching rationale. [Glute Focus](2026-10-17-glute-focus-program-proposal.md)
owns the separate 12-week glute-specialization template, including distinct cable/machine
kickbacks and the approved glute-drive repeat. Neither template updates existing copies.

`Ogus October 26` is a six-week Classic template with Upper then Lower (seven slots each),
pending two more days. Every slot has two working sets: week 1 at 2 RIR, weeks 2–5 at 1 RIR,
and week 6 explicitly marked deload with one set at 4 RIR. Its description preserves optional
external rotation/calves, C1/C2 ordering, and quad-compound alternatives. Nine distinct catalog
variations preserve the photographed exercise identities; existing incline press, chest-supported
T-bar row, leg extension, seated calf raise and hack squat entries are reused. Shared catalog
entries live in source; station-specific DB variants are created through the existing picker.

Slots may carry a nullable, day-local `superset_group`. Template creation, builder saves,
cloning and loaders preserve it. Consecutive slots with the same group display numbered
labels (C1/C2) in detail, planner and active workout; only the final member starts the rest
timer. The builder and atomic save RPC reject single-member or separated groups. Groups
do not merge exercise identity, prescriptions, set logs or progression. Ungrouped slots keep
their existing timer behavior. Apply `20261017215800_program_supersets.sql` before deploying
these readers; the additive column retains the existing owner-scoped RLS and the RPC stays
security invoker.

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
schema. New user-owned tables follow ownership RLS. `body_measurement_log` is owner-scoped
like `bodyweight_log`; a missing site is a missing row. The signup trigger creates a profile;
profile/catalog read errors must surface instead of rendering invented empty state.

`src/lib/supabase/client.ts` and `server.ts` use the public publishable key and cookie-based
SSR. Email magic-link login exchanges its code in `src/app/auth/callback/route.ts`.
`createClient()`, `getCatalogMap()`, and `getCurrentBodyweight()` are wrapped in React
`cache()`, so a request loads each once. `cache()` keys on argument identity, so the shared
client instance is what lets layout, page, and action calls hit the same entry; keep it
memoized.
`src/proxy.ts` calls `updateSession()` from `src/lib/supabase/middleware.ts` on matched
requests and propagates refreshed cookies. It does not redirect unauthenticated users:
the app layout and authenticated actions enforce access via `getClaims()`.

Track Coach and the agent’s `weeklyCoach` tool share `loadCoachUi` with the signed-in
user’s client and owner-scoped RLS. There is no elevated application read path.
`SUPABASE_SECRET_KEY` is retained only for local live agent evals.

The in-app agent is a separate cookie-auth path: `POST /api/agent/chat` → LangChain loop →
read tools wrapping `loadCoachUi`, `getActiveProgram`, Exercise review grouping, and
`loadNextWorkout` + `resolveEffectiveWorkoutTarget()`. Tools use the user-scoped client only. Conversation
rows live in `agent_thread` / `agent_message`, many threads per user. See
[AI Coach](AI-COACH.md#threads) and [ai-coach.html](ai-coach.html).

## History and reporting

[2026-09-29 movement rollup](superpowers/specs/2026-09-29-non-machine-movement-rollup-design.md)
shipped Card 1 on 2026-09-29. Cables, session targets, and stall/Fluid keep their
Card 2–4 defaults unless James reverses them.

- In-session quick history uses `exerciseFamilyIds()` to include explicitly linked
  variants (machine, cable, bench, rack, platform) via `baseExerciseId`, returns ten
  latest sets from previous workouts, and loads only when opened.
  This family grouping is for browsing; progression and records use exact exercise identity.
- Per-exercise `/history/[exerciseId]` is Exercise review for every entry point. A `month`
  query is return-link context, not a second page. The screen answers Last (last finished
  session), the past 21 Chicago days, an e1RM chart (last 8 session-bests, or All
  history), then a month-to-month compare. Session grouping lives in
  `exercise-review-sessions.ts`; only finished sessions count. Period bands overlay All
  history only when tracking is on. Month-to-month volume uses Chicago `monthlyWindows`
  and `identityVolume` beside `sessionTonnage`; do not reuse UTC `weeklyVolume` weeks.
  Program captions read distinct `program.name` values from `workout_session.program_id`
  in the chart window and in the selected months. Entry points pass `equipment`
  (`none` or the instance id) so the page never blends machines or stations.
  `?equipment=` stays an instance id, not a station switcher. Track
  (`/analytics`) uses `analytics.ts` summaries plus `board.ts` for default compounds and
  pin visibility; those summaries pick the latest finished instance per exact exercise.
  Default-compound tiles keep template ids (`bb-bench`, `lat-pulldown`, …) and short
  names. Ordinary-pound tiles aggregate session-bests across movement members; cable
  tiles still follow the latest finished family member. Variant pins collapse to the
  template at read time. Machine and cable PR numbers stay unmerged.
  Volume and this week's full PR list sit in Track Explore. Weight trends live on Body.
  Coach lives on Track (`/analytics/coach`). The Track tab stays current on `/history/...`.
  Pattern-strength replay does not replay historical personal machine coefficients.
- Pins are an owner-scoped display table (`user_exercise_pin`). They do not change `set_log`,
  coefficients, swaps, or `workoutRecords` eligibility. Cap 8 is enforced in the action.
- Live PR pills and completion recaps share `strength/records.ts` through the paginated
  `loadWorkoutRecords`. Compare against history finished before the session's start.
  Record kinds are rep PRs, top-weight (max effective load), and e1RM.
  Read [workout records](DECISIONS.md#workout-records) before changing eligibility or precision.
- Coach snapshot/clipboard and the agent’s `weeklyCoach` tool share `coach-check-in.ts` plus deterministic proposals
  in `coach-recommendations.ts`. Accept/dismiss/defer persists review state, not prescriptions.
- Weight calendar, trend, and monthly loaders have separate complete-history and date-window
  contracts. Follow their feature docs rather than reusing a capped dashboard query.
- Monthly PR totals replay canonical workout records; monthly strength compares stored eligible
  e1RMs. Flat monthly changes are descriptive, not a stall diagnosis.

## Deload observations

`program_phase.is_deload` explicitly identifies recovery phases. The builder, built-in
phases, template creation, cloning and `save_program` preserve it. Session insertion
snapshots the effective classic phase into `workout_session.is_deload` using the stored
`week_index`; Fluid sessions default to normal. The database copies this flag onto every
`set_log` insert/update, including ad-hoc sets and substitutions, and suppresses calibration
on deload sets. Trigger functions are security invoker, use owner-matched lookups and have
no directly callable grants. Ordinary edits cannot override classification. Later phase
edits or program deletion cannot reclassify an existing session or its saved sets.

`strength/eligibility.ts` excludes warmups and deloads from strength observations.
Track retains actual activity dates/counts but derives estimates, deltas, charts and PRs
from eligible sets. Review keeps recovery sets visible and chooses the last eight eligible
estimates before limiting its chart. Record replay excludes deloads as both candidates and
baselines. Monthly PR/strength comparisons, Coach strength/rep comparisons, pooled strength,
cache rebuilds and next-workout progression references use the same exclusion. Stall detection
still breaks its series at recovery; it consumes saved classification instead of depending
on mutable phase definitions. Tonnage, working-set counts and adherence retain deload work.
Stored set e1RMs remain intact, including their historical bodyweight information.

Migration `20261010171247_deload_progression.sql` backfills exact `Deload` phase names and
known half-volume/four-RIR `Recovery` / `Recover & review` phases, then rebuilds affected
strength caches from saved eligible estimates. It clears affected personal coefficients
for re-anchoring at the next normal stat write. Missing program/week context and ambiguous
custom phases remain normal pending review; `supabase/tests/deload_legacy_review.sql` lists
those candidates without inferring recovery from actual load or effort.

## Foreground Coach inbox

The [inbox contract](COACH-INBOX.md) separates canonical eligibility, pure episode transitions,
signed owner-scoped transactional reconciliation, and deterministic UI. Four derived tables
store episode, notice, preferences and source/state revision. Before-statement owner locks and
source revision guards serialize training invalidation with reconciliation; notification
failures remain outside the saved training transaction. No model, privileged app client,
background worker or training-action RPC is added by #195.

## Enforced domain boundaries

[Verification and hardening](VERIFICATION.md) owns the executable checks and migration
batches. Workout record loading normalizes owner-scoped saved sets through validated
training evidence before progression/record replay; missing warmup/deload classification
is invalid rather than silently eligible. Exact target identities protect Home/planner,
active session and Coach target entry points without widening comparison scopes. Coach
storage reads validate the existing format/version and pass parsed evidence to details;
invalid/unsupported data fails closed outside training writes. Shared cursor mechanics
reject non-advancing IDs while retaining explicit owner-scoped projections in each loader.
Architectural lint and the indexed-access slice run through the normal CI entry point.
