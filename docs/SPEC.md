# MVP Spec

Detailed spec derived from `PLAN.md` via interview, then reshaped around a program builder.
Where this conflicts with `PLAN.md`, this wins. `PLAN.md` stays as the original effort view;
`docs/DECISIONS.md` holds architecture rationale. This is the behavior contract.

## North star

Done = I run a real training block in the app: build one week of a 3–5 day program, set it
to repeat 4–6 weeks, then have the app walk me through each session — log working sets with
RIR, see a recommended weight per slot, swap a movement if a machine is taken, and see my
e1RM trend and whether I beat last time. Built for me first; public-readiness is a later pass.

## Scope shift from PLAN.md

`PLAN.md` deprioritized the program builder to v2 and built the MVP around freeform ad-hoc
logging. That was wrong for how I train. The MVP now centers on a **thin program builder**:
sessions are instantiated from a program, not added ad hoc. The keystone is still the
active-session screen, now driven by program slots. Honest cost: ~32–38h (~3–4 weeks at
10h/wk), up from the original ~19h.

The builder stays thin by leaning on the existing engine. The program prescribes the
*structure* — sets × rep-range × RIR per slot — which is fixed across the block. Week-over-week
overload is driven by **double progression** (reps-then-weight): the per-session weight/rep
target advances from your last logged performance. The e1RM recommender is reused for the jobs
it's good at — the *starting* weight on a slot's first session, and re-deriving weight on a
swap or cross-exercise transfer. No periodization engine, no auto-deload.

## Settled decisions (from interview)

| Topic | Choice |
|-------|--------|
| Session source | Instantiated from the active program (next day in sequence). |
| Progression | **Double progression** (reps-then-weight). Structure (sets × rep-range × RIR) fixed across the block; per-session weight/rep target advances from last logged performance. |
| Bump trigger | **First working set reaches `rep_max`** → next session add weight, reset reps target to `rep_min`. Otherwise hold weight, target +1 rep toward `rep_max`. |
| Jump size | **Per-exercise `increment`** (barbell 5 lb, dumbbell per its step, etc.) — already in the engine. |
| Slot binding | Concrete exercise, **pattern-tagged** so swap re-derives weight. |
| Day scheduling | Ordered sequence (named days), **no calendar binding**. |
| End of block | Block stops; user clones/edits to start a new one. No auto-deload/progression. |
| Rep prescription | **Rep range** per slot (e.g. 8–12 @ 2 RIR). |
| Recommend trigger | **Always-on** — shown on every slot card. |
| Starting weight | e1RM recommender targeting **`rep_min`** at the slot's RIR — used only on a slot's first session, a swap, or cross-exercise transfer; double progression takes over after. |
| Validation data | **Starting cold.** No history import; recommender runs on priors, self-corrects. |
| Audience | **Just me first.** Skip onboarding/empty-state polish. |
| Warmups | **Working sets only.** Warmups simply aren't logged. |
| Bodyweight/assisted | **Included.** Log added load (negative = assisted); e1RM uses bodyweight + added. |
| Overload signal | Best working-set e1RM this session vs best the previous session of that exact exercise. |

## Defaulted mechanics (low-stakes; veto if wrong)

- **Units:** lb only. No kg toggle.
- **Weight input:** numeric entry + 5 lb stepper; manual entry for microplates / odd dumbbells.
- **Reps input:** 1–30, stepper.
- **RIR input:** 0–5 integer (RPE = 10 − RIR, matching `e1rm.ts`).
- **Recommended weight rounding:** barbell → nearest 5 lb; dumbbell → nearest 5 lb; machine
  → no rounding (see Calibration).
- **Edit/delete a logged set:** inline; recomputes e1RM and the affected `user_exercise_stat`.
- **Multiple programs:** allowed (saved), but exactly one `is_active` at a time.
- **Charts:** Recharts.

## Data model

Additions to `supabase/migrations/0001_init.sql`. Existing `program` and `workout_session`
(already carry `program_id`, `week_index`) stay. New migration adds:

- **`program`** gains `weeks` (int) and `is_active` (boolean; one active block per user).
- **`program_day`** — `(id, program_id, user_id, position, name)`. Ordered days.
- **`program_slot`** — `(id, program_day_id, user_id, position, exercise_id, pattern,
  target_sets, rep_min, rep_max, target_rir)`. Exercise is concrete but pattern-tagged.
