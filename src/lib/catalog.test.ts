import { describe, it, expect } from "vitest";
import { dbExerciseToDef, mergeCatalog, type DbExerciseRow } from "./catalog";
import { isLoggableExercise } from "./station";
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

  // History policy: leftover flat cable/barbell set_log rows keep the seeded
  // template id. Catalog merge must never replace that seed with a variant row.
  it("leaves leftover cable and barbell template ids as the seeded row", () => {
    const map = mergeCatalog([
      row({
        id: "lat-pulldown",
        name: "Hacked pulldown",
        pattern: "vertical_pull",
        equipment: "cable",
        brand: "Nautilus",
        machine_type: "selectorized",
        base_exercise_id: "lat-pulldown",
        needs_calibration: false,
      }),
      row({
        id: "bb-incline-bench",
        name: "Hacked incline",
        pattern: "horizontal_press",
        equipment: "barbell",
        brand: "Flex Fitness",
        machine_type: "bench",
        base_exercise_id: "bb-incline-bench",
        needs_calibration: true,
      }),
    ]);
    expect(map["lat-pulldown"]).toEqual(EXERCISE_BY_ID["lat-pulldown"]);
    expect(map["bb-incline-bench"]).toEqual(EXERCISE_BY_ID["bb-incline-bench"]);
  });

  it("does not put stationProfile on a DB variant, so the variant stays loggable", () => {
    const cable = dbExerciseToDef(row({
      id: "lat-pulldown__nautilus__selectorized",
      name: "Lat Pulldown (Cable) — Nautilus (stack)",
      pattern: "vertical_pull",
      equipment: "cable",
      brand: "Nautilus",
      machine_type: "selectorized",
      base_exercise_id: "lat-pulldown",
      coefficient: 1,
      needs_calibration: true,
      increment: 10,
    }));
    expect(cable.stationProfile).toBeUndefined();
    expect(cable.needsCalibration).toBe(true);
    expect(isLoggableExercise(cable)).toBe(true);
    const bench = dbExerciseToDef(row({
      id: "bb-incline-bench__flex-fitness__bench",
      name: "Barbell Incline Bench — Flex Fitness (bench)",
      equipment: "barbell",
      brand: "Flex Fitness",
      machine_type: "bench",
      base_exercise_id: "bb-incline-bench",
      coefficient: 0.82,
      needs_calibration: false,
      increment: 5,
    }));
    expect(bench.stationProfile).toBeUndefined();
    expect(bench.needsCalibration).toBe(false);
    expect(isLoggableExercise(bench)).toBe(true);
  });
});
