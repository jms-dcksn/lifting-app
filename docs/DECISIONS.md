# Architecture Decisions

A personal progressive-overload lifting app. Priorities: progressive overload, proper
technique, foundational movements. Core feature: swap exercises and get a recommended
weight for any exercise based on logged history of similar movements.

## Stack

- **Next.js (App Router, Server Actions)** — mobile web app, accessed via browser.
- **Supabase** — Postgres + Auth + RLS. Zero-ops.
- **Auth**: Supabase Auth, email magic-link only (Google OAuth deferred post-MVP). RLS keys off `auth.uid()`.
- **PWA manifest** — home-screen install, wake-lock, optimistic logging. (Not offline.)
- **Recommender runs client-side** (pure TS, bundled coefficient table). No Python service.
- **Deploy**: Vercel.

Assumes internet during workouts, so no offline/local-first layer (deleted ~40% of the
original complexity). No Fly.io, Docker, or sync engine.

## Core algorithm (three layers)

1. **Normalize every set to e1RM** via an RPE/RIR load table (RPE = 10 - RIR), not a bare
   1RM formula. Progressive overload = e1RM trending up. See `src/lib/strength/e1rm.ts`.
2. **Cross-exercise via latent pattern strength + coefficients.** One strength number per
   movement pattern (in reference-lift e1RM units); each exercise has a coefficient vs that
   reference. `predicted_e1RM = pattern_strength * coefficient`. See `recommend.ts`.
3. **Personalize coefficients** by Bayesian shrinkage from population prior toward each
   user's observed ratios.

## Machines

Cannot predict absolute machine loads from free weights (arbitrary leverage/pin/stack
units). So machines are flagged `needsCalibration`: the first session is a calibration set
(conservative guess), and one data point anchors everything after. Machine identity is a
*variant* = generic template × brand × machine_type (Phase C below), stored in the `exercise`
table, since brand loading differs.

Gym context: Lifetime — barbell, dumbbell (to ~120lb), cables, plus machines from Hammer
Strength, Life Fitness, Cybex, Hoist, Technogym, Precor, Matrix, Nautilus (the `KNOWN_BRANDS`
dropdown seed; any other brand is free-text).

## Data model

`set_log` is the source of truth; `user_exercise_stat` is a rebuildable cache. Program
slots reference movement patterns, so "swap exercise" is a first-class operation. Seeded
exercise *templates* live in `coefficients.ts` (app code); the `exercise` table holds
user-created brand/type variants and fully-custom exercises, merged with the seeded set by
`src/lib/catalog.ts`. Schema across migrations `0001`–`0008` (see Phase C below for `0008`);
`0002` adds program/day/slot + `profile.bodyweight` + `set_log.program_slot_id`, `0004` adds
`workout_session.finished_at`. Typed DB types at `src/lib/supabase/types.ts`.

## Phase 2 decisions

**`finished_at` on `workout_session`.** Added in `0004_session_finished_at.sql`. The original
schema had no completion flag, which `finishSession` and "count completed sessions" (block
position derivation) both require. Nullable so in-progress and abandoned sessions are
distinguishable from completed ones.

**`current_e1rm` = max e1RM across working sets.** `recomputeStat` selects the maximum e1RM
from all logged working sets, not the first-set value or a session average. This represents
demonstrated current strength. Per-session overload deltas (progress visualization) are
computed live from `set_log` in Phase 4 (history page, finish-session summary) and are not
stored in `user_exercise_stat`.

**Block position (week/day) is fully derived, not stored.** Day and week are derived from the
count of finished sessions with matching `program_id`, not stored on the session row. Seed
sessions from Phase 2 have `program_slot_id = null`; from Phase 3 onward all sessions carry
a real `program_slot_id` and progression keys on that column.

**Machine personal-coefficient recompute was deferred to Phase 5** (now shipped — see Phase 5
decisions below). At the time, `recomputeStat` returned only `currentE1rm`; `logSet` preserved
any existing `personal_coefficient` and `coeff_confidence_n` untouched.

