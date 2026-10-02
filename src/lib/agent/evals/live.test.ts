import { describe, expect, it } from "vitest";
import {
  INCLINE_E1RM_REFERENCE,
  REFERENCE_MATCH_INSTRUCTIONS,
  gradeRightTool,
  gradeToolCount,
  outputFromTurn,
  scoreNoul,
} from "./live";

describe("live eval graders", () => {
  it("keeps a handwritten incline-bench reference", () => {
    expect(INCLINE_E1RM_REFERENCE).toContain("incline barbell bench press");
    expect(INCLINE_E1RM_REFERENCE).toContain("184.96 lb (2026-09-29)");
    expect(INCLINE_E1RM_REFERENCE).toContain("179.21 → 184.48 → 190.29 → 190.29 → 184.96");
    expect(REFERENCE_MATCH_INSTRUCTIONS.ignore).toContain("Ignore exact pounds");
  });

  it("passes only when exerciseReview targets incline bench", () => {
    expect(gradeRightTool({
      expectedTools: ["exerciseReview"],
      toolCalls: [{ name: "exerciseReview", args: { name: "incline bench press" } }],
    }).score).toBe(1);
    expect(gradeRightTool({
      expectedTools: ["exerciseReview"],
      toolCalls: [{ name: "exerciseReview", args: { exerciseId: "bb-bench", name: "incline bench" } }],
    }).score).toBe(0);
    expect(gradeRightTool({
      expectedTools: ["exerciseReview"],
      toolCalls: [{ name: "weeklyCoach", args: {} }],
    }).comment).toContain("missing exerciseReview");
  });

  it("caps the tool-call count at 3", () => {
    expect(gradeToolCount(1, 3).score).toBe(1);
    expect(gradeToolCount(3, 3).score).toBe(1);
    expect(gradeToolCount(4, 3)).toEqual({ score: 0, comment: "4 tool calls (max 3)" });
  });

  it("classifies a Jev noul against the reference threshold", () => {
    expect(scoreNoul(0.8).score).toBe(1);
    expect(scoreNoul(0.79).comment).toContain("incorrect");
  });

  it("reads tool calls and the assistant answer off a turn", () => {
    const output = outputFromTurn([
      {
        role: "assistant",
        parts: [{ type: "tool-call", id: "c1", name: "exerciseReview", args: { name: "incline bench press" } }],
      },
      {
        role: "tool",
        parts: [{ type: "tool-result", id: "c1", name: "exerciseReview", result: {} }],
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "Up to 185 lb.\nSource: Exercise review" }],
      },
    ]);
    expect(output.toolCalls).toEqual([
      { name: "exerciseReview", args: { name: "incline bench press" } },
    ]);
    expect(output.answer).toContain("185 lb");
  });
});
