import { describe, it, expect } from "vitest";
import {
  selectProgressionReference,
  startingWeight,
  sessionTarget,
  type ProgressionPerformance,
  type SlotPrescription,
} from "@/lib/strength/progression";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { resolvePrescription } from "@/lib/periodization";

const defs = EXERCISE_BY_ID;
const slot: SlotPrescription = { repMin: 8, repMax: 12, targetRir: 2 };
const stat = (exerciseId: string, e: Partial<ExerciseStat> = {}): ExerciseStat => ({
  exerciseId,
  currentE1rm: 0,
  personalCoefficient: null,
  confidenceN: 0,
  ...e,
});

describe("startingWeight", () => {
  it("returns null when nothing in the pattern is logged", () => {
    expect(startingWeight(defs["bb-bench"], 8, 2, defs, [], null)).toBeNull();
  });

  it("returns the recommender weight directly for free weights", () => {
    const stats = [stat("bb-bench", { currentE1rm: 200, confidenceN: 3 })];
    const out = startingWeight(defs["bb-bench"], 8, 2, defs, stats, null)!;
    expect(out.weight).toBeGreaterThan(0);
    expect(out.confidence).toBe("high");
  });

  it("converts a bodyweight movement's suggested total load into added load", () => {
    // weighted-pullup is bodyweight equipment; pattern history comes from lat-pulldown
    const stats = [stat("lat-pulldown", { currentE1rm: 150, confidenceN: 2 })];
    const bw = 180;
    const out = startingWeight(defs["weighted-pullup"], 5, 2, defs, stats, bw)!;
    // added load = suggested total - bodyweight; total here is well below bodyweight,
    // so the added load is negative (assisted) — never silently zeroed.
    expect(out.weight).toBeLessThan(bw);
  });

  it("returns null for a bodyweight movement when bodyweight is unknown", () => {
    const stats = [stat("lat-pulldown", { currentE1rm: 150, confidenceN: 2 })];
    expect(startingWeight(defs["weighted-pullup"], 5, 2, defs, stats, null)).toBeNull();
  });
});

describe("sessionTarget", () => {
  const stats = [stat("bb-bench", { currentE1rm: 200, confidenceN: 3 })];

  it("reduces load at the prior rep count for a phase-resolved deload", () => {
    const prescription = resolvePrescription(
      { targetSets: 3, repMin: 6, repMax: 8, targetRir: 1 },
      6,
      [{
        id: "deload", position: 0, name: "Deload", description: null,
        weekStart: 6, weekEnd: 6, targetRirMin: 3, targetRirMax: 4,
        setMultiplier: 0.5,
      }],
    );
    const target = sessionTarget(
      defs["bb-bench"], prescription, { weight: 150, reps: 7, rir: 1 },
      defs, stats, null,
    );

    // The load table gives 150 / 0.786 × 0.707 = 134.9 lb, rounded to 135.
    expect(target).toMatchObject({ weight: 135, targetReps: 7, targetRir: 4 });
  });

  it("delegates to the recommender at rep_min with no prior performance", () => {
    const t = sessionTarget(defs["bb-bench"], slot, null, defs, stats, null)!;
    expect(t.source).toBe("recommendation");
    expect(t.targetReps).toBe(slot.repMin);
    expect(t.confidence).toBeDefined();
  });

  it("uses the canonical two-RIR default for legacy recovery references", () => {
    const target = sessionTarget(
      defs["bb-bench"], { repMin: 6, repMax: 8, targetRir: 4 },
      { weight: 150, reps: 7, rir: null }, defs, stats, null,
    );

    expect(target).toMatchObject({ weight: 140, targetReps: 7, targetRir: 4 });
  });

  it("withholds a bodyweight recovery load when bodyweight is unknown", () => {
    expect(sessionTarget(
      defs["weighted-pullup"], { repMin: 6, repMax: 8, targetRir: 4 },
      { weight: 35, reps: 7, rir: 1 }, defs, stats, null,
    )).toBeNull();
  });

  it.each([
    { reps: 4, rir: 1, targetRir: 4, weight: 160, targetReps: 6 },
    { reps: 8, rir: 1, targetRir: 4, weight: 165, targetReps: 8 },
    { reps: 10, rir: 1, targetRir: 4, weight: 180, targetReps: 8 },
    { reps: 7, rir: 4, targetRir: 4, weight: 185, targetReps: 7 },
    { reps: 7, rir: 1, targetRir: 5, weight: 160, targetReps: 7 },
    { reps: 7, rir: 1, targetRir: 3, weight: 185, targetReps: 8 },
    { reps: 8, rir: 1, targetRir: 3, weight: 190, targetReps: 6 },
  ])("keeps recovery targets in range and preserves progression below four RIR: $reps reps @ $targetRir target RIR", ({ reps, rir, targetRir, weight, targetReps }) => {
    const target = sessionTarget(
      defs["bb-bench"], { repMin: 6, repMax: 8, targetRir },
      { weight: 185, reps, rir }, defs, stats, null,
    );

    expect(target).toMatchObject({ weight, targetReps, targetRir });
  });

  it("rounds a recovery pull-up's added load with decimal bodyweight", () => {
    const target = sessionTarget(
      defs["weighted-pullup"], { repMin: 6, repMax: 8, targetRir: 4 },
      { weight: 35, reps: 7, rir: 1 }, defs, stats, 149.2,
    );

    expect(target).toMatchObject({ weight: 15, targetReps: 7, targetRir: 4 });
  });

  it("allows assisted bodyweight recovery targets", () => {
    const target = sessionTarget(
      defs["weighted-pullup"], { repMin: 6, repMax: 8, targetRir: 4 },
      { weight: 0, reps: 7, rir: 1 }, defs, stats, 180,
    );

    expect(target).toMatchObject({ weight: -20, targetReps: 7, targetRir: 4 });
  });

  it("returns null with no prior performance and no pattern history", () => {
    expect(sessionTarget(defs["bb-bench"], slot, null, defs, [], null)).toBeNull();
  });

  it("bumps weight and resets reps when the last first-set hit rep_max", () => {
    const last = { weight: 135, reps: slot.repMax };
    const t = sessionTarget(defs["bb-bench"], slot, last, defs, stats, null)!;
    expect(t.source).toBe("progression");
    expect(t.weight).toBe(135 + defs["bb-bench"].increment);
    expect(t.targetReps).toBe(slot.repMin);
    expect(t.last).toEqual(last);
  });

  it("holds weight and targets +1 rep when below rep_max", () => {
    const last = { weight: 135, reps: 9 };
    const t = sessionTarget(defs["bb-bench"], slot, last, defs, stats, null)!;
    expect(t.source).toBe("progression");
    expect(t.weight).toBe(135);
    expect(t.targetReps).toBe(10);
  });

  it("recalibrates load and targets rep_min after a below-range set", () => {
    const last = { weight: 185, reps: 4, rir: 1 };
    const lowerRange = { ...slot, repMin: 6, repMax: 10, targetRir: 1 };
    const t = sessionTarget(defs["bb-bench"], lowerRange, last, defs, stats, null)!;

    expect(t.weight).toBe(175);
    expect(t.targetReps).toBe(6);
  });

  it("accounts for bodyweight when recalibrating a below-range weighted pull-up", () => {
    const last = { weight: 60, reps: 2, rir: 2 };
    const pullupRange = { ...slot, repMin: 6, repMax: 10, targetRir: 2 };
    const t = sessionTarget(
      defs["weighted-pullup"],
      pullupRange,
      last,
      defs,
      stats,
      180,
    )!;

    expect(t.weight).toBe(30);
    expect(t.targetReps).toBe(6);
  });

  it("rounds the added load rather than total load for a decimal bodyweight", () => {
    const last = { weight: 60, reps: 2, rir: 2 };
    const pullupRange = { ...slot, repMin: 6, repMax: 10, targetRir: 2 };
    const t = sessionTarget(
      defs["weighted-pullup"],
      pullupRange,
      last,
      defs,
      stats,
      149.2,
    )!;

    expect(t.weight).toBe(35);
    expect(t.targetReps).toBe(6);
  });

  it("never increases load after a below-range set with excess RIR", () => {
    const last = { weight: 185, reps: 5, rir: 4 };
    const lowerRange = { ...slot, repMin: 6, repMax: 10, targetRir: 2 };
    const t = sessionTarget(defs["bb-bench"], lowerRange, last, defs, stats, null)!;

    expect(t.weight).toBe(185);
    expect(t.targetReps).toBe(6);
  });

  it("never targets beyond rep_max when holding", () => {
    const last = { weight: 135, reps: slot.repMax - 1 };
    const t = sessionTarget(defs["bb-bench"], slot, last, defs, stats, null)!;
    expect(t.targetReps).toBe(slot.repMax);
  });
});

