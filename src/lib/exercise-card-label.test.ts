import { describe, expect, it } from "vitest";
import { EXERCISE_BY_ID, type ExerciseDef } from "./strength/coefficients";
import { exerciseCardLabel, exerciseCardLabelText, stripEquipmentPrefix } from "./exercise-card-label";

function variant(
  baseId: string,
  brand: string | null,
  machineType: ExerciseDef["machineType"],
): ExerciseDef {
  const base = EXERCISE_BY_ID[baseId];
  return {
    ...base,
    id: `${baseId}__test`,
    baseExerciseId: baseId,
    brand: brand ?? undefined,
    machineType,
    name: base.name,
  };
}

describe("stripEquipmentPrefix", () => {
  it("removes a leading equipment word", () => {
    expect(stripEquipmentPrefix("Dumbbell Lateral Raise")).toBe("Lateral Raise");
    expect(stripEquipmentPrefix("Barbell Incline Bench")).toBe("Incline Bench");
  });
});

describe("exerciseCardLabel", () => {
  it("renders machine brand and type on separate lines", () => {
    expect(exerciseCardLabel(variant("hack-squat", "Cybex", "plate_loaded"))).toEqual({
      name: "Hack Squat",
      secondary: "Cybex",
      tertiary: "Plate-loaded",
    });
  });

  it("renders free-weight equipment without a third line", () => {
    expect(exerciseCardLabel(EXERCISE_BY_ID["db-lateral-raise"])).toEqual({
      name: "Lateral Raise",
      secondary: "Dumbbell",
    });
  });

  it("renders barbell equipment and a station label", () => {
    expect(exerciseCardLabel(variant("bb-incline-bench", "Hoist", "bench"))).toEqual({
      name: "Incline Bench",
      secondary: "Barbell",
      tertiary: "Hoist Bench",
    });
  });

  it("keeps unresolved templates on the movement name only", () => {
    expect(exerciseCardLabel(EXERCISE_BY_ID["hack-squat"])).toEqual({ name: "Hack Squat" });
    expect(exerciseCardLabel(EXERCISE_BY_ID["lat-pulldown"])).toEqual({
      name: "Lat Pulldown (Cable)",
    });
  });

  it("joins lines for aria labels", () => {
    expect(
      exerciseCardLabelText(exerciseCardLabel(variant("hack-squat", "Cybex", "plate_loaded"))),
    ).toBe("Hack Squat Cybex Plate-loaded");
  });
});
