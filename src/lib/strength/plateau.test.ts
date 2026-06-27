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
