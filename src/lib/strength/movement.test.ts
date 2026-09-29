import { describe, expect, it } from "vitest";
import { EXERCISE_BY_ID, type ExerciseDef } from "./coefficients";
import {
  comparisonKey,
  comparisonScope,
  movementId,
  movementMemberIds,
  rollsUp,
} from "./movement";

function variant(base: ExerciseDef, id: string, extra: Partial<ExerciseDef> = {}): ExerciseDef {
  const rest = { ...base };
  delete rest.stationProfile;
  delete rest.machineTemplate;
  return {
    ...rest,
    id,
    baseExerciseId: base.id,
    isReference: false,
    ...extra,
  };
}

const flexIncline = variant(EXERCISE_BY_ID["bb-incline-bench"], "bb-incline-bench__flex-fitness__bench", {
  brand: "Flex Fitness",
  machineType: "bench",
  name: "Barbell Incline Bench - Flex Fitness (bench)",
});
const nautilusIncline = variant(EXERCISE_BY_ID["bb-incline-bench"], "bb-incline-bench__nautilus__bench", {
  brand: "Nautilus",
  machineType: "bench",
  name: "Barbell Incline Bench - Nautilus (bench)",
});
const ownedIncline = variant(
  EXERCISE_BY_ID["bb-incline-bench"],
  "bb-incline-bench__flex-fitness__bench__user-2",
  { brand: "Flex Fitness", machineType: "bench" },
);
const hoistPulldown = variant(EXERCISE_BY_ID["lat-pulldown"], "lat-pulldown__hoist__selectorized", {
  brand: "Hoist",
  machineType: "selectorized",
  needsCalibration: true,
  name: "Lat Pulldown (Cable) - Hoist (stack)",
});
const nautilusPulldown = variant(EXERCISE_BY_ID["lat-pulldown"], "lat-pulldown__nautilus__selectorized", {
  brand: "Nautilus",
  machineType: "selectorized",
  needsCalibration: true,
  name: "Lat Pulldown (Cable) - Nautilus (stack)",
});
const hammerPress = variant(EXERCISE_BY_ID["machine-chest-press"], "machine-chest-press__hammer-strength__plate_loaded", {
  brand: "Hammer Strength",
  machineType: "plate_loaded",
  needsCalibration: true,
});
const cybexPress = variant(EXERCISE_BY_ID["machine-chest-press"], "machine-chest-press__cybex__plate_loaded", {
  brand: "Cybex",
  machineType: "plate_loaded",
  needsCalibration: true,
});

const customCable: ExerciseDef = {
  id: "custom-cable-row-ab12",
  name: "My cable row",
  pattern: "horizontal_pull",
  equipment: "cable",
  brand: "Hoist",
  machineType: "selectorized",
  coefficient: 1,
  needsCalibration: true,
  increment: 10,
  isReference: false,
};

const catalog: Record<string, ExerciseDef> = {
  ...EXERCISE_BY_ID,
  [flexIncline.id]: flexIncline,
  [nautilusIncline.id]: nautilusIncline,
  [ownedIncline.id]: ownedIncline,
  [hoistPulldown.id]: hoistPulldown,
  [nautilusPulldown.id]: nautilusPulldown,
  [hammerPress.id]: hammerPress,
  [cybexPress.id]: cybexPress,
  [customCable.id]: customCable,
};

function scope(exerciseId: string, equipmentInstanceId: string | null = null) {
  return comparisonScope(
    { exercise_id: exerciseId, equipment_instance_id: equipmentInstanceId },
    catalog,
  );
}

