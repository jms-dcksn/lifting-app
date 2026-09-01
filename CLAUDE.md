# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

A personal progressive-overload lifting tracker. Mobile web app. The defining feature is
**cross-exercise weight recommendation**: log sets with RIR, and when you swap a movement
(dumbbell → barbell → machine), the app recommends a working weight from your logged history.

> Note: this is Next.js 16 with breaking changes from older versions (see AGENTS.md above) —
> check `node_modules/next/dist/docs/` before writing framework code.

## Deployment

Deployed on **Vercel** via its native GitHub integration (repo `jms-dcksn/lifting-app`).
Every pushed branch gets an automatic **preview deployment**; `main` deploys to production.

- Production: https://lifting-app-plum.vercel.app
- Latest production deployment URL: https://lifting-e0yxuet5p-jmsdcksns-projects.vercel.app

Preview URLs for a branch/commit can be read from Vercel (CLI `vercel ls`, or the Vercel MCP
`list_deployments`) or from GitHub — Vercel posts deployment statuses back to the commit/PR
(`gh api repos/jms-dcksn/lifting-app/deployments`, `gh pr checks`). This is Vercel's Git
integration, **not** GitHub Actions.

## Commands

```bash
npm run dev          # Next.js dev server (Turbopack)
npm run build        # production build
npm run lint         # eslint
npx tsc --noEmit     # typecheck
npm test             # vitest (run once); npm run test:watch for watch mode
```

Tests run on **vitest**, scoped to the pure modules under `src/lib/` (config:
`vitest.config.ts`, `include: src/lib/**/*.test.ts`, node environment, `@/` alias via
native tsconfig-paths). The strength engine and analytics are framework-free, so the suite
loads no Next.js/React. Co-locate new tests as `*.test.ts` next to the module. Current
coverage: `e1rm`, `recommend`, `progression`, `plateau`, `program-tags`, `program-templates`,
`coach-check-in`,
`rest`, `coefficients`, `catalog`, `exercise-id`.

## Architecture

Next.js 16 (App Router, Server Actions, React 19) + Supabase (Postgres + Auth + RLS),
deployed on Vercel. Assumes connectivity during workouts — there is **no offline/local-first
layer** by design. See `docs/DECISIONS.md` for the full rationale and `PLAN.md` for the MVP
build sequence and what is intentionally out of scope.

### The strength engine (`src/lib/strength/`) — the heart of the app

Pure TypeScript, no framework deps. The recommender runs **client-side** (no server round-trip).
Five modules that must be understood together:

1. **`e1rm.ts`** — converts every logged set `(weight, reps, RIR)` to an estimated 1RM using
   an RPE/RIR load model (RPE = 10 − RIR), collapsed to a single %1RM curve over
   reps-to-failure. This is the universal comparison unit; progressive overload = e1RM rising.
   Do not swap in a bare Epley/Brzycki formula — it drifts in the 1–12 rep range.

2. **`coefficients.ts`** — the seeded exercise catalog for a Lifetime gym. Each exercise has a
   `pattern` (movement pattern), an `equipment` type (`barbell | dumbbell | cable | machine |
   bodyweight`), and a `coefficient` = its strength relative to that pattern's reference lift
   (coefficient 1.0). This file is the **source of truth** for seeded exercises. Machine
   movements are seeded as *generic templates* (`equipment: "machine"`, `machineTemplate: true`,
   no brand); the `exercise` DB table holds user-created brand/type *variants* and fully-custom
   exercises, merged in by `src/lib/catalog.ts`. Logging conventions are encoded here and must
   stay consistent: barbell/machine = total load (selectorized and plate-loaded both log total),
   dumbbell = one dumbbell's weight. Also exports `KNOWN_BRANDS`, `MACHINE_TYPE_LABEL`, and the
   `MachineType` (`selectorized | plate_loaded`) type. A machine template carries no absolute
   load identity until instantiated to a variant (`resolveVariant`).

3. **`recommend.ts`** — the model. One latent "pattern strength" per user per movement pattern
   (in reference-lift e1RM units), pooled from every logged variant. To recommend a weight for
   any exercise: `predicted_e1RM = pattern_strength × coefficient`, then invert to a working
   weight for the target reps/RIR. Coefficients are population priors that shrink toward each
   user's observed ratios (Bayesian shrinkage, `PRIOR_WEIGHT`).

