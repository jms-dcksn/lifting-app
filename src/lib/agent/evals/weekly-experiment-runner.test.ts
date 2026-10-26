import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import type { Example } from "langsmith/schemas";
import { WEEKLY_EXAMPLES } from "./weekly-cases";
import { WEEKLY_JUDGE_QUESTIONS } from "./weekly-grade";
import { createWeeklyEvaluators, runWeeklyExperiment } from "./weekly-experiment";

vi.mock("langsmith/evaluation", () => ({ evaluate: vi.fn() }));
vi.mock("./live-experiment", () => ({ loadLocalEnv: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:child_process")>(),
  execFileSync: vi.fn((_command: string, args: string[]) => args[0] === "rev-parse" ? "fixture-sha\n" : ""),
}));

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup() {
  for (const name of ["EVAL_LIVE", "EVAL_WEEKLY_LIVE"]) vi.stubEnv(name, "1");
  for (const name of ["LANGSMITH_API_KEY", "AI_GATEWAY_API_KEY", "JEV_API_KEY"]) vi.stubEnv(name, "fixture-key");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("This offline test must never contact a service"); }));
  const directory = mkdtempSync(join(tmpdir(), "weekly-runner-")); directories.push(directory);
  const path = join(directory, "results.json"); vi.stubEnv("WEEKLY_RESULTS_PATH", path);
  const examples = WEEKLY_EXAMPLES.map((example, index) => ({ ...example, id: `fixture-${index}`, dataset_id: "dataset" })) as unknown as Example[];
  vi.spyOn(Client.prototype, "readDataset").mockResolvedValue({ id: "dataset" } as never);
  vi.spyOn(Client.prototype, "readDatasetVersion").mockResolvedValue({ as_of: "fixture-version" } as never);
  vi.spyOn(Client.prototype, "listExamples").mockImplementation(async function* () { yield* examples; });
  const rows = examples.map((example) => ({ example, run: { id: example.id, inputs: example.inputs,
    outputs: { answer: "Fixture answer", toolCalls: [], toolResults: [] }, error: undefined as string | undefined },
    evaluationResults: { results: Object.keys(WEEKLY_JUDGE_QUESTIONS).map((key) => ({ key, score: 0.9 })) } }));
  // Installed SDK 0.10.4 materializes results, then leaves its iterator exhausted.
  vi.mocked(evaluate).mockResolvedValue({ experimentName: "offline-materialized", results: rows,
    async *[Symbol.asyncIterator]() { /* already consumed by evaluate() */ },
  } as never);
  return { path, rows };
}

describe("weekly experiment result persistence (offline SDK boundary)", () => {
  it("keeps failed or missing feedback rows in the report before failing the command", async () => {
    const { path, rows } = setup();
    rows[0]!.evaluationResults.results = [];
    rows[1]!.evaluationResults.results.find((grade) => grade.key === "grounded")!.score = 0.2;
    await expect(runWeeklyExperiment()).rejects.toThrow("2/10 cases require review");
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved.rows).toHaveLength(10);
    expect(saved.rows.filter((row: { passed: boolean }) => !row.passed)).toHaveLength(2);
  });

  it("persists every materialized SDK row even when the returned iterator is exhausted", async () => {
    const { path } = setup();
    await expect(runWeeklyExperiment()).resolves.toBeUndefined();
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved.rows).toHaveLength(10);
    expect(saved.rows.every((row: { passed: boolean }) => row.passed)).toBe(true);
    expect(saved.metadata.judgeVersion).toBe("weekly-judge-v3");
    expect(saved.metadata.codeSha).toBe("fixture-sha");
    expect(saved.metadata.dirty).toBe(false);
    expect(Object.keys(saved.metadata.judgeQuestions)).toEqual(["grounded", "complete"]);
  });

  it.each(["grounded", "complete"])("requires %s to meet the threshold and preserves raw scores", async (key) => {
    const { path, rows } = setup();
    rows[0]!.evaluationResults.results.find((grade) => grade.key === key)!.score = 0.69;
    rows[1]!.evaluationResults.results.forEach((grade) => { grade.score = 0.7; });
    await expect(runWeeklyExperiment()).rejects.toThrow("1/10 cases require review");
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved.rows[0].passed).toBe(false);
    expect(saved.rows[1].passed).toBe(true);
    expect(saved.rows[0].feedback.find((grade: { key: string }) => grade.key === key).score).toBe(0.69);
  });

  it("rejects a target error even when both feedback scores pass", async () => {
    const { path, rows } = setup();
    rows[0]!.run.error = "model unavailable";
    await expect(runWeeklyExperiment()).rejects.toThrow("1/10 cases require review");
    expect(JSON.parse(readFileSync(path, "utf8")).rows[0]).toMatchObject({ passed: false, error: "model unavailable" });
  });
});

describe("weekly evaluator caching", () => {
  it("uses one judge request for exactly two score columns", async () => {
    const judge = vi.fn().mockResolvedValue({ grounded: 0.91, complete: 0.63 });
    const evaluators = createWeeklyEvaluators(judge);
    const example = WEEKLY_EXAMPLES[0]!;
    const run = { inputs: example.inputs, outputs: { answer: "185 lb", toolCalls: [{ name: "weeklyCoach", args: {} }],
      toolResults: [{ name: "weeklyCoach", result: example.inputs.evidence.weeklyCoach }] } };
    expect(evaluators).toHaveLength(2);
    const grades = await Promise.all(evaluators.map((evaluator) => evaluator(run as never, example as never)));
    expect(grades).toMatchObject([{ key: "grounded", score: 0.91 }, { key: "complete", score: 0.63 }]);
    expect(judge).toHaveBeenCalledTimes(1);
  });
  it("leaves a failed judge request as errors rather than fabricating scores", async () => {
    const judge = vi.fn().mockRejectedValue(new Error("judge unavailable"));
    const evaluators = createWeeklyEvaluators(judge);
    const example = WEEKLY_EXAMPLES[0]!;
    const run = { inputs: example.inputs, outputs: { answer: "Fixture answer", toolCalls: [], toolResults: [] } };
    const results = await Promise.allSettled(evaluators.map((evaluator) => evaluator(run as never, example as never)));
    expect(results.every((result) => result.status === "rejected" && result.reason.message === "judge unavailable")).toBe(true);
    expect(judge).toHaveBeenCalledTimes(1);
  });
});
