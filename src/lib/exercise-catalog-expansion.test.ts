import { describe, expect, it } from "vitest";
import { EXERCISES, EXERCISE_BY_ID, PATTERN_LABEL, needsStation, resolveStationFields } from "./strength/coefficients";
import { EXERCISE_VARIATIONS } from "./strength/exercise-variations";
import { MACHINE_MODELS, normalizeStationModel } from "./machine-models";
import { matchesExercise } from "./exercise-search";
import { variantId, ownedVariantId, variantShortLabel } from "./exercise-id";
import { comparisonKey, comparisonScope } from "./strength/movement";
import { dbExerciseToDef, mergeCatalog, type DbExerciseRow } from "./catalog";
import { effectiveLoad, recomputeStat } from "./strength/recompute";
import { estimatePatternStrength, recommend } from "./strength/recommend";
import { sessionTarget } from "./strength/progression";
import { formatExerciseSet, validExerciseWeight } from "./strength/load-mode";

describe("expanded catalog contracts", () => {
  it("includes glute additions for owners with no saved exercise rows", () => {
    const catalog = mergeCatalog([]);
    expect(catalog["cable-glute-kickback"]).toMatchObject({ pattern: "hip_extension", equipment: "cable", stationProfile: "cable", needsCalibration: true });
    expect(catalog["smith-hip-thrust"]).toMatchObject({ pattern: "hip_thrust", allowedMachineTypes: ["plate_loaded"] });
    expect(catalog["machine-lunge"]).toMatchObject({ pattern: "lunge", stationProfile: "machine", needsCalibration: true });
    expect(recommend(catalog["bb-hip-thrust"], 10, 2, catalog, [
      { exerciseId: "cable-glute-kickback", currentE1rm: 50, confidenceN: 3 },
    ])).toBeNull();
  });

  it("keeps every exercise unique, classified, and loggable through the right station flow", () => {
    expect(new Set(EXERCISES.map(e => e.id)).size).toBe(EXERCISES.length);
    expect(EXERCISE_VARIATIONS.length).toBeGreaterThanOrEqual(90);
    for (const def of EXERCISE_VARIATIONS) {
      expect(def.name.trim(), def.id).not.toBe("");
      expect(PATTERN_LABEL[def.pattern], def.id).toBeDefined();
      expect(def.coefficient, def.id).toBeGreaterThan(0);
      expect(def.increment, def.id).toBeGreaterThan(0);
      expect(needsStation(def), def.id).toBe(def.stationProfile !== "none");
      expect(def.needsCalibration ?? false, def.id).toBe(["machine", "cable"].includes(def.stationProfile!));
    }
  });

  it("keeps isolation patterns from predicting compound lifts", () => {
    expect(EXERCISE_BY_ID["db-flat-fly"].pattern).toBe("chest_fly");
    const stats = [{ exerciseId: "db-flat-fly", currentE1rm: 50, confidenceN: 3 }];
    expect(recommend(EXERCISE_BY_ID["db-bench"], 10, 2, EXERCISE_BY_ID, stats)).toBeNull();
    for (const pattern of ["chest_fly", "hip_adduction", "hip_extension", "ankle_dorsiflexion", "core_rotation"] as const) {
      expect(EXERCISES.filter(e => e.pattern === pattern && e.isReference)).toHaveLength(1);
    }
  });

  it("only offers real, compatible model-to-movement links", () => {
    expect(new Set(MACHINE_MODELS.map(m => m.id)).size).toBe(MACHINE_MODELS.length);
    expect(new Set(MACHINE_MODELS.map(m => m.brand)).size).toBe(4);
    for (const model of MACHINE_MODELS) {
      expect(normalizeStationModel(model.name)).toBe(model.id);
      for (const id of model.exercises) {
        const def = EXERCISE_BY_ID[id];
        expect(needsStation(def), `${model.id}: ${id}`).toBe(true);
        expect(() => resolveStationFields(def, { brand: model.brand, machineType: model.machineType })).not.toThrow();
      }
    }
    expect(MACHINE_MODELS.find(m => m.id === "hs-t-bar")?.exercises).toEqual(["machine-standing-t-bar-row"]);
  });

  it.each([
    ["db-spider-curl", "spider db curls"], ["db-incline-fly", "incline db flyes"],
    ["bb-row", "bent-over barbell row"], ["cable-curl", "cable curl with bar"],
    ["cable-mid-fly", "cable crossover"], ["machine-row", "Hammer Strength D.Y. row"],
    ["machine-chest-press", "Cybex Eagle NX"], ["machine-deadlift", "Hoist RPL 5356"],
    ["cable-glute-kickback", "cable glute kickbacks"], ["cable-glute-kickback", "ankle strap kickback"],
    ["cable-glute-kickback", "cable hip extension"], ["smith-hip-thrust", "smith hip thrusts"],
    ["machine-lunge", "Hammer Strength squat lunge"], ["glute-drive", "Life Fitness glute bridge"],
    ["glute-drive", "Hammer Strength glute drive"], ["glute-drive", "hip thrust machine"],
    ["machine-glute-kickback", "Cybex Eagle NX glute"], ["machine-glute-kickback", "Cybex Prestige glute"],
    ["machine-glute-kickback", "Hammer Strength hip and glute"],
    ["seated-hip-abduction", "Hammer Strength hip abductor"], ["seated-hip-abduction", "Cybex hip abduction"],
  ])("finds %s using %s", (id, query) => expect(matchesExercise(EXERCISE_BY_ID[id], query)).toBe(true));

  it("preserves legacy IDs and isolates model records after hydration", () => {
    const legacy = variantId("machine-chest-press", "Life Fitness", "selectorized");
    expect(legacy).toBe("machine-chest-press__life-fitness__selectorized");
    const row: DbExerciseRow = {
      id: legacy, name: "Legacy press", pattern: "horizontal_press", equipment: "machine", brand: "Life Fitness",
      machine_type: "selectorized", base_exercise_id: "machine-chest-press", coefficient: 1,
      increment: 5, is_reference: false, needs_calibration: true,
    };
    const one = { ...row, id: variantId(row.base_exercise_id!, row.brand, "selectorized", "lf-insignia-chest"), station_model: "lf-insignia-chest" };
    const two = { ...row, id: variantId(row.base_exercise_id!, row.brand, "selectorized", "lf-insignia-dual-chest"), station_model: "lf-insignia-dual-chest" };
    const catalog = mergeCatalog([row, one, two]);
    const key = (id: string) => comparisonKey(comparisonScope({ exercise_id: id, equipment_instance_id: null }, catalog));
    expect(new Set([key(legacy), key(one.id), key(two.id)]).size).toBe(3);
    expect(catalog[one.id].stationModel).toBe(one.station_model);
    expect(catalog[one.id].stationProfile).toBeUndefined();
    expect(variantShortLabel(one.brand, "selectorized", one.station_model)).toContain("Insignia Chest Press");
    expect(ownedVariantId("machine-chest-press", row.brand, "selectorized", "owner", one.station_model)).toBe(`${one.id}__owner`);
  });

  it("normalizes models without lossy slug collisions", () => {
    expect(normalizeStationModel("  Custom   Model  ")).toBe("custom model");
    expect(normalizeStationModel("  ")).toBeNull();
    expect(() => normalizeStationModel("x".repeat(101))).toThrow();
    const id = (model: string) => variantId("machine-row", "Hoist", "plate_loaded", model);
    expect(id("A/B")).not.toBe(id("A B"));
    expect(id("A/B")).toBe(id(" a/b "));
  });
});

