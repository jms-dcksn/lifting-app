import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "./cases";
import { goldUsesFixtureNumbers, gradeGrounding, inventedAnswer } from "./grade";
import { TOOL_FIXTURES } from "./fixtures";

describe("agent evals", () => {
  it("labels about 20 questions with expected tools and citations", () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(20);
    for (const item of EVAL_CASES) {
      expect(item.question.length).toBeGreaterThan(0);
      expect(Array.isArray(item.expectedTools)).toBe(true);
    }
  });

  it("grades gold answers against fixture numbers", () => {
    for (const item of EVAL_CASES) {
      expect(goldUsesFixtureNumbers(item), item.id).toEqual({ pass: true, reasons: [] });
    }
  });

  it("fails invented numbers", () => {
    const week = EVAL_CASES.find((item) => item.id === "week-how");
    expect(week).toBeTruthy();
    const result = inventedAnswer(week!);
    expect(result.pass).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("citation"))).toBe(true);
  });

  it("keeps fixture next-workout target on sessionTarget", () => {
    const target = TOOL_FIXTURES.nextWorkout.workout.slots[0]?.target;
    expect(target?.weight).toBe(230);
    expect(target?.targetReps).toBe(6);
    expect(target?.source).toBe("progression");
  });

  it("rejects a write tool even when citations match", () => {
    const result = gradeGrounding({
      expectedTools: [],
      usedTools: ["saveProgram"],
      expectedCitations: [],
      answer: "Done.",
    });
    expect(result.pass).toBe(false);
  });
});
