# Fluid (Adaptive) Program Style — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second program *style* — fluid/adaptive — where the cycle never changes but the engine detects per-movement e1RM plateaus (with hysteresis) and recommends a rep-range change, then an exercise swap, with a fresh starting weight.

**Architecture:** A new framework-free module `src/lib/strength/plateau.ts` (pure, vitest-tested) owns plateau detection, the rep-band ladder, swap ranking, and prescription folding. A thin server loader `src/lib/fluid.ts` composes those pure functions with Supabase data and the existing `startingWeight()`/`recommend()`. The session page computes a `pendingSuggestion` per slot server-side; the existing `SlotCard` renders an Accept / Keep going / Other options card. Double-progression (`progression.ts`) is untouched — the fluid layer is purely additive and fires only on plateau. Adaptation *intent* persists in a new append-only `movement_adaptation` table; the current prescription is `base slot ⊕ accepted adaptations`.

**Tech Stack:** Next.js 16 (App Router, Server Actions, React 19), Supabase (Postgres + RLS), TypeScript, vitest.

## Global Constraints

- Tests run on **vitest**, scoped to `src/lib/**/*.test.ts` (node env, `@/` alias). Co-locate new tests next to the module. Pure modules only — no React/Next imports in tested code.
- **Next.js 16:** middleware lives in `src/proxy.ts`; auth via `getClaims()` (see `AGENTS.md`). Check `node_modules/next/dist/docs/` before writing framework code.
- **Supabase:** project id `jtcppebmosaffaajtgow`. Apply migrations via the Supabase MCP `apply_migration`, then **hand-edit** `src/lib/supabase/types.ts` (types are not auto-generated in this repo).
- **RLS on every table**, keyed on `auth.uid()`; every row carries `user_id`. New tables must follow this.
- `set_log` is the source of truth for *performance*; derived caches must be rebuildable. `movement_adaptation` stores *intent* (not a cache of `set_log`), so it is its own source of truth.
- Logging conventions in `coefficients.ts` are fixed: barbell/machine = total load, dumbbell = one dumbbell, bodyweight = added load. Don't change them.
- Constants live in `plateau.ts`: `PATIENCE_BARBELL=4`, `PATIENCE_DEFAULT=3`, `MIN_PLATEAU_DAYS=14`, `SNOOZE_EXPOSURES=2`, `RUNGS_BEFORE_SWAP=1`, `REP_BANDS=[{repMin:5,repMax:8},{repMin:8,repMax:12},{repMin:12,repMax:15}]`.
- Style values: `program.style` is `'classic' | 'fluid'`, default `'classic'`. Existing programs stay classic.

---

## Task 1: Migration 0009 — schema for fluid programs

**Files:**
- Create: `supabase/migrations/0009_fluid_programs.sql`
- Modify: `src/lib/supabase/types.ts` (add `movement_adaptation` table; add columns to `program`, `program_slot`)

**Interfaces:**
- Produces: table `movement_adaptation`, columns `program.style`, `program_slot.plateau_patience`. Later tasks read/write these.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0009_fluid_programs.sql`:

```sql
-- Fluid (adaptive) program style: per-movement plateau detection drives rep-range
-- changes then exercise swaps. movement_adaptation is an append-only INTENT log (what the
-- engine recommended and the user accepted/dismissed) — not a cache of set_log.

alter table program add column style text not null default 'classic';        -- 'classic' | 'fluid'
alter table program_slot add column plateau_patience smallint;               -- null = auto by movement type

create table movement_adaptation (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  program_slot_id  uuid not null references program_slot(id) on delete cascade,
  exercise_id      text not null,                  -- the exercise this event acted on
  action           text not null,                  -- 'rep_change' | 'swap' | 'dismiss'
  new_exercise_id  text,                           -- swap only
  new_rep_min      smallint,                       -- rep_change only
  new_rep_max      smallint,                       -- rep_change only
  ladder_step      smallint not null default 0,    -- the resulting ladder step this event produced
  created_at       timestamptz not null default now()
);

create index movement_adaptation_slot_idx
  on movement_adaptation (user_id, program_slot_id, created_at);

alter table movement_adaptation enable row level security;

create policy "own movement_adaptation" on movement_adaptation
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on column program.style is 'classic | fluid';
comment on column program_slot.plateau_patience is 'stalled-exposure window before plateau; null = auto by movement type';
comment on column movement_adaptation.action is 'rep_change | swap | dismiss';
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase MCP `apply_migration` with name `0009_fluid_programs` and the SQL above. Confirm with `list_migrations` that `0009_fluid_programs` is listed.

- [ ] **Step 3: Hand-edit `src/lib/supabase/types.ts`**

In the `Tables` object add a `movement_adaptation` entry, and add the new columns to `program` and `program_slot` (`Row`, `Insert`, `Update`). Match the existing style in the file:

```ts
movement_adaptation: {
  Row: {
    id: string;
    user_id: string;
    program_slot_id: string;
    exercise_id: string;
    action: string;
    new_exercise_id: string | null;
    new_rep_min: number | null;
    new_rep_max: number | null;
    ladder_step: number;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    program_slot_id: string;
    exercise_id: string;
    action: string;
    new_exercise_id?: string | null;
    new_rep_min?: number | null;
    new_rep_max?: number | null;
    ladder_step?: number;
    created_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    program_slot_id?: string;
    exercise_id?: string;
    action?: string;
    new_exercise_id?: string | null;
    new_rep_min?: number | null;
    new_rep_max?: number | null;
    ladder_step?: number;
    created_at?: string;
  };
  Relationships: [];
};
```

