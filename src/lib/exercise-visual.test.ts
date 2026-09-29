import { describe, expect, it } from "vitest";
import { exerciseVisualKey, exerciseVisualSrc, EXERCISE_VISUAL_SRC } from "./exercise-visual";

describe("exerciseVisualSrc", () => {
  it("maps seeded catalog ids, not names", () => {
    expect(exerciseVisualSrc("bb-bench")).toBe("/exercises/bb-bench.jpg");
    expect(exerciseVisualSrc("bb-back-squat")).toBe(EXERCISE_VISUAL_SRC["bb-back-squat"]);
    expect(exerciseVisualSrc("lat-pulldown")).toBe("/exercises/lat-pulldown.jpg");
    expect(exerciseVisualSrc("hack-squat")).toBe("/exercises/hack-squat.jpg");
    expect(exerciseVisualSrc("Barbell Bench Press")).toBeNull();
  });

  it("lets station variants inherit the template asset", () => {
    expect(exerciseVisualSrc("bb-bench__flex-fitness__bench")).toBe("/exercises/bb-bench.jpg");
    expect(exerciseVisualSrc("lat-pulldown__nautilus__selectorized__user-1")).toBe(
      "/exercises/lat-pulldown.jpg",
    );
    expect(exerciseVisualKey("owned-id", "hack-squat")).toBe("hack-squat");
    expect(exerciseVisualSrc("owned-id", "hack-squat")).toBe("/exercises/hack-squat.jpg");
  });

  it("falls back when the identity is custom, unknown, or missing", () => {
    expect(exerciseVisualSrc("custom-my-lift-abc12")).toBeNull();
    expect(exerciseVisualSrc("custom-bb-bench-xyz")).toBeNull();
    expect(exerciseVisualSrc("bb-row")).toBeNull();
    expect(exerciseVisualSrc("")).toBeNull();
    expect(exerciseVisualSrc(null)).toBeNull();
    expect(exerciseVisualSrc(undefined)).toBeNull();
  });
});
