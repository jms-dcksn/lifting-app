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
   when bodyweight equipment is used but bodyweight is unknown — never coerce to 0. Personal-coefficient
   recompute for machine calibration is deferred to Phase 5; `logSet` preserves any existing
   `personal_coefficient`/`coeff_confidence_n` untouched.

5. **`progression.ts`** — pure double-progression engine. `sessionTarget(def, slot, last, defs,
   stats, bodyweight)`: no prior history → hands off to `recommend()` at `rep_min` (source
   `"recommendation"`, carries confidence; for bodyweight equipment the suggested total load
   is converted back to added load, and no target is returned when bodyweight is unknown);
   has prior → if first-set reps ≥ `rep_max`, bumps
   weight by `def.increment` and resets to `rep_min`, else holds weight and targets +1 rep
   (source `"progression"`). Bump test is reps-only.

**Machines are special.** You cannot predict absolute machine loads from free weights (arbitrary
leverage/pin/stack units). Exercises flagged `needsCalibration` return `confidence: "calibrate"`
with a deliberately conservative number; the first logged set anchors that machine's personal
coefficient. Preserve this behavior — don't try to make machines predict like free weights.

### Data model (`supabase/migrations/`)

Four applied migrations: `0001_init.sql` (base schema), `0002_program_builder.sql` (program/day/slot tables, `profile.bodyweight`, `set_log.program_slot_id`), `0003_harden_signup_trigger.sql` (signup trigger hardening), `0004_session_finished_at.sql` (adds nullable `finished_at timestamptz` to `workout_session`). Typed DB types at `src/lib/supabase/types.ts`.

- **`set_log` is the source of truth.** `user_exercise_stat` is a derived cache (current e1RM
  + personal coefficient) that is rebuildable from `set_log` — never let it drift.
- `exercise_id` is a **text slug** (matching `coefficients.ts` ids) and is intentionally **not**
  a foreign key, so the seeded catalog can live in app code.
- Program slots reference movement *patterns*, not fixed exercises — this is what makes "swap
  exercise" a first-class operation that re-derives weight automatically.
- `set_log.program_slot_id` is populated from Phase 3 onward. Progression "last performance"
  lookup keys on `program_slot_id` (not `exercise_id`). Seed sessions from Phase 2 have
  `program_slot_id = null` and are superseded by real DB-backed programs.
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

### Supabase clients (`src/lib/supabase/`)

`client.ts` (browser) and `server.ts` (Server Components / Actions, async, cookie-based) via
`@supabase/ssr`. Auth is email magic-link. Session refresh runs in `src/proxy.ts` (Next.js 16
renamed `middleware.ts` → `proxy.ts`; see AGENTS.md) via `updateSession()` in
`src/lib/supabase/middleware.ts`, which uses `getClaims()` (not `getUser()`/`getSession()`) for
token refresh and auth protection.
