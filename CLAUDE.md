# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

A personal progressive-overload lifting tracker. Mobile web app. The defining feature is
**cross-exercise weight recommendation**: log sets with RIR, and when you swap a movement
(dumbbell → barbell → machine), the app recommends a working weight from your logged history.

> Note: this is Next.js 16 with breaking changes from older versions (see AGENTS.md above) —
> check `node_modules/next/dist/docs/` before writing framework code.

## Commands

```bash
npm run dev          # Next.js dev server (Turbopack)
npm run build        # production build
npm run lint         # eslint
npx tsc --noEmit     # typecheck (no test runner configured yet)
```

There is no test runner yet. The strength engine is pure and framework-free, so verify it
ad hoc with `npx tsx --eval` importing from `src/lib/strength/` (see git history for the
sanity-check pattern). If adding tests, prefer a runner that runs these modules in isolation.

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

2. **`coefficients.ts`** — the seeded exercise catalog (~38 exercises for a Lifetime gym).
   Each exercise has a `pattern` (movement pattern), an `equipment` type, and a `coefficient`
   = its strength relative to that pattern's reference lift (coefficient 1.0). This file is the
   **source of truth** for seeded exercises; the `exercise` DB table holds only user-custom
   additions. Logging conventions are encoded here and must stay consistent: barbell/machine =
   total load, dumbbell = one dumbbell's weight.

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

Four applied migrations: `0001_init.sql` (base schema), `0002_program_builder.sql` (program/day/slot tables, `profile.bodyweight`, `set_log.program_slot_id`), `0003_harden_signup_trigger.sql` (signup trigger hardening), `0004_session_finished_at.sql` (adds nullable `finished_at timestamptz` to `workout_session`). Typed DB types at `src/lib/supabase/types.ts`.

- **`set_log` is the source of truth.** `user_exercise_stat` is a derived cache (current e1RM
  + personal coefficient) that is rebuildable from `set_log` — never let it drift.
- `exercise_id` is a **text slug** (matching `coefficients.ts` ids) and is intentionally **not**
  a foreign key, so the seeded catalog can live in app code.
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

Shared server-side helper. Exports `getActiveProgram`, `getProgram`, `listPrograms`,
`recentExerciseIds`, and the `Program`/`ProgramDay`/`ProgramSlot` types. Assembles the
nested program structure (days → slots) from the `program`, `program_day`, and
`program_slot` tables. Used by home, the session page, and the builder.

`src/app/(app)/session/seed.ts` no longer drives the runtime program. It survives only
as the template source for `createFromTemplate` (onboarding shortcut that seeds the
built-in Push/Pull/Legs template).

### Active session targets and swap (`src/app/(app)/session/[id]/`)

`page.tsx` no longer computes session targets server-side — it hydrates the client
component with `ExerciseStat[]`, `recentExerciseIds`, and a per-slot
`lastByExercise: Record<exerciseId, LastPerformance>` map. `active-session.tsx`'s
`SlotCard` calls `sessionTarget()` client-side (`useMemo`) to derive each target, so a
swap re-derives instantly with no round-trip. A slot's effective exercise id is the most
recently logged exercise in that slot this session (falling back to the program slot's
exercise), so an in-session swap survives a page reload. Swap is a `secondary` `Button` on
the slot card (was a caption text link) that opens `ExercisePicker`
(`program/exercise-picker.tsx`, a `Sheet`) filtered to the slot's pattern, with a "show all
patterns" escape hatch (now visible pattern `Chip`s, not a text toggle); subsequent sets
log against the swapped `exercise_id` + the original `program_slot_id`. Picking an exercise
dismisses the sheet itself (animated); `onPick` only updates parent state and `onClose`
only unmounts — both the builder's add-slot flow and swap follow this contract.

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

### Exercise history (`src/app/(app)/history/[exerciseId]/`)

Server Component (`page.tsx`) fetches that exercise's working sets via `set_log` joined to
`workout_session!inner(performed_at)`, groups them by session, and computes a best-e1RM-per-
session series plus an overload badge (latest session vs the one before it). The line chart
(`e1rm-chart.tsx`, `recharts`) is a thin client component. The same exercise-keyed overload
delta (latest session vs that exercise's previous session) is also surfaced per-lift in the
finish-session summary (`session/actions.ts` → `finishSession`'s `prevE1rm`). This lookup is
keyed on `exercise_id`, not `program_slot_id` — see `docs/DECISIONS.md` Phase 4.

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
  `(app)/session/[id]/loading.tsx`, `(app)/history/[exerciseId]/loading.tsx`) so server
  navigations never show a dead white screen.
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
muted text). `layout.tsx` itself stays a Server Component (auth gate via `getClaims()`).

### Supabase clients (`src/lib/supabase/`)

`client.ts` (browser) and `server.ts` (Server Components / Actions, async, cookie-based) via
`@supabase/ssr`. Auth is email magic-link. Session refresh runs in `src/proxy.ts` (Next.js 16
renamed `middleware.ts` → `proxy.ts`; see AGENTS.md) via `updateSession()` in
`src/lib/supabase/middleware.ts`, which uses `getClaims()` (not `getUser()`/`getSession()`) for
token refresh and auth protection.
