import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { evaluate } from "langsmith/evaluation";
import type { Example, Run } from "langsmith/schemas";
import { agentModelId, enableLangSmithTracing } from "../policy";
import { AGENT_SYSTEM_PROMPT } from "../prompt";
import { loadLocalEnv } from "./live-experiment";
import { askJev, jevModelId } from "./jev";
import type { LiveTurnOutput } from "./live";
import { WEEKLY_DATASET, WEEKLY_EXAMPLES, WEEKLY_POLICY_VERSION, type WeeklyInputs, type WeeklyReference } from "./weekly-cases";
import { gradeWeeklyAnswer, validateWeeklySnapshot, WEEKLY_COACH_GUIDELINES, WEEKLY_JUDGE_QUESTIONS, WEEKLY_JUDGE_VERSION, WEEKLY_THRESHOLD, type WeeklyGrade } from "./weekly-grade";
import { ExperimentClient, experimentMetadata } from "./experiment-client";
import { runWeeklyTurn } from "./weekly-runner";
import weeklyDataset from "./datasets/weekly-coach-v1.langsmith.json";

const METRICS = Object.keys(WEEKLY_JUDGE_QUESTIONS);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function createWeeklyEvaluators(judge: typeof askJev = askJev) {
  const cache = new Map<string, Promise<WeeklyGrade[]>>();
  return METRICS.map((key) => async (run: Run, example?: Example) => {
    const inputs = run.inputs as WeeklyInputs, output = run.outputs as LiveTurnOutput;
    const reference = example?.outputs as WeeklyReference | undefined;
    if (!reference || !output) throw new Error(`Missing weekly outputs/reference: ${inputs.id}`);
    const cacheKey = JSON.stringify([inputs, output, reference]);
    let grades = cache.get(cacheKey);
    if (!grades) { grades = gradeWeeklyAnswer(inputs, output, reference, judge); cache.set(cacheKey, grades); }
    const grade = (await grades).find((item) => item.key === key);
    if (!grade) throw new Error(`Missing weekly metric ${key}`);
    return grade;
  });
}

export async function runWeeklyExperiment() {
  if (process.env.EVAL_LIVE !== "1" || process.env.EVAL_WEEKLY_LIVE !== "1") throw new Error("Weekly paid run requires both explicit live gates.");
  loadLocalEnv();
  enableLangSmithTracing();
  process.env.LANGSMITH_TRACING = "true";
  const missing = ["LANGSMITH_API_KEY", "AI_GATEWAY_API_KEY", "JEV_API_KEY"].filter((key) => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Weekly eval needs ${missing.join(", ")}. No Supabase credentials are required.`);
  const client = new ExperimentClient();
  const dataset = await client.readDataset({ datasetId: weeklyDataset.id });
  const version = await client.readDatasetVersion({ datasetId: dataset.id,
    asOf: process.env.WEEKLY_DATASET_VERSION?.trim() || weeklyDataset.version });
  const examples: Example[] = [];
  for await (const example of client.listExamples({ datasetId: dataset.id, asOf: version.as_of })) examples.push(example);
  validateWeeklySnapshot(examples, WEEKLY_EXAMPLES);
  const metadata = { ...experimentMetadata("weekly-coach"), datasetVersion: version.as_of, fixtureHash: hash(JSON.stringify(WEEKLY_EXAMPLES)), policyVersion: WEEKLY_POLICY_VERSION,
    judgeVersion: WEEKLY_JUDGE_VERSION, judgeQuestions: WEEKLY_JUDGE_QUESTIONS, judgeGuidelines: WEEKLY_COACH_GUIDELINES, judgeThreshold: WEEKLY_THRESHOLD,
    agentModel: agentModelId(), judgeModel: jevModelId(), judgeModelIsFloating: jevModelId().endsWith("latest"), promptHash: hash(AGENT_SYSTEM_PROMPT),
    toolDefinitionsHash: hash(readFileSync("src/lib/agent/tools/index.ts", "utf8")),
    codeSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()), synthetic: true };
  const evaluators = createWeeklyEvaluators();
  console.log(`${WEEKLY_DATASET}@${version.as_of}: ${examples.length} synthetic cases; dataset-linked experiment traces.`);
  const results = await evaluate((inputs: WeeklyInputs) => runWeeklyTurn(inputs, undefined, { codeSha: metadata.codeSha, datasetVersion: version.as_of }), {
    data: examples, client, experimentPrefix: "weekly-coach", metadata, maxConcurrency: 1, evaluators,
  });
  const rows = [];
  let failures = 0;
  for (const row of results.results) {
    const feedback = row.evaluationResults.results;
    const passed = !row.run.error && METRICS.every((key) => {
      const score = feedback.find((grade) => grade.key === key)?.score;
      return typeof score === "number" && score >= WEEKLY_THRESHOLD && score <= 1;
    });
    if (!passed) failures++;
    rows.push({ id: row.example.inputs.id, inputs: row.example.inputs, reference: row.example.outputs, output: row.run.outputs, feedback, passed, error: row.run.error });
    console.log(`${row.example.inputs.id}: ${passed ? "PASS" : "REVIEW"}`);
  }
  const outputPath = process.env.WEEKLY_RESULTS_PATH?.trim() || `test-results/weekly-coach-${Date.now()}.json`;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({ experiment: results.experimentName, metadata, rows }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await awaitAllCallbacks();
  console.log(`Saved ${outputPath}; experiment ${results.experimentName}. ${failures} cases require review.`);
  if (failures || rows.length !== WEEKLY_EXAMPLES.length) throw new Error(`Weekly experiment: ${failures}/${rows.length} cases require review; expected ${WEEKLY_EXAMPLES.length} results. See ${outputPath}.`);
}
