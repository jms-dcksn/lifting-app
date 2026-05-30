# Architecture Decisions

A personal progressive-overload lifting app. Priorities: progressive overload, proper
technique, foundational movements. Core feature: swap exercises and get a recommended
weight for any exercise based on logged history of similar movements.

## Stack

- **Next.js (App Router, Server Actions)** — mobile web app, accessed via browser.
- **Supabase** — Postgres + Auth + RLS. Zero-ops.
- **Auth**: Supabase Auth, email magic-link + Google OAuth. RLS keys off `auth.uid()`.
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
(conservative guess), and one data point anchors everything after. Machine identity is
ideally machine-at-a-gym (`equipment_instance`) since brand loading differs.

Gym context: Lifetime — barbell, dumbbell (to ~120lb), cables, plus Hammer Strength
(plate-loaded ISO-lateral), Life Fitness / Hoist (selectorized pin), Technogym (selectorized).

## Data model

`set_log` is the source of truth; `user_exercise_stat` is a rebuildable cache. Program
slots reference movement patterns, so "swap exercise" is a first-class operation. Seeded
exercise catalog lives in `coefficients.ts` (app code); the `exercise` table holds only
user-custom additions. See `supabase/migrations/0001_init.sql`.

## Build order

- **v0** — Logging + e1RM tracking + progression charts. (Build this fully first.)
- **v1** — Swap exercise + weight recommendation (population priors).
- **v2** — Personalized coefficients + machine calibration + per-gym machine identity.
