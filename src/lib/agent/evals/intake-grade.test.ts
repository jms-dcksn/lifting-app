import { describe, expect, it } from "vitest";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { gradeIntakeClassification, gradeTemplateInvariants } from "./intake-grade";

describe("slice 2 intake evals", () => {
  it("does not guess a split when days are missing", () => {
    const result = gradeIntakeClassification({
      fields: { goal: "hypertrophy", style: "classic" },
      expectReady: false,
    });
    expect(result.pass).toBe(true);
    expect(result.result.followUp).toMatch(/days/i);
  });

  it("round-trips a complete intake to valid template slots", () => {
    const result = gradeTemplateInvariants({
      intake: {
        days: 4,
        goal: "hypertrophy",
        style: "classic",
        equipment: "full_gym",
        omissions: ["deadlifts"],
      },
      recentExerciseIds: ["bb-back-squat", "bb-bench"],
    });
    expect(result.pass).toBe(true);
    expect(result.draft?.days.length).toBeGreaterThan(0);
  });

  it("keeps machine templates generic after patching", () => {
    const result = gradeTemplateInvariants({
      intake: {
        days: 3,
        goal: "hypertrophy",
        style: "fluid",
        equipment: "machines_only",
        emphasis: "glutes",
      },
    });
    expect(result.pass).toBe(true);
    const machineSlots = result.draft?.days
      .flatMap((day) => day.slots)
      .filter((slot) => EXERCISE_BY_ID[slot.exerciseId]?.stationProfile === "machine") ?? [];
    for (const slot of machineSlots) {
      expect(EXERCISE_BY_ID[slot.exerciseId].brand).toBeUndefined();
    }
  });
});
