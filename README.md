# lifting-app

Personal progressive-overload lifting tracker. Logs sets with RIR, tracks estimated 1RM,
recommends a working weight for any exercise — including when you swap movements
(dumbbell → barbell → machine) — and summarizes training progress across sessions.

Programs come in two styles. **Classic** programs run a fixed weekly cycle with
rep-range-safe double progression and can apply week-specific set/RIR phases. A performance
below the rep floor recalibrates load instead of prescribing another out-of-range target.
**Fluid (adaptive)** programs keep the cycle fixed but adapt the *movement*:
per-exercise e1RM plateau detection drives a laddered intervention — widen the rep range first,
then swap to a ranked alternative in the same pattern — surfaced in-session as recommend-and-confirm.

In an active workout, **Swap → choose exercise → This workout only / Remainder of program**
saves the replacement immediately. Program scope changes only that slot on that program day;
workout scope leaves the next occurrence unchanged. Already logged sets retain their exercise,
weight, reps, and RIR. See [exercise swap behavior](docs/EXERCISE-SWAPS.md).

Tap **Today's work** on Lift (home) to open a full-page planner with sets, reps, RIR, rest,
and phase details. Choose specific machines or swap exercises before starting; selections
apply to that workout and persist in the same browser. Start from either Home or the planner
with those choices intact. See [workout planning](docs/WORKOUT-PLANNING.md).

Saved sets highlight **rep PRs at a fixed load** and **estimated 1RM records** on the
exercise card. Finish opens a cinematic recap of those records (or `{day} done` when
there are none). It remains above the cards when reopening the workout and updates
after set edits/deletions. Records compare the same exercise and equipment across
programs. See [workout records](docs/DECISIONS.md#workout-records).

See the [documentation map](docs/README.md) for architecture, feature contracts, and plans.
Agent instructions live in [AGENTS.md](AGENTS.md); deployment configuration in [DEPLOY.md](DEPLOY.md).


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
npx supabase db push   # applies all migrations in supabase/migrations/
```

Enable the Email (magic-link) provider in the Supabase Auth dashboard.

## Layout

- `src/lib/strength/` — the recommendation engine (framework-free, unit-testable)
  - `e1rm.ts` — RPE/RIR → estimated 1RM and its inverse
  - `coefficients.ts` — seeded exercise catalog (generic machine *templates*) + population strength priors
  - `recommend.ts` — pattern-strength model + cross-exercise weight recommendation
  - `recompute.ts` — rebuild `user_exercise_stat` from `set_log` rows
  - `progression.ts` — double-progression session target using bounded best-recent exact-exercise history across repeated weekly slots
  - `records.ts` — shared rep/e1RM record replay with stable pre-workout comparisons
  - `plateau.ts` — fluid-program engine: per-movement e1RM plateau detection (hysteresis) and the laddered rep-range → swap intervention (unit-tested)
- `src/lib/fluid.ts` — server loader that turns logged history into pending in-session adaptation suggestions
- `src/lib/workout-records.ts` — user-scoped, paginated record history for live cards and completion recaps
- `src/lib/catalog.ts` — merges seeded templates with the user's DB `exercise` rows (brand/type variants + custom exercises) into the `Record<id, ExerciseDef>` the engine consumes
- `src/lib/exercise-id.ts` — pure variant-id / variant-name / custom-slug helpers
- `src/lib/analytics.ts` — framework-free aggregation helpers for Track
- `src/lib/coach-check-in.ts` — versioned canonical coach report plus its clipboard formatter
- `src/lib/coach-recommendations.ts` — deterministic, evidence-backed weekly proposals with
  deload/pain/RIR/plateau guardrails
- `src/lib/coach-api.ts` / `src/lib/coach-weekly-data.ts` — authenticated, read-only weekly Coach
  API contract and explicitly user-scoped server data loader
- `src/lib/bodyweight.ts` — pure seven-day bodyweight windows, sparse averages, and week-over-week trend
- `src/lib/current-bodyweight.ts` — latest-observation lookup with preserved profile baseline fallback
- `src/lib/session-feedback.ts` — readiness/pain/note contract and input validation
- `src/lib/periodization.ts` — resolves week-specific working-set and RIR overrides for classic programs
- `src/lib/program.ts` — server-side program loader; assembles nested program (days → slots) from DB
- `src/components/ui/` — shared UI primitives (Button, Stepper, Card, Input, Sheet, Skeleton) and design tokens (`src/app/globals.css`)
- `src/lib/supabase/` — browser client, server client, and `middleware.ts` (`updateSession` helper for `proxy.ts`)
- `src/proxy.ts` — Next.js 16 session proxy (replaces `middleware.ts`); refreshes Supabase session on matched requests
- `src/app/(app)/program/` — summary tile grid + dedicated read-only detail route + builder (Classic/Adaptive style, catalog-driven picker, custom exercises, server actions)
- `src/app/(app)/exercise/actions.ts` — `resolveVariant` (find-or-create a machine brand/type variant) and `createCustomExercise` server actions
- `src/app/(app)/settings/` — bodyweight history/trend, goal weight, default rest-between-sets, rest-complete tone editor, period tracking, and sign out (You tab)
- `src/app/(app)/analytics/` — Track: 2-column compound scoreboard (catalog reference lifts with history; hidden otherwise); Explore menu (this week's PRs, all-lifts search, month review, Coach, Body, Volume)
- `src/app/api/coach/v1/weekly/` — private, no-store endpoint for the scheduled Coach check-in
- `docs/COACH-REPORT.md` — exact v1 windows, metrics, trend rules, privacy contract, and limitations
- `src/lib/exercise-review-sessions.ts` — pure helper: groups finished sets by session, computes session-best e1RM, 21-day recent window, and chart point series
- `src/lib/exercise-review-months.ts` / `exercise-review-month-stats.ts` — month-compare defaults, program captions, Chicago-window PRs/e1RM/volume/exposures
- `src/lib/exercise-review-href.ts` / `review-equipment.ts` — Exercise review URL (`equipment` / `month`) and latest-instance identity helpers
- `src/app/(app)/history/[exerciseId]/` — Exercise review: Today card (last finished session + delta), past-21-day window, e1RM chart (last 8 / All history toggle, period overlay on All history only), month-to-month compare, equipment switcher, and session list
- `supabase/migrations/` — database schema with row-level security; `supabase/tests/` holds ownership and atomic-write regression checks

### Quick lift history

During a workout, tap **History** on an exercise to open a scrollable sheet with its
10 most recent logged sets from previous workouts. Machine exercises include all linked
brands and machine types, with each machine named alongside the date, weight, reps,
and RIR. Close the sheet to resume your workout without losing your set inputs.

Weight history can be browsed and edited through a shared calendar on Home, Track,
and You, including backdated entries and atomic date corrections. See
[Weight calendar](docs/WEIGHT-CALENDAR.md) for the data contract and preview checklist.

Track → More includes bodyweight dots, seven-day trend averages, a goal reference,
30/90-day, six-month and all-history views, plus optional weekly averages. Tap a
reading to edit it in the weight calendar. See [weight trend contracts](docs/WEIGHT-TRENDS.md).

Monthly review: open **Track → Month review** for exact-date
month comparisons, canonical workout PR totals, and equipment-specific strength evidence.
Supported stalls appear under **Worth reviewing**, with comparable workout evidence shared
with Coach and Fluid. The dashboard includes ranked improvements, rep gains, grouped achievements, exact-equipment drill-downs, and selected-month weight trends. See [Monthly progress](docs/MONTHLY-PROGRESS.md).
