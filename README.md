# lifting-app

Personal progressive-overload lifting tracker. Logs sets with RIR, tracks estimated 1RM,
and recommends a working weight for any exercise — including when you swap movements
(dumbbell → barbell → machine) — from your logged history.

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
  - `coefficients.ts` — seeded exercise catalog + population strength priors
  - `recommend.ts` — pattern-strength model + cross-exercise weight recommendation
  - `recompute.ts` — rebuild `user_exercise_stat` from `set_log` rows
  - `progression.ts` — double-progression session target (weight + reps) per slot
- `src/lib/program.ts` — server-side program loader; assembles nested program (days → slots) from DB
- `src/components/ui/` — shared UI primitives (Button, Stepper, Card, Input, Sheet) and design tokens (`src/app/globals.css`)
- `src/lib/supabase/` — browser client, server client, and `middleware.ts` (`updateSession` helper for `proxy.ts`)
- `src/proxy.ts` — Next.js 16 session proxy (replaces `middleware.ts`); refreshes Supabase session on every request
- `src/app/(app)/program/` — program builder (server page + client builder, exercise picker, program list, server actions)
- `src/app/(app)/settings/` — bodyweight editor
- `src/app/(app)/history/[exerciseId]/` — per-exercise history: e1RM line chart (Recharts) + overload signal vs the previous session
- `supabase/migrations/` — database schema with row-level security