- **`workout_session`** gains `program_day_id` (which day this session instantiates).
- **`set_log`** gains nullable `program_slot_id`, so a set ties back to its slot even after a
  swap. The set's own `exercise_id` records what was actually performed.
- **`profile`** gains `bodyweight` (numeric), for bodyweight/assisted e1RM.
- All new tables follow the RLS pattern: every row carries `user_id`; policy keyed on
  `auth.uid()`.

**Block position is derived**, not stored: completed sessions ÷ days-per-week = current week;
remainder = next day in sequence. Nothing to keep in sync. `week_index` is stamped on each
session at creation for history.

### Engine / data invariants (unchanged)

- **`set_log` is the source of truth.** `user_exercise_stat` (current e1RM + personal
  coefficient) is a rebuildable cache — never let it drift. Every insert/edit/delete of a
  logged set recomputes the affected stat.
- e1RM via `e1rm.ts` (RPE/RIR model, RPE = 10 − RIR). No bare Epley/Brzycki.
- Pattern strength: one latent per user per movement pattern, pooled across logged variants,
  Bayesian shrinkage toward population coefficients (`PRIOR_WEIGHT`) in `recommend.ts`.
- `exercise_id` is a text slug matching `coefficients.ts`; seeded catalog lives in app code.
- Logging conventions from `coefficients.ts`: barbell/machine = total load, dumbbell = one
  dumbbell's weight. Bodyweight/assisted = added load (negative = assisted); e1RM input is
  `bodyweight + added`.

## Progression (double progression)

A pure module `src/lib/strength/progression.ts` computes each slot's **session target**
(weight + reps to aim for). It keys on `(program_slot_id, exercise_id)` so a swap doesn't
corrupt the chain. Algorithm for a slot when starting a session:

1. **No prior performance of this exercise in this slot** (first session, or just swapped to a
   new exercise) → `weight = recommend(exercise, rep_min, target_rir).suggestedWeight`,
   `targetReps = rep_min`. This is the e1RM handoff; it carries the recommender's confidence.
2. **Has prior performance** → look at the most recent session's **first working set** for this
   slot+exercise:
   - `firstSetReps >= rep_max` → `weight = lastWeight + exercise.increment`, `targetReps = rep_min`.
   - else → `weight = lastWeight`, `targetReps = min(rep_max, firstSetReps + 1)`.

Notes: the trigger is **reps only** (RIR is the effort guide for the set and feeds e1RM, but is
not part of the bump test). A stall just holds weight at the same rep target — no auto-deload
(out of scope). The card shows the target plus context, e.g. "Target: 50 × 5 · last: 45 × 8".

## Recommendation, swap, calibration

- **Starting/swap weight is recommender-driven; in-block targets are progression-driven.** A
  slot's first session (or a fresh swap) shows the e1RM recommendation + confidence badge;
  every session after shows the double-progression target derived from your last set. Both
  recompute live client-side off hydrated `user_exercise_stat` (no server round-trip).
- **Confidence states** (driven by engine `confidence`): `high`/`medium` show the weight
  plainly; `low` frames it as a prior-driven starting estimate ("log a set to dial this in");
  `calibrate` shows the conservative number and labels the first set **"feel it out."**
- **Swap** (at the gym): tap a slot → exercise picker **filtered to the same pattern first** →
  `recommend()` re-derives the weight → sets log against the swapped `exercise_id` plus the
  original `program_slot_id`.
- **Machine calibration:** first set on a `needsCalibration` machine is `calibrate`
  (conservative). After it's logged, recompute and persist that machine's personal coefficient
  in `user_exercise_stat`; subsequent recommendations graduate out of `calibrate`. Machines
  never predict absolute load from free weights.

## Screens & flows

### `/login`
Magic-link email form → `/` on success.

