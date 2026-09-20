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
`src/lib/catalog.ts`. Schema is defined by all files in `supabase/migrations/`;
`0002` adds program/day/slot + `profile.bodyweight` + `set_log.program_slot_id`, `0004` adds
`workout_session.finished_at`; the session row also owns optional readiness, joint-pain, and
plain-text note feedback. Typed DB types live at `src/lib/supabase/types.ts`.

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

**Next block position (week/day) is derived.** Day and week come from the count of finished
sessions with matching `program_id`; creation stores `program_day_id` and `week_index` on the
session so historical phase resolution uses that workout's week. Seed
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

**Seed data moved into shared templates.** `session/seed.ts` was subsequently deleted;
`createFromTemplate` reads `src/lib/program-templates.ts`, including Push/Pull/Legs.
All runtime program data comes from the `program`/`program_day`/`program_slot` tables via
`src/lib/program.ts`.

**Progression "last performance" keys on `program_slot_id`.** From Phase 3 onward,
the double-progression engine looks up prior sets by `program_slot_id`, not `exercise_id`.
This correctly handles the case where the same exercise appears in multiple slots with
different rep targets.

## Phase 4 decisions

**Overload delta is computed live, keyed on `exercise_id` (not `program_slot_id`).**
Exercise review's Last card and the finish-session summary compare the latest
session's best e1RM for an exercise against the best e1RM from that exercise's most
recent *earlier* session, found via `set_log` joined to `workout_session.performed_at`
and `finished_at`. Review grouping is `groupReviewSessions` (finished sessions only).
This is intentionally `exercise_id`-keyed, unlike progression's `program_slot_id`
lookup: the overload signal is "is this exercise getting stronger over time"
regardless of which slot/program it was logged under, including across a swap.
Review displays that delta at 0.1 lb.

**`finishSession` now verifies session ownership via a select before updating.** Needed to
read `performed_at` for the overload-delta query anyway. The action performs an explicit
ownership-checked select (throws `"Session not found"` if missing/not owned), then retains
the user filter on the update as defense in depth alongside RLS. `is("finished_at", null)`
keeps repeat summary views from moving the original finish time.

**Charts: Recharts, client component, no server-side rendering of chart data.** The
history page (`src/app/(app)/history/[exerciseId]/page.tsx`) is a Server Component that
fetches finished sets; `groupReviewSessions` builds the series. `ReviewChart` toggles
last 8 workouts vs All history and reuses `e1rm-chart.tsx` (`recharts` `LineChart`).
Period bands apply only to All history when tracking is enabled. Matches the SPEC.md
default ("Charts: Recharts").

## Phase 5 decisions

**Session targets compute client-side; the server hydrates state, not targets.** The session
page no longer calls `sessionTarget()` server-side. It hydrates `ExerciseStat[]`,
`recentExerciseIds`, and recent first-set performances grouped by exact exercise;
`active-session.tsx` derives each slot's target via `useMemo`. This is what lets a swap
re-derive the recommendation instantly with no server round-trip.

**`startingWeight()` extracted from `sessionTarget()`'s no-prior branch.** Pure helper
`startingWeight(def, reps, targetRir, defs, stats, bodyweight)` wraps `recommend()` and the
bodyweight added-load conversion. `sessionTarget()` delegates to it for the "no prior
performance" case, and the UI also calls it directly to recompute the suggested weight live
as the user edits reps/RIR before the first set (the weight field follows reps/RIR until the
user manually touches weight).

**A missed rep floor is a load-calibration failure, not a progression step.** When the most
recent first set falls below `rep_min`, `sessionTarget()` estimates the load needed for
`rep_min` at the prescribed RIR from that observed set. The calculation uses total effective
load for bodyweight movements before converting back to added/assisted load, and it is capped
at the prior logged load. This keeps both the active-session target and weekly Coach proposal
inside the programmed range without rewarding an overweight set.

**Repeated weekly exercises share a bounded progression window.** The latest performance for
the exact `(program_slot_id, exercise_id)` remains the anchor, preserving different rep ranges
and swap chains. From that anchor forward, `selectProgressionReference()` chooses the highest
e1RM first set for the exact exercise across program days; ties prefer recency. This means a
newer Lower B hack-squat performance can advance Lower A, while an old all-time PR before Lower
A's last exposure cannot. A slot with no own history uses the best of four recent exposures.
The active card shows both “Last here” and a distinct “Best recent,” and the editable set entry
remains the user's final decision. The session page's effective exercise-per-slot is derived
from the most recently logged exercise in that slot this session, so an in-session swap survives
a page reload.

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

