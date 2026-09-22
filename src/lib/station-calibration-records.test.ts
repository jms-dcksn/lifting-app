import { describe, expect, it } from "vitest";
import { exerciseFamilyIds } from "./exercise-history";
import { isLoggableExercise } from "./station";
import { EXERCISE_BY_ID, needsStation, type ExerciseDef } from "./strength/coefficients";
import { computeE1rm, roundToIncrement, weightForTarget } from "./strength/e1rm";
import { sessionTarget, startingWeight } from "./strength/progression";
import { recommend, type ExerciseStat } from "./strength/recommend";
import {
  eligibleRecordSet,
  recordCounts,
  recordScope,
  workoutRecords,
  type RecordSet,
} from "./strength/records";

// Slice 5 verification. Family browse groups leftover flat rows with later variants;
// records, calibration, and progression stay exact exercise_id. No rewrite of leftover
// set_log rows — those ids remain themselves.

function variant(baseId: string, id: string, extra: Partial<ExerciseDef> = {}): ExerciseDef {
  const base = EXERCISE_BY_ID[baseId];
  const rest = { ...base };
  delete rest.stationProfile;
  delete rest.machineTemplate;
  delete rest.isReference;
  return {
    ...rest,
    id,
    name: extra.name ?? `${base.name} — ${extra.brand ?? "Brand"} (${extra.machineType ?? "tag"})`,
    baseExerciseId: base.id,
    isReference: false,
    needsCalibration: extra.needsCalibration ?? !!base.needsCalibration,
    ...extra,
  };
}

const nautilusPulldown = variant("lat-pulldown", "lat-pulldown__nautilus__selectorized", {
  brand: "Nautilus",
  machineType: "selectorized",
  needsCalibration: true,
});
const hoistPulldown = variant("lat-pulldown", "lat-pulldown__hoist__selectorized", {
  brand: "Hoist",
  machineType: "selectorized",
  needsCalibration: true,
});
const flexIncline = variant("bb-incline-bench", "bb-incline-bench__flex-fitness__bench", {
  brand: "Flex Fitness",
  machineType: "bench",
  needsCalibration: false,
});
const rogueSquat = variant("bb-back-squat", "bb-back-squat__rogue__rack", {
  brand: "Rogue",
  machineType: "rack",
  needsCalibration: false,
});
const eleikoDeadlift = variant("bb-deadlift", "bb-deadlift__eleiko__platform", {
  brand: "Eleiko",
  machineType: "platform",
  needsCalibration: false,
});
const hammerChest = variant("machine-chest-press", "machine-chest-press__hammer-strength__plate_loaded", {
  brand: "Hammer Strength",
  machineType: "plate_loaded",
  needsCalibration: true,
});

const catalog: Record<string, ExerciseDef> = {
  ...EXERCISE_BY_ID,
  [nautilusPulldown.id]: nautilusPulldown,
  [hoistPulldown.id]: hoistPulldown,
  [flexIncline.id]: flexIncline,
  [rogueSquat.id]: rogueSquat,
  [eleikoDeadlift.id]: eleikoDeadlift,
  [hammerChest.id]: hammerChest,
};

const start = "2026-09-12T10:00:00Z";
const slot = { repMin: 8, repMax: 12, targetRir: 2 };

function stat(exerciseId: string, extra: Partial<ExerciseStat> = {}): ExerciseStat {
  return { exerciseId, currentE1rm: 0, personalCoefficient: null, confidenceN: 0, ...extra };
}

function set(overrides: Partial<RecordSet> = {}): RecordSet {
  return {
    id: "prior",
    user_id: "user",
    session_id: "previous",
    exercise_id: "lat-pulldown",
    equipment_instance_id: null,
    program_slot_id: "old-slot",
    weight: 140,
    reps: 8,
    rir: 1,
    e1rm: computeE1rm(140, 8, 1),
    is_warmup: false,
    created_at: "2026-09-10T10:05:00Z",
    workout_session: { performed_at: "2026-09-10T10:00:00Z", finished_at: "2026-09-10T11:00:00Z" },
    ...overrides,
  };
}

function current(overrides: Partial<RecordSet> = {}) {
  return set({
    id: "current",
    session_id: "active",
    program_slot_id: "slot",
    reps: 10,
    created_at: "2026-09-12T10:05:00Z",
    workout_session: { performed_at: start, finished_at: null },
    ...overrides,
  });
}

const detect = (sets: RecordSet[]) => workoutRecords(sets, "user", "active", start, catalog);

