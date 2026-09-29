import { describe, expect, it } from "vitest";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { assembleProgramDraft, pickTemplate, validateAssembledProgram } from "./assembler";

describe("assembleProgramDraft", () => {
  it("picks a 4-day hypertrophy template for matching intake", () => {
    const template = pickTemplate({
      days: 4,
      goal: "hypertrophy",
      style: "classic",
      equipment: "full_gym",
    });
    expect(template.tags).toContain("4-day");
    expect(template.tags.some((tag) => tag.includes("hypertrophy") || tag.includes("strength"))).toBe(true);
  });

  it("prefers logged exercises with stats while keeping machine templates generic", () => {
    const draft = assembleProgramDraft({
      intake: {
        days: 3,
        goal: "general",
        style: "classic",
        equipment: "full_gym",
      },
      recentExerciseIds: ["bb-back-squat", "bb-bench"],
    });
    const preferredBench = draft.days
      .flatMap((day) => day.slots)
      .find((slot) => slot.exerciseId === "bb-bench");
    expect(preferredBench).toBeDefined();
    const machineSlots = draft.days
      .flatMap((day) => day.slots)
      .filter((slot) => EXERCISE_BY_ID[slot.exerciseId]?.stationProfile === "machine");
    for (const slot of machineSlots) {
      expect(EXERCISE_BY_ID[slot.exerciseId].brand).toBeUndefined();
    }
    validateAssembledProgram(draft);
  });

  it("honors omissions by swapping to another pattern match", () => {
    const draft = assembleProgramDraft({
      intake: {
        days: 3,
        goal: "general",
        style: "classic",
        equipment: "full_gym",
        omissions: ["bb-rdl"],
      },
      recentExerciseIds: [],
      catalog: EXERCISE_BY_ID,
    });
    const omittedSlots = draft.days
      .flatMap((day) => day.slots)
      .filter((slot) => slot.exerciseId === "bb-rdl");
    expect(omittedSlots).toHaveLength(0);
    validateAssembledProgram(draft);
  });

  it("keeps every slot on a valid catalog exercise and matching pattern", () => {
    const draft = assembleProgramDraft({
      intake: {
        days: 5,
        goal: "strength",
        style: "fluid",
        equipment: "full_gym",
        emphasis: "upper",
      },
      recentExerciseIds: ["lat-pulldown"],
    });
    for (const day of draft.days) {
      for (const slot of day.slots) {
        const def = EXERCISE_BY_ID[slot.exerciseId];
        expect(def, slot.exerciseId).toBeDefined();
        expect(slot.pattern, slot.exerciseId).toBe(def.pattern);
      }
    }
  });
});
