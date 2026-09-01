import { describe, expect, it } from "vitest";
import {
  effectiveSetCount,
  resolvePrescription,
  validateProgramPhases,
  type ProgramPhase,
} from "./periodization";

const phase = (overrides: Partial<ProgramPhase>): ProgramPhase => ({
  id: "phase-1",
  position: 0,
  name: "Build",
  description: null,
  weekStart: 1,
  weekEnd: 1,
  targetRirMin: 2,
  targetRirMax: 2,
  setMultiplier: null,
  ...overrides,
});

const base = { targetSets: 3, repMin: 8, repMax: 12, targetRir: 1 };

describe("resolvePrescription", () => {
  it("leaves programs without phases unchanged", () => {
    expect(resolvePrescription(base, 4, [])).toMatchObject({
      ...base,
      targetRirMin: 1,
      targetRirMax: 1,
      phase: null,
    });
  });

  it("resolves block boundaries and RIR ranges", () => {
    const phases = [
      phase({ id: "cal-1", name: "Calibration", weekStart: 1, weekEnd: 1 }),
      phase({ id: "build-1", position: 1, weekStart: 2, weekEnd: 3, targetRirMin: 1, targetRirMax: 1 }),
      phase({ id: "intense-1", position: 2, weekStart: 4, weekEnd: 5, targetRirMin: 0, targetRirMax: 1 }),
      phase({ id: "deload-1", position: 3, name: "Deload", weekStart: 6, weekEnd: 6, targetRirMin: 3, targetRirMax: 4, setMultiplier: 0.5 }),
      phase({ id: "cal-2", position: 4, weekStart: 7, weekEnd: 7 }),
      phase({ id: "build-2", position: 5, weekStart: 8, weekEnd: 9, targetRirMin: 1, targetRirMax: 1 }),
      phase({ id: "intense-2", position: 6, weekStart: 10, weekEnd: 11, targetRirMin: 0, targetRirMax: 1 }),
      phase({ id: "deload-2", position: 7, name: "Deload", weekStart: 12, weekEnd: 12, targetRirMin: 3, targetRirMax: 4, setMultiplier: 0.5 }),
    ];

    expect(resolvePrescription(base, 1, phases).targetRir).toBe(2);
    expect(resolvePrescription(base, 2, phases).targetRir).toBe(1);
    expect(resolvePrescription(base, 4, phases)).toMatchObject({ targetRirMin: 0, targetRirMax: 1 });
    expect(resolvePrescription(base, 6, phases)).toMatchObject({ targetSets: 2, targetRirMin: 3, targetRirMax: 4 });
    expect(resolvePrescription(base, 7, phases).targetRir).toBe(2);
    expect(resolvePrescription(base, 12, phases)).toMatchObject({ targetSets: 2, targetRirMin: 3, targetRirMax: 4 });
  });
});

describe("effectiveSetCount", () => {
  it("rounds half sets up and retains at least one set", () => {
    expect(effectiveSetCount(4, 0.5)).toBe(2);
    expect(effectiveSetCount(3, 0.5)).toBe(2);
    expect(effectiveSetCount(1, 0.5)).toBe(1);
  });
});

describe("validateProgramPhases", () => {
  it("reports overlapping and out-of-block phases", () => {
    const errors = validateProgramPhases([
      phase({ weekStart: 1, weekEnd: 3 }),
      phase({ id: "phase-2", position: 1, name: "Overlap", weekStart: 3, weekEnd: 13 }),
    ], 12);

    expect(errors).toContain("Overlap: week range must sit within weeks 1–12.");
    expect(errors).toContain("Overlap: week range overlaps Build.");
  });
});
