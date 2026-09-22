import { describe, expect, it } from "vitest";
import {
  PIN_CAP,
  buildBoardLifts,
  canPinExercise,
  defaultCompoundIds,
  isExercisePinned,
  nextExtraPosition,
  sessionRecordChips,
  sessionRecordSummary,
  signedDelta,
  visibleBoardIds,
  weekRecordChips,
} from "./board";
import { EXERCISE_BY_ID, type ExerciseDef } from "./strength/coefficients";
import type { ExerciseRecords } from "./strength/records";

function linked(base: ExerciseDef, id: string, extra: Partial<ExerciseDef> = {}): ExerciseDef {
  return { ...base, id, baseExerciseId: base.id, isReference: false, ...extra };
}

const familyCatalog: Record<string, ExerciseDef> = {
  ...EXERCISE_BY_ID,
  "bb-bench__flex-fitness__bench": linked(EXERCISE_BY_ID["bb-bench"], "bb-bench__flex-fitness__bench", {
    brand: "Flex Fitness", machineType: "bench", name: "Barbell Bench Press — Flex Fitness (bench)",
  }),
  "bb-bench__nautilus__bench": linked(EXERCISE_BY_ID["bb-bench"], "bb-bench__nautilus__bench", {
    brand: "Nautilus", machineType: "bench", name: "Barbell Bench Press — Nautilus (bench)",
  }),
  "lat-pulldown__nautilus__selectorized": linked(EXERCISE_BY_ID["lat-pulldown"], "lat-pulldown__nautilus__selectorized", {
    brand: "Nautilus", machineType: "selectorized", name: "Lat Pulldown (Cable) — Nautilus (stack)",
  }),
};

function summary(
  exerciseId: string,
  lastPerformedAt: string,
  extra: { currentE1rm?: number | null; delta?: number | null; e1rmSeries?: number[]; equipmentInstanceId?: string | null } = {},
) {
  return {
    exerciseId,
    lastPerformedAt,
    equipmentInstanceId: extra.equipmentInstanceId ?? null,
    currentE1rm: extra.currentE1rm ?? 180,
    delta: extra.delta ?? null,
    e1rmSeries: extra.e1rmSeries ?? [extra.currentE1rm ?? 180],
  };
}

const defaults = defaultCompoundIds(EXERCISE_BY_ID);

describe("board compounds", () => {
  it("uses catalog reference lifts for the six key patterns", () => {
    expect(defaults).toEqual([
      "bb-back-squat",
      "bb-deadlift",
      "bb-bench",
      "bb-ohp",
      "bb-row",
      "lat-pulldown",
    ]);
  });

  it("hides untrained defaults and unpinned compounds, then appends extras", () => {
    const pins = [
      { exerciseId: "bb-bench", position: 0 },
      { exerciseId: "bb-hip-thrust", position: 1 },
    ];
    expect(visibleBoardIds(pins, defaults, ["bb-back-squat", "bb-bench", "bb-hip-thrust"])).toEqual([
      "bb-back-squat",
      "bb-hip-thrust",
    ]);
  });

  it("treats a trained station variant as history for its default tile", () => {
    expect(visibleBoardIds([], defaults, ["bb-bench__flex-fitness__bench"], familyCatalog)).toEqual([
      "bb-bench",
    ]);
    expect(visibleBoardIds(
      [{ exerciseId: "bb-bench", position: 0 }],
      defaults,
      ["bb-bench__flex-fitness__bench"],
      familyCatalog,
    )).toEqual([]);
  });

  it("treats default rows as hidden and extras as pins", () => {
    const pins = [{ exerciseId: "bb-bench", position: 0 }];
    expect(isExercisePinned(pins, defaults, "bb-bench")).toBe(false);
    expect(isExercisePinned(pins, defaults, "bb-deadlift")).toBe(true);
    expect(isExercisePinned([], defaults, "bb-hip-thrust")).toBe(false);
  });

  it("refuses a pin that would exceed the cap", () => {
    const history = [...defaults, "bb-hip-thrust", "db-split-squat", "bb-curl"];
    const pins = [
      { exerciseId: "bb-hip-thrust", position: 1 },
      { exerciseId: "db-split-squat", position: 2 },
    ];
    expect(visibleBoardIds(pins, defaults, history)).toHaveLength(PIN_CAP);
    expect(canPinExercise(pins, defaults, history, "bb-curl")).toEqual({
      ok: false,
      error: "Pin cap is 8. Unpin something first.",
    });
    expect(canPinExercise(pins, defaults, history, "bb-hip-thrust")).toEqual({ ok: true });
  });

  it("counts a family-trained default toward the pin cap", () => {
    const history = [
      "bb-back-squat",
      "bb-deadlift",
      "bb-bench__flex-fitness__bench",
      "bb-ohp",
      "bb-row",
      "lat-pulldown",
      "bb-hip-thrust",
      "db-split-squat",
    ];
    const pins = [
      { exerciseId: "bb-hip-thrust", position: 1 },
      { exerciseId: "db-split-squat", position: 2 },
    ];
    expect(visibleBoardIds(pins, defaults, history, familyCatalog)).toHaveLength(PIN_CAP);
    expect(canPinExercise(pins, defaults, history, "bb-curl", familyCatalog)).toEqual({
      ok: false,
      error: "Pin cap is 8. Unpin something first.",
    });
  });

  it("assigns extras the next position", () => {
    expect(nextExtraPosition([{ exerciseId: "bb-hip-thrust", position: 3 }], defaults)).toBe(4);
  });
});

