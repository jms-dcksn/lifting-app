# lifting-app

Personal progressive-overload lifting tracker. Logs sets with RIR, tracks estimated 1RM,
and recommends a working weight for any exercise — including when you swap movements
(dumbbell → barbell → machine) — from your logged history.

See [docs/DECISIONS.md](docs/DECISIONS.md) for architecture and the recommendation algorithm.

## Stack

Next.js (App Router) · Supabase (Postgres + Auth + RLS) · TypeScript recommender · Vercel.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase URL + anon key
npm run dev
```

Apply the schema to your Supabase project:

```bash
# via Supabase CLI, or paste supabase/migrations/0001_init.sql into the SQL editor
supabase db push
```

Enable the Email (magic-link) provider in the Supabase Auth dashboard.

## Layout

- `src/lib/strength/` — the recommendation engine (framework-free, unit-testable)
  - `e1rm.ts` — RPE/RIR → estimated 1RM and its inverse
  - `coefficients.ts` — seeded exercise catalog + population strength priors
  - `recommend.ts` — pattern-strength model + cross-exercise weight recommendation
- `src/lib/supabase/` — browser and server Supabase clients
- `supabase/migrations/` — database schema with row-level security