4. **`recompute.ts`** — pure stat rebuild. `recomputeStat(def, sets, bodyweight)` returns
   `currentE1rm` = max e1RM across logged working sets (demonstrated current strength).
   `effectiveLoad(def, weight, bodyweight)` handles the bodyweight/assisted convention
   (effective load = bodyweight + added; added is negative for assisted); it returns `null`
   when bodyweight equipment is used but bodyweight is unknown — never coerce to 0. Machine
   calibration (`personal_coefficient`/`coeff_confidence_n`) is computed in
   `recomputeAndUpsertStat` (`session/actions.ts`), not here — see below.

5. **`progression.ts`** — pure double-progression engine. `startingWeight(def, reps, targetRir,
   defs, stats, bodyweight)` wraps `recommend()` and converts to the unit the UI displays/logs
   (for bodyweight equipment, suggested total load → added load; returns `null` when bodyweight
   is unknown). `sessionTarget(def, slot, last, defs, stats, bodyweight)`: no prior history →
   delegates to `startingWeight()` at `rep_min` (source `"recommendation"`, carries confidence);
   has prior → if first-set reps ≥ `rep_max`, bumps weight by `def.increment` and resets to
   `rep_min`, else holds weight and targets +1 rep (source `"progression"`). Bump test is
   reps-only. `startingWeight` is also called client-side to recompute the suggested weight
   live as the user edits reps/RIR before the first set.

**Machines are special.** You cannot predict absolute machine loads from free weights (arbitrary
leverage/pin/stack units). Exercises flagged `needsCalibration` return `confidence: "calibrate"`
with a deliberately conservative number; the first logged set anchors that machine's personal
coefficient (`personal_coefficient = currentE1rm / pattern strength from other logged variants`),
re-anchored while only one session exists, then held fixed — later machine progress moves
pattern strength, not the coefficient. `coeff_confidence_n` (distinct sessions with working
sets) feeds the Bayesian shrinkage in `recommend.ts` and graduates the exercise out of
`calibrate` once it has its own e1RM history. Preserve this behavior — don't try to make
machines predict like free weights.

### Data model (`supabase/migrations/`)

Migrations are sequential through `0010_program_phases.sql`. The phase table adds reusable,
program-level week ranges with optional RIR-range and working-set-multiplier overrides. Typed DB
types live at `src/lib/supabase/types.ts`.

- **`set_log` is the source of truth.** `user_exercise_stat` is a derived cache (current e1RM
  + personal coefficient) that is rebuildable from `set_log` — never let it drift.
- `exercise_id` is a **text slug** and is intentionally **not** a foreign key, so the seeded
  catalog can live in app code. A slug resolves through the **merged catalog** (`src/lib/catalog.ts`):
  seeded templates from `coefficients.ts` plus the user's `exercise` rows (brand/type variants and
  fully-custom exercises), seeded ids winning collisions. Variant ids are
  `base__brand__machinetype` (`src/lib/exercise-id.ts`); custom ids are `custom-<slug>-<rand>`.
  Variants are find-or-created by `resolveVariant` (`src/app/(app)/exercise/actions.ts`), backed by
  the `exercise_variant_unique` index; `createCustomExercise` makes fully-custom rows. Every screen
  that used to import the static `EXERCISE_BY_ID` now threads `getCatalogMap(supabase, userId)`
  instead — including the calibration-critical `session/actions.ts`, so variants calibrate and
  progress like any other exercise.
- Program slots reference movement *patterns*, not fixed exercises — this is what makes "swap
  exercise" a first-class operation that re-derives weight automatically.
- `set_log.program_slot_id` is populated from Phase 3 onward. Progression "last performance"
  lookup keys on `(program_slot_id, exercise_id)`, so a swapped exercise resumes its own
  progression chain in that slot without corrupting the original's. Seed sessions from
  Phase 2 have `program_slot_id = null` and are superseded by real DB-backed programs.
- Block position (week/day within the active program) is derived from the count of finished
  sessions with matching `program_id`, not stored.
- Builder save is an id-preserving upsert + delete-missing (not full replace), so
  `set_log.program_slot_id` continuity survives program edits. A partial unique index
  (`program_one_active_per_user`) enforces a single active program per user; saving always
  activates the saved program.
- **Every table has RLS** keyed on `auth.uid()`; every row carries `user_id`. New tables must
  follow this pattern. A trigger auto-creates a `profile` row on signup.

### Program loader (`src/lib/program.ts`)

