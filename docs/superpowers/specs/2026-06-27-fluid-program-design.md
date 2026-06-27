# Fluid (Adaptive) Program Style — Design

**Date:** 2026-06-27
**Status:** Approved design, pre-implementation

## Summary

A second program *style* — **fluid/adaptive** — that sits alongside the existing classic
(fixed weeks × days, double-progression) style. In a fluid program the cycle never changes;
the **movement** does. Each slot is anchored to a movement pattern and trained indefinitely.
The app watches each movement's e1RM trend and, when it plateaus, recommends a stimulus change
— first a rep-range shift, then a movement swap — with a fresh starting weight. Progression
becomes granular and per-exercise: if a movement is working, stick with it; if it stalls,
change it.

The defining behavioral contract: **double-progression is untouched and still drives
session-to-session targets inside the current rep range.** The fluid layer is purely additive
— it only acts when within-range progression has demonstrably stalled.

## Goals

- Detect per-movement plateaus from logged history, with hysteresis (no false positives on
  one bad session).
- Honor a real-time minimum: at least ~2 weeks of no progress before intervening; some
  movements wait longer.
- On plateau, recommend a concrete next step (new rep range + weight, or a ranked movement
  swap + starting weight) and let the user confirm.
- Reuse the existing strength engine (e1RM, pattern strength, cross-exercise recommendation,
  the swap picker) rather than building parallel logic.

## Non-goals (v1)

- Deload / planned-overreach logic. A deliberate deload reads as "no progress" and is a known
  blind spot, not solved here.
- Auto-applying adaptations. We recommend and wait for confirmation.
- Migrating existing classic programs to fluid. Fluid is a new style; existing programs stay
  classic.
- Movement-timeline visualization (listed as optional phase 2 below).

---

## Decisions (from brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | Container model | Pattern-anchored slots grouped into rotating days (reuse existing program/day/slot model), no fixed week count, runs indefinitely. |
| 2 | Plateau metric | e1RM trend, windowed by **exposures** (sessions where the movement was trained), not calendar weeks. |
| 3 | Intervention policy | **Laddered**: rep-range change first; swap the exercise if still stuck. |
| 4 | Agency | **Recommend, user confirms** (Accept / Keep going / Other options). |
| 5 | Patience window | **Auto from movement type, overridable per slot.** |
| 6 | Composition | Double-progression drives within-range; the fluid layer acts **only** on plateau. |

---

## 1. Architecture

New pure module **`src/lib/strength/plateau.ts`**, framework-free, in the same family as
`progression.ts` / `recommend.ts`, fully vitest-tested. It exposes two pure functions:

- `detectPlateau(...)` → `Plateau | null`
- `nextAdaptation(...)` → a concrete recommendation (rep-range change or swap, with starting
  weight), built on the existing `recommend()` / `startingWeight()`.

`sessionTarget()` (double-progression) is **unchanged** and continues to drive the per-session
weight/rep target inside the current rep range. The fluid layer fires only between phases.

### The "movement phase"