**Analytics is a derived read model, not new schema.** Track reads working
`set_log` rows joined to `workout_session(performed_at, finished_at, program_id)` plus
`profile.bodyweight`, then aggregates in `src/lib/analytics.ts`. No analytics tables,
views, RPCs, or cached counters were added; single-user full-history scans are still
trivial, and the helpers are framework-free so they can be sanity-checked with `tsx`.

**Tonnage reuses the strength engine's effective-load convention.** `sessionTonnage()`
calls `effectiveLoad(def, weight, bodyweight)` from `recompute.ts`, so bodyweight and
assisted exercises use the same convention as e1RM recompute. Sets whose effective load
cannot be computed (notably bodyweight lifts without a stored bodyweight) are counted as
excluded, not coerced to zero, and the UI names that exclusion beside the volume chart.

**Track tiles funnel into the existing per-exercise history route.** Track
surfaces total volume, recent e1RM gainers, record events, and a searchable all-exercise
list, but every lift row links to `history/[exerciseId]` with an `equipment` query
(`none` or the instance id) rather than introducing another exercise chart surface.
Tile and All-lifts numbers use the latest finished equipment instance for that
exercise, not a blended series. Month review uses the same route with `month` and
`equipment` query params; those params do not swap the template. `month` also defaults
the month-to-month compare on Exercise review. The Track tab is current on
`/history/...`. The only new client code is the Recharts volume chart and the
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

**Weekly coaching is a derived export, not new mutable workout state.** The Coach check-in
card builds a seven-day, paste-ready summary from finished `workout_session` and `set_log`
rows: adherence, RIR distribution, 0–1 RIR hard sets by pattern, and latest lift performance.
The original version intentionally added no schema before the first real block. Issue #5 then
added the deliberately narrow signals actual coaching needs: readiness 1–5 before the first
set, joint pain at finish, and one 280-character session note.

**The coach check-in has one versioned report contract.** Issue #7 replaces parallel summary
logic with a pure `buildCoachCheckInReport()` aggregation. The compact Progress snapshot and
clipboard formatter accept only its `CoachCheckInReport` output, so visible and exported facts
cannot drift. The v1 contract uses explicit non-overlapping seven-day windows, reconstructs
week-specific phase prescriptions (including deloads), and emits data-quality warnings instead
of filling gaps. It excludes user/auth and internal database identifiers by construction. Trend
labels require four exposures split into two adjacent pairs, with both recent marks clearing a
1% margin, so a single poor session cannot create a decline. Exact definitions live in
`docs/COACH-REPORT.md`.

**Coach recommendations are derived proposals with separately persisted review state.** Issue #8
keeps the factual `CoachCheckInReport` v1 shape stable and computes proposals in the pure
`coach-recommendations.ts` layer. Normal overload delegates to `sessionTarget()` using the same
bounded best-recent reference as the active workout; stalls delegate to `detectPlateau()`.
Deload and significant-pain gates run before overload, and RIR-based load reductions require the
**first working set** to miss in two consecutive comparable slot exposures—hard back-off sets do
not downshift a correctly loaded top set. Recommendations carry the program-day name so duplicate
weekly exercises remain distinguishable. The only new mutable state is the user's
accepted/dismissed/deferred response keyed to that evidence snapshot. Accepting does not rewrite
a program: the established slot/exercise log chain remains the source of the next workout target.

**The scheduled Coach API is a narrow capability, not a second account session.** Issue #9 exposes
the canonical report and proposal layer through one read-only route. A server-held Supabase secret
is necessary because a scheduled task has no browser session, but every elevated query still
includes the one configured user scope. The public credential is a separately revocable,
high-entropy capability token compared via fixed-length SHA-256 digests and never returned or
logged. Bearer auth is preferred; a query capability is retained only because ChatGPT scheduled
tasks do not currently expose custom request headers. Both forms receive the same no-store,
noindex response policy and cannot mutate training or recommendation-decision state.

**Bodyweight observations are date-keyed; `profile.bodyweight` is the preserved fallback.**
`bodyweight_log` permits one observation per user per calendar date. A repeated date replaces
that reading through the calendar. Moving an edit onto an occupied date requires explicit
replacement confirmation and an atomic `save_bodyweight_entry` call; see
[Weight calendar](WEIGHT-CALENDAR.md). The latest observation is
the current value for bodyweight/assisted exercise calculations. The original profile field is
not overwritten, so an account with no history—or one whose history is removed—retains its
pre-feature baseline. Seven-day trends use available observations in explicit current and prior
non-overlapping windows; they do not require daily weighing.

