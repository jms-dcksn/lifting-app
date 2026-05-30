# MVP Build Plan

Goal: a usable mobile-web app where I can log a workout with RIR, see my e1RM trend, swap
an exercise mid-session, and get a recommended weight. Done = I use it for a real workout.

## What exists (committed)

- Next.js (App Router, TS, Tailwind) scaffold
- Strength engine: `e1rm.ts`, `coefficients.ts` (~38 Lifetime exercises), `recommend.ts` — typechecks, math sanity-checked
- Supabase clients (browser/server) + schema with RLS in `supabase/migrations/0001_init.sql`
- Architecture in `docs/DECISIONS.md`

## What's left for MVP

### Phase 0 — Stand up the backend (blocking, ~1 hr)
- [ ] Create Supabase project; put URL + anon key in `.env.local`
- [ ] Apply `0001_init.sql` (Supabase SQL editor or `supabase db push`)
- [ ] Enable Auth providers: Email magic-link + Google OAuth
- [ ] Generate typed DB types → `src/lib/supabase/types.ts`

### Phase 1 — Auth + shell (~3 hrs)
- [ ] `middleware.ts` to refresh Supabase session on every request
- [ ] `/login` — magic-link form + "Sign in with Google" button
- [ ] `/auth/callback` route handler to exchange the code for a session
- [ ] Protected layout: redirect to `/login` if no user
- [ ] PWA: `manifest.ts`, icons, `theme-color`. Add-to-home-screen works.

### Phase 2 — Logging (the core, ~6 hrs)
This is the part everything depends on. Build it fully before touching recommendations.
- [ ] Exercise picker: search the seeded catalog (`EXERCISES`) + recent-first
- [ ] **Active session screen** — the one screen that matters at the gym:
  - [ ] Start session → creates `workout_session`
  - [ ] Add exercise → list of sets
  - [ ] Log a set: weight / reps / RIR via steppers + numeric keypad (big tap targets)
  - [ ] Optimistic insert (`useOptimistic`) — row appears instantly, write in background
  - [ ] Server Action `logSet` → compute e1rm, insert `set_log`, upsert `user_exercise_stat`
  - [ ] `navigator.wakeLock` so the screen stays on
- [ ] Finish session → summary (total sets, top e1RM per lift)

### Phase 3 — Progression view (~3 hrs)
- [ ] Per-exercise history: sets over time + e1RM line chart (Recharts)
- [ ] Home: last session + "continue/repeat" affordance
- [ ] Visible overload signal: e1RM delta vs last time per exercise

### Phase 4 — Swap + recommend (the differentiator, ~4 hrs)
- [ ] "Swap exercise" on a session slot → exercise picker filtered to same pattern first
- [ ] On selecting any exercise, call `recommend()` client-side with loaded `user_exercise_stat`
- [ ] Show suggested weight + confidence badge (high / low / **calibrate**)
- [ ] Calibration UX: when `confidence === "calibrate"`, label the first set "feel it out"
- [ ] After a calibration set, recompute the machine's personal coefficient

## Explicitly NOT in MVP (resist)
- Program builder / periodization engine (log freeform first; programs are v2)
- Per-gym machine instances (use one generic machine entry per brand for now)
- Social, sharing, export, Apple Health, rest timers, plate calculator
- Offline (we assume connectivity)

## Sequencing notes
- Phases are strictly ordered; Phase 2 is the keystone. If time runs out, ship after Phase 3
  — a clean logger with e1RM tracking is already worth using. Phase 4 is what makes it *mine*.
- ~19 hrs of focused work ≈ 2 weeks at 10 hrs/wk. First milestone to chase: log one real
  workout end-to-end (Phases 0–2).

## Open decisions
- Charts: Recharts (simple, good enough) vs nothing for v0. Lean Recharts.
- Units: lb only for v0 (I lift in lb). kg toggle later.
- Validate before Phase 4: pull my own history and confirm cross-variant e1RM ratios are
  stable enough to recommend off. De-risks the whole recommender for ~1 hr of effort.
