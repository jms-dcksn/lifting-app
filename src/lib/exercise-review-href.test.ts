import { describe, expect, it } from "vitest";
import { equipmentQueryValue, exerciseReviewHref } from "./exercise-review-href";

describe("exerciseReviewHref", () => {
  it("encodes equipment=none when the identity has no instance", () => {
    expect(equipmentQueryValue(null)).toBe("none");
    expect(exerciseReviewHref({ exerciseId: "bb-bench", equipmentInstanceId: null }))
      .toBe("/history/bb-bench?equipment=none");
  });

  it("passes the instance id and keeps month when both are known", () => {
    expect(exerciseReviewHref({
      exerciseId: "leg-press",
      equipmentInstanceId: "machine-1",
      month: "2026-09",
    })).toBe("/history/leg-press?month=2026-09&equipment=machine-1");
  });

  it("omits equipment when the caller does not know the identity", () => {
    expect(exerciseReviewHref({ exerciseId: "bb-bench" })).toBe("/history/bb-bench");
  });
});