describe("board copy", () => {
  it("labels a zero delta as held", () => {
    expect(signedDelta(0)).toBe("held");
    expect(signedDelta(12.4)).toBe("+12");
    expect(signedDelta(-3.2)).toBe("-3");
  });

  it("builds week chips and last-session headlines from canonical groups", () => {
    const group: ExerciseRecords = {
      key: '["bb-bench",null]',
      exerciseId: "bb-bench",
      equipmentInstanceId: null,
      name: "Barbell Bench Press",
      isBodyweight: false,
      repRecords: [{ setId: "s1", slotId: "slot", load: 225, weight: 225, reps: 8, improvement: 1 }],
      e1rmRecord: { setId: "s1", slotId: "slot", value: 275, improvement: 5 },
      topWeightRecord: { setId: "s1", slotId: "slot", load: 315, weight: 315, improvement: 10 },
    };
    expect(sessionRecordChips("w1", [group])).toEqual([
      {
        sessionId: "w1",
        exerciseId: "bb-bench",
        name: "Barbell Bench Press",
        label: "Bench 225 × 8 +1",
      },
      {
        sessionId: "w1",
        exerciseId: "bb-bench",
        name: "Barbell Bench Press",
        label: "Bench 315 top +10",
      },
      {
        sessionId: "w1",
        exerciseId: "bb-bench",
        name: "Barbell Bench Press",
        label: "Bench 275 e1RM +5",
      },
    ]);
    expect(weekRecordChips([{ sessionId: "w1", groups: [group] }])).toEqual(
      sessionRecordChips("w1", [group]),
    );
    expect(sessionRecordSummary([group])).toBe("1 rep PR · 1 e1RM record · 1 top-weight record");
    expect(sessionRecordSummary([{ ...group, e1rmRecord: null, topWeightRecord: null }])).toBe("1 PR");
  });
});

describe("buildBoardLifts", () => {
  it("carries the latest-instance equipment onto the tile", () => {
    const lifts = buildBoardLifts({
      catalog: EXERCISE_BY_ID,
      pins: [],
      summaries: [{
        exerciseId: "bb-bench",
        lastPerformedAt: "2026-09-16T12:00:00Z",
        equipmentInstanceId: "pad-1",
        currentE1rm: 150,
        delta: 5,
        e1rmSeries: [145, 150],
      }],
      weekExerciseIds: [],
    });
    expect(lifts.find((lift) => lift.exerciseId === "bb-bench")).toMatchObject({
      reviewExerciseId: "bb-bench",
      equipmentInstanceId: "pad-1",
      currentE1rm: 150,
    });
  });

  it("keeps default tile keys and short names while numbers and href follow family-latest", () => {
    const lifts = buildBoardLifts({
      catalog: familyCatalog,
      pins: [],
      summaries: [
        summary("bb-bench", "2026-08-01T12:00:00Z", { currentE1rm: 300, e1rmSeries: [280, 300] }),
        summary("bb-bench__nautilus__bench", "2026-09-02T12:00:00Z", { currentE1rm: 210, delta: 5, e1rmSeries: [205, 210] }),
        summary("bb-bench__flex-fitness__bench", "2026-09-10T12:00:00Z", {
          currentE1rm: 185,
          delta: -8,
          e1rmSeries: [193, 185],
          equipmentInstanceId: "pad-flex",
        }),
      ],
      weekExerciseIds: ["bb-bench__flex-fitness__bench"],
    });
    expect(lifts.find((lift) => lift.exerciseId === "bb-bench")).toMatchObject({
      exerciseId: "bb-bench",
      reviewExerciseId: "bb-bench__flex-fitness__bench",
      shortName: "Bench",
      name: "Barbell Bench Press",
      currentE1rm: 185,
      delta: -8,
      e1rmSeries: [193, 185],
      equipmentInstanceId: "pad-flex",
      recentRecord: true,
    });
  });

  it("does not merge sibling family PR numbers onto the default tile", () => {
    const lifts = buildBoardLifts({
      catalog: familyCatalog,
      pins: [],
      summaries: [
        summary("lat-pulldown", "2026-07-01T12:00:00Z", { currentE1rm: 220, e1rmSeries: [200, 220] }),
        summary("lat-pulldown__nautilus__selectorized", "2026-09-16T12:00:00Z", {
          currentE1rm: 140,
          delta: null,
          e1rmSeries: [140],
        }),
      ],
      weekExerciseIds: ["lat-pulldown"],
    });
    expect(lifts.find((lift) => lift.exerciseId === "lat-pulldown")).toMatchObject({
      reviewExerciseId: "lat-pulldown__nautilus__selectorized",
      currentE1rm: 140,
      delta: null,
      e1rmSeries: [140],
      recentRecord: false,
    });
  });

  it("keeps an extra pin on a specific variant exact-id", () => {
    const lifts = buildBoardLifts({
      catalog: familyCatalog,
      pins: [{ exerciseId: "bb-bench__nautilus__bench", position: 1 }],
      summaries: [
        summary("bb-bench__nautilus__bench", "2026-09-02T12:00:00Z", { currentE1rm: 210, e1rmSeries: [210] }),
        summary("bb-bench__flex-fitness__bench", "2026-09-10T12:00:00Z", { currentE1rm: 185, e1rmSeries: [185] }),
      ],
      weekExerciseIds: ["bb-bench__flex-fitness__bench"],
    });
    expect(lifts.find((lift) => lift.exerciseId === "bb-bench")).toMatchObject({
      reviewExerciseId: "bb-bench__flex-fitness__bench",
      currentE1rm: 185,
    });
    expect(lifts.find((lift) => lift.exerciseId === "bb-bench__nautilus__bench")).toMatchObject({
      reviewExerciseId: "bb-bench__nautilus__bench",
      currentE1rm: 210,
      recentRecord: false,
    });
  });
});