## Phase 3 decisions

**Builder save is id-preserving, not a full replace.** `saveProgram` upserts day/slot rows
by their existing ids and deletes only rows that are no longer present, rather than
dropping and recreating the program. This preserves `set_log.program_slot_id` continuity
when users edit an in-use program. Client generates uuids for new rows; positions are
re-derived from array order on save.

**Single active program enforced by a partial unique index.** `program_one_active_per_user`
is a partial unique index on `(user_id) WHERE is_active`. Saving any program unconditionally
activates it (clears the old active flag first). `cloneProgram` creates an inactive draft.

**`session/seed.ts` demoted to template-only.** The hardcoded Push/Pull/Legs seed no longer
drives the runtime program. It is called only by `createFromTemplate` (onboarding shortcut).
All runtime program data comes from the `program`/`program_day`/`program_slot` tables via
`src/lib/program.ts`.

**Progression "last performance" keys on `program_slot_id`.** From Phase 3 onward,
the double-progression engine looks up prior sets by `program_slot_id`, not `exercise_id`.
This correctly handles the case where the same exercise appears in multiple slots with
different rep targets.

## Phase 4 decisions

**Overload delta is computed live, keyed on `exercise_id` (not `program_slot_id`).**
Both the per-exercise history page and the finish-session summary compare the latest
session's best e1RM for an exercise against the best e1RM from that exercise's most
recent *earlier* session, found via `set_log` joined to `workout_session.performed_at`
(`workout_session!inner(performed_at)`). This is intentionally `exercise_id`-keyed, unlike
progression's `program_slot_id` lookup: the overload signal is "is this exercise getting
stronger over time" regardless of which slot/program it was logged under, including
across a swap.

**`finishSession` now verifies session ownership via a select before updating.** Needed to
read `performed_at` for the overload-delta query anyway, so the existing
`.eq("user_id", userId)` filter on the update was replaced by an explicit
ownership-checked select (throws `"Session not found"` if missing/not owned) followed by
an unfiltered-by-user update scoped by `id` + `is("finished_at", null)`.

**Charts: Recharts, client component, no server-side rendering of chart data.** The
history page (`src/app/(app)/history/[exerciseId]/page.tsx`) is a Server Component that
fetches and groups sets by session; the line chart itself
(`e1rm-chart.tsx`) is a small `"use client"` wrapper around `recharts` `LineChart`. Matches
the SPEC.md default ("Charts: Recharts").

## Phase 5 decisions

**Session targets compute client-side; the server hydrates state, not targets.** The session
page no longer calls `sessionTarget()` server-side. It hydrates `ExerciseStat[]`,
`recentExerciseIds`, and a per-slot `lastByExercise` map; `active-session.tsx` derives each
slot's target via `useMemo`. This is what lets a swap re-derive the recommendation instantly
with no server round-trip.

**`startingWeight()` extracted from `sessionTarget()`'s no-prior branch.** Pure helper
`startingWeight(def, reps, targetRir, defs, stats, bodyweight)` wraps `recommend()` and the
bodyweight added-load conversion. `sessionTarget()` delegates to it for the "no prior
performance" case, and the UI also calls it directly to recompute the suggested weight live
as the user edits reps/RIR before the first set (the weight field follows reps/RIR until the
user manually touches weight).

**Progression "last performance" is now `(program_slot_id, exercise_id)`-keyed.** Previously
keyed on `program_slot_id` alone (Phase 3). A swapped exercise now resumes its own
progression chain within that slot, independent of whatever exercise the slot held before.
The session page's effective exercise-per-slot is derived from the most recently logged
exercise in that slot this session, so an in-session swap survives a page reload.

**Swap is same-pattern-first with a show-all escape hatch.** `ExercisePicker` gained
`patternFilter` (already plumbed for swap) plus a "show all patterns" toggle, since a same-
pattern substitute isn't always available or desired.

