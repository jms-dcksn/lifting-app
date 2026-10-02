import { describe, expect, it } from "vitest";
import { EXERCISES } from "@/lib/strength/coefficients";
import { resolveExerciseIdentity } from "../tools/exercise-review";
import {
  INCLINE_E1RM_REFERENCE,
  LIVE_EXAMPLES,
  REFERENCE_MATCH_INSTRUCTIONS,
  gradeFoundExercise,
  gradeRightTool,
  gradeToolCount,
  outputFromTurn,
  scoreNoul,
} from "./live";

const catalog = Object.fromEntries(EXERCISES.map((def) => [def.id, def]));

describe("live eval examples", () => {
  it("keeps a handwritten incline-bench reference", () => {
    expect(INCLINE_E1RM_REFERENCE).toContain("incline barbell bench press");
    expect(INCLINE_E1RM_REFERENCE).toContain("184.96 lb (2026-09-29)");
    expect(INCLINE_E1RM_REFERENCE).toContain("179.21 → 184.48 → 190.29 → 190.29 → 184.96");
    expect(REFERENCE_MATCH_INSTRUCTIONS.ignore).toContain("Ignore exact pounds");
  });

  it("locks each user phrase to the seed-catalog resolver", () => {
    expect(LIVE_EXAMPLES).toHaveLength(11);
    for (const example of LIVE_EXAMPLES) {
      expect(resolveExerciseIdentity(catalog, { name: example.name }), example.name)
        .toEqual(example.seedResolution);
    }
  });

  it("gives resolved examples a trend reference and hard examples a choice list", () => {
    const resolved = LIVE_EXAMPLES.filter((example) => example.review.outcome === "resolved");
    expect(resolved.map((example) => example.id)).toEqual([
      "incline-bench",
      "easy-barbell-back-squat",
      "easy-leg-press",
      "easy-romanian-deadlift",
      "medium-back-squat",
      "medium-bench-press",
      "medium-deadlift",
    ]);
    for (const example of resolved) {
      expect(example.reference).toContain("Last recorded E1RM");
      expect(example.reference).toContain("Recent e1RM points");
    }
    const hard = LIVE_EXAMPLES.find((example) => example.id === "hard-squat");
    expect(hard?.reference).toContain("Barbell Back Squat");
    expect(hard?.reference).toContain("Barbell Front Squat");
    expect(LIVE_EXAMPLES.find((example) => example.id === "miss-rdl")?.reference).toContain("rdl");
  });
});

describe("live eval graders", () => {
  it("passes when the expected tool was called", () => {
    expect(gradeRightTool({
      expectedTools: ["exerciseReview"],
      toolCalls: [{ name: "exerciseReview", args: { name: "incline bench press" } }],
    }).score).toBe(1);
    expect(gradeRightTool({
      expectedTools: ["exerciseReview"],
      toolCalls: [{ name: "weeklyCoach", args: {} }],
    }).comment).toContain("missing exerciseReview");
  });

  it("scores the exerciseReview result against the expected exercise", () => {
    expect(gradeFoundExercise({
      expected: { outcome: "resolved", exerciseId: "bb-back-squat" },
      toolResults: [{ name: "exerciseReview", result: { exerciseId: "bb-back-squat" } }],
    }).score).toBe(1);
    expect(gradeFoundExercise({
      expected: { outcome: "resolved", exerciseId: "bb-incline-bench" },
      toolResults: [{ name: "exerciseReview", result: { exerciseId: "bb-bench" } }],
    }).score).toBe(0);
    expect(gradeFoundExercise({
      expected: { outcome: "disambiguate", matchIds: ["bb-back-squat", "bb-front-squat"] },
      toolResults: [{
        name: "exerciseReview",
        result: JSON.stringify({
          needsDisambiguation: true,
          matches: [
            { id: "bb-front-squat", name: "Barbell Front Squat" },
            { id: "bb-back-squat", name: "Barbell Back Squat" },
          ],
        }),
      }],
    }).score).toBe(1);
    expect(gradeFoundExercise({
      expected: { outcome: "miss", name: "rdl" },
      toolResults: [{
        name: "exerciseReview",
        result: { source: "exerciseReview", error: "No exercise matched “rdl”." },
      }],
    }).score).toBe(1);
    expect(gradeFoundExercise({
      expected: { outcome: "miss", name: "rdl" },
      toolResults: [{ name: "exerciseReview", result: { exerciseId: "bb-rdl" } }],
    }).comment).toContain("bb-rdl");
  });

  it("uses the last exerciseReview result when the model retries", () => {
    expect(gradeFoundExercise({
      expected: { outcome: "resolved", exerciseId: "bb-bench" },
      toolResults: [
        { name: "exerciseReview", result: { error: "No exercise matched “bench”." } },
        { name: "exerciseReview", result: { exerciseId: "bb-bench" } },
      ],
    }).score).toBe(1);
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

  it("reads tool calls, tool results, and the assistant answer off a turn", () => {
    const output = outputFromTurn([
      {
        role: "assistant",
        parts: [{ type: "tool-call", id: "c1", name: "exerciseReview", args: { name: "incline bench press" } }],
      },
      {
        role: "tool",
        parts: [{ type: "tool-result", id: "c1", name: "exerciseReview", result: { exerciseId: "bb-incline-bench" } }],
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "Up to 185 lb.\nSource: Exercise review" }],
      },
    ]);
    expect(output.toolCalls).toEqual([
      { name: "exerciseReview", args: { name: "incline bench press" } },
    ]);
    expect(output.toolResults).toEqual([
      { name: "exerciseReview", result: { exerciseId: "bb-incline-bench" } },
    ]);
    expect(output.answer).toContain("185 lb");
  });
});