describe("selectProgressionReference", () => {
  const performance = (
    performedAt: string,
    programSlotId: string,
    reps: number,
    e1rm: number | null,
  ): ProgressionPerformance => ({
    programSlotId,
    performedAt,
    weight: 300,
    reps,
    rir: 1,
    e1rm,
  });

  it("uses a stronger newer exposure from another weekly slot", () => {
    const lowerA = performance("2026-09-09T10:00:00Z", "lower-a", 8, 394);
    const lowerB = performance("2026-09-12T10:00:00Z", "lower-b", 9, 406);

    const reference = selectProgressionReference([lowerA, lowerB], "lower-a");

    expect(reference.lastSameSlot).toEqual(lowerA);
    expect(reference.bestRecent).toEqual(lowerB);
    expect(reference.selected).toEqual(lowerB);
  });

  it("does not let an older all-time best override the current slot cycle", () => {
    const oldBest = performance("2026-08-01T10:00:00Z", "lower-b", 12, 430);
    const lowerA = performance("2026-09-09T10:00:00Z", "lower-a", 8, 394);
    const lowerB = performance("2026-09-12T10:00:00Z", "lower-b", 9, 406);

    const reference = selectProgressionReference([oldBest, lowerA, lowerB], "lower-a");

    expect(reference.selected).toEqual(lowerB);
  });

  it("uses the strongest of four recent exposures for a new slot", () => {
    const rows = [
      performance("2026-09-12T10:00:00Z", "other-1", 8, 390),
      performance("2026-09-10T10:00:00Z", "other-2", 9, 410),
      performance("2026-09-08T10:00:00Z", "other-3", 10, 405),
      performance("2026-09-06T10:00:00Z", "other-4", 10, 400),
      performance("2026-09-01T10:00:00Z", "other-5", 12, 450),
    ];

    expect(selectProgressionReference(rows, "new-slot").selected).toEqual(rows[1]);
  });

  it("falls back to the most recent exposure when e1RM is unavailable", () => {
    const recent = performance("2026-09-12T10:00:00Z", "other", 8, null);
    const older = performance("2026-09-10T10:00:00Z", "other", 9, null);

    expect(selectProgressionReference([older, recent], "new-slot").selected).toEqual(recent);
  });
});