**Machine calibration: `personal_coefficient = currentE1rm / pattern strength estimated from
the user's other logged variants`,** computed in `recomputeAndUpsertStat`
(`session/actions.ts`) via `estimatePatternStrength`. It anchors on the first session with
working sets on that exercise, re-anchors while only one such session exists (so editing or
deleting that calibration session stays consistent), then holds fixed — later progress on the
machine moves the pattern-strength estimate, not the coefficient. `coeff_confidence_n` =
count of distinct sessions with working sets on that exercise, feeding the Bayesian shrinkage
in `recommend.ts`. If all sets for a calibration exercise are deleted, both fields reset
(`personal_coefficient = null`, `coeff_confidence_n = 0`) so the next first set recalibrates.
Graduation out of `calibrate` is not a separate code path — once the machine has its own
e1RM and confidence count, `recommend()`'s direct-history branch naturally returns
medium/high.

**Confidence badge wording: `low` → "starting estimate"** (was "estimate"), to read more
clearly as a recommender-driven starting point rather than a measurement.

## Phase 6 decisions

**Native `<dialog>` over a dialog/sheet library.** `Sheet` (`src/components/ui/sheet.tsx`)
is a native `<dialog>` with `showModal()` (free focus trap + `Escape`→`cancel`), animated
via `data-closing` + `@starting-style` in `globals.css`. It is the app's *only* overlay
primitive — `ExercisePicker` is rebuilt on it. Rejected a component library (shadcn/Radix):
one overlay and five controls is small enough that hand-rolling stays smaller and keeps the
whole UI layer auditable.

**Design tokens are the contract, defined once in `globals.css`.** `@theme`/`@theme inline`
define a near-monochrome palette (color is semantic-only: `overload-up/down`, `calibrate`,
`danger`), a four-step type scale (display/heading/body/caption), one card radius and one
control radius, and shared motion (`--ease-snap`, `animate-tick`, all `transform`/`opacity`,
150–250ms, honoring `prefers-reduced-motion`). This fixed a real bug in the process:
`body { font-family: Arial }` had been silently overriding the Geist fonts loaded in
`layout.tsx` since the project's start — Geist now actually renders.

**`buttonClasses` lives in a separate non-`"use client"` module (`button-styles.ts`).**
`Button` itself needs `"use client"` for `useFormStatus`, but Server Components (e.g. a
page rendering a `<Link>` styled as a button) need the class builder without pulling in a
client boundary. Calling an export from a `"use client"` module inside a Server Component
throws at runtime — and `next build` does not catch it — so the class builder is split into
its own plain module.

**`ExercisePicker`'s dismiss contract changed when it moved onto `Sheet`.** Previously a
full-screen div that the parent hard-unmounted on pick. Now picking dismisses the `Sheet`
itself (with the exit animation) via `useSheetDismiss()`; `onPick` only updates parent
state and `onClose` only unmounts after the animation completes. Both call sites (builder
add-slot, session swap) were updated to this contract.

**`start-button.tsx` deleted; home uses the shared `Button`.** The bespoke component
existed only to prevent double-tap on Start/Resume; `Button`'s built-in pending state
(via `useFormStatus` for the `<form action>` submit button) covers the same case for free.

## Phase 7 decisions

**Reorder animates via the View Transitions API, not a JS animation library.** Program
builder day/slot reorder calls `withViewTransition(update)` (`src/components/ui/
view-transition.ts`), which wraps the state update in `document.startViewTransition` +
`flushSync`; day cards and slot rows carry a matching `viewTransitionName` (`vt-<id>`) so
the browser tweens their old/new positions. Falls back to a plain update when unsupported
or `prefers-reduced-motion` is set. Chosen over a library (e.g. Framer Motion) for the same
reason as Phase 6's native-`<dialog>` call: one more dependency for a single reorder
interaction isn't worth it when the platform API covers it.

