import { describe, it, expect } from "vitest";
import { startingWeight, sessionTarget, type SlotPrescription } from "@/lib/strength/progression";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";

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

  it("delegates to the recommender at rep_min with no prior performance", () => {
    const t = sessionTarget(defs["bb-bench"], slot, null, defs, stats, null)!;
    expect(t.source).toBe("recommendation");
    expect(t.targetReps).toBe(slot.repMin);
    expect(t.confidence).toBeDefined();
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

  it("never targets beyond rep_max when holding", () => {
    const last = { weight: 135, reps: slot.repMax - 1 };
    const t = sessionTarget(defs["bb-bench"], slot, last, defs, stats, null)!;
    expect(t.targetReps).toBe(slot.repMax);
  });
});