A **phase** is the active period of a `(program_slot_id, exercise_id, rep_range)` triple. A
phase ends when an adaptation is accepted (rep-range change or swap); that starts a new phase.
Plateau is always measured **within the current phase**, so a fresh swap or rep-range change
resets the plateau clock automatically. The current phase boundary is the timestamp of the
most recent accepted adaptation for the slot (or the slot's first logged set if none).

---

## 2. Plateau detector

**Input:** the per-session **best working-set e1RM** series for the current phase — the same
"max e1RM across working sets, grouped by session" computation that `history/[exerciseId]` and
`analytics.ts` already perform. Only sessions within the current phase are considered.

**Progress signal.** A session counts as *progress* if its best e1RM sets a **new
running-best for the phase**, beyond a noise margin:

```
IMPROVEMENT_MARGIN = max(currentBest * 0.01, ABS_FLOOR)   // ~1%, with a small absolute floor
progress(session_i) = bestE1rm_i > runningBest_{i-1} + IMPROVEMENT_MARGIN
```

As long as e1RM keeps nudging up — by reps or by weight — there is no plateau.

**Plateau condition (hysteresis).** Flag a plateau only when **both** hold:

1. **Exposure window:** ≥ `patience` consecutive recent exposures with no new running-best.
   `patience` defaults by movement type (§5) and is per-slot overridable.
2. **Calendar floor:** the span of those stalled exposures is **≥ `MIN_PLATEAU_DAYS` (14)**.
   This makes "at least two weeks minimum" literal, so a high-frequency movement can't flag in
   a few days.

**Anti-thrashing guards:**

- **Eligibility:** a phase needs at least `patience + 1` exposures before it can be flagged at
  all (never flag a brand-new movement).
- **Post-adaptation grace:** a new phase gets a full fresh window before it is eligible again.
- **Dismissal snooze:** a "Keep going" dismissal suppresses re-suggestion for
  `SNOOZE_EXPOSURES` (≈2) more exposures, so the user isn't nagged every session.

**Output:**

```ts
interface Plateau {
  slotId: string;
  exerciseId: string;
  stalledExposures: number;
  stalledSinceDays: number;
  ladderStep: number;        // current phase's ladder rung (drives the next adaptation)
}
```

**Known blind spot:** a deliberate deload reads as non-improving and could trip a false
plateau. Out of scope for v1; noted.

---

## 3. Adaptation ladder

Each phase carries a **ladder step**. On plateau, the engine recommends the next rung:

- **Step 0 → rep-range change.** Keep the exercise; shift to a contrasting rep band. Bands are
  a fixed ladder:

  ```
  heavy    5–8
  moderate 8–12
  light    12–15
  ```

  The engine picks the band **furthest from the current and most-recently-used** band (max
  novelty): moderate→heavy, heavy→light, light→heavy. The new starting weight comes from the
  existing recommender (`startingWeight()` at the new `rep_min`), which already inverts
  e1RM/pattern-strength to any rep target — no new weight math.

- **Step 1 → swap exercise.** Still plateaued in the new band → escalate to a movement swap
  (§4). The swapped exercise resets to the slot's **home band** (its originally built range)
  and the ladder resets to step 0, so the new movement gets a full fresh run.

One rep-range rung before swapping. The band ladder and the "rungs before swap" count are
constants in `plateau.ts`, easy to tune later.

---

## 4. Swap candidate selection

Reuses the cross-exercise recommender, surfaced through the existing `ExercisePicker`
(`program/exercise-picker.tsx`) filtered to the slot's pattern, but **ranked and annotated**:

- **Pool:** all exercises in the slot's pattern from the merged catalog, minus the current
  exercise.
- **Rank by novelty:** prefer movements not trained recently and not themselves recently
  plateaued; de-prioritize anything swapped *away from* in the last several weeks
  (anti-ping-pong, read from `movement_adaptation` history).
- **Annotate** each candidate with a starting weight from `recommend()` (pattern-strength ×
  coefficient → weight; machine templates return `calibrate`, exactly as today).
- Present top ~3; **Accept** takes the top, **Other options** opens the full ranked picker.
  Machine templates still flow through the existing brand/type instantiation step
  (`resolveVariant`).

Swap is therefore not a new screen — it is the existing picker, pre-ranked with a recommended
pick and live starting weights.

---

## 5. Data model

`set_log` remains the source of truth for *performance*. Adaptation **intent** (what the
engine told you to do, the ladder step, dismissals) is independent data — not a cache of
`set_log` — so it earns its own table without violating the "caches must be rebuildable" rule.

### New table: `movement_adaptation` (append-only intent log)

```sql
create table movement_adaptation (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id),
  program_slot_id  uuid not null references program_slot(id) on delete cascade,
  exercise_id      text not null,                 -- the exercise this event acted on
  action           text not null,                 -- 'rep_change' | 'swap' | 'dismiss'
  new_exercise_id  text,                          -- swap only
  new_rep_min      smallint,                      -- rep_change only
  new_rep_max      smallint,                      -- rep_change only
  ladder_step      smallint not null default 0,
  created_at       timestamptz not null default now()
);
-- RLS keyed on auth.uid(); user_id on every row (project convention).
```

- **Current prescription for a fluid slot** = the slot's base (`program_slot`) folded with its
  accepted `rep_change` / `swap` rows in chronological order. For fluid slots this *replaces*
  today's "most-recently-logged exercise" derivation and stays consistent with progression's
  `(program_slot_id, exercise_id)` keying.
- **Pending suggestions are computed, not stored.** The plateau engine recomputes them each
  time the session loads; only the user's *response* persists — Accept writes a
  `rep_change`/`swap` row; "Keep going" writes a `dismiss` row that snoozes. No
  suggestion-status state machine.

**Alternative considered:** a single mutable `slot_state` row (current exercise/range/step).
Simpler reads, but a second mutable source of truth that can drift, and it loses the phase
history that powers the optional timeline. Rejected in favor of the append-only log.

### Schema additions

```sql
alter table program add column style text not null default 'classic';   -- 'classic' | 'fluid'
alter table program_slot add column plateau_patience smallint;           -- null = auto by type
```

### Patience defaults (movement type → exposures)

```
barbell compound (squat/bench/deadlift/press patterns)  -> 4
dumbbell / cable                                         -> 3
machine / isolation                                      -> 3
```

`plateau_patience` (per slot) overrides the default when set. A floor keeps any value
consistent with the 14-day calendar minimum.

---

## 6. UX

- **Builder (`program-builder.tsx`):** a Classic / Adaptive **style toggle**. Adaptive
  de-emphasizes the week count (runs indefinitely) and exposes a per-slot **Patience** control
  (Low / Normal / High → the `plateau_patience` override). Rep range is still set as the
  *starting* band. `saveProgram` persists `style` and per-slot `plateau_patience`.
- **Home (`page.tsx`):** for fluid programs, the block-progress bar (which assumes a fixed
  total) is replaced with a lighter "Session N · {n} movements adapting" line. Start/Resume
  logic is unchanged.
- **Active session (`active-session.tsx`):** a slot with a pending plateau suggestion renders
  a recommendation card above set-entry:

  ```
  [ Plateau detected ]
  DB Bench · no new e1RM high in 3 sessions
  Suggested: drop to 5–8 @ 95 lb
   [ Accept ]   [ Keep going ]   [ Other options ]
  ```

  **Accept** writes the adaptation row and the slot immediately re-targets via the existing
  recommender. **Keep going** writes a `dismiss` (snooze). **Other options** opens the ranked
  picker (`Sheet`). Reuses `Card tone` + `Sheet`; no new overlay primitive.
- **Movement timeline (optional, phase 2):** a per-slot phase history on the history screen
  (`DB Bench 8–12 → 5–8 → Machine Press 8–12`). Cut from v1 if it adds scope.

---

## 7. Testing

All detection / ladder / band / ranking logic is pure → vitest, co-located as
`src/lib/strength/plateau.test.ts`. Cases:

- Hysteresis entry: flags at exactly `patience` stalled exposures, not before.
- 14-day calendar floor: a high-frequency stall under 14 days does not flag.
- No-flag for a brand-new movement (below eligibility).
- Post-adaptation grace: a fresh phase is not immediately re-flagged.
- Dismissal snooze: "Keep going" suppresses re-suggestion for `SNOOZE_EXPOSURES`.
- Band selection: picks the most novel band; correct moderate→heavy→light→heavy rotation.
- Ladder escalation: rep_change at step 0, swap at step 1, reset to step 0 + home band after
  swap.
- Swap ranking: novelty ordering and anti-ping-pong exclusion.
- Progress margin: a within-noise e1RM bump does not count as progress.

Engine logic stays out of React, consistent with the existing strength-engine test discipline
(`vitest.config.ts`, `src/lib/**/*.test.ts`).

---

## 8. Constants (initial values, all in `plateau.ts`)

```
PATIENCE_DEFAULTS   = { barbellCompound: 4, default: 3 }
MIN_PLATEAU_DAYS    = 14
IMPROVEMENT_MARGIN  = max(currentBest * 0.01, ABS_FLOOR)
SNOOZE_EXPOSURES    = 2
REP_BANDS           = [ {min:5,max:8}, {min:8,max:12}, {min:12,max:15} ]
RUNGS_BEFORE_SWAP   = 1
```

---

## 9. Build sequence (for the implementation plan)

1. Migration `0009`: `program.style`, `program_slot.plateau_patience`, `movement_adaptation`
   table + RLS; hand-edit `types.ts`.
2. `plateau.ts` + `plateau.test.ts` (TDD): progress signal, `detectPlateau`, band selection,
   `nextAdaptation`, swap ranking.
3. Current-prescription folding helper (base slot + accepted adaptations) and its plumbing
   into the session loader.
4. Active-session recommendation card (Accept / Keep going / Other options) + the accept/
   dismiss server actions writing `movement_adaptation`.
5. Builder style toggle + per-slot patience; `saveProgram` persistence.
6. Home fluid-program header variant.
7. (Optional) movement timeline on the history screen.
```