**Sticky + safe-area-inset over fixed + magic padding.** The session finish bar and program
builder save bar were `fixed inset-x-0 bottom-0` paired with a `pb-28` spacer guess on the
scroll container. The finish bar is now `sticky bottom-0` with
`padding-bottom: calc(0.75rem + env(safe-area-inset-bottom))`; remaining `fixed` bars
(builder save) and bottom-padded scroll containers (program list) use the same
`env(safe-area-inset-bottom)` calc instead of a fixed pixel guess, so content doesn't
disappear behind the iOS PWA home-indicator bar.

**Current-slot hierarchy is conveyed via `Card` `tone`, not color.** The active session
derives `currentIndex` (first slot whose logged-set count is below its target, from
server-truth set counts) and passes `isCurrent` to `SlotCard`. `Card` gained a `tone` prop
(`default | active | done`): `active` = `border-border-strong`, `done` = `opacity-60`.
Consistent with the near-monochrome design system — color stays reserved for the
overload/calibrate/danger semantics from Phase 6.

**Failed optimistic writes are now surfaced, not silently reverted.** `handleLog`/
`handleDelete` in `active-session.tsx` catch errors from `logSet`/`deleteSet` and render a
per-card message (`text-danger`). Previously a failed write just reverted on revalidation
with no explanation, which looked like the tap did nothing.

**One content-column token (`--container-page` → `max-w-page`, 32rem) applied across every
screen.** Centralizes what had been ad hoc per-page flex containers; also used by `Sheet`
(now `max-w-page` with `sm:border-x` instead of full-bleed) so overlays read as a column on
wider viewports.

**Program builder caps at `MAX_DAYS = 6`** and lays days out as a horizontal scroller at
`sm:` and above (vertical stack on phones).

## Phase 8 decisions

**Analytics is a derived read model, not new schema.** The Progress hub reads working
`set_log` rows joined to `workout_session(performed_at, finished_at, program_id)` plus
`profile.bodyweight`, then aggregates in `src/lib/analytics.ts`. No analytics tables,
views, RPCs, or cached counters were added; single-user full-history scans are still
trivial, and the helpers are framework-free so they can be sanity-checked with `tsx`.

**Tonnage reuses the strength engine's effective-load convention.** `sessionTonnage()`
calls `effectiveLoad(def, weight, bodyweight)` from `recompute.ts`, so bodyweight and
assisted exercises use the same convention as e1RM recompute. Sets whose effective load
cannot be computed (notably bodyweight lifts without a stored bodyweight) are counted as
excluded, not coerced to zero, and the UI names that exclusion beside the volume chart.

**Progress links funnel into the existing per-exercise history route.** The Progress hub
surfaces total volume, recent e1RM gainers, record events, and a searchable all-exercise
list, but every lift row links to `history/[exerciseId]` rather than introducing another
exercise chart surface. The only new client code is the Recharts volume chart and the
small searchable list component; data fetching and aggregation stay server-side.

## Phase 9 decisions

**Three of the six Phase 9 bullets were implemented; the other three remain unbuilt.**
Implemented: volume by movement pattern, hard sets per week, pattern strength trend.
Left for later (or never): stalled-lift detector, adherence/consistency, rep-quality drift.

**Training balance and pattern strength are list-based cards, not colored multi-line charts.**
Both new analytics surfaces on the Progress screen are horizontal-bar or list layouts with a
signed-delta `TrendPill` — not `recharts` multi-line time charts per pattern. Reason: a
per-pattern line chart would require distinct colors per pattern, breaking the "color is
semantic only" Phase 6 contract. Monochrome lists and bar overlays (total sets vs hard sets)
carry the same signal without introducing decorative color.

**`patternStrengthTrend` replays sessions with population coefficients only (no personal coefficient).** `patternStrengthTrend` in `analytics.ts` passes `null` as `personalCoefficient`
when calling `estimatePatternStrength` at each historical session. This is intentional: the
goal is to track the pooled-across-variants signal (pattern strength) rather than any one
machine's absolute load. Machine personal-coefficient history is not replayed. The displayed
trend and the live recommender pool from the same signal, so they agree directionally.

