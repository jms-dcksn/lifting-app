import { describe, expect, it } from "vitest";
import {
  openCoachCheckIn,
  openExerciseReview,
  openProgram,
  startNextWorkoutRequest,
} from "./navigation";

describe("agent navigation tools", () => {
  it("returns the same hrefs the UI uses", () => {
    expect(openCoachCheckIn()).toEqual({
      source: "openCoachCheckIn",
      action: "navigate",
      href: "/analytics/coach",
    });
    expect(openExerciseReview({ exerciseId: "bb-bench", equipmentInstanceId: null })).toEqual({
      source: "openExerciseReview",
      action: "navigate",
      href: "/history/bb-bench?equipment=none",
      exerciseId: "bb-bench",
      equipmentInstanceId: null,
    });
    expect(openProgram("prog-1")).toEqual({
      source: "openProgram",
      action: "navigate",
      href: "/program/prog-1",
      programId: "prog-1",
    });
    expect(startNextWorkoutRequest()).toMatchObject({
      source: "startNextWorkout",
      action: "confirm",
    });
  });
});
