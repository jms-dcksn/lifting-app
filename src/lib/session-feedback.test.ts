import { describe, expect, it } from "vitest";
import {
  normalizeJointPain,
  normalizeSessionNote,
  SESSION_NOTE_MAX_LENGTH,
  validateReadiness,
} from "./session-feedback";

describe("session feedback validation", () => {
  it("accepts the complete readiness scale", () => {
    expect([1, 2, 3, 4, 5].map(validateReadiness)).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects readiness outside whole-number 1–5 values", () => {
    for (const value of [0, 2.5, 6]) expect(() => validateReadiness(value)).toThrow();
  });

  it("normalizes optional notes without silently truncating them", () => {
    expect(normalizeSessionNote("  Felt strong.  ")).toBe("Felt strong.");
    expect(normalizeSessionNote("   ")).toBeNull();
    expect(() => normalizeSessionNote("x".repeat(SESSION_NOTE_MAX_LENGTH + 1))).toThrow();
  });

  it("accepts only the documented joint-pain values", () => {
    expect(normalizeJointPain(null)).toBeNull();
    expect(normalizeJointPain("significant")).toBe("significant");
    expect(() => normalizeJointPain("severe")).toThrow();
  });
});