describe("movement comparison scope", () => {
  it("rolls ordinary-lb profiles up and keeps machine and cable exact", () => {
    expect(rollsUp(EXERCISE_BY_ID["bb-incline-bench"])).toBe(true);
    expect(rollsUp(EXERCISE_BY_ID["bb-bench"])).toBe(true);
    expect(rollsUp(EXERCISE_BY_ID["bb-back-squat"])).toBe(true);
    expect(rollsUp(EXERCISE_BY_ID["bb-deadlift"])).toBe(true);
    expect(rollsUp(EXERCISE_BY_ID["bb-row"])).toBe(true);
    expect(rollsUp(EXERCISE_BY_ID["db-incline-bench"])).toBe(true);
    expect(rollsUp(EXERCISE_BY_ID["weighted-dip"])).toBe(true);
    expect(rollsUp(EXERCISE_BY_ID["lat-pulldown"])).toBe(false);
    expect(rollsUp(EXERCISE_BY_ID["machine-chest-press"])).toBe(false);
    expect(rollsUp(customCable)).toBe(false);
  });

  it("shares one movement key across incline-bench stations, including a leftover template row", () => {
    const flex = scope(flexIncline.id, "pad-flex");
    const nautilus = scope(nautilusIncline.id, "pad-nautilus");
    const leftover = scope("bb-incline-bench");
    const owned = scope(ownedIncline.id);
    expect(flex).toEqual({ kind: "movement", movementId: "bb-incline-bench" });
    expect(comparisonKey(flex)).toBe(comparisonKey(nautilus));
    expect(comparisonKey(flex)).toBe(comparisonKey(leftover));
    expect(comparisonKey(flex)).toBe(comparisonKey(owned));
    expect(comparisonKey(flex)).toBe("movement:bb-incline-bench");
  });

  it("does not rewrite the logged exercise id when the story rolls up", () => {
    const set = {
      exercise_id: flexIncline.id,
      equipment_instance_id: null as string | null,
    };
    expect(comparisonScope(set, catalog).kind).toBe("movement");
    expect(set.exercise_id).toBe("bb-incline-bench__flex-fitness__bench");
  });

  it("keeps two chest-press machines and two pulldown cables on separate keys", () => {
    const hammer = scope(hammerPress.id);
    const cybex = scope(cybexPress.id);
    expect(hammer.kind).toBe("station");
    expect(comparisonKey(hammer)).not.toBe(comparisonKey(cybex));
    expect(comparisonKey(scope(hoistPulldown.id))).not.toBe(comparisonKey(scope(nautilusPulldown.id)));
    expect(comparisonKey(scope("lat-pulldown"))).not.toBe(comparisonKey(scope(nautilusPulldown.id)));
  });

  it("still splits equipment instances for stations that do not roll up", () => {
    const a = scope(hammerPress.id, "pad-a");
    const b = scope(hammerPress.id, "pad-b");
    expect(comparisonKey(a)).not.toBe(comparisonKey(b));
  });

  it("does not merge dumbbell incline into barbell incline, and customs stay alone", () => {
    expect(comparisonKey(scope("db-incline-bench"))).toBe("movement:db-incline-bench");
    expect(comparisonKey(scope("db-incline-bench"))).not.toBe(comparisonKey(scope("bb-incline-bench")));
    expect(comparisonKey(scope(customCable.id))).toBe(`station:${customCable.id}:`);
    expect(movementId(customCable)).toBe(customCable.id);
  });

  it("lists every incline station for the master and only the logged cable for a cable", () => {
    expect(movementMemberIds("bb-incline-bench", catalog)).toEqual([
      "bb-incline-bench",
      flexIncline.id,
      ownedIncline.id,
      nautilusIncline.id,
    ]);
    expect(movementMemberIds(flexIncline.id, catalog)).toEqual(
      movementMemberIds("bb-incline-bench", catalog),
    );
    expect(movementMemberIds(nautilusPulldown.id, catalog)).toEqual([nautilusPulldown.id]);
    expect(movementMemberIds("db-bench", catalog)).toEqual(["db-bench"]);
    expect(movementMemberIds("missing", catalog)).toEqual(["missing"]);
  });

  it("does not merge an unknown id into a family", () => {
    expect(scope("missing").kind).toBe("station");
    expect(comparisonKey(scope("missing"))).toBe("station:missing:");
  });
});
