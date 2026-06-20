import { describe, it, expect } from "vitest";
import { pctOf1RM, computeE1rm, weightForTarget, roundToIncrement } from "@/lib/strength/e1rm";

describe("pctOf1RM", () => {
  it("is 1.0 at a true 1RM (reps-to-failure = 1)", () => {
    expect(pctOf1RM(1)).toBe(1);
    expect(pctOf1RM(0.5)).toBe(1); // clamped up to 1
  });

  it("is monotonically decreasing across and beyond the table", () => {
    let prev = pctOf1RM(1);
    for (let n = 2; n <= 20; n++) {
      const cur = pctOf1RM(n);
      expect(cur).toBeLessThan(prev);
      prev = cur;
    }
  });

  it("interpolates linearly between integer points", () => {
    // halfway between rtf=1 (1.0) and rtf=2 (0.955)
    expect(pctOf1RM(1.5)).toBeCloseTo((1.0 + 0.955) / 2, 6);
  });

  it("is continuous at the table boundary (rtf = 12)", () => {
    expect(pctOf1RM(12)).toBeCloseTo(0.68, 6);
    // the Epley-decay branch evaluated at 12 equals the table value
    expect(pctOf1RM(12.0001)).toBeCloseTo(0.68, 3);
  });
});

describe("computeE1rm", () => {
  it("returns the load itself for a 1-rep, 0-RIR set", () => {
    expect(computeE1rm(225, 1, 0)).toBeCloseTo(225, 6);
  });

  it("folds RIR into reps-to-failure (RPE = 10 - RIR)", () => {
    // 5 reps @ 2 RIR === 7 reps to failure === 7 reps @ 0 RIR
    expect(computeE1rm(100, 5, 2)).toBeCloseTo(computeE1rm(100, 7, 0), 6);
  });

  it("defaults RIR to 2 when omitted", () => {
    expect(computeE1rm(100, 5)).toBeCloseTo(computeE1rm(100, 5, 2), 6);
  });

  it("treats negative RIR as 0 (clamped)", () => {
    expect(computeE1rm(100, 5, -3)).toBeCloseTo(computeE1rm(100, 5, 0), 6);
  });

  it("estimates a higher 1RM than the working load", () => {
    expect(computeE1rm(100, 8, 2)).toBeGreaterThan(100);
  });
});

describe("weightForTarget is the inverse of computeE1rm", () => {
  it("round-trips for assorted reps/RIR", () => {
    for (const [reps, rir] of [
      [1, 0],
      [5, 2],
      [8, 1],
      [12, 3],
      [15, 0],
    ] as const) {
      const w = 185;
      const e1rm = computeE1rm(w, reps, rir);
      expect(weightForTarget(e1rm, reps, rir)).toBeCloseTo(w, 6);
    }
  });
});

describe("roundToIncrement", () => {
  it("rounds to the nearest multiple", () => {
    expect(roundToIncrement(112, 5)).toBe(110);
    expect(roundToIncrement(113, 5)).toBe(115);
    expect(roundToIncrement(117, 10)).toBe(120);
  });

  it("rounds to the nearest integer when increment is non-positive", () => {
    expect(roundToIncrement(50.4, 0)).toBe(50);
    expect(roundToIncrement(50.6, -1)).toBe(51);
  });
});