### `/` Home
- Active-block status line: "Week 2 of 5 · next: Pull".
- Big **Start next workout** CTA (instantiates the next day's session).
- Resume affordance if a session is in progress.
- Last finished session summary (date, total working sets, top e1RM per lift).

### `/program` — builder
- Create/edit a program: name, weeks (4–6), `is_active`.
- Add/reorder **days** (named).
- Within a day, add/reorder **slots**: exercise picker + target sets + rep range (min/max) +
  target RIR.
- Clone an existing program to start a new block.

### Active session — the keystone
One session = one `workout_session` tied to a `program_day`.
1. **Start** → app determines next (week, day) → inserts `workout_session`; acquires
   `navigator.wakeLock`. Renders the day's slots as exercise cards.
2. Each **slot card** shows the prescription (sets × rep-range @ RIR) + the session target from
   `progression.ts` ("Target: 50 × 5 · last: 45 × 8"); on a slot's first session or a swap the
   target is the e1RM recommendation with its confidence badge. Plus an empty/working set list.
3. **Log a working set**: weight / reps / RIR via big-tap steppers + numeric keypad.
   - **Optimistic insert** (`useOptimistic`) — row renders instantly.
   - Background Server Action `logSet` computes e1RM, inserts `set_log` (with
     `program_slot_id`), upserts `user_exercise_stat`. On failure the row reverts inline.
4. **Swap** a slot → same-pattern picker → recommendation re-derives (above).
5. **Edit/delete** any set inline (triggers recompute).
6. **Finish** → summary (total working sets, top e1RM per lift, overload delta vs previous
   session per exercise). Release wakeLock.

### Exercise history (Progression)
Per-exercise: sets over time + e1RM line chart (Recharts) + overload delta vs previous session.

### Settings (minimal)
Edit `bodyweight`. Nothing else in MVP.

## Server Actions (behavior, not signatures)

- `startNextSession()` → derive next (week, day) from completed sessions, create
  `workout_session`, return it with its day's slots.
- `logSet({ sessionId, programSlotId, exerciseId, weight, reps, rir })` → compute e1RM, insert
  `set_log`, upsert `user_exercise_stat`; return the persisted row.
- `editSet` / `deleteSet` → mutate `set_log`, recompute affected `user_exercise_stat`.
- `finishSession(sessionId)` → mark finished, return summary (totals, top e1RM/lift, deltas).
- Program CRUD: `saveProgram`, `cloneProgram`, `setActiveProgram`.
- Reads (history, stat hydration for the recommender) via Server Components / cached fetches;
  recommender math runs client-side off hydrated `user_exercise_stat`.

## Build sequence

- **P0 — Backend.** Supabase project; apply `0001_init.sql` + a new migration for
  program/day/slot tables, `set_log.program_slot_id`, `profile.bodyweight`, RLS. Typed DB types.
- **P1 — Auth + shell + PWA.** `middleware.ts` session refresh, `/login`, `/auth/callback`,
  protected layout, `manifest.ts`/icons/`theme-color`.
- **P2 — Keystone: active-session screen** against a **hardcoded seed program** first. logSet,
  e1RM compute, `progression.ts` (per-session double-progression target, with the e1RM handoff
  for first-time/no-history slots), optimistic insert, wakeLock, edit/delete, finish summary.
  Bodyweight e1RM convention lands here. (Building against a hardcoded program de-risks logging
  before the builder exists.)
- **P3 — Program builder UI** → replaces the hardcoded program; home block-status; clone.
- **P4 — Progression view** (e1RM charts + overload deltas).
- **P5 — Recommendation layer**: confidence-badge states on starting/swap weights, same-pattern
  swap (re-derive via `recommend()`, resume double progression after), machine calibration
  recompute. (Double-progression targets themselves already work from P2.)

## Out of scope (resist)

Periodization/auto-progression, auto-deload, calendar-bound scheduling, multiple concurrent
active programs, per-gym machine instances UI (`equipment_instance` table exists but unused),
social/sharing/export, Apple Health, rest timers, plate calculator, offline/local-first, kg,
warmup tracking, user-custom exercises beyond what's trivially free, onboarding/empty-state
polish.

## Open items (decide later)

- Exact `confidence` thresholds (logged-variants/sets count that flips `low` → `high`).
- Whether the finished-session summary needs more than totals + top e1RM + deltas.
- After a few weeks of real logging: sanity-check observed cross-variant e1RM ratios against
  the coefficient priors; adjust priors then (substitute for the dropped history-import
  validation).
- kg toggle, custom exercises, deload/auto-progression — all post-MVP.
