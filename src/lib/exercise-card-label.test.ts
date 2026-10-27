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
  it("keeps machine category distinct from brand and loading type", () => {
    expect(exerciseCardLabel(variant("hack-squat", "Cybex", "plate_loaded"))).toEqual({
      name: "Hack Squat",
      equipment: "Machine",
      secondary: "Cybex",
      tertiary: "Plate-loaded",
    });
  });

  it("renders free-weight equipment without a third line", () => {
    expect(exerciseCardLabel(EXERCISE_BY_ID["db-lateral-raise"])).toEqual({
      name: "Lateral Raise",
      equipment: "Dumbbell",
    });
  });

  it("renders barbell equipment and a station label", () => {
    expect(exerciseCardLabel(variant("bb-incline-bench", "Hoist", "bench"))).toEqual({
      name: "Incline Bench",
      equipment: "Barbell",
      station: "Bench",
      secondary: "Hoist",
    });
  });

  it("labels unresolved templates without inventing brand or loading type", () => {
    expect(exerciseCardLabel(EXERCISE_BY_ID["hack-squat"])).toEqual({ name: "Hack Squat", equipment: "Machine" });
    expect(exerciseCardLabel(EXERCISE_BY_ID["lat-pulldown"])).toEqual({
      name: "Lat Pulldown (Cable)",
      equipment: "Cable",
    });
  });

  it("distinguishes the same-brand machine and cable kickbacks despite a shared stack tag", () => {
    const machine = variant("machine-glute-kickback", "Life Fitness", "selectorized");
    const cable = variant("cable-glute-kickback", "Life Fitness", "selectorized");
    expect(exerciseCardLabel(machine)).toMatchObject({ equipment: "Machine", secondary: "Life Fitness", tertiary: "Weight stack" });
    expect(exerciseCardLabel(cable)).toMatchObject({ equipment: "Cable", secondary: "Life Fitness" });
    expect(exerciseCardLabel(cable).tertiary).toBeUndefined();
  });

  it("retains machine loading details without a brand", () => {
    expect(exerciseCardLabel(variant("machine-glute-kickback", null, "selectorized"))).toEqual({
      name: "Glute Kickback / Hip Extension", equipment: "Machine", tertiary: "Weight stack",
    });
  });

  it.each(["bench", "rack", "platform"] as const)("shows %s context without requiring a brand", station => {
    expect(exerciseCardLabel(variant("bb-back-squat", null, station))).toMatchObject({
      equipment: "Barbell", station: station[0].toUpperCase() + station.slice(1),
    });
  });

  it("preserves bodyweight and custom exercise categories independently of names", () => {
    const custom: ExerciseDef = { ...EXERCISE_BY_ID["db-lateral-raise"], id: "custom", name: "My shoulder exercise" };
    expect(exerciseCardLabel(custom)).toEqual({ name: "My shoulder exercise", equipment: "Dumbbell" });
    expect(exerciseCardLabel(EXERCISE_BY_ID["weighted-pullup"])).toMatchObject({ equipment: "Bodyweight" });
  });

  it("identifies assisted bodyweight exercises by their machine station", () => {
    expect(exerciseCardLabel(variant("assisted-pullup", "Life Fitness", "selectorized"))).toMatchObject({
      equipment: "Machine", station: "Assisted", tertiary: "Weight stack",
    });
  });

  it("uses custom catalog bases and preserves model information on variants", () => {
    const base: ExerciseDef = { ...EXERCISE_BY_ID["machine-glute-kickback"], id: "custom-base", name: "My glute exercise" };
    const def = { ...base, id: "variant", name: "Stored instance name", baseExerciseId: base.id,
      stationProfile: undefined, brand: "Cybex", stationModel: "cybex-eagle-glute", machineType: "selectorized" as const };
    expect(exerciseCardLabel(def, { [base.id]: base })).toEqual({
      name: "My glute exercise", equipment: "Machine", secondary: "Cybex · Eagle NX Glute", tertiary: "Weight stack",
    });
    expect(exerciseCardLabel({ ...def, baseExerciseId: "missing" })).toMatchObject({
      name: "Stored instance name", equipment: "Machine",
    });
  });

  it("joins lines for aria labels", () => {
    expect(
      exerciseCardLabelText(exerciseCardLabel(variant("hack-squat", "Cybex", "plate_loaded"))),
    ).toBe("Hack Squat Machine Cybex Plate-loaded");
  });
});