`getProgram` assembles one complete program for home, detail, edit, and session flows.
It also loads ordered `program_phase` rows. `src/lib/periodization.ts` is the framework-free
source of truth for resolving an effective prescription from a stored session week; odd
fractional set counts round up with a minimum of one set.
`listProgramSummaries` powers `/program` with three batched queries (programs, days, slots)
and returns counts without assembling every program tree. Pure aggregation and ordering live
in `src/lib/program-summary.ts`: active first, then newest first. `ProgramSlot` carries
`restSeconds: number | null` (the per-slot rest override; `null` = use the profile default),
selected/mapped by `assemble()` so builder edits preserve it.

Built-in program templates live in `src/lib/program-templates.ts` (pure data, validated by
`program-templates.test.ts`: every slot's exercise id must resolve in `coefficients.ts` with
a matching pattern, and `weeks` must sit in the builder's 4-12 range). Fifteen templates: the
personalized 12-week James HIT Upper/Lower block, the simple Push/Pull/Legs, five community
programs (Reddit PPL, GZCLP, 5/3/1 BBB, PHUL, PHAT),
both Kinobody Ripped Artiste protocols (`kino-strength-density`, `kino-physique-mastery`),
and six transcribed from the source files in `docs/` — Jeff Nippard's Essentials 3x/4x/5x
(`essentials-3x/4x/5x`), Ultimate PPL 4x Phase 1 (`ultimate-ppl-4x`), Pure Bodybuilding
Upper/Lower Build Phase (`pure-bodybuilding-ul`), and Kinobody's Warrior Shred
(`warrior-shred`) — all mapped into the rep-range/RIR model — linear progression is
encoded as `repMin === repMax` (hitting repMax on the first set triggers the weight bump),
percent work is approximated with RIR. Kinobody's Reverse Pyramid Training (heavy top set,
drop ~10-15%/set) has no native model here, so its near-failure intent is approximated with
low RIR over the rep range; each rest-pause finisher is a single RIR-0 set. Seeding those two
added a `traps` pattern (`bb-shrug`/`cable-shrug`), populated the previously-empty `lunge`
pattern (`db-split-squat` ref, `db-step-up`), and added a `back-extension` machine template;
the `docs/` batch added `weighted-dip` (bodyweight `horizontal_press`, so assisted dips log
assistance as negative added weight like `weighted-pullup`). `createFromTemplate(templateId)` (`program/actions.ts`)
instantiates one: active on an empty account (first-run), otherwise an inactive draft.
The old `src/app/(app)/session/seed.ts` is deleted; its PPL data moved into the templates
module.

### Program routes (`src/app/(app)/program/`)

`/program` is a filterable responsive grid of linked summary tiles. Tiles show essential
metadata only and contain no actions. `/program/[id]` is the read-only full program view;
`/program/[id]?mode=edit` edits that program; `/program/new` creates one. Save/cancel from
an existing edit returns to detail. Edit, Make active, and Clone live on detail. Templates
remain a compact list below the owned-program grid.

`tag-filter.tsx` is a single-select chip row over the union of all tags (plus "All"); it
renders nothing when no programs have tags. `tag-input.tsx` edits tags in the builder
(Enter/comma to add, ×/Backspace to remove). `saveProgram` persists normalized tags and the
description. Each slot also has an optional rest override; save and clone preserve it.

`src/lib/program-tags.ts` is pure tag logic shared by the gallery and the builder:
`normalizeTags` (trim, drop empties, case-insensitive dedupe preserving first form),
`uniqueTags` (sorted case-insensitive union across programs), `filterByTag` (case-insensitive
filter; a null tag returns everything). Tested in `program-tags.test.ts`.

### Active session targets and swap (`src/app/(app)/session/[id]/`)

