import { describe, expect, it } from "vitest";
import {
  clientActionsFromParts,
  latestConfirmCallId,
  openExerciseReviewHref,
  parseClientAction,
} from "./client-tools";

describe("agent client tools", () => {
  it("builds exercise review hrefs with equipment", () => {
    expect(openExerciseReviewHref({ exerciseId: "bb-bench", equipmentInstanceId: null }))
      .toBe("/history/bb-bench?equipment=none");
    expect(openExerciseReviewHref({ exerciseId: "leg-press", equipmentInstanceId: "cybex" }))
      .toBe("/history/leg-press?equipment=cybex");
  });

  it("parses navigate and confirm actions from tool results", () => {
    expect(parseClientAction({
      type: "tool-result",
      id: "c1",
      name: "openCoachCheckIn",
      result: { action: "navigate", href: "/analytics/coach" },
    })).toEqual({
      type: "navigate",
      href: "/analytics/coach",
      tool: "openCoachCheckIn",
    });
    expect(parseClientAction({
      type: "tool-result",
      id: "c2",
      name: "startNextWorkout",
      result: { action: "confirm" },
    })).toEqual({
      type: "confirm",
      tool: "startNextWorkout",
    });
  });

  it("collects client actions and finds the latest confirm call", () => {
    const parts = [
      { type: "tool-call", id: "old", name: "startNextWorkout", args: {} },
      { type: "tool-result", id: "old", name: "startNextWorkout", result: { action: "confirm" } },
      { type: "tool-call", id: "new", name: "startNextWorkout", args: {} },
    ] as const;
    expect(clientActionsFromParts([parts[1]])).toEqual([{ type: "confirm", tool: "startNextWorkout" }]);
    expect(latestConfirmCallId([{ parts: [...parts] }])).toBe("new");
  });
});