**Subjective feedback is stored on `workout_session`, not in a general wellness model.** These
signals describe one training exposure and share the session's existing ownership/RLS boundary.
The unused `workout_session.notes` column is now the capped plain-text note; `readiness` and
`joint_pain` are nullable constrained columns. Readiness writes are rejected after the first
set. Pain and notes remain optional and editable after finishing, while `finished_at` retains
its original value. Significant pain is surfaced as a reason to pause progression advice, never
as a medical diagnosis.

**Classic blocks can span 4–12 weeks.** The original 4–6 week builder cap prevented a complete
two-mesocycle plan from being represented as one program. The database already stores an
unconstrained integer, so validation and the builder now allow 12 while retaining 4 as the
minimum. Existing programs are unchanged.

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

## Program grid navigation (2026-07-03)

**Dedicated summary and detail paths supersede inline expansion.** `/program` now loads
batched summaries and renders linked tiles; `/program/[id]` loads one full program. This
reverses the earlier full-gallery assembly decision because inline expansion created large
cards and avoidable scroll friction. Actions live on detail, edit remains explicit, and no
schema change is required.

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

**One timer for the whole session, not one per slot.** `useRestTimer()` lives in
`session/[id]/layout.tsx` (`RestTimerProvider`) and is shared by the page, the route
loading fallback, and the session error view. Starting a new rest replaces whatever was
running. A lifter only rests for one slot at a time in practice, so per-slot timers would
just add state without adding capability.

**Live-card refresh must not unmount rest.** Logging a set revalidates the workout so
record pills can appear from persisted sets. That refetch can suspend
`session/[id]/loading.tsx` — especially the first saved set of an exercise, which is when
`loadWorkoutRecords` starts paging prior history. The timer therefore lives in the session
layout (layouts are not replaced by `loading.tsx`), and the absolute end timestamp is also
written to `sessionStorage` so a full remount can resume. Gold PR / e1RM chips still come
from the canonical `workoutRecords` replay streamed into the live cards; optimistic rows
still never earn records.

**Absolute end-timestamp, not a decrementing counter.** The hook stores `Date.now() + seconds
* 1000` and recomputes `remaining` from `endsAt - Date.now()` on each 250ms tick, so drift
from tab throttling or a missed tick self-corrects instead of accumulating.