describe("rep-only and assisted load handling", () => {
  const prescription = { repMin: 8, repMax: 12, targetRir: 2 };

  it.each(["ab-wheel-rollout", "hanging-leg-raise", "glute-ham-raise"])("tracks %s without inventing load or e1RM", id => {
    const def = EXERCISE_BY_ID[id];
    expect(validExerciseWeight(def, 0)).toBe(true);
    expect(validExerciseWeight(def, 10)).toBe(false);
    expect(effectiveLoad(def, 0, 180)).toBeNull();
    expect(recomputeStat(def, [{ weight: 0, reps: 12, rir: 2 }], 180).currentE1rm).toBeNull();
    expect(recommend(def, 10, 2, EXERCISE_BY_ID, [])).toBeNull();
    expect(estimatePatternStrength(def.pattern, EXERCISE_BY_ID, [{ exerciseId: id, currentE1rm: 100, confidenceN: 1 }])).toBeNull();
    expect(sessionTarget(def, prescription, null, EXERCISE_BY_ID, [], null)).toMatchObject({ weight: 0, targetReps: 8 });
    expect(sessionTarget(def, prescription, { weight: 0, reps: 12 }, EXERCISE_BY_ID, [], 180)).toMatchObject({ weight: 0, targetReps: 12 });
    expect(formatExerciseSet(def, 0, 12)).toBe("12 reps");
  });

  it("hydrates assisted variants and advances by reducing assistance, stopping at zero", () => {
    const def = dbExerciseToDef({ id: "assisted-station", name: "Assisted", equipment: "bodyweight", pattern: "vertical_pull",
      brand: "Life Fitness", machine_type: "selectorized", base_exercise_id: "assisted-pullup", coefficient: 1.3,
      increment: 5, is_reference: false, needs_calibration: true });
    expect(def.loadMode).toBe("assisted");
    expect(validExerciseWeight(def, -30)).toBe(true);
    expect(validExerciseWeight(def, 5)).toBe(false);
    expect(effectiveLoad(def, -30, 180)).toBe(150);
    expect(effectiveLoad(def, -30, null)).toBeNull();
    expect(sessionTarget(def, prescription, { weight: -30, reps: 12 }, EXERCISE_BY_ID, [], 180)?.weight).toBe(-25);
    expect(sessionTarget(def, prescription, { weight: 0, reps: 12 }, EXERCISE_BY_ID, [], 180)?.weight).toBe(0);
    expect(formatExerciseSet(def, -30, 10)).toBe("30 lb assistance × 10");
  });

  it("rejects impossible loading modes for Smith and assist stations", () => {
    expect(() => resolveStationFields(EXERCISE_BY_ID["smith-squat"], { brand: "Cybex", machineType: "selectorized" })).toThrow();
    expect(() => resolveStationFields(EXERCISE_BY_ID["assisted-dip"], { brand: "Life Fitness", machineType: "plate_loaded" })).toThrow();
  });
});
