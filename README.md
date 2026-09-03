# lifting-app

Personal progressive-overload lifting tracker. Logs sets with RIR, tracks estimated 1RM,
recommends a working weight for any exercise — including when you swap movements
(dumbbell → barbell → machine) — and summarizes training progress across sessions.

Programs come in two styles. **Classic** programs run a fixed weekly cycle with
double-progression and can apply week-specific set/RIR phases. **Fluid (adaptive)** programs keep the cycle fixed but adapt the *movement*:
per-exercise e1RM plateau detection drives a laddered intervention — widen the rep range first,
then swap to a ranked alternative in the same pattern — surfaced in-session as recommend-and-confirm.

See [docs/DECISIONS.md](docs/DECISIONS.md) for architecture and the recommendation algorithm.

## Stack

Next.js (App Router) · Supabase (Postgres + Auth + RLS) · TypeScript recommender · Recharts · Vercel.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase URL + publishable key
npm run dev
```

Apply the schema to your Supabase project:

```bash
supabase db push   # applies all migrations in supabase/migrations/
```

Enable the Email (magic-link) provider in the Supabase Auth dashboard.

## Layout

- `src/lib/strength/` — the recommendation engine (framework-free, unit-testable)
  - `e1rm.ts` — RPE/RIR → estimated 1RM and its inverse
  - `coefficients.ts` — seeded exercise catalog (generic machine *templates*) + population strength priors
  - `recommend.ts` — pattern-strength model + cross-exercise weight recommendation
  - `recompute.ts` — rebuild `user_exercise_stat` from `set_log` rows
  - `progression.ts` — double-progression session target (weight + reps) per slot
  - `plateau.ts` — fluid-program engine: per-movement e1RM plateau detection (hysteresis) and the laddered rep-range → swap intervention (unit-tested)
- `src/lib/fluid.ts` — server loader that turns logged history into pending in-session adaptation suggestions
- `src/lib/catalog.ts` — merges seeded templates with the user's DB `exercise` rows (brand/type variants + custom exercises) into the `Record<id, ExerciseDef>` the engine consumes
- `src/lib/exercise-id.ts` — pure variant-id / variant-name / custom-slug helpers
- `src/lib/analytics.ts` — framework-free aggregation helpers for the Progress hub
- `src/lib/coach-check-in.ts` — paste-ready weekly coaching summary from finished-session logs
- `src/lib/bodyweight.ts` — pure seven-day bodyweight windows, sparse averages, and week-over-week trend
- `src/lib/current-bodyweight.ts` — latest-observation lookup with preserved profile baseline fallback
- `src/lib/session-feedback.ts` — readiness/pain/note contract and input validation
- `src/lib/periodization.ts` — resolves week-specific working-set and RIR overrides for classic programs
- `src/lib/program.ts` — server-side program loader; assembles nested program (days → slots) from DB
- `src/components/ui/` — shared UI primitives (Button, Stepper, Card, Input, Sheet, Skeleton) and design tokens (`src/app/globals.css`)
- `src/lib/supabase/` — browser client, server client, and `middleware.ts` (`updateSession` helper for `proxy.ts`)
- `src/proxy.ts` — Next.js 16 session proxy (replaces `middleware.ts`); refreshes Supabase session on every request
- `src/app/(app)/program/` — summary tile grid + dedicated read-only detail route + builder (Classic/Adaptive style, catalog-driven picker, custom exercises, server actions)
- `src/app/(app)/exercise/actions.ts` — `resolveVariant` (find-or-create a machine brand/type variant) and `createCustomExercise` server actions
- `src/app/(app)/settings/` — bodyweight history/trend, goal weight, and default rest-between-sets editor
- `src/app/(app)/analytics/` — Progress hub: coach check-in export (including session feedback and bodyweight trend), session volume, e1RM gainers, record feed, searchable exercise list
- `src/app/(app)/history/[exerciseId]/` — per-exercise history: e1RM line chart (Recharts) + overload signal vs the previous session
- `supabase/migrations/` — database schema with row-level security; `supabase/tests/` holds pgTAP ownership checks