`page.tsx` no longer computes session targets server-side — it hydrates the client
component with `ExerciseStat[]`, `recentExerciseIds`, and a per-slot
`lastByExercise: Record<exerciseId, LastPerformance>` map. `active-session.tsx`'s
`SlotCard` calls `sessionTarget()` client-side (`useMemo`) to derive each target, so a
swap re-derives instantly with no round-trip. `ActiveSession` holds the merged `catalog`
(hydrated from `page.tsx` via `getCatalogMap`) in state and exposes `addToCatalog`, so a
variant resolved in-session is merged in and immediately drives that slot's name/target.
A slot's effective exercise id is the most recently logged exercise in that slot this session
(falling back to the program slot's exercise), so an in-session swap survives a page reload.
Swap is a `secondary` `Button` on the slot card that opens `ExercisePicker`
(`program/exercise-picker.tsx`, a `Sheet`) filtered to the slot's pattern, with a "show all
patterns" escape hatch; subsequent sets log against the swapped `exercise_id` + the original
`program_slot_id`. **Machine instantiation:** the session picker runs with `resolveMachines`,
so picking a bare machine template opens a brand/type sub-step that calls `resolveVariant` and
returns a concrete variant; a slot still on a template renders a "Choose machine (brand &
type)" button instead of set-entry (`isTemplate` gate). The picker also has an "Add custom
exercise" form (name + pattern + equipment, plus brand/type when equipment is machine) calling
`createCustomExercise`. `onPick` always receives a concrete, loggable def; `onClose` only
unmounts — the builder's add-slot flow (`resolveMachines` off → templates stored as-is) and
swap both follow this contract.

`SlotCard` tracks `isCurrent` (passed from the parent: the first slot whose logged set
count is below its target, i.e. server-truth-derived) and renders `Card tone="done"` once
its own sets reach target, `tone="active"` if it's the current slot, else `default` —
completed slots recede, the current slot reads as current, via hierarchy not color.
`ProgressDots` (filled vs target count) sits next to the rep/RIR prescription. Logged-set
rows animate in (`animate-row-in`); delete sets `data-exiting` (plays `row-out`) before the
optimistic removal commits ~160ms later. `handleLog`/`handleDelete` catch failed writes and
set a per-card `error` string rendered below the set list — failed optimistic writes no
longer revert silently. `TargetLine` shows weight × reps at heading weight with a "Start"/
"Target" caption label; `calibrate` and `low` confidence render as their own instruction
lines below (the old inline `confidenceBadge` helper is gone); the recommendation line is
suppressed entirely once `done > 0` (it goes stale the moment the first set is logged).

Classic sessions resolve every slot through `resolvePrescription()` using the session's stored
`week_index`. Effective sets drive progress dots, current/completed state, and set-entry defaults;
RIR ranges render in full while recommendation APIs receive the conservative upper bound. A
session-level phase card explains calibration, intensification, and deload weeks. Programs with
no phases retain their static slot prescription.

**Rest timer.** `active-session.tsx` owns one `useRestTimer()` (`rest-timer.tsx`) for the
whole session — only one rest countdown runs at a time, regardless of how many slots are in
play. The hook tracks an absolute end timestamp (not a decrementing counter) so a 250ms tick
stays accurate across tab throttling; on completion it fires `navigator.vibrate` plus a short
WebAudio beep, both best-effort/guarded. `handleLog` calls each `SlotCard`'s `startRest`
callback immediately on logging a set — optimistically, so a failed write doesn't stop the
clock — with duration `slot.restSeconds ?? defaultRestSeconds` (the per-slot override from
`program_slot.rest_seconds`, falling back to `profile.default_rest_seconds`). `RestBar`
renders in the sticky footer above Finish, with `+30s` and `Skip` controls, and is absent
when idle. `useScreenWakeLock()` (further down in this file, pre-existing from before the
timer) keeps the screen on for the duration of the session, so the timer fires reliably as
long as the session screen stays open and unlocked — see `docs/DECISIONS.md` Phase B for the
narrower-than-expected limitation this leaves (manual lock / backgrounded tab only).

### Exercise history (`src/app/(app)/history/[exerciseId]/`)

