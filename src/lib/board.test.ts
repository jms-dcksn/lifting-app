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
import { EXERCISE_BY_ID } from "./strength/coefficients";
import type { ExerciseRecords } from "./strength/records";

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
        label: "Bench 275 e1RM +5",
      },
    ]);
    expect(weekRecordChips([{ sessionId: "w1", groups: [group] }])).toEqual(
      sessionRecordChips("w1", [group]),
    );
    expect(sessionRecordSummary([group])).toBe("2 PRs");
  });
});

describe("buildBoardLifts", () => {
  it("carries the latest-instance equipment onto the tile", () => {
    const lifts = buildBoardLifts({
      catalog: EXERCISE_BY_ID,
      pins: [],
      summaries: [{
        exerciseId: "bb-bench",
        equipmentInstanceId: "pad-1",
        currentE1rm: 150,
        delta: 5,
        e1rmSeries: [145, 150],
      }],
      weekExerciseIds: [],
    });
    expect(lifts.find((lift) => lift.exerciseId === "bb-bench")).toMatchObject({
      equipmentInstanceId: "pad-1",
      currentE1rm: 150,
    });
  });
});