In the `program` table's `Row`/`Insert`/`Update` add `style: string` (`style?: string` for Insert/Update). In `program_slot`'s `Row`/`Insert`/`Update` add `plateau_patience: number | null` (`plateau_patience?: number | null` for Insert/Update).

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: passes (no errors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_fluid_programs.sql src/lib/supabase/types.ts
git commit -m "feat: migration 0009 — fluid program style + movement_adaptation"
```

---

## Task 2: Plateau detector — `detectPlateau`

**Files:**
- Create: `src/lib/strength/plateau.ts`
- Test: `src/lib/strength/plateau.test.ts`

**Interfaces:**
- Consumes: `ExerciseDef` from `./coefficients`.
- Produces: constants (see Global Constraints); `defaultPatience(def: ExerciseDef): number`; `interface PhaseExposure { sessionAt: string; bestE1rm: number }`; `interface PlateauResult { plateaued: boolean; stalledExposures: number; stalledSinceDays: number }`; `detectPlateau(exposures: PhaseExposure[], patience: number, now: Date, margin?: (best: number) => number): PlateauResult`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/strength/plateau.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectPlateau, defaultPatience, type PhaseExposure } from "./plateau";
import type { ExerciseDef } from "./coefficients";

const day = (n: number) => new Date(2026, 0, 1 + n).toISOString();
// builds exposures one week apart so the 14-day floor is satisfied by 3+ exposures
const week = (n: number) => new Date(2026, 0, 1 + n * 7).toISOString();

function series(e1rms: number[], at = week): PhaseExposure[] {
  return e1rms.map((bestE1rm, i) => ({ sessionAt: at(i), bestE1rm }));
}

const bb: ExerciseDef = { id: "bb-bench", name: "Bench", pattern: "horizontal_press", equipment: "barbell", coefficient: 1, increment: 5 };
const db: ExerciseDef = { id: "db-bench", name: "DB Bench", pattern: "horizontal_press", equipment: "dumbbell", coefficient: 0.42, increment: 5 };

describe("defaultPatience", () => {
  it("gives barbell compounds a longer window", () => {
    expect(defaultPatience(bb)).toBe(4);
    expect(defaultPatience(db)).toBe(3);
  });
});

describe("detectPlateau", () => {
  const now = new Date(2026, 6, 1); // well after all sessions

  it("does not flag a still-progressing movement", () => {
    const r = detectPlateau(series([150, 153, 156, 159, 162]), 3, now);
    expect(r.plateaued).toBe(false);
  });

  it("flags after `patience` stalled exposures past the last new best", () => {
    // new best at index 1 (155), then 3 stalled exposures
    const r = detectPlateau(series([150, 155, 154, 155, 153]), 3, now);
    expect(r.plateaued).toBe(true);
    expect(r.stalledExposures).toBe(3);
  });

  it("does not flag at patience-1 stalled exposures (hysteresis)", () => {
    const r = detectPlateau(series([150, 155, 154, 155]), 3, now);
    expect(r.plateaued).toBe(false);
    expect(r.stalledExposures).toBe(2);
  });

  it("ignores within-noise bumps (1% margin)", () => {
    // 200 -> 201 is < 1% over 200, so not progress
    const r = detectPlateau(series([200, 201, 200, 201]), 3, now);
    expect(r.plateaued).toBe(true);
  });

  it("honors the 14-day calendar floor even with enough stalled exposures", () => {
    // four exposures on consecutive days -> stalled count high but span < 14 days
    const r = detectPlateau(series([150, 155, 154, 153, 154], day), 3, now);
    expect(r.stalledExposures).toBeGreaterThanOrEqual(3);
    expect(r.plateaued).toBe(false);
  });

  it("never flags a brand-new movement (too few exposures)", () => {
    const r = detectPlateau(series([150, 150]), 3, now);
    expect(r.plateaued).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- plateau`
Expected: FAIL — cannot resolve `./plateau`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/strength/plateau.ts`:

```ts
// Fluid/adaptive plateau engine. Pure, framework-free (vitest-tested like the rest of the
// strength engine). Watches a movement's per-session e1RM trend within the current "phase"
// (a (slot, exercise, rep-range) period) and reports a plateau once progress has stalled,
// with hysteresis: at least `patience` stalled exposures AND at least MIN_PLATEAU_DAYS of
// real time. Double-progression (progression.ts) is untouched; this only fires on plateau.

import type { ExerciseDef } from "./coefficients";

export const PATIENCE_BARBELL = 4;
export const PATIENCE_DEFAULT = 3;
export const MIN_PLATEAU_DAYS = 14;
export const SNOOZE_EXPOSURES = 2;
export const RUNGS_BEFORE_SWAP = 1;

export interface RepBand {
  repMin: number;
  repMax: number;
}

export const REP_BANDS: RepBand[] = [
  { repMin: 5, repMax: 8 }, // heavy
  { repMin: 8, repMax: 12 }, // moderate
  { repMin: 12, repMax: 15 }, // light
];

// Heavy barbell compounds progress slowly and noisily, so they wait longer before we call a
// plateau. In this catalog barbell == compound, so equipment is a sufficient proxy.
export function defaultPatience(def: ExerciseDef): number {
  return def.equipment === "barbell" ? PATIENCE_BARBELL : PATIENCE_DEFAULT;
}

export interface PhaseExposure {
  sessionAt: string; // ISO timestamp of the session
  bestE1rm: number; // best working-set e1RM that session
}

export interface PlateauResult {
  plateaued: boolean;
  stalledExposures: number; // exposures since the last new running-best
  stalledSinceDays: number; // real days since the last new running-best
}

const DAY_MS = 24 * 60 * 60 * 1000;
const defaultMargin = (best: number) => Math.max(best * 0.01, 1);

// exposures: chronological (oldest first), one per session, within the current phase.
export function detectPlateau(
  exposures: PhaseExposure[],
  patience: number,
  now: Date,
  margin: (best: number) => number = defaultMargin,
): PlateauResult {
  if (exposures.length === 0) {
    return { plateaued: false, stalledExposures: 0, stalledSinceDays: 0 };
  }

  let runningBest = exposures[0].bestE1rm;
  let lastProgressIndex = 0;
  for (let i = 1; i < exposures.length; i++) {
    if (exposures[i].bestE1rm > runningBest + margin(runningBest)) {
      runningBest = exposures[i].bestE1rm;
      lastProgressIndex = i;
    }
  }

  const stalledExposures = exposures.length - 1 - lastProgressIndex;
  const stalledSinceDays = Math.floor(
    (now.getTime() - new Date(exposures[lastProgressIndex].sessionAt).getTime()) / DAY_MS,
  );

  const plateaued = stalledExposures >= patience && stalledSinceDays >= MIN_PLATEAU_DAYS;
  return { plateaued, stalledExposures, stalledSinceDays };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- plateau`
Expected: PASS (all cases in `plateau.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/strength/plateau.ts src/lib/strength/plateau.test.ts
git commit -m "feat: plateau detector with exposure + calendar hysteresis"
```

---

## Task 3: Rep-band ladder — `bandOf`, `pickRepBand`, `nextLadderAction`

**Files:**
- Modify: `src/lib/strength/plateau.ts`
- Test: `src/lib/strength/plateau.test.ts`

**Interfaces:**
- Consumes: `REP_BANDS`, `RepBand`, `RUNGS_BEFORE_SWAP` from Task 2.
- Produces: `type AdaptationAction = "rep_change" | "swap"`; `bandOf(repMin: number, repMax: number): RepBand`; `pickRepBand(current: RepBand, recent: RepBand[]): RepBand`; `nextLadderAction(ladderStep: number): AdaptationAction`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/strength/plateau.test.ts`:

```ts
import { bandOf, pickRepBand, nextLadderAction } from "./plateau";

describe("bandOf", () => {
  it("maps an exact range to its band", () => {
    expect(bandOf(8, 12)).toEqual({ repMin: 8, repMax: 12 });
  });
  it("maps an off-grid range to the nearest band by midpoint", () => {
    expect(bandOf(6, 10)).toEqual({ repMin: 5, repMax: 8 }); // mid 8 -> heavy(6.5) vs moderate(10): closer to heavy
  });
});

describe("pickRepBand", () => {
  it("moves moderate -> heavy", () => {
    expect(pickRepBand({ repMin: 8, repMax: 12 }, [])).toEqual({ repMin: 5, repMax: 8 });
  });
  it("moves heavy -> light", () => {
    expect(pickRepBand({ repMin: 5, repMax: 8 }, [])).toEqual({ repMin: 12, repMax: 15 });
  });
  it("moves light -> heavy", () => {
    expect(pickRepBand({ repMin: 12, repMax: 15 }, [])).toEqual({ repMin: 5, repMax: 8 });
  });
  it("avoids a recently used band", () => {
    // from heavy, furthest is light; but if light was just used, fall back to moderate
    expect(pickRepBand({ repMin: 5, repMax: 8 }, [{ repMin: 12, repMax: 15 }])).toEqual({
      repMin: 8,
      repMax: 12,
    });
  });
});

describe("nextLadderAction", () => {
  it("recommends a rep change at step 0, a swap once rungs are exhausted", () => {
    expect(nextLadderAction(0)).toBe("rep_change");
    expect(nextLadderAction(1)).toBe("swap");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- plateau`
Expected: FAIL — `bandOf`/`pickRepBand`/`nextLadderAction` not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/strength/plateau.ts`:

```ts
export type AdaptationAction = "rep_change" | "swap";

const mid = (b: RepBand) => (b.repMin + b.repMax) / 2;
const sameBand = (a: RepBand, b: RepBand) => a.repMin === b.repMin && a.repMax === b.repMax;

// Nearest standard band to an arbitrary built range, by midpoint.
export function bandOf(repMin: number, repMax: number): RepBand {
  const m = (repMin + repMax) / 2;
  return REP_BANDS.reduce((best, b) =>
    Math.abs(mid(b) - m) < Math.abs(mid(best) - m) ? b : best,
  );
}

// The most novel band relative to the current one: furthest by index, tie-broken toward the
// heavier band (lower repMin). Skips any band in `recent` (recently used in this phase chain)
// unless that leaves nothing.
export function pickRepBand(current: RepBand, recent: RepBand[]): RepBand {
  const curBand = bandOf(current.repMin, current.repMax);
  const curIdx = REP_BANDS.findIndex((b) => sameBand(b, curBand));

  const ranked = REP_BANDS.map((b, i) => ({ b, i }))
    .filter(({ b }) => !sameBand(b, curBand))
    .sort((x, y) => {
      const dist = Math.abs(y.i - curIdx) - Math.abs(x.i - curIdx); // furthest first
      if (dist !== 0) return dist;
      return x.b.repMin - y.b.repMin; // tie -> heavier (lower repMin) first
    });

  const fresh = ranked.find(({ b }) => !recent.some((r) => sameBand(r, b)));
  return (fresh ?? ranked[0]).b;
}

export function nextLadderAction(ladderStep: number): AdaptationAction {
  return ladderStep < RUNGS_BEFORE_SWAP ? "rep_change" : "swap";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- plateau`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/strength/plateau.ts src/lib/strength/plateau.test.ts
git commit -m "feat: rep-band ladder (band selection + rung-to-action)"
```

---

## Task 4: Swap ranking — `rankSwapCandidates`

**Files:**
- Modify: `src/lib/strength/plateau.ts`
- Test: `src/lib/strength/plateau.test.ts`

**Interfaces:**
- Produces: `interface SwapCandidateInput { exerciseId: string; name: string; recentlyPlateaued: boolean; recencyRank: number }`; `rankSwapCandidates(cands: SwapCandidateInput[]): SwapCandidateInput[]`. `recencyRank`: 0 = trained most recently; larger = staler/more novel; use `Number.MAX_SAFE_INTEGER` for never-trained.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/strength/plateau.test.ts`:

```ts
import { rankSwapCandidates, type SwapCandidateInput } from "./plateau";

describe("rankSwapCandidates", () => {
  const c = (exerciseId: string, recentlyPlateaued: boolean, recencyRank: number): SwapCandidateInput => ({
    exerciseId,
    name: exerciseId,
    recentlyPlateaued,
    recencyRank,
  });

  it("puts fresh (not recently plateaued) movements first", () => {
    const ranked = rankSwapCandidates([c("a", true, 5), c("b", false, 1)]);
    expect(ranked.map((x) => x.exerciseId)).toEqual(["b", "a"]);
  });

  it("among fresh movements, prefers the most novel (staler/never trained)", () => {
    const ranked = rankSwapCandidates([c("recent", false, 0), c("stale", false, 99)]);
    expect(ranked[0].exerciseId).toBe("stale");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- plateau`
Expected: FAIL — `rankSwapCandidates` not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/strength/plateau.ts`:

```ts
export interface SwapCandidateInput {
  exerciseId: string;
  name: string;
  recentlyPlateaued: boolean; // plateaued on / swapped away from recently — avoid ping-pong
  recencyRank: number; // 0 = trained most recently; larger = staler/more novel
}

// Novel-first: movements not recently plateaued beat ones that were; among equals, the staler
// (less recently trained) movement ranks higher. The current exercise must be excluded by the
// caller before ranking.
export function rankSwapCandidates(cands: SwapCandidateInput[]): SwapCandidateInput[] {
  return [...cands].sort(
    (a, b) =>
      Number(a.recentlyPlateaued) - Number(b.recentlyPlateaued) || b.recencyRank - a.recencyRank,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- plateau`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/strength/plateau.ts src/lib/strength/plateau.test.ts
git commit -m "feat: swap candidate ranking (novelty + anti-ping-pong)"
```

---

## Task 5: Prescription folding — `foldPrescription`

**Files:**
- Modify: `src/lib/strength/plateau.ts`
- Test: `src/lib/strength/plateau.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface AdaptationRow { action: AdaptationAction | "dismiss"; newExerciseId: string | null; newRepMin: number | null; newRepMax: number | null; createdAt: string }`
  - `interface FoldedPrescription { exerciseId: string; repMin: number; repMax: number; ladderStep: number; phaseStartAt: string | null; recentBands: RepBand[]; lastDismissAt: string | null }`
  - `foldPrescription(base: { exerciseId: string; repMin: number; repMax: number }, rows: AdaptationRow[]): FoldedPrescription`

Semantics: fold chronological accepted rows over the base slot. `rep_change` → set repMin/repMax to new band, `ladderStep += 1`, `phaseStartAt = createdAt`. `swap` → set exerciseId to newExerciseId, reset repMin/repMax to the slot's **base home band**, `ladderStep = 0`, `phaseStartAt = createdAt`, clear `recentBands`. `dismiss` → no prescription change, record `lastDismissAt`. `recentBands` accumulates `rep_change` bands since the last swap.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/strength/plateau.test.ts`:

```ts
import { foldPrescription, type AdaptationRow } from "./plateau";

describe("foldPrescription", () => {
  const base = { exerciseId: "db-bench", repMin: 8, repMax: 12 };

  it("returns the base when there are no adaptations", () => {
    const f = foldPrescription(base, []);
    expect(f).toMatchObject({ exerciseId: "db-bench", repMin: 8, repMax: 12, ladderStep: 0, phaseStartAt: null });
  });

  it("applies a rep_change: new band, ladder step 1, phase start set", () => {
    const rows: AdaptationRow[] = [
      { action: "rep_change", newExerciseId: null, newRepMin: 5, newRepMax: 8, createdAt: "2026-02-01T00:00:00Z" },
    ];
    const f = foldPrescription(base, rows);
    expect(f).toMatchObject({ exerciseId: "db-bench", repMin: 5, repMax: 8, ladderStep: 1, phaseStartAt: "2026-02-01T00:00:00Z" });
    expect(f.recentBands).toEqual([{ repMin: 5, repMax: 8 }]);
  });

  it("applies a swap: new exercise, home band restored, ladder reset, recentBands cleared", () => {
    const rows: AdaptationRow[] = [
      { action: "rep_change", newExerciseId: null, newRepMin: 5, newRepMax: 8, createdAt: "2026-02-01T00:00:00Z" },
      { action: "swap", newExerciseId: "machine-chest-press", newRepMin: null, newRepMax: null, createdAt: "2026-03-01T00:00:00Z" },
    ];
    const f = foldPrescription(base, rows);
    expect(f).toMatchObject({ exerciseId: "machine-chest-press", repMin: 8, repMax: 12, ladderStep: 0, phaseStartAt: "2026-03-01T00:00:00Z" });
    expect(f.recentBands).toEqual([]);
  });

  it("records the latest dismiss without changing the prescription", () => {
    const rows: AdaptationRow[] = [
      { action: "dismiss", newExerciseId: null, newRepMin: null, newRepMax: null, createdAt: "2026-02-10T00:00:00Z" },
    ];
    const f = foldPrescription(base, rows);
    expect(f).toMatchObject({ exerciseId: "db-bench", repMin: 8, repMax: 12, lastDismissAt: "2026-02-10T00:00:00Z" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- plateau`
Expected: FAIL — `foldPrescription` not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/strength/plateau.ts`:

```ts
export interface AdaptationRow {
  action: AdaptationAction | "dismiss";
  newExerciseId: string | null;
  newRepMin: number | null;
  newRepMax: number | null;
  createdAt: string;
}

export interface FoldedPrescription {
  exerciseId: string;
  repMin: number;
  repMax: number;
  ladderStep: number;
  phaseStartAt: string | null; // createdAt of the last rep_change/swap; null = original phase
  recentBands: RepBand[]; // rep_change bands used since the last swap
  lastDismissAt: string | null;
}

// Current prescription = base slot folded with accepted adaptation rows (chronological).
// set_log stays the source of truth for performance; this folds the INTENT log.
export function foldPrescription(
  base: { exerciseId: string; repMin: number; repMax: number },
  rows: AdaptationRow[],
): FoldedPrescription {
  const homeBand = { repMin: base.repMin, repMax: base.repMax };
  const state: FoldedPrescription = {
    exerciseId: base.exerciseId,
    repMin: base.repMin,
    repMax: base.repMax,
    ladderStep: 0,
    phaseStartAt: null,
    recentBands: [],
    lastDismissAt: null,
  };

  for (const row of rows) {
    if (row.action === "rep_change" && row.newRepMin != null && row.newRepMax != null) {
      state.repMin = row.newRepMin;
      state.repMax = row.newRepMax;
      state.ladderStep += 1;
      state.phaseStartAt = row.createdAt;
      state.recentBands = [...state.recentBands, { repMin: row.newRepMin, repMax: row.newRepMax }];
    } else if (row.action === "swap" && row.newExerciseId) {
      state.exerciseId = row.newExerciseId;
      state.repMin = homeBand.repMin;
      state.repMax = homeBand.repMax;
      state.ladderStep = 0;
      state.phaseStartAt = row.createdAt;
      state.recentBands = [];
    } else if (row.action === "dismiss") {
      state.lastDismissAt = row.createdAt;
    }
  }

  return state;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- plateau`
Expected: PASS. Then run the whole suite: `npm test` — expect all green (prior 58 + new plateau tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/strength/plateau.ts src/lib/strength/plateau.test.ts
git commit -m "feat: fold adaptation intent log into current prescription"
```

---

## Task 6: Thread `style` and `plateauPatience` through the program loader

**Files:**
- Modify: `src/lib/program.ts` (`ProgramSlot`, `Program`, `assemble`, the three select lists)
- Modify: `src/app/(app)/program/actions.ts` (`SaveProgramInput`, `SaveSlotInput`, `saveProgram`, `cloneProgram`)

**Interfaces:**
- Consumes: columns from Task 1.
- Produces: `Program.style: "classic" | "fluid"`, `ProgramSlot.plateauPatience: number | null`; `SaveProgramInput.style`, `SaveSlotInput.plateauPatience`. Tasks 7–9 read these.

- [ ] **Step 1: Extend the loader types and selects**

In `src/lib/program.ts`:

Add to `ProgramSlot`:
```ts
  plateauPatience: number | null;
```
Add to `Program`:
```ts
  style: "classic" | "fluid";
```
In `assemble`, change the slot select to include the column:
```ts
        .select("id, program_day_id, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds, plateau_patience, position")
```
In the slot push, add:
```ts
      plateauPatience: s.plateau_patience,
```
Change the `assemble` `row` param type to include `style: string` and set it on the returned object:
```ts
    style: (row.style as "classic" | "fluid") ?? "classic",
```
In `getActiveProgram`, `getProgram`, and `listProgramsFull`, add `style` to each `program` select:
```ts
    .select("id, name, description, tags, weeks, is_active, style")
```

- [ ] **Step 2: Extend `SaveProgramInput`/`SaveSlotInput` and persist**

In `src/app/(app)/program/actions.ts`:

Add to `SaveSlotInput`:
```ts
  plateauPatience: number | null;
```
Add to `SaveProgramInput`:
```ts
  style: "classic" | "fluid";
```
In `saveProgram`, persist `style` on the program upsert:
```ts
    .upsert({ id: input.id, user_id: userId, name, description, tags, weeks, style: input.style, is_active: true });
```
In the `slotRows` map, persist the patience override:
```ts
      plateau_patience: s.plateauPatience,
```
In `cloneProgram`, add `style` to the source select and the insert, and `plateau_patience` to the slot select + insert:
```ts
    .select("name, weeks, style")           // src select
```
```ts
    .insert({ user_id: userId, name: `${src.name} (copy)`, weeks: src.weeks, style: src.style, is_active: false })
```
```ts
      .select("exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds, plateau_patience, position")  // slot select
```
```ts
          plateau_patience: s.plateau_patience,   // slot insert
```

- [ ] **Step 3: Keep `program-builder.tsx` compiling**

Adding `style` to `Program` and `plateauPatience` to `ProgramSlot` makes the builder's `Draft` (`type Draft = Program`) require both fields, and `handleSave` builds `SaveProgramInput`/`SaveSlotInput` inline. Patch three spots in `src/app/(app)/program/program-builder.tsx` so it compiles (Task 9 then adds the UI that sets these values):

In `blankProgram()`, add `style`:
```ts
  return { id: uid(), name: "", description: null, tags: [], weeks: 5, style: "classic", isActive: true, days: [] };
```
In `addSlot()`'s pushed slot literal, add:
```ts
          plateauPatience: null,
```
In `handleSave`'s `saveProgram({ ... })` payload, add `style: draft.style,` at the program level and `plateauPatience: s.plateauPatience,` inside the per-slot `map<SaveSlotInput>`.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS (unchanged; pure modules unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/lib/program.ts "src/app/(app)/program/actions.ts" "src/app/(app)/program/program-builder.tsx"
git commit -m "feat: thread program style + slot patience through loader and save"
```

---

## Task 7: Server loader — compute a `pendingSuggestion` per slot

**Files:**
- Create: `src/lib/fluid.ts`
- Modify: `src/app/(app)/session/[id]/page.tsx`
- Modify: `src/app/(app)/session/[id]/active-session.tsx` (`SlotView` gains `pendingSuggestion`)

**Interfaces:**
- Consumes: `foldPrescription`, `detectPlateau`, `defaultPatience`, `nextLadderAction`, `pickRepBand`, `rankSwapCandidates`, `SNOOZE_EXPOSURES`, `bandOf` from `plateau.ts`; `startingWeight` from `progression.ts`; `getCatalogMap` from `catalog.ts`.
- Produces:
  - `interface PendingSuggestion { action: "rep_change" | "swap"; ladderStep: number; stalledExposures: number; repBand?: { repMin: number; repMax: number }; weight?: number | null; candidates?: { exerciseId: string; name: string; weight: number | null }[] }`
  - `loadPendingSuggestions(supabase, userId, slots, catalog, stats, bodyweight): Promise<Record<string, PendingSuggestion>>` keyed by `program_slot_id`. Only fluid-program slots are considered; non-plateaued or snoozed slots are omitted.
  - `currentPrescription(base, rows)` re-export is not needed — page uses `foldPrescription` directly.

This task has DB glue, so it is verified by `tsc` + `npm run build` rather than vitest (the testable logic already has unit tests in Tasks 2–5). Keep `fluid.ts` thin; all decisions delegate to `plateau.ts`.

- [ ] **Step 1: Write `src/lib/fluid.ts`**

```ts
// Server-side composition: turns a fluid program's slots + logged history + adaptation log
// into a per-slot plateau suggestion. All policy lives in plateau.ts; this file only fetches
// and wires. Returns suggestions ONLY for slots that are plateaued and not snoozed.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ExerciseDef, Pattern } from "@/lib/strength/coefficients";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { startingWeight } from "@/lib/strength/progression";
import {
  detectPlateau,
  defaultPatience,
  nextLadderAction,
  pickRepBand,
  rankSwapCandidates,
  foldPrescription,
  SNOOZE_EXPOSURES,
  type PhaseExposure,
  type AdaptationRow,
  type SwapCandidateInput,
} from "@/lib/strength/plateau";

type Client = SupabaseClient<Database>;

export interface PendingSuggestion {
  action: "rep_change" | "swap";
  ladderStep: number;
  stalledExposures: number;
  repBand?: { repMin: number; repMax: number };
  weight?: number | null;
  candidates?: { exerciseId: string; name: string; weight: number | null }[];
}

export interface FluidSlotInput {
  programSlotId: string;
  exerciseId: string; // current effective exercise (from session page's folded prescription)
  pattern: Pattern;
  repMin: number;
  repMax: number;
  targetRir: number;
  plateauPatience: number | null;
}

const MAX_SWAP_CANDIDATES = 3;

export async function loadPendingSuggestions(
  supabase: Client,
  userId: string,
  slots: FluidSlotInput[],
  catalog: Record<string, ExerciseDef>,
  stats: ExerciseStat[],
  bodyweight: number | null,
  now: Date = new Date(),
): Promise<Record<string, PendingSuggestion>> {
  const out: Record<string, PendingSuggestion> = {};
  if (slots.length === 0) return out;

  const slotIds = slots.map((s) => s.programSlotId);

  // All adaptation rows for these slots (chronological), and exposure history per slot.
  const { data: adaptRows } = await supabase
    .from("movement_adaptation")
    .select("program_slot_id, exercise_id, action, new_exercise_id, new_rep_min, new_rep_max, ladder_step, created_at")
    .eq("user_id", userId)
    .in("program_slot_id", slotIds)
    .order("created_at", { ascending: true });

  const { data: setRows } = await supabase
    .from("set_log")
    .select("program_slot_id, exercise_id, e1rm, created_at")
    .eq("user_id", userId)
    .eq("is_warmup", false)
    .in("program_slot_id", slotIds);

  for (const slot of slots) {
    const def = catalog[slot.exerciseId];
    if (!def) continue;

    const rows: AdaptationRow[] = (adaptRows ?? [])
      .filter((r) => r.program_slot_id === slot.programSlotId)
      .map((r) => ({
        action: r.action as AdaptationRow["action"],
        newExerciseId: r.new_exercise_id,
        newRepMin: r.new_rep_min,
        newRepMax: r.new_rep_max,
        createdAt: r.created_at,
      }));

    const folded = foldPrescription(
      { exerciseId: slot.exerciseId, repMin: slot.repMin, repMax: slot.repMax },
      rows,
    );

    // Best e1RM per session for the current (slot, exercise) phase.
    const phaseStart = folded.phaseStartAt ? new Date(folded.phaseStartAt).getTime() : 0;
    const bySession = new Map<string, PhaseExposure>();
    for (const r of setRows ?? []) {
      if (r.program_slot_id !== slot.programSlotId) continue;
      if (r.exercise_id !== folded.exerciseId) continue;
      if (r.e1rm == null) continue;
      const t = new Date(r.created_at).getTime();
      if (t < phaseStart) continue;
      // group by day-bucket of created_at (one session per slot per day)
      const key = r.created_at.slice(0, 10);
      const prev = bySession.get(key);
      if (!prev || r.e1rm > prev.bestE1rm) bySession.set(key, { sessionAt: r.created_at, bestE1rm: r.e1rm });
    }
    const exposures = [...bySession.values()].sort(
      (a, b) => new Date(a.sessionAt).getTime() - new Date(b.sessionAt).getTime(),
    );

    const patience = slot.plateauPatience ?? defaultPatience(def);
    const result = detectPlateau(exposures, patience, now);
    if (!result.plateaued) continue;

    // Snooze: if the user dismissed within the last SNOOZE_EXPOSURES exposures, stay quiet.
    if (folded.lastDismissAt) {
      const dismissT = new Date(folded.lastDismissAt).getTime();
      const since = exposures.filter((e) => new Date(e.sessionAt).getTime() > dismissT).length;
      if (since < SNOOZE_EXPOSURES) continue;
    }

    const action = nextLadderAction(folded.ladderStep);

    if (action === "rep_change") {
      const band = pickRepBand({ repMin: folded.repMin, repMax: folded.repMax }, folded.recentBands);
      const weight = startingWeight(def, band.repMin, slot.targetRir, catalog, stats, bodyweight)?.weight ?? null;
      out[slot.programSlotId] = {
        action,
        ladderStep: folded.ladderStep,
        stalledExposures: result.stalledExposures,
        repBand: band,
        weight,
      };
    } else {
      // Swap: rank other exercises in the pattern by novelty.
      const recentlyPlateauedIds = new Set(
        (adaptRows ?? [])
          .filter((r) => r.action === "swap")
          .map((r) => r.exercise_id), // exercises we swapped AWAY from
      );
      const trained = new Map<string, number>(); // exerciseId -> recency rank (0 = most recent)
      let rank = 0;
      for (const r of [...(setRows ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )) {
        if (!trained.has(r.exercise_id)) trained.set(r.exercise_id, rank++);
      }

      const pool: SwapCandidateInput[] = Object.values(catalog)
        .filter((d) => d.pattern === slot.pattern && d.id !== folded.exerciseId)
        .map((d) => ({
          exerciseId: d.id,
          name: d.name,
          recentlyPlateaued: recentlyPlateauedIds.has(d.id),
          recencyRank: trained.get(d.id) ?? Number.MAX_SAFE_INTEGER,
        }));

      const candidates = rankSwapCandidates(pool)
        .slice(0, MAX_SWAP_CANDIDATES)
        .map((c) => {
          const cdef = catalog[c.exerciseId];
          const weight =
            cdef ? startingWeight(cdef, folded.repMin, slot.targetRir, catalog, stats, bodyweight)?.weight ?? null : null;
          return { exerciseId: c.exerciseId, name: c.name, weight };
        });

      out[slot.programSlotId] = {
        action,
        ladderStep: folded.ladderStep,
        stalledExposures: result.stalledExposures,
        candidates,
      };
    }
  }

  return out;
}
```

- [ ] **Step 2: Wire the session page**

In `src/app/(app)/session/[id]/page.tsx`:

After `const catalog = await getCatalogMap(...)` and after `stats` is built, fetch the program style and, for fluid programs, the folded current prescription + suggestions. First extend the program select:
```ts
    session.program_id
      ? supabase.from("program").select("weeks, style").eq("id", session.program_id).maybeSingle()
      : Promise.resolve({ data: null }),
```
Then, for fluid slots, fold the adaptation log to get each slot's *current* exercise/range (replacing the "last logged exercise" derivation for fluid), and compute suggestions. Add after the `slots` array is built (it currently uses `sessionExercise.get(slot.id) ?? slot.exercise_id`):

```ts
  const isFluid = program?.style === "fluid";

  let suggestions: Record<string, import("@/lib/fluid").PendingSuggestion> = {};
  if (isFluid) {
    const { loadPendingSuggestions } = await import("@/lib/fluid");
    suggestions = await loadPendingSuggestions(
      supabase,
      userId,
      slots.map((s) => ({
        programSlotId: s.programSlotId,
        exerciseId: s.exerciseId,
        pattern: s.pattern,
        repMin: s.prescription.repMin,
        repMax: s.prescription.repMax,
        targetRir: s.prescription.targetRir,
        plateauPatience: null, // see note below
      })),
      catalog,
      stats,
      profile?.bodyweight ?? null,
    );
  }
```
Add `plateau_patience` to the `daySlots` select and carry it onto `SlotView` so the patience override is available:
```ts
      .select("id, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds, plateau_patience, position")
```
and in the `slots` map add `plateauPatience: slot.plateau_patience,` to each `SlotView`, then pass `plateauPatience: s.plateauPatience` into the `loadPendingSuggestions` slot input instead of `null`.

Attach the suggestion to each slot and pass through:
```ts
  const slotsWithSuggestions = slots.map((s) => ({ ...s, pendingSuggestion: suggestions[s.programSlotId] ?? null }));
```
Pass `slots={slotsWithSuggestions}` to `<ActiveSession />`.

- [ ] **Step 3: Extend `SlotView`**

In `src/app/(app)/session/[id]/active-session.tsx`, add to `SlotView`:
```ts
  plateauPatience: number | null;
  pendingSuggestion: import("@/lib/fluid").PendingSuggestion | null;
```

- [ ] **Step 4: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: passes. (SlotCard does not yet render the suggestion — that is Task 8; the field is plumbed but unused, which is fine.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/fluid.ts "src/app/(app)/session/[id]/page.tsx" "src/app/(app)/session/[id]/active-session.tsx"
git commit -m "feat: compute per-slot plateau suggestions for fluid sessions"
```

---

## Task 8: Recommendation card + accept/dismiss actions

**Files:**
- Modify: `src/app/(app)/session/actions.ts` (add `acceptAdaptation`, `dismissAdaptation`)
- Modify: `src/app/(app)/session/[id]/active-session.tsx` (`SlotCard` renders the card)

**Interfaces:**
- Consumes: `PendingSuggestion` (Task 7), `nextLadderAction` semantics (the resulting `ladder_step` is `ladderStep + 1` for `rep_change`, `0` for `swap`).
- Produces server actions:
  - `acceptAdaptation(input: { sessionId: string; programSlotId: string; exerciseId: string; action: "rep_change" | "swap"; ladderStep: number; newExerciseId?: string; newRepMin?: number; newRepMax?: number }): Promise<void>`
  - `dismissAdaptation(input: { programSlotId: string; exerciseId: string }): Promise<void>`

- [ ] **Step 1: Add the server actions**

In `src/app/(app)/session/actions.ts`, add (near the other actions; reuse the file's existing `createClient`/auth pattern — match `logSet`'s structure for obtaining `userId`):

```ts
export async function acceptAdaptation(input: {
  sessionId: string;
  programSlotId: string;
  exerciseId: string;
  action: "rep_change" | "swap";
  ladderStep: number;
  newExerciseId?: string;
  newRepMin?: number;
  newRepMax?: number;
}): Promise<void> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Not authenticated");

  const resultingStep = input.action === "swap" ? 0 : input.ladderStep + 1;

  const { error } = await supabase.from("movement_adaptation").insert({
    user_id: userId,
    program_slot_id: input.programSlotId,
    exercise_id: input.exerciseId,
    action: input.action,
    new_exercise_id: input.newExerciseId ?? null,
    new_rep_min: input.newRepMin ?? null,
    new_rep_max: input.newRepMax ?? null,
    ladder_step: resultingStep,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/session/${input.sessionId}`);
}

export async function dismissAdaptation(input: {
  programSlotId: string;
  exerciseId: string;
}): Promise<void> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Not authenticated");

  const { error } = await supabase.from("movement_adaptation").insert({
    user_id: userId,
    program_slot_id: input.programSlotId,
    exercise_id: input.exerciseId,
    action: "dismiss",
  });
  if (error) throw new Error(error.message);
}
```

Ensure `revalidatePath` is imported in this file (it is used by other actions; if not, add `import { revalidatePath } from "next/cache";`).

- [ ] **Step 2: Render the card in `SlotCard`**

In `active-session.tsx`, import the new actions:
```ts
import {
  logSet,
  editSet,
  deleteSet,
  finishSession,
  acceptAdaptation,
  dismissAdaptation,
  type SessionSummary,
} from "../actions";
```
Add suggestion state in `SlotCard` (near the other `useState`s):
```ts
  const [dismissed, setDismissed] = useState(false);
  const [applying, startApply] = useTransition();
  const suggestion = slot.pendingSuggestion;
  const showSuggestion = !!suggestion && !dismissed && slot.sets.length === 0;
```
The card renders only before any set is logged this session (a fresh prescription should drive the session once accepted). Insert this block immediately after the `<TargetLine ... />` line:

```tsx
      {showSuggestion && suggestion && (
        <div className="mt-3 rounded-card border border-border-strong p-3">
          <p className="text-caption uppercase tracking-wide text-muted">Plateau detected</p>
          <p className="mt-1 text-body">
            {name} · no new e1RM high in {suggestion.stalledExposures} sessions.
          </p>
          {suggestion.action === "rep_change" && suggestion.repBand && (
            <>
              <p className="mt-1 text-body">
                Try{" "}
                <span className="font-medium text-foreground">
                  {suggestion.repBand.repMin}–{suggestion.repBand.repMax} reps
                  {suggestion.weight != null ? ` @ ${suggestion.weight} lb` : ""}
                </span>
                .
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  pending={applying}
                  onClick={() =>
                    startApply(async () => {
                      await acceptAdaptation({
                        sessionId,
                        programSlotId: slot.programSlotId,
                        exerciseId,
                        action: "rep_change",
                        ladderStep: suggestion.ladderStep,
                        newRepMin: suggestion.repBand!.repMin,
                        newRepMax: suggestion.repBand!.repMax,
                      });
                    })
                  }
                >
                  Accept
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    startApply(async () => {
                      await dismissAdaptation({ programSlotId: slot.programSlotId, exerciseId });
                      setDismissed(true);
                    })
                  }
                >
                  Keep going
                </Button>
              </div>
            </>
          )}
          {suggestion.action === "swap" && (
            <>
              <p className="mt-1 text-body">Stuck here — try a different movement:</p>
              <ul className="mt-2 flex flex-col gap-1">
                {suggestion.candidates?.map((c) => (
                  <li key={c.exerciseId}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full justify-between"
                      pending={applying}
                      onClick={() =>
                        startApply(async () => {
                          await acceptAdaptation({
                            sessionId,
                            programSlotId: slot.programSlotId,
                            exerciseId,
                            action: "swap",
                            ladderStep: suggestion.ladderStep,
                            newExerciseId: c.exerciseId,
                          });
                          setExerciseId(c.exerciseId);
                        })
                      }
                    >
                      <span>{c.name}</span>
                      {c.weight != null && <span className="tabular-nums text-muted">{c.weight} lb</span>}
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setSwapping(true)}>
                  Other options
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    startApply(async () => {
                      await dismissAdaptation({ programSlotId: slot.programSlotId, exerciseId });
                      setDismissed(true);
                    })
                  }
                >
                  Keep going
                </Button>
              </div>
            </>
          )}
        </div>
      )}
```

Note: accepting a swap reuses the existing in-session swap path (`setExerciseId`), so the slot immediately re-targets; the adaptation row makes the change persist for the next session. A `rep_change` accept revalidates the route, which reloads the folded prescription with the new band.

- [ ] **Step 3: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: passes.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS (unchanged).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/session/actions.ts" "src/app/(app)/session/[id]/active-session.tsx"
git commit -m "feat: in-session plateau recommendation card (accept / keep going / swap)"
```

---

## Task 9: Builder — style toggle + per-slot patience

**Files:**
- Modify: `src/app/(app)/program/program-builder.tsx`

**Interfaces:**
- Consumes: `Program.style`, `ProgramSlot.plateauPatience` (Task 6, already on the `Draft`); the builder's existing `update(fn)` and `updateSlot(dayId, slotId, patch)` mutators. The save payload already carries `style`/`plateauPatience` after Task 6.
- Produces: builder UI that sets `style` and per-slot `plateauPatience`. No save-payload change needed (done in Task 6).

The builder's `type Draft = Program`, so `draft.style` and `slot.plateauPatience` already exist. This task only adds controls.

- [ ] **Step 1: Add a style toggle and de-emphasize weeks (fluid)**

In `src/app/(app)/program/program-builder.tsx`, in the metadata block, replace the weeks row (currently lines ~191–204, the `<div className="flex items-center gap-3 text-body">…Weeks Stepper…</div>`) with a style toggle followed by a weeks row that only renders for classic:

```tsx
<div className="flex flex-col gap-2">
  <span className="text-body text-muted">Progression style</span>
  <div className="flex gap-2">
    <Button
      type="button"
      variant={draft.style === "classic" ? "primary" : "secondary"}
      size="sm"
      onClick={() => update((d) => ({ ...d, style: "classic" }))}
    >
      Classic
    </Button>
    <Button
      type="button"
      variant={draft.style === "fluid" ? "primary" : "secondary"}
      size="sm"
      onClick={() => update((d) => ({ ...d, style: "fluid" }))}
    >
      Adaptive
    </Button>
  </div>
  <p className="text-caption text-muted">
    {draft.style === "fluid"
      ? "Runs indefinitely. Each movement is tracked for plateaus and swapped or re-ranged when it stalls."
      : "Fixed block of weeks with double-progression."}
  </p>
</div>

{draft.style === "classic" && (
  <div className="flex items-center gap-3 text-body">
    <span className="text-muted">Repeat for</span>
    <Stepper
      label="Weeks"
      layout="row"
      inputMode="numeric"
      value={draft.weeks}
      step={1}
      min={4}
      max={6}
      onChange={(v) => update((d) => ({ ...d, weeks: v }))}
    />
    <span className="text-muted">weeks</span>
  </div>
)}
```

- [ ] **Step 2: Add a per-slot patience control (fluid only)**

In the slot `<li>` (after the `<RestField .../>` at line ~263), add a patience selector that renders only for fluid programs, using the existing `updateSlot` helper:

```tsx
{draft.style === "fluid" && (
  <label className="mt-2 flex items-center justify-between gap-2 text-caption text-muted">
    <span className="uppercase tracking-wide">Patience</span>
    <select
      value={slot.plateauPatience ?? ""}
      onChange={(e) =>
        updateSlot(day.id, slot.id, {
          plateauPatience: e.target.value === "" ? null : Number(e.target.value),
        })
      }
      className="h-9 rounded-control border border-border-strong bg-transparent px-2 text-sm font-semibold"
    >
      <option value="">Auto</option>
      <option value="2">Low (2)</option>
      <option value="3">Normal (3)</option>
      <option value="4">High (4)</option>
      <option value="5">Very high (5)</option>
    </select>
  </label>
)}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/program/program-builder.tsx"
git commit -m "feat: builder style toggle + per-slot plateau patience"
```

---

## Task 10: Home — fluid program header variant

**Files:**
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `Program.style` (Task 6).

- [ ] **Step 1: Branch the header on style**

In `src/app/(app)/page.tsx`, `program` already comes from `getActiveProgram`. The block-progress bar assumes a fixed total (`program.days.length * program.weeks`), which is meaningless for fluid programs. Replace the `<BlockProgress .../>` render with a conditional:

```tsx
{program.style === "fluid" ? (
  <p className="text-caption text-muted">
    Session {completed + 1} · adaptive — movements adjust as you plateau
  </p>
) : (
  <BlockProgress completed={completed} total={totalSessions} />
)}
```

Also soften the week line for fluid (no fixed total): keep "next: {day}" but drop "Week X of N":
```tsx
<p className="text-body text-muted">
  {program.style === "fluid" ? "Next" : `Week ${week} of ${program.weeks} · next`}:{" "}
  <span className="font-medium text-foreground">{nextDay.name}</span>
</p>
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: passes.

- [ ] **Step 3: Run the full suite**

Run: `npm test && npm run lint`
Expected: tests PASS, lint clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: fluid-program home header variant"
```

---

## Final verification

- [ ] Run `npm test` — all pure-module tests pass (prior 58 + new plateau suite).
- [ ] Run `npx tsc --noEmit` — clean.
- [ ] Run `npm run lint` — clean.
- [ ] Run `npm run build` — succeeds.
- [ ] Manual smoke (logged-in session, see memory `browser-audit-via-magic-link`):
  1. Build an Adaptive program; confirm weeks UI is de-emphasized and slots show Patience.
  2. With seeded plateau history on a movement (or after enough stalled sessions), open a session and confirm the "Plateau detected" card appears, Accept applies a rep-range change, and the next session reflects the new band.
  3. Drive a second plateau in the new band; confirm the card escalates to a swap with ranked candidates + starting weights; accepting swaps the exercise and resets to the home band.
  4. Confirm "Keep going" snoozes the suggestion for the next session.

---

## Notes for the implementer

- **Out of scope (do not build):** deload detection, auto-applying adaptations, migrating classic programs, the movement-timeline visualization.
- **Why no vitest for `fluid.ts`:** it is thin DB glue; every decision is delegated to `plateau.ts`, which is fully unit-tested. Testing `fluid.ts` would mean mocking Supabase, which this repo deliberately avoids (pure modules only).
- **Session/day grouping for exposures:** `fluid.ts` buckets `set_log` rows by the date portion of `created_at` (one session per slot per day). This matches how a user trains a slot once per session and avoids needing a join to `workout_session`.
- **Phase boundary:** `foldPrescription` returns `phaseStartAt` (the timestamp of the last rep_change/swap). Only exposures at or after it count toward the current phase's plateau — that is what makes an accepted adaptation reset the clock.
```
