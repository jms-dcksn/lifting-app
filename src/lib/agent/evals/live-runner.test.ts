import { describe, expect, it, vi } from "vitest";
import { Client } from "langsmith";
import { gradeScenario, planLiveSync, selectLiveExamples, syncLiveExamples, validateEvalTarget } from "./live-experiment";
import { LIVE_EXAMPLES, LIVE_FOLLOW_UP_EXAMPLES, LIVE_POLICY_VERSION } from "./live";
import { askJev } from "./jev";
vi.mock("./jev", () => ({ askJev: vi.fn(), jevModelId: () => "fixture-judge" }));

describe("live scenario selection", () => {
  const rows = [...LIVE_EXAMPLES, ...LIVE_FOLLOW_UP_EXAMPLES].map((example) => ({
    id: `row-${example.id}`, inputs: { id: example.id, question: example.question,
      followUps: example.followUps?.map((turn) => turn.question) },
    outputs: { policyVersion: LIVE_POLICY_VERSION, review: example.review, followUps: example.followUps },
  }));
  it("defaults to the 11 first turns and leaves unrelated manual rows alone", () => {
    const manual = { id: "manual", inputs: { id: "manual-test" } };
    expect(selectLiveExamples([...rows, manual]).map((row) => row.inputs?.id)).toEqual(LIVE_EXAMPLES.map((example) => example.id));
    expect(selectLiveExamples(rows, "follow-ups")).toHaveLength(4);
    expect(selectLiveExamples(rows, "all")).toHaveLength(15);
    expect(() => selectLiveExamples(rows, "typo")).toThrow("EVAL_SCENARIOS");
  });
  it("identifies stale references and supplies the explicit migration commands", () => {
    const legacy = rows.slice(0, 11).map((row) => ({ ...row, outputs: undefined }));
    expect(() => selectLiveExamples(legacy)).toThrow("incline-bench");
    expect(() => selectLiveExamples(legacy)).toThrow("npm run eval:agent:sync -- --adopt");
    expect(() => selectLiveExamples(legacy)).toThrow("EVAL_DATASET_VERSION");
    expect(selectLiveExamples(rows.slice(0, 11))).toHaveLength(11);
    const edited = rows.map((row) => ({ ...row, inputs: { ...row.inputs, question: "Dataset-edited question" } }));
    expect(selectLiveExamples(edited)[0]?.inputs?.question).toBe("Dataset-edited question");
  });
  it("refuses missing or duplicated selected cases and incomplete follow-up references", () => {
    expect(() => selectLiveExamples(rows.slice(1))).toThrow("Missing scenario incline-bench");
    expect(() => selectLiveExamples([...rows, rows[0]!])).toThrow("Multiple rows");
    const incomplete = rows.map((row) => ({ ...row, outputs: { ...row.outputs, followUps: undefined } }));
    expect(selectLiveExamples(incomplete)).toHaveLength(11);
    expect(() => selectLiveExamples(incomplete, "follow-ups")).toThrow("confirm-squat");
    const missingTurns = incomplete.map((row) => ({ ...row, inputs: { ...row.inputs, followUps: undefined } }));
    expect(() => selectLiveExamples(missingTurns, "follow-ups")).toThrow("confirm-squat");
  });
});

