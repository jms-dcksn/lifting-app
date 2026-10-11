import { describe, expect, it, vi } from "vitest";
import { Client } from "langsmith";
import { gradeScenario, planLiveSync, syncLiveExamples, validateEvalTarget } from "./live-experiment";
import { askJev } from "./jev";
vi.mock("./jev", () => ({ askJev: vi.fn(), jevModelId: () => "fixture-judge" }));

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
  it("stores raw dimensions and fails the aggregate when any required dimension fails", async () => {
    vi.mocked(askJev).mockResolvedValue({ selection_correctness: 0.95, evidence_support: 0.2, availability_handling: 0.9, helpfulness: 1 });
    const turn = { answer: "Invented 405 lb.", toolCalls: [{ name: "exerciseReview", args: { name: "front squat" } }],
      toolResults: [{ name: "exerciseReview", result: { exerciseId: "bb-front-squat", last: null } }] };
    const grades = await gradeScenario({ question: "front squat" }, { ...turn, turns: [turn] },
      { review: { outcome: "resolved", exerciseId: "bb-front-squat" }, maxToolCalls: 3 });
    expect(grades.find((grade) => grade.key === "evidence_support_raw")?.score).toBe(0.2);
    expect(grades.find((grade) => grade.key === "reference_match")?.score).toBe(0);
    expect(vi.mocked(askJev).mock.calls.at(-1)?.[0].state).toMatchObject({ toolEvidence: turn.toolResults });
  });
});