Server Component (`page.tsx`) fetches that exercise's working sets via `set_log` joined to
`workout_session!inner(performed_at)`, groups them by session, and computes a best-e1RM-per-
session series plus an overload badge (latest session vs the one before it). The line chart
(`e1rm-chart.tsx`, `recharts`) is a thin client component. The same exercise-keyed overload
delta (latest session vs that exercise's previous session) is also surfaced per-lift in the
finish-session summary (`session/actions.ts` → `finishSession`'s `prevE1rm`). This lookup is
keyed on `exercise_id`, not `program_slot_id` — see `docs/DECISIONS.md` Phase 4.

### Progress analytics (`src/app/(app)/analytics/`)

Top-level nav label is **Progress** (`/analytics`). The page is a Server Component that
fetches this user's working `set_log` rows joined to
`workout_session(performed_at, finished_at, program_id)` plus `profile.bodyweight`, then
hands them to `src/lib/analytics.ts`.

`src/lib/analytics.ts` is pure and framework-free (ad-hoc testable with `npx tsx --eval`
like the strength engine):

- `sessionTonnage(rows, defs, bodyweight)` groups by session and sums
  `effectiveLoad(def, weight, bodyweight) * reps`. Bodyweight sets with unknown
  bodyweight are excluded and counted, never treated as zero.
- `e1rmPrFeed(rows)` emits chronological e1RM record events per exercise.
- `weightPrs(rows)` returns each exercise's all-time heaviest raw logged load.
- `exerciseSummaries(rows)` returns current/latest-session e1RM, all-time best e1RM,
  last-performed date, session count, and latest-vs-previous-session delta.
- `patternWeekStats(rows, defs, bodyweight, hardRir=2)` → working sets, hard sets
  (RIR ≤ `hardRir`), and tonnage per movement pattern per ISO week (Monday-start UTC).
  Returns `PatternWeekStat[]`. `HARD_RIR = 2` is the module default.
- `latestWeekBalance(rows, defs, bodyweight, hardRir=2)` → the most recent training
  week's per-pattern stats ranked by set count: `{ weekStart, patterns }` or null.
- `patternStrengthTrend(rows, defs)` → per-pattern latent pattern-strength trend.
  Replays sessions chronologically over running-best e1RMs, calling
  `estimatePatternStrength` from `recommend.ts` at each session. Returns
  `PatternStrengthPoint[]` sorted by current pattern strength desc. **Caveat:**
  passes `null` for `personalCoefficient`, so machine personal-coefficient history is
  not replayed — it tracks the same pooled-across-variants signal the live recommender
  uses, not its exact calibrated value.

`coefficients.ts` now also exports `PATTERN_LABEL: Record<Pattern, string>` —
human-readable movement-pattern names for analytics UI (e.g. `"Hip Hinge"`).

The Progress page (`analytics/page.tsx`) renders six server-side cards, top to bottom:
1. **Coach check-in** — client copy button over a server-derived seven-day coaching payload
   from `coach-check-in.ts` (finished-session adherence, RIR, hard sets, and lift trends)
2. **Total volume** — session tonnage chart (Recharts `volume-chart.tsx`)
3. **Training balance** — latest training week's per-pattern horizontal bar list;
   total working sets (faint bar) with hard-set portion overlaid (foreground bar);
   caption "{n} sets · {m} hard"; footnote "Hard = RIR ≤ 2 (near failure)"
4. **e1RM progression highlights** — top gainers with signed-delta `TrendPill`
5. **Pattern strength** — list of trained patterns, current reference-lift e1RM,
   signed-delta `TrendPill`; patterns with <2 sessions show "new" instead of a trend
6. **All exercises** — searchable list (`exercise-list.tsx`) → `history/[exerciseId]`

The hub deliberately funnels lift rows into the existing `history/[exerciseId]` route
instead of creating a second per-exercise drill-down. Keep client code small: client
pieces are only `coach-check-in.tsx` (clipboard), `volume-chart.tsx` (Recharts), and
`exercise-list.tsx` (search).
Training balance and pattern strength are monochrome list cards — not colored multi-line
charts — to preserve the "color is semantic only" Phase 6 contract.

### UI primitives and design tokens (`src/components/ui/`)

All screens are built on a small shared component set, introduced in Phase 6 and extended
in Phase 7 with motion/loading primitives. Don't hand-roll new buttons/cards/steppers/
overlays/skeletons — extend these.

- **Tokens live in `src/app/globals.css`** (`@theme` / `@theme inline`): semantic colors
  (background/foreground/surface/border/border-strong/muted/faint/accent/accent-foreground,
  plus `overload-up`, `overload-down`, `calibrate`, `danger`), a type scale
  (`text-display/heading/body/caption`), one card radius (`--radius-card`) and one control
  radius (`--radius-control`), a single content-column width (`--container-page` →
  `max-w-page`, used on every screen's root wrapper), and motion tokens `--ease-snap`/
  `animate-tick`/`animate-row-in`/`animate-rise` plus a plain-CSS `[data-exiting]` →
  `row-out` exit animation and `.skeleton` pulse keyframes. The palette is near-monochrome
  by design — color is semantic only (overload/calibrate/danger). Geist fonts are wired via
  `--font-sans`/`--font-mono` (the old `body { font-family: Arial }` override that silently
  disabled Geist is gone). The global `prefers-reduced-motion` kill-switch
  (`animation-duration`/`transition-duration: 0.01ms`) covers all motion tokens, including
  the Phase 7 additions and `::view-transition-group(*)`.
- **`Sheet` (`sheet.tsx`) is the app's one overlay primitive** — a native `<dialog>` +
  `showModal()` bottom sheet (focus trap, scrim tap / Escape / swipe-down-on-handle to
  dismiss, animated exit via `data-closing` + `@starting-style` in `globals.css`; the JS
  exit delay (`EXIT_MS`) must match the CSS transition duration). `useSheetDismiss()` lets
  inner content (e.g. a Cancel button) trigger the same animated close. The parent only
  unmounts via `onClose` after the animation finishes. `ExercisePicker` is built on this,
  and is itself capped at `max-w-page` (with `sm:border-x` so it reads as a column on wider
  viewports rather than spanning edge-to-edge).
- **`Button` (`button.tsx`)** — primary/secondary/destructive/ghost × sm/md/lg, with
  built-in pending state (spinner + `aria-busy`): pass `pending` explicitly, or rely on
  `useFormStatus` for submit buttons inside a `<form action>`. The variant/size class
  builder (`buttonClasses`, in `button-styles.ts`) is deliberately **not** in a `"use
  client"` module so Server Components can use it to style `<Link>`s as buttons — calling
  a function exported from a `"use client"` module from a Server Component throws at
  runtime, and `next build` does **not** catch this.
- **`Stepper` (`stepper.tsx`)** — the most-touched control mid-workout: 44px hit areas,
  press-and-hold auto-repeat (action fires on `pointerdown`, repeats after 450ms at 80ms
  intervals; `onClick` is reserved for keyboard activation), tick animation on change via
  input remount, select-all on focus. `column` layout for session set-entry, `row` for
  inline steppers (e.g. builder weeks). Note: the `eslint-plugin-react-hooks` "refs" rule
  (no `ref.current` writes during render) shapes this component's structure — value reads
  happen via an effect-synced ref, and the hold/repeat logic lives entirely in event
  handlers, not render.
- **`Card` (`card.tsx`)** gained a `tone` prop (`default | active | done`) that carries
  hierarchy without color: `active` = `border-border-strong` (the current slot), `done` =
  `opacity-60` (a completed slot). `Card` now spreads `...props`, so callers can pass
  `style` (e.g. `viewTransitionName`) and other DOM attributes through.
- **`Skeleton` (`skeleton.tsx`)** — neutral placeholder block (`.skeleton` pulse keyframes,
  reduced-motion-safe). Used by the route-level `loading.tsx` fallbacks (`(app)/loading.tsx`,
  `(app)/session/[id]/loading.tsx`, `(app)/history/[exerciseId]/loading.tsx`,
  `(app)/analytics/loading.tsx`) so server navigations never show a dead white screen.
- **`withViewTransition` (`view-transition.ts`)** — runs a state update inside
  `document.startViewTransition` (+ `flushSync`) so elements carrying a matching
  `viewTransitionName` tween between their old and new positions; falls back to a plain
  update when unsupported or `prefers-reduced-motion` is set. Used by the program builder's
  day/slot reorder (`vt-<id>` view-transition names on day cards and slot rows).
- `input.tsx` (`Input`), `cx.ts` (classname join) round out the set.
  `src/app/(app)/start-button.tsx` was deleted — the home screen's start/resume action is
  now a shared `Button` (its built-in pending state covers the double-tap protection the
  old component existed for).

### App shell (`src/app/(app)/layout.tsx`)

Nav is extracted into a client component, `(app)/nav-links.tsx` (`NavLinks`), which uses
`usePathname()` to mark the active top-level route (`aria-current="page"`, foreground vs
muted text). Current top-level destinations are Progress (`/analytics`), Program, and
Settings, plus the Lift home link. `layout.tsx` itself stays a Server Component (auth gate
via `getClaims()`).

### Supabase clients (`src/lib/supabase/`)

`client.ts` (browser) and `server.ts` (Server Components / Actions, async, cookie-based) via
`@supabase/ssr`. Auth is email magic-link. Session refresh runs in `src/proxy.ts` (Next.js 16
renamed `middleware.ts` → `proxy.ts`; see AGENTS.md) via `updateSession()` in
`src/lib/supabase/middleware.ts`, which uses `getClaims()` (not `getUser()`/`getSession()`) for
token refresh and auth protection.
