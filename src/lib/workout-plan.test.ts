import { describe, expect, it } from "vitest";
import { readWorkoutPlan, workoutPlanKey } from "./workout-plan";
import { EXERCISE_BY_ID, needsStation } from "./strength/coefficients";

const key = workoutPlanKey("user", "program", "day", 0);
const slots = [{ id: "slot" }];
const exercise = Object.values(EXERCISE_BY_ID).find((d) => !needsStation(d))!;
const template = Object.values(EXERCISE_BY_ID).find((d) => needsStation(d))!;
const cable = EXERCISE_BY_ID["lat-pulldown"];
const incline = EXERCISE_BY_ID["bb-incline-bench"];
const raw = (choices: unknown, draftKey = key) => JSON.stringify({ key: draftKey, choices });

describe("next workout draft isolation", () => {
  it("keeps concrete selections, including same-exercise selections", () => {
    expect(readWorkoutPlan(raw({ slot: exercise.id }), key, slots, EXERCISE_BY_ID)).toEqual({ slot: exercise.id });
  });
  it.each([
    workoutPlanKey("other", "program", "day", 0),
    workoutPlanKey("user", "other", "day", 0),
    workoutPlanKey("user", "program", "other", 0),
    workoutPlanKey("user", "program", "day", 1),
  ])("never carries choices into a different user or workout: %s", (otherKey) => {
    expect(readWorkoutPlan(raw({ slot: exercise.id }), otherKey, slots, EXERCISE_BY_ID)).toEqual({});
  });
  it("discards deleted slots, unknown exercises, and unresolved stations", () => {
    expect(readWorkoutPlan(raw({ deleted: exercise.id, slot: template.id }), key, slots, EXERCISE_BY_ID)).toEqual({});
    expect(readWorkoutPlan(raw({ slot: cable.id }), key, slots, EXERCISE_BY_ID)).toEqual({});
    expect(readWorkoutPlan(raw({ slot: incline.id }), key, slots, EXERCISE_BY_ID)).toEqual({});
    expect(readWorkoutPlan(raw({ slot: "missing" }), key, slots, EXERCISE_BY_ID)).toEqual({});
  });
  it.each([undefined, "bad json", "null", "[]", raw(null), raw({ slot: 3 })])("handles malformed draft %s", (value) => {
    expect(readWorkoutPlan(value, key, slots, EXERCISE_BY_ID)).toEqual({});
  });
});