describe("deliberate dataset sync", () => {
  it("preserves unowned UI rows and previews adoption of legacy source ids", () => {
    const existing = [{ id: "legacy", inputs: { id: "incline-bench", question: "UI-edited question" } },
      { id: "manual", inputs: { id: "manual-test" } }];
    expect(planLiveSync(existing).find((item) => item.example.id === "incline-bench")?.action).toBe("preserve");
    expect(planLiveSync(existing, true).find((item) => item.example.id === "incline-bench")?.action).toBe("update");
    expect(planLiveSync(existing, true).some((item) => item.row?.id === "manual")).toBe(false);
  });
  it("prefers marked ownership over a duplicated UI id and refuses ambiguous adoption", () => {
    const existing = [{ id: "manual", inputs: { id: "incline-bench" } },
      { id: "source", inputs: { id: "incline-bench" }, metadata: { source: "lifting-app/LIVE_EXAMPLES" } }];
    expect(planLiveSync(existing).find((item) => item.example.id === "incline-bench")?.row?.id).toBe("source");
    expect(() => planLiveSync(existing.map((row) => ({ ...row, metadata: undefined })), true)).toThrow("Multiple rows");
  });
  it("previews creating a missing dataset but never mistakes a connection failure for absence", async () => {
    const fake = { readDataset: vi.fn().mockRejectedValue(new Error("Dataset[id=undefined, name=ai-coach-live] not found")),
      createDataset: vi.fn() } as unknown as Client;
    expect(await syncLiveExamples(fake)).toMatchObject({ createDataset: true });
    expect(fake.createDataset).not.toHaveBeenCalled();
    vi.mocked(fake.readDataset).mockRejectedValue(new Error("Connection failed"));
    await expect(syncLiveExamples(fake, { apply: true })).rejects.toThrow("Connection failed");
    expect(fake.createDataset).not.toHaveBeenCalled();
  });
  it("performs no writes for a preview and never deletes manual examples on apply", async () => {
    const readDataset = vi.fn().mockResolvedValue({ id: "dataset" });
    const createExample = vi.fn(), updateExample = vi.fn(), deleteExample = vi.fn();
    const fake = { readDataset, createExample, updateExample, deleteExample,
      async *listExamples() { yield { id: "manual", inputs: { id: "manual-test" } }; } } as unknown as Client;
    const preview = await syncLiveExamples(fake);
    expect(preview).toMatchObject({ applied: false });
    expect(createExample).not.toHaveBeenCalled();
    await syncLiveExamples(fake, { apply: true });
    expect(createExample).toHaveBeenCalledTimes(15);
    expect(deleteExample).not.toHaveBeenCalled();
    expect(updateExample).not.toHaveBeenCalled();
  });
  it("rejects production and mismatched projects before a model can run", () => {
    expect(validateEvalTarget("https://uggyizzzczwwxkgnwuse.supabase.co")).toBe("uggyizzzczwwxkgnwuse");
    expect(() => validateEvalTarget("https://jtcppebmosaffaajtgow.supabase.co", "jtcppebmosaffaajtgow")).toThrow("development");
    expect(() => validateEvalTarget("https://other.supabase.co")).toThrow("development");
  });
});

describe("scenario judge wiring", () => {
  it("uses one direct correctness score and preserves a factual failure", async () => {
    vi.mocked(askJev).mockResolvedValue({ reference_match: 0.2 });
    const turn = { answer: "Invented 405 lb.", toolCalls: [{ name: "exerciseReview", args: { name: "front squat" } }],
      toolResults: [{ name: "exerciseReview", result: { exerciseId: "bb-front-squat", last: null } }] };
    const grades = await gradeScenario({ question: "front squat" }, { ...turn, turns: [turn] },
      { review: { outcome: "resolved", exerciseId: "bb-front-squat" }, maxToolCalls: 3 });
    expect(grades.find((grade) => grade.key === "reference_match_raw")?.score).toBe(0.2);
    expect(grades.find((grade) => grade.key === "reference_match")?.score).toBe(0);
    expect(vi.mocked(askJev).mock.calls.at(-1)?.[0].state).toMatchObject({ toolEvidence: turn.toolResults });
  });
  it("grades station clarification without requiring a resolved review or trend fields", async () => {
    vi.mocked(askJev).mockResolvedValue({ reference_match: 0.9 });
    const turn = {
      answer: "I found three leg press stations. Generic has no sets; Cybex and Nautilus have history. Which one did you mean?",
      toolCalls: [{ name: "exerciseReview", args: { name: "leg press" } }],
      toolResults: [{ name: "exerciseReview", result: { selectionStatus: "clarification_needed", needsDisambiguation: true,
        matches: [{ id: "leg-press", history: { loggedSetCount: 0 } },
          { id: "leg-press__cybex__plate_loaded", history: { loggedSetCount: 3 } },
          { id: "leg-press__nautilus__plate_loaded", history: { loggedSetCount: 2 } }] } }],
    };
    const grades = await gradeScenario({ question: "How is my e1RM trending on leg press?" }, { ...turn, turns: [turn] },
      { reference: "Clarify separate stations when multiple have history.", review: { outcome: "policy", requiredMatchIds: ["leg-press"] } });
    expect(grades.find((grade) => grade.key === "reference_match")?.score).toBe(1);
    expect(grades.map((grade) => grade.key)).toEqual([
      "right_tool", "tool_call_count", "supported_figures", "found_exercise", "reference_match_raw", "reference_match",
    ]);
    const request = vi.mocked(askJev).mock.calls.at(-1)![0];
    expect(Object.keys(request.questions)).toEqual(["reference_match"]);
    expect(request.state).toMatchObject({ question: "How is my e1RM trending on leg press?", answer: turn.answer, toolEvidence: turn.toolResults });
  });
});
