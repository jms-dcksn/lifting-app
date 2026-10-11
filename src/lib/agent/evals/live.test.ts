import { describe, expect, it } from "vitest";
import { LIVE_EXAMPLES, LIVE_FOLLOW_UP_EXAMPLES, gradeFoundExercise, gradeRightTool, gradeToolCount,
  outputFromTurn, reviewJudgeRequest, scoreNoul } from "./live";

const preferred = { selectionStatus: "preferred_history", exerciseId: "bb-back-squat", equipmentInstanceId: null,
  recommendation: { reason: "only_match_with_logged_sets" }, matches: [
    { id: "bb-back-squat", equipmentInstanceId: null, key: "movement:bb-back-squat", history: { loggedSetCount: 1 } },
    { id: "bb-front-squat", equipmentInstanceId: null, key: "movement:bb-front-squat", history: { loggedSetCount: 0 } },
  ] };
const expected = { outcome: "policy" as const, requiredMatchIds: ["bb-back-squat", "bb-front-squat"] };

describe("live references and judges", () => {
  it("keeps independent contract outcomes without time-sensitive numeric gold", () => {
    expect(LIVE_EXAMPLES).toHaveLength(11);
    expect(LIVE_FOLLOW_UP_EXAMPLES).toHaveLength(4);
    const full = LIVE_EXAMPLES.find((example) => example.id === "easy-romanian-deadlift")!;
    const alias = LIVE_EXAMPLES.find((example) => example.id === "alias-rdl")!;
    expect(full.reference).toBe(alias.reference);
    for (const example of LIVE_EXAMPLES) expect(example.reference).not.toMatch(/\d+\s*lb/);
  });
  it("passes complete transparent-selection evidence, not a hidden initial hit", () => {
    expect(gradeFoundExercise({ expected, toolResults: [{ name: "exerciseReview", result: preferred }] }).score).toBe(1);
    expect(gradeFoundExercise({ expected: { outcome: "resolved", exerciseId: "bb-back-squat" }, toolResults: [
      { name: "exerciseReview", result: preferred }, { name: "exerciseReview", result: { exerciseId: "bb-front-squat" } },
    ] }).score).toBe(0);
    expect(gradeFoundExercise({ expected, toolResults: [{ name: "exerciseReview", result: { ...preferred, matches: preferred.matches.slice(0, 1) } }] }).score).toBe(0);
    expect(gradeFoundExercise({ expected, toolResults: [{ name: "exerciseReview", result: { ...preferred,
      matches: preferred.matches.map((match) => ({ ...match, history: { loggedSetCount: 1 } })) } }] }).score).toBe(0);
  });
  it("passes honest clarification with additional legitimate matches", () => {
    expect(gradeFoundExercise({ expected: { outcome: "disambiguate", matchIds: ["bb-back-squat", "bb-front-squat"] },
      toolResults: [{ name: "exerciseReview", result: { needsDisambiguation: true, matches: [...preferred.matches, { id: "hack-squat" }] } }] }).score).toBe(1);
  });
  it("gives the judge current evidence, disjoint criteria and no mandatory invented trend", () => {
    const request = reviewJudgeRequest("squat trend", "policy", { answer: "No recent comparison.", toolCalls: [],
      toolResults: [{ name: "exerciseReview", result: preferred }] });
    expect(request.state.toolEvidence).toHaveLength(1);
    expect(request.questions.selection_correctness.instructions).toContain("LAST exerciseReview");
    expect(request.questions.evidence_support.instructions).toContain("Deload exclusion");
    expect(request.questions.availability_handling.instructions).toContain("Two older eligible points");
    for (const question of Object.values(request.questions)) expect(question.criteria.true).not.toEqual(question.criteria.false);
  });
  it("keeps procedural diagnostics and the 0.8 threshold", () => {
    expect(gradeRightTool({ expectedTools: ["exerciseReview"], toolCalls: [] }).score).toBe(0);
    expect(gradeToolCount(3, 3).score).toBe(1);
    expect(gradeToolCount(4, 3).score).toBe(0);
    expect(scoreNoul(0.8).score).toBe(1);
    expect(scoreNoul(0.79).score).toBe(0);
    expect(scoreNoul(NaN).score).toBe(0);
  });
  it("exports only the final assistant answer with the complete turn trajectory", () => {
    const output = outputFromTurn([
      { role: "assistant", parts: [{ type: "text", text: "Checking..." }, { type: "tool-call", name: "exerciseReview", id: "c", args: { name: "squat" } }] },
      { role: "tool", parts: [{ type: "tool-result", name: "exerciseReview", id: "c", result: preferred }] },
      { role: "assistant", parts: [{ type: "text", text: "Back squat; did you mean that?\nSource: Exercise review" }] },
    ]);
    expect(output.answer).not.toContain("Checking");
    expect(output.toolCalls).toHaveLength(1);
    expect(output.toolResults).toHaveLength(1);
  });
});
