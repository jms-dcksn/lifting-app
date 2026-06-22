import { describe, it, expect } from "vitest";
import { dbExerciseToDef, mergeCatalog, type DbExerciseRow } from "./catalog";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const row = (over: Partial<DbExerciseRow> = {}): DbExerciseRow => ({
  id: "v1",
  name: "Machine Chest Press — Cybex (plate)",
  pattern: "horizontal_press",
  equipment: "machine",
  brand: "Cybex",
  machine_type: "plate_loaded",
  base_exercise_id: "machine-chest-press",
  coefficient: 0.9,
  is_reference: false,
  needs_calibration: true,
  increment: 10,
  ...over,
});

describe("dbExerciseToDef", () => {
  it("maps a variant row to an ExerciseDef", () => {
    const def = dbExerciseToDef(row());
    expect(def.id).toBe("v1");
    expect(def.equipment).toBe("machine");
    expect(def.brand).toBe("Cybex");
    expect(def.machineType).toBe("plate_loaded");
    expect(def.baseExerciseId).toBe("machine-chest-press");
    expect(def.needsCalibration).toBe(true);
    expect(def.machineTemplate).toBeUndefined(); // DB defs are concrete, never templates
  });

  it("maps a fully-custom row (no base, no brand)", () => {
    const def = dbExerciseToDef(
      row({ id: "c1", base_exercise_id: null, brand: null, machine_type: null, equipment: "barbell", needs_calibration: false }),
    );
    expect(def.baseExerciseId).toBeUndefined();
    expect(def.brand).toBeUndefined();
    expect(def.machineType).toBeUndefined();
    expect(def.equipment).toBe("barbell");
  });
});

describe("mergeCatalog", () => {
  it("includes every seeded template", () => {
    const map = mergeCatalog([]);
    expect(map["machine-chest-press"]).toEqual(EXERCISE_BY_ID["machine-chest-press"]);
  });

  it("adds DB rows alongside seeded templates", () => {
    const map = mergeCatalog([row()]);
    expect(map["v1"].brand).toBe("Cybex");
    expect(map["machine-chest-press"]).toBeDefined();
  });

  it("lets seeded templates win an id collision", () => {
    const map = mergeCatalog([row({ id: "machine-chest-press", brand: "Hacked" })]);
    expect(map["machine-chest-press"].brand).toBeUndefined();
  });
});