describe("station calibration matrix", () => {
  it.each([
    [nautilusPulldown, "calibrate"],
    [hoistPulldown, "calibrate"],
    [hammerChest, "calibrate"],
    [flexIncline, "low"],
    [rogueSquat, "low"],
    [eleikoDeadlift, "low"],
  ] as const)("$id first session is $1", (def, confidence) => {
    const patternStat = def.pattern === "vertical_pull"
      ? stat("weighted-pullup", { currentE1rm: 200 })
      : def.pattern === "squat"
        ? stat("bb-front-squat", { currentE1rm: 250 })
        : def.pattern === "hinge"
          ? stat("bb-rdl", { currentE1rm: 300 })
          : stat("bb-bench", { currentE1rm: 200 });
    const rec = recommend(def, 8, 2, catalog, [patternStat])!;
    expect(rec.confidence).toBe(confidence);
    expect(def.needsCalibration).toBe(confidence === "calibrate");
    const naive = roundToIncrement(
      weightForTarget(rec.predictedE1rm, 8, 2),
      def.increment,
    );
    if (confidence === "calibrate") {
      expect(rec.suggestedWeight).toBe(roundToIncrement(naive * 0.85, def.increment));
    } else {
      expect(rec.suggestedWeight).toBe(naive);
    }
  });

  it("calibrates a cable variant even when leftover template stats exist", () => {
    const leftover = stat("lat-pulldown", { currentE1rm: 140, confidenceN: 6 });
    const rec = recommend(nautilusPulldown, 8, 2, catalog, [leftover])!;
    expect(rec.confidence).toBe("calibrate");
    expect(rec.exerciseId).toBe(nautilusPulldown.id);
    const naive = roundToIncrement(weightForTarget(140, 8, 2), nautilusPulldown.increment);
    expect(rec.suggestedWeight).toBe(roundToIncrement(naive * 0.85, nautilusPulldown.increment));
  });

  it("starts a barbell station from pattern × coefficient, not leftover progression", () => {
    const leftover = stat("bb-incline-bench", { currentE1rm: 164, confidenceN: 6 });
    const startLoad = startingWeight(flexIncline, 8, 2, catalog, [leftover], null)!;
    expect(startLoad.confidence).toBe("low");
    expect(startLoad.weight).toBe(
      roundToIncrement(weightForTarget(164, 8, 2), flexIncline.increment),
    );
    const target = sessionTarget(flexIncline, slot, null, catalog, [leftover], null)!;
    expect(target.source).toBe("recommendation");
    expect(target.confidence).toBe("low");
    expect(target.last).toBeUndefined();
  });
});

describe("station records stay exact-id", () => {
  it("keeps leftover template PRs on the template id", () => {
    const groups = detect([set(), current({ exercise_id: "lat-pulldown" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].exerciseId).toBe("lat-pulldown");
    expect(groups[0].repRecords[0]).toMatchObject({ load: 140, reps: 10, improvement: 2 });
    expect(eligibleRecordSet(set(), EXERCISE_BY_ID["lat-pulldown"])).not.toBeNull();
    expect(eligibleRecordSet(set({ exercise_id: "bb-incline-bench", weight: 185 }), EXERCISE_BY_ID["bb-incline-bench"]))
      .not.toBeNull();
    expect(eligibleRecordSet(set({ exercise_id: "machine-chest-press" }), EXERCISE_BY_ID["machine-chest-press"]))
      .toBeNull();
  });

  it("does not merge leftover template PRs into a new family variant", () => {
    expect(detect([
      set({ exercise_id: "lat-pulldown" }),
      current({ exercise_id: nautilusPulldown.id, weight: 160, reps: 12 }),
    ])).toEqual([]);
    expect(detect([
      set({ exercise_id: "bb-incline-bench", weight: 185 }),
      current({ exercise_id: flexIncline.id, weight: 205, reps: 6 }),
    ])).toEqual([]);
    expect(recordScope(set({ exercise_id: "lat-pulldown" }))).not.toBe(
      recordScope(set({ exercise_id: nautilusPulldown.id })),
    );
  });

  it("does not merge PRs across brands in the same family", () => {
    expect(detect([
      set({ exercise_id: nautilusPulldown.id, weight: 120 }),
      current({ exercise_id: hoistPulldown.id, weight: 150, reps: 12 }),
    ])).toEqual([]);
    const own = detect([
      set({ exercise_id: nautilusPulldown.id, weight: 120 }),
      current({ exercise_id: nautilusPulldown.id, weight: 120, reps: 11 }),
    ]);
    expect(own).toHaveLength(1);
    expect(own[0].exerciseId).toBe(nautilusPulldown.id);
    expect(recordCounts(own).exercises).toBe(1);
  });

  it("treats the first variant session as a quiet first exposure", () => {
    expect(detect([current({ exercise_id: nautilusPulldown.id, weight: 100 })])).toEqual([]);
    expect(detect([current({ exercise_id: flexIncline.id, weight: 185 })])).toEqual([]);
  });
});

describe("family browse of leftover template + variant", () => {
  it("groups leftover lat-pulldown with later cable brands without sharing record scope", () => {
    const family = exerciseFamilyIds("lat-pulldown", catalog);
    expect(family.sort()).toEqual([
      "lat-pulldown",
      hoistPulldown.id,
      nautilusPulldown.id,
    ].sort());
    expect(needsStation(EXERCISE_BY_ID["lat-pulldown"])).toBe(true);
    expect(isLoggableExercise(EXERCISE_BY_ID["lat-pulldown"])).toBe(false);
    expect(isLoggableExercise(nautilusPulldown)).toBe(true);
    expect(isLoggableExercise(flexIncline)).toBe(true);
    expect(recordScope(set({ exercise_id: "lat-pulldown" }))).toBe(JSON.stringify(["lat-pulldown", null]));
    expect(recordScope(set({ exercise_id: nautilusPulldown.id }))).toBe(
      JSON.stringify([nautilusPulldown.id, null]),
    );
  });
});
