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

Pure TypeScript, no framework deps, runs **client-side** (the recommender needs no server
round-trip). Three layers that must be understood together:

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

**Machines are special.** You cannot predict absolute machine loads from free weights (arbitrary
leverage/pin/stack units). Exercises flagged `needsCalibration` return `confidence: "calibrate"`
with a deliberately conservative number; the first logged set anchors that machine's personal
coefficient. Preserve this behavior — don't try to make machines predict like free weights.

### Data model (`supabase/migrations/`)

Three applied migrations: `0001_init.sql` (base schema), `0002_program_builder.sql` (program/day/slot tables, `profile.bodyweight`, `set_log.program_slot_id`), `0003_harden_signup_trigger.sql` (signup trigger hardening). Typed DB types at `src/lib/supabase/types.ts`.

- **`set_log` is the source of truth.** `user_exercise_stat` is a derived cache (current e1RM
  + personal coefficient) that is rebuildable from `set_log` — never let it drift.
- `exercise_id` is a **text slug** (matching `coefficients.ts` ids) and is intentionally **not**
  a foreign key, so the seeded catalog can live in app code.
- Program slots reference movement *patterns*, not fixed exercises — this is what makes "swap
  exercise" a first-class operation that re-derives weight automatically.
- **Every table has RLS** keyed on `auth.uid()`; every row carries `user_id`. New tables must
  follow this pattern. A trigger auto-creates a `profile` row on signup.

### Supabase clients (`src/lib/supabase/`)

`client.ts` (browser) and `server.ts` (Server Components / Actions, async, cookie-based) via
`@supabase/ssr`. Auth is email magic-link; session refresh belongs in middleware.