**`PATTERN_LABEL` added to `coefficients.ts`.** Human-readable pattern names (e.g. `"Hip Hinge"`)
needed by analytics UI are exported alongside the seeded exercise catalog. Kept in
`coefficients.ts` because it is the canonical home of pattern-level knowledge in the strength
engine.

## Phase A decisions (program gallery + tags)

Phase A of `docs/superpowers/specs/2026-06-20-program-gallery-tags-rest-timer-design.md`
(plan: `docs/superpowers/plans/2026-06-20-program-gallery-tags.md`). Phase B (rest timer) is
documented separately below.

**`program.notes` (present in generated types, never read or written by app code) was
renamed to `program.description` instead of adding a new column.** A deviation from the
spec, which proposed adding `description`. Reusing the dead column avoids a redundant field.

**`listPrograms` was replaced by `listProgramsFull`, which assembles every program's full
day/slot tree, not just the row.** The gallery expands any card inline with no extra
round-trip per card; a user has only a handful of programs, so assembling all of them
up front server-side is cheap. This is plan option (a) over the spec's alternative of adding
a `dayCount` to a row-only `listPrograms`.

**The standalone read-only `?id=X` program view is gone.** `program-view.tsx` and
`program-list.tsx` are deleted; their rendering (day/slot detail, clone/activate actions)
moved into `program-card.tsx`'s expanded state. There is now exactly one place a program's
detail renders: inline in the gallery card.

**Tags are free text on the program row, not a separate table.** Single-user app, no need
for tag identity, sharing, or referential integrity — `text[]` with app-level normalization
(`program-tags.ts`: trim, drop empties, case-insensitive dedupe preserving first-seen form)
is sufficient.

**`HARD_RIR = 2` is a module-level constant, not a user setting.** Sets with `rir ≤ 2` are
classified as hard (stimulating) sets. The constant is unexported (private to `analytics.ts`)
but the two public functions that use it (`patternWeekStats`, `latestWeekBalance`) accept an
optional `hardRir` parameter for callers that need a different threshold.

## Phase B decisions (rest timer)

Phase B of `docs/superpowers/specs/2026-06-20-program-gallery-tags-rest-timer-design.md`.
Note: `docs/PLAN.md`'s "Explicitly NOT in MVP" list named "rest timers" as out of scope —
that line predates this spec, which deliberately revisits and reverses that call. See the
PLAN.md edit accompanying this section.

**Rest starts optimistically on log, not on a confirmed write.** `handleLog` starts the
countdown immediately when a set is logged client-side, before the Supabase write resolves.
A failed write surfaces its own error (existing per-card `error` state) but does not stop or
roll back the clock — the rest period is real regardless of whether the log persisted, and
gating the timer on a round-trip would make it feel laggy for no benefit.

**One timer for the whole session, not one per slot.** `useRestTimer()` is instantiated once
in `active-session.tsx` and shared; starting a new rest replaces whatever was running. A
lifter only rests for one slot at a time in practice, so per-slot timers would just add state
without adding capability.

**Absolute end-timestamp, not a decrementing counter.** The hook stores `Date.now() + seconds
* 1000` and recomputes `remaining` from `endsAt - Date.now()` on each 250ms tick, so drift
from tab throttling or a missed tick self-corrects instead of accumulating.

**Screen Wake Lock turned out to already exist.** The spec listed "no Wake Lock" as an
explicit non-goal, anticipating that a locked-pocket countdown could drift or never fire.
`active-session.tsx` already had a `useScreenWakeLock()` hook (predating this phase) that
keeps the screen on for the duration of a session. As a result the documented limitation is
narrower than the spec feared: the timer is unreliable only if the user *manually* locks the
phone or backgrounds the tab (JS timers throttle then) — not merely from leaving the screen
untouched. No push/service-worker notification was added; that remains out of scope.