**Screen Wake Lock turned out to already exist.** The spec listed "no Wake Lock" as an
explicit non-goal, anticipating that a locked-pocket countdown could drift or never fire.
`active-session.tsx` already had a `useScreenWakeLock()` hook (predating this phase) that
keeps the screen on for the duration of a session. As a result the documented limitation is
narrower than the spec feared: the timer is unreliable only if the user *manually* locks the
phone or backgrounds the tab (JS timers throttle then) — not merely from leaving the screen
untouched. Phase B left push, service-worker, and the Notification API out of scope.
Completion audio is an in-app Web Audio pair of beeps (`profile.rest_tone_enabled`,
default on in Settings); vibration is not gated by that toggle. #104 later added system
notifications; see [rest completion notifications](#rest-completion-notifications-104).

**Per-slot rest override is nullable, not a required field.** `program_slot.rest_seconds`
defaults to `null` (use the profile default) rather than copying the profile's value at
creation time. This keeps "most slots use the default" cheap to express and means a later
change to the profile default automatically applies to every slot that hasn't been
explicitly overridden.

## Rest completion notifications (#104)

Friend interview (first user): rest-complete cues did not fire when the phone was
backgrounded. Phase B only used in-tab Web Audio plus `navigator.vibrate`. That is silent
once the browser suspends the tab.

**System notification when permitted, tone stays audio-only.** Rest complete still vibrates
and still plays the Settings-gated beeps. A Notification API banner ("Rest over") fires when
`Notification.permission === "granted"`. The tone checkbox does not gate the banner. There
is no new profile column. Permission is per-browser.

**Ask at first rest start or Settings Enable, never on load.** Logging a set is a user
gesture, which iOS requires. Settings shows off / on / blocked / unavailable from that
permission and an Enable button while undecided. Denied degrades to vibrate and optional
tone. ⓘ explains how to re-enable. No caption under the control.

**Notification-only service worker.** `/rest-sw.js` schedules the same banner from the rest
end timestamp so Android can still alert if the page timer is frozen. It does not cache
documents or add offline sync. iPhone still needs the Home Screen app (iOS 16.4+) and
cannot guarantee lock-screen delivery. Native push remains out of scope (#43).

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


## Workout records

Issues #24, #25, and #26 share `strength/records.ts` and the paginated,
authenticated `loadWorkoutRecords` read path. No schema migration is required.

### What the lifter sees

- Successfully saved working sets earn persistent compact **record** pills
  on their exercise card (`225 × 8 +1`, `275 e1RM +5`) in `--record` gold.
- Both types can appear together. Records from an exercise swapped out mid-workout
  retain their original exercise name. Completed cards with records remain readable.
- Finish recap is the payoff: a `--text-recap`-size hero for records earned this workout
  (`2 PRs`, or the two-part count when a single number would mix rep and e1RM),
  then one row per exercise/equipment scope with compact lines (`225 × 8 +1`,
  `275 e1RM +5`) in record gold. History links stay on the exercise name.
  Several improvements at one load collapse to the best reps; distinct loads remain.
  One best e1RM is included per scope. The top-e1RM table is not on this screen.
- A workout with no records still finishes: `{dayName} done` plus working-set count,
  with no gold and no invented records. Joint pain and the session note sit behind
  a details control, not in the hero.
- Reopening a finished session shows the editable set cards with **Home** and **View recap**.
  Recap lives at `/session/{id}/recap` (finish, last-session card chips, Track week list,
  monthly achievement links). Edits/deletions update records.
- Recap is `/session/{id}/recap` only; the workout page does not repeat that hero.
  No toast, celebration effect, or announcement is replayed on rerender, refresh, or
  resume. Optimistic rows never earn records.

### Comparability and eligibility

The identity is `(user_id, exercise_id, equipment_instance_id)`, across programs and
slots. Machine variant slugs already distinguish brands and selectorized/plate-loaded
equipment. Broad movement patterns and the history sheet's exercise families are not
record comparison scopes. Unresolved machine templates cannot earn records.

Working sets require finite load, positive whole-number reps, and valid RIR (0–5).
Legacy null RIR uses the canonical default of 2; missing load/reps is never zero-filled.
Warmups, invalid sets, and nonpositive effective loads are excluded. Calibration working
sets are eligible observations; being the first observation alone is never a PR.

Barbell/machine/cable loads use recorded total load; dumbbells use one dumbbell's load.
Bodyweight exercises use **historical total effective load** (bodyweight plus added
weight; negative added weight means assistance) for fixed-load comparison. Equal added
weights at different bodyweights are not the same fixed load. The pill displays total
load plus the recorded addition/assistance so this comparison is explicit.

Load identity is normalized to 0.001 lb to remove floating-point noise. e1RM uses the
existing RIR load model in `strength/e1rm.ts`, compared/displayed at 0.1 lb precision.
Rounded ties do not earn records, and improvements cannot display as `+0`.

### Historical bodyweight

The app already stores `set_log.e1rm` using the canonical formula at save time. For a
bodyweight set, `e1rm × pctOf1RM(reps + RIR)` recovers that set's effective load. Subtract
the recorded added weight to recover the bodyweight used then. New record calculation
never consults current profile weight or the mutable `user_exercise_stat` cache.

Editing a bodyweight set preserves this recovered historical bodyweight. If the original
e1RM/bodyweight was unavailable, the edit keeps e1RM unknown; today's weigh-in does not
retroactively fill the gap. Such sets cannot establish comparable records.

### Replay and recap stability

History includes only same-user sets from other workouts **finished by this workout's
start**, with both their workout start and set creation before this workout's start.
This excludes unfinished/overlapping sessions, future workouts, and sets added later
to an old workout. History is paginated, ordered by creation and ID, without the usual
1,000-row truncation. Read errors surface instead of inventing an empty baseline.

The engine folds historical bests, then replays current saved sets in creation/ID order.
A strict increase over prior history or an earlier current set earns a record. Final
deltas always use the pre-workout best, not the intermediate set. A within-workout
improvement with no pre-workout observation is labeled **improved this workout**, with
no fabricated historical delta. A lone first observation stays quiet.

The recap is derived from persisted set truth with this fixed time boundary; there is
no achievement cache to drift. Later workouts cannot erase it. Editing/deleting a
relevant current or earlier set intentionally corrects the result on the next load.
Repeated saves with identical performance, duplicate query rows, and resumed rendering
do not add achievement counts. Set IDs identify the winning slot for card placement.

### Verification

- `strength/records.test.ts`: mixed/consolidated records, scope, numeric eligibility,
  precision, bodyweight/assistance, first observations, edits, deletes, replay stability,
  recap headline mixing, and compact recap lines.
- `achievement-recap.test.tsx`: finish hero copy, gold compact lines, history links,
  hidden resume recap when empty, and no-record finish without gold.
- `workout-records.test.ts`: authenticated query scoping, time boundary, pagination past
  1,000 historical sets, empty sessions, and failed reads.
- `record-actions.test.ts`: real save/edit/delete/finish actions through the loader and
  engine with an in-memory database adapter, failed writes/retries, feedback, reopened
  summaries, and preservation of historical bodyweight during edits.

## Period tracking (#32–33)

**Female-only opt-in menstrual period tracking** for monthly progress context. Records observed
bleeding days only; no cycle prediction, no hormonal phases, no external sharing, no training
automation. Design: [PERIOD-TRACKING.md](PERIOD-TRACKING.md).

**Daily observations** — one date-only row per observed period day, aligned with America/Chicago
and weight calendar semantics. No interval records, no open-ended spans; user marks each day
during menstruation and stops when it ends. Backfilling and sparse data are normal. Blank days
are not confirmed absences.

**Consent and eligibility** — requires `profile.sex = 'female'` (new optional field, defaults
unspecified) and explicit `period_tracking_enabled = true`. No inference from demographics,
weight, or training. Consent version and timestamp stored to support future opt-in changes.

**Context bands, not analysis** — monthly review shows optional shaded bands on weight and e1RM
charts when tracking is enabled. View toggle per session (not saved). #105 adds a descriptive
Monday-Sunday overlay of observed period days, weekly weight change, and PR counts on the same
month page. It groups weeks; it does not infer a cycle, compute a correlation, or change
training. Period data never alters stall classification, PR totals, weight calculations, or
Coach recommendations. No Coach API or export inclusion in V1 (separate consent required for
future sharing).

**Disable and deletion** — toggling off offers Keep history (private, re-enable shows it again)
or Delete history (hard delete, irreversible). Changing sex from Female auto-disables without
silent deletion; user controls removal. Delete account cascades period observations. Observations
remain in the table when disabled but are gated from all queries by `period_tracking_enabled`
check at read time.

**Privacy design** — no cycle prediction, no phase labels, no symptom tracking, no fertility
claims, no automated correlation with performance. Separate table (`period_observation`),
owner-scoped RLS, explicit consent version. Future additions (e.g., Coach sharing, symptom
logs) require consent re-prompt and separate opt-in.

## AI Coach (2026-09-20)

The in-app agent is a new scope slice, not a rewrite of the Coach loop. The build contract
is [AI-COACH.md](AI-COACH.md). Locks below are the hard-to-reverse calls; slice checklists
live in that doc.

**Wrap the deterministic Coach.** Track Coach, `CoachCheckInReport`, proposals, and the
weekly API remain the source of weekly facts. The agent narrates and acts on that output.
Replacing `/analytics/coach` would throw away a tested contract the private API also uses.

**Stay in this TypeScript app.** Every tool worth calling is already a TS loader or action
(`loadCoachUi`, `getActiveProgram`, `loadNextWorkout`, `sessionTarget()`, `saveProgram`,
`startNextSession`). A Python sidecar would re-expose that surface. Deep Agents waits
until Slice 5; LangChain TypeScript is enough for the loop.

**User session + RLS, not the weekly secret.** The agent is an in-app user. The weekly API
is a single-account capability URL with a service-role client. Domain tools wrap existing
loaders so period data, slot identity, and owner scope cannot drift. Conversation memory
is new `agent_thread` / `agent_message` rows, not embeddings over `set_log`.

**Engine owns numbers.** A second, LLM-shaped progression rule would desync Home, the
session screen, and Coach. The agent may explain a target only by calling the same
`sessionTarget()` path the session already uses.

**Writes are drafts, then confirms.** `saveProgram` activates on save and preserves slot
IDs; an unattended upsert can smash history links. Slice 0 is read-only. Slice 2 persists
inactive drafts and opens the builder. Slice 4 calls existing actions after an
in-transcript confirm.

**Jev classifies; code assembles.** Jev cannot emit a program. Slice 2 uses Choice / Noul /
Score over a closed intake ontology, then a template assembler. Uncertain confidence asks
the user.

**Custom Sheet, not a fifth tab.** The four experiences stay Lift / Track / Program / You.
Gym logging already hides chrome (`hideAppChrome`); the agent entry follows that hide so
it does not fight set entry. Stream protocol may follow LangChain / agent-chat-ui; visual
language stays this app’s primitives.

**Period data stays off-limits** until a separate opt-in, matching the Coach V1 export
exclusion and Settings consent copy.
