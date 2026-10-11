import { describe, expect, it } from "vitest";
import { classifyProgramIntake } from "./classify";
import { CONFIDENCE_THRESHOLD } from "./ontology";

describe("classifyProgramIntake", () => {
  it("asks for days when only goal is known", () => {
    const result = classifyProgramIntake({ goal: "hypertrophy" });
    expect(result.ready).toBe(false);
    expect(result.days.value).toBeNull();
    expect(result.followUp).toMatch(/days per week/i);
    expect(result.chips).toContain("4 days");
  });

  it("asks for style before drafting", () => {
    const result = classifyProgramIntake({ days: 4, goal: "strength" });
    expect(result.ready).toBe(false);
    expect(result.style.value).toBeNull();
    expect(result.followUp).toMatch(/classic|fluid/i);
  });

  it("is ready when required fields meet the confidence threshold", () => {
    const result = classifyProgramIntake({
      days: 4,
      goal: "hypertrophy",
      style: "classic",
      equipment: "full_gym",
    });
    expect(result.overallConfidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    expect(result.ready).toBe(true);
    expect(result.intake).toEqual({
      days: 4,
      goal: "hypertrophy",
      style: "classic",
      equipment: "full_gym",
    });
  });

  it("normalizes omission aliases", () => {
    const result = classifyProgramIntake({
      days: 3,
      goal: "hypertrophy",
      style: "fluid",
      omissions: ["deadlifts", "RDL"],
    });
    expect(result.ready).toBe(true);
    expect(result.intake?.omissions).toEqual(
      expect.arrayContaining(["bb-deadlift", "hinge", "bb-rdl"]),
    );
  });

  it("does not guess days from vague input", () => {
    const result = classifyProgramIntake({ goal: "hypertrophy", style: "classic" });
    expect(result.ready).toBe(false);
    expect(result.days.value).toBeNull();
  });
});