**Per-slot rest override is nullable, not a required field.** `program_slot.rest_seconds`
defaults to `null` (use the profile default) rather than copying the profile's value at
creation time. This keeps "most slots use the default" cheap to express and means a later
change to the profile default automatically applies to every slot that hasn't been
explicitly overridden.

## Phase C decisions (machine brands, types, custom exercises)

Spec: `docs/superpowers/specs/2026-06-21-machine-brands-types-custom-exercises-design.md`;
plan: `docs/superpowers/plans/2026-06-21-machine-brands-types-custom-exercises.md`.

**Exercise identity gains a layer: templates → variants → customs.** `coefficients.ts` no
longer bakes a brand into machine rows. Machine movements are now generic *templates*
(`equipment: "machine"`, `machineTemplate: true`, no brand). A *variant* = template × brand ×
machine_type, stored as a row in the (previously dormant) `exercise` table; this is the
trackable identity `set_log.exercise_id` points at, created lazily via find-or-create
(`resolveVariant`) the first time a brand/type combo is logged. A *custom exercise* is also an
`exercise` row, with `base_exercise_id = null` and a user-picked pattern. `src/lib/catalog.ts`
merges seeded templates with the user's DB rows into the `Record<id, ExerciseDef>` the pure
engine already consumes (seeded ids win collisions); that merged catalog is threaded through
every screen that used to import the static `EXERCISE_BY_ID`.

**Equipment collapses to one `machine` value; `machine_type` is identity, not math.** The old
`machine_plate`/`machine_pin` split is gone (nothing in the engine branched on it — only
`equipment.startsWith("machine")` and `=== "bodyweight"`). Selectorized and plate-loaded both
log total load; `machine_type` (`selectorized | plate_loaded`) only distinguishes one physical
machine from another. Cross-machine recommendation falls out for free: a brand-new variant
predicts from `pattern_strength × template coefficient`, and per-machine progression is just its
own `exercise_id`.

**Two judgment calls.** (1) Brand/type are scoped to `machine` equipment only — cables stay
single exercises (one cable column behaves the same across brands), so the picker shows the
brand/type step only for machines. (2) A `core` movement pattern was added with `cable-crunch`
as its reference anchor, so ab work has a home in the pattern model.

**Builder picks templates; the session resolves them.** The program builder stays
brand-agnostic (`resolveMachines={false}`): a slot stores the generic machine template. The
active-session picker runs with `resolveMachines`, so the first time a lifter reaches a machine
slot they pick brand + type and the template is instantiated to a concrete variant before any
set is logged. A bare template renders a "Choose machine" prompt instead of set-entry. Custom
exercises created from either picker are concrete and immediately loggable.

**Migration 0008** adds `exercise.machine_type` and `exercise.base_exercise_id` plus a partial
unique index (`exercise_variant_unique` on `user_id, base_exercise_id, coalesce(brand,''),
coalesce(machine_type,'')`) backing variant dedup. No `set_log` backfill — demo data is
disposable, and old brand-baked ids (`hs-chest-press`, etc.) are simply gone.

## Build order

> Superseded by `SPEC.md`, which wins on conflicts. Current phase structure: P0 (backend, done),
> P1 (auth + PWA), P2 (keystone: active-session screen), P3 (program builder), P4 (progression
> view), P5 (recommendation + swap + calibration, done), P6 (UX foundation: design tokens +
> core components, done), P7 (screen-by-screen UX polish + motion + mobile ergonomics, done),
> P8 (Progress analytics hub, done), P9 (analytics depth: partial — pattern balance, hard sets,
> pattern strength trend shipped; stalled lifts, adherence, rep-quality drift not built).
> See `docs/PLAN.md` for the sequence and status. Outside this numbered sequence: Phase A
> (program gallery + tags, done) and Phase B (rest timer, done) come from a separate
> spec/plan pair under `docs/superpowers/` — see "Phase A decisions" and "Phase B decisions"
> above.
