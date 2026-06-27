import { describe, it, expect } from "vitest";
import {
  detectPlateau,
  defaultPatience,
  bandOf,
  pickRepBand,
  nextLadderAction,
  rankSwapCandidates,
  type PhaseExposure,
  type SwapCandidateInput,
} from "./plateau";
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
  it("does not flag a still-progressing movement", () => {
    const r = detectPlateau(series([150, 153, 156, 159, 162]), 3);
    expect(r.plateaued).toBe(false);
  });

  it("flags after `patience` stalled exposures past the last new best", () => {
    // new best at index 1 (155), then 3 stalled exposures
    const r = detectPlateau(series([150, 155, 154, 155, 153]), 3);
    expect(r.plateaued).toBe(true);
    expect(r.stalledExposures).toBe(3);
  });

  it("does not flag at patience-1 stalled exposures (hysteresis)", () => {
    const r = detectPlateau(series([150, 155, 154, 155]), 3);
    expect(r.plateaued).toBe(false);
    expect(r.stalledExposures).toBe(2);
  });

  it("ignores within-noise bumps (1% margin)", () => {
    // 200 -> 201 is < 1% over 200, so not progress
    const r = detectPlateau(series([200, 201, 200, 201]), 3);
    expect(r.plateaued).toBe(true);
  });

  it("honors the 14-day calendar floor even with enough stalled exposures", () => {
    // four exposures on consecutive days -> stalled count high but span < 14 days
    const r = detectPlateau(series([150, 155, 154, 153, 154], day), 3);
    expect(r.stalledExposures).toBeGreaterThanOrEqual(3);
    expect(r.plateaued).toBe(false);
  });

  it("never flags a brand-new movement (too few exposures)", () => {
    const r = detectPlateau(series([150, 150]), 3);
    expect(r.plateaued).toBe(false);
  });
});

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
