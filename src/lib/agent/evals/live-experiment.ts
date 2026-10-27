import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import type { Database } from "@/lib/supabase/types";
import { enrichScreenContext } from "../context";
import type { AgentMessage } from "../messages";
import { runAgentTurn } from "../run";
import { bindReadTools } from "../tools";
import { agentModelId, enableLangSmithTracing } from "../policy";
import { ExperimentClient, experimentMetadata } from "./experiment-client";
import { gradeSupportedFigures } from "./evidence-grade";
import { askJev, jevModelId } from "./jev";
import { LIVE_DATASET, LIVE_EXAMPLES, LIVE_FOLLOW_UP_EXAMPLES, LIVE_POLICY_VERSION, LIVE_JUDGE_VERSION,
  REFERENCE_MATCH_THRESHOLD, REVIEW_JUDGE_QUESTIONS, gradeFoundExercise, gradeRightTool, gradeToolCount,
  outputFromTurn, reviewJudgeRequest, reviewRecord, scoreNoul,
  type ExpectedReview, type LiveExample, type LiveTurnOutput } from "./live";

const DEFAULT_EVAL_EMAIL = "jms.dcksn88@gmail.com";
const SOURCE = "lifting-app/LIVE_EXAMPLES";
const DEVELOPMENT_PROJECT = "uggyizzzczwwxkgnwuse";
const PRODUCTION_PROJECT = "jtcppebmosaffaajtgow";
const DATASET_DESCRIPTION = "Live exercise review policy checks with explicit source sync; live facts are graded against tool evidence, not numeric gold.";
export type LiveScenarioOutput = LiveTurnOutput & { turns: LiveTurnOutput[] };

export function validateEvalTarget(url: string, expectedProject = DEVELOPMENT_PROJECT) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== `${expectedProject}.supabase.co` || expectedProject === PRODUCTION_PROJECT) {
    throw new Error("Live eval requires the configured development project. Check NEXT_PUBLIC_SUPABASE_URL and EVAL_DB_PROJECT_REF.");
  }
  return expectedProject;
}

export async function runLiveExperiment() {
  loadLocalEnv();
  enableLangSmithTracing();
  process.env.LANGSMITH_TRACING = "true";
  const missing = ["LANGSMITH_API_KEY", "AI_GATEWAY_API_KEY", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL", "JEV_API_KEY"]
    .filter((key) => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Live eval needs ${missing.join(", ")} in the shell or .env.local.`);
  const databaseProject = validateEvalTarget(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.EVAL_DB_PROJECT_REF?.trim() || DEVELOPMENT_PROJECT);
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const userId = await userIdForEmail(supabase, process.env.EVAL_USER_EMAIL?.trim() || DEFAULT_EVAL_EMAIL);
  const client = new ExperimentClient();
  const dataset = await client.readDataset({ datasetName: LIVE_DATASET });
  const version = await client.readDatasetVersion({ datasetId: dataset.id,
    ...(process.env.EVAL_DATASET_VERSION?.trim() ? { asOf: process.env.EVAL_DATASET_VERSION.trim() } : { tag: "latest" }) });
  const examples = [];
  for await (const example of client.listExamples({ datasetId: dataset.id, asOf: version.as_of })) {
    examples.push(example);
  }
  const scenarioSet = process.env.EVAL_SCENARIOS?.trim() || "first-turn";
  const selectedExamples = selectLiveExamples(examples, scenarioSet, version.as_of);
  const snapshot = await trainingSnapshot(supabase, userId);
  const codeSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
  const metadata = { ...experimentMetadata("exercise-review"), scenarioSet, policyVersion: LIVE_POLICY_VERSION, datasetVersion: version.as_of,
    agentModel: agentModelId(), judgeModel: jevModelId(), judgeThreshold: REFERENCE_MATCH_THRESHOLD,
    judgeVersion: LIVE_JUDGE_VERSION, judgeConfiguration: REVIEW_JUDGE_QUESTIONS, judgeModelIsFloating: jevModelId().endsWith("latest"), codeSha, dirty, databaseProject, userId,
    asOf: new Date().toISOString(), trainingSnapshot: snapshot };
  console.log(`Dataset ${LIVE_DATASET}@${version.as_of}: ${selectedExamples.length} scenarios; development project ${databaseProject}; model ${metadata.agentModel}`);
  const screenContext = await enrichScreenContext(supabase, userId, { pathname: "/", activeProgramId: null, openSessionId: null, focusedExerciseId: null });
  const results = await evaluate(async (inputs: { question: string; id?: string; followUps?: string[] }): Promise<LiveScenarioOutput> => {
    const persisted: AgentMessage[] = [];
    const turns: LiveTurnOutput[] = [];
    for (const [index, question] of [inputs.question, ...(inputs.followUps ?? [])].entries()) {
      persisted.push({ id: `user-${index}`, role: "user", parts: [{ type: "text", text: question }], createdAt: new Date().toISOString() });
      const generated = await runAgentTurn({ persisted, threadId: `eval-${inputs.id ?? "live"}`, screenContext,
        tools: bindReadTools(supabase, userId), traceMetadata: { ...experimentMetadata("exercise-review"), dataset: LIVE_DATASET, datasetVersion: version.as_of, codeSha } });
      turns.push(outputFromTurn(generated));
      for (const [messageIndex, message] of generated.entries()) persisted.push({ ...message,
        id: `turn-${index}-${messageIndex}`, createdAt: new Date().toISOString() });
    }
    return { ...turns.at(-1)!, turns };
  }, { data: selectedExamples, client, experimentPrefix: "exercise-review", maxConcurrency: 1, metadata,
    evaluators: [async (args: { inputs: Record<string, unknown>; outputs: Record<string, unknown>; referenceOutputs?: Record<string, unknown> }) => {
      const outputs = args.outputs as unknown as LiveScenarioOutput;
      const reference = args.referenceOutputs ?? {};
      return { results: await gradeScenario(args.inputs, outputs, reference) };
    }] });
  for (const row of results.results) console.log(row.evaluationResults.results.map((result) => `${result.key}=${result.score} (${result.comment ?? ""})`).join("\n"));
  const after = await trainingSnapshot(supabase, userId);
  const experiment = await client.readProject({ projectName: results.experimentName });
  await client.updateProject(experiment.id, { metadata: { ...experiment.extra?.metadata, ...metadata,
    trainingSnapshotAfter: after, trainingDataChangedDuringRun: after.sha256 !== snapshot.sha256 } });
  await awaitAllCallbacks();
}

export async function gradeScenario(inputs: Record<string, unknown>, output: LiveScenarioOutput, reference: Record<string, unknown>) {
  const turns = output.turns ?? [output];
  const followUps = Array.isArray(reference.followUps) ? reference.followUps as Array<Record<string, unknown>> : [];
  const questions = [String(inputs.question ?? ""), ...(Array.isArray(inputs.followUps) ? inputs.followUps.map(String) : [])];
  if (turns.length !== questions.length) throw new Error("Scenario turn count differs from dataset input.");
  const grades: Array<{ key: string; score: number; comment: string }> = [];
  for (const [index, turn] of turns.entries()) {
    const expectation = index === 0 ? reference : followUps[index - 1];
    const expected = reviewFrom(expectation?.review);
    if (!expected) throw new Error("Scenario is missing review expectation.");
    const prefix = turns.length > 1 ? `turn_${index + 1}_` : "";
    grades.push({ key: `${prefix}right_tool`, ...gradeRightTool({ toolCalls: turn.toolCalls, expectedTools: ["exerciseReview"] }) },
      { key: `${prefix}tool_call_count`, ...gradeToolCount(turn.toolCalls.length, Number(expectation.maxToolCalls ?? 3)) },
      { key: `${prefix}supported_figures`, ...gradeSupportedFigures(turn) },
      { key: `${prefix}found_exercise`, ...gradeFoundExercise({ toolResults: turn.toolResults, expected }) });
    const request = reviewJudgeRequest(questions[index]!, String(reference.reference ?? ""), turn);
    const scores = await askJev({ ...request, state: { ...request.state, conversationQuestions: questions.slice(0, index + 1) } });
    const raw = scores.reference_match;
    if (raw === undefined) throw new Error("Jev missing reference_match");
    grades.push({ key: `${prefix}reference_match_raw`, score: raw,
      comment: `model ${jevModelId()}; judge ${LIVE_JUDGE_VERSION}; threshold ${REFERENCE_MATCH_THRESHOLD}` },
      { key: `${prefix}reference_match`, ...scoreNoul(raw) });
  }
  return grades;
}

export async function syncLiveDataset(options: { apply?: boolean; adopt?: boolean } = {}) {
  loadLocalEnv();
  if (!process.env.LANGSMITH_API_KEY?.trim()) throw new Error("Dataset sync needs LANGSMITH_API_KEY.");
  const plan = await syncLiveExamples(new Client(), options);
  console.log(JSON.stringify(plan, null, 2));
}

type ExistingExample = { id: string; inputs?: Record<string, unknown>; outputs?: Record<string, unknown>;
  metadata?: Record<string, unknown> };
export function selectLiveExamples<T extends ExistingExample>(examples: T[], scenarioSet = "first-turn", datasetVersion?: string): T[] {
  if (!["first-turn", "follow-ups", "all"].includes(scenarioSet)) {
    throw new Error("EVAL_SCENARIOS must be first-turn, follow-ups, or all.");
  }
  const cases = scenarioSet === "first-turn" ? LIVE_EXAMPLES : scenarioSet === "follow-ups" ? LIVE_FOLLOW_UP_EXAMPLES
    : [...LIVE_EXAMPLES, ...LIVE_FOLLOW_UP_EXAMPLES];
  const syncHelp = "Preview: npm run eval:agent:sync -- --adopt\nAfter reviewing: npm run eval:agent:sync -- --adopt --apply\n"
    + "Then retry. If EVAL_DATASET_VERSION pins an older snapshot, clear it or choose the new version.";
  return cases.map((scenario) => {
    const matches = examples.filter((example) => example.inputs?.id === scenario.id);
    if (!matches.length) throw new Error(`Missing scenario ${scenario.id} in ${LIVE_DATASET}.\n${syncHelp}`);
    if (matches.length > 1) throw new Error(`Multiple rows have scenario id ${scenario.id}; resolve the duplicate before running.`);
    const example = matches[0]!;
    const followUps = example.inputs?.followUps ?? [];
    const references = example.outputs?.followUps ?? [];
    if (example.outputs?.policyVersion !== LIVE_POLICY_VERSION || !reviewFrom(example.outputs?.review)
      || !Array.isArray(followUps) || followUps.length !== (scenario.followUps?.length ?? 0)
      || !Array.isArray(references) || references.length !== followUps.length
      || references.some((turn) => !reviewFrom(reviewRecord(turn)?.review))) {
      throw new Error(`Dataset ${LIVE_DATASET}${datasetVersion ? `@${datasetVersion}` : ""} has old or incomplete policy references for ${scenario.id}.\n${syncHelp}`);
    }
    return example;
  });
}
export function planLiveSync(existing: ExistingExample[], adopt = false) {
  return [...LIVE_EXAMPLES, ...LIVE_FOLLOW_UP_EXAMPLES].map((example) => {
    const rows = existing.filter((candidate) => candidate.inputs?.id === example.id);
    const ownedRows = rows.filter((candidate) => candidate.metadata?.source === SOURCE);
    if (ownedRows.length > 1 || (adopt && !ownedRows.length && rows.length > 1)) {
      throw new Error(`Multiple rows claim source id ${example.id}; resolve ownership before sync.`);
    }
    const row = ownedRows[0] ?? rows[0];
    const owned = row?.metadata?.source === SOURCE;
    return { example, row, action: !row ? "create" : owned || adopt ? "update" : "preserve" };
  });
}
export async function syncLiveExamples(client: Client, options: { apply?: boolean; adopt?: boolean } = {}) {
  let dataset;
  try { dataset = await client.readDataset({ datasetName: LIVE_DATASET }); }
  catch (error) {
    if (!(error instanceof Error && /^Dataset\[.*\] not found$/.test(error.message))) throw error;
    if (!options.apply) return { dataset: LIVE_DATASET, createDataset: true, changes: planLiveSync([]).map((item) => ({ id: item.example.id, action: item.action })) };
    dataset = await client.createDataset(LIVE_DATASET, { description: DATASET_DESCRIPTION });
  }
  const existing: ExistingExample[] = [];
  for await (const example of client.listExamples({ datasetId: dataset.id })) existing.push(example);
  const plan = planLiveSync(existing, options.adopt);
  const changes = plan.map((item) => ({ id: item.example.id, action: item.action,
    before: item.row ? { inputs: item.row.inputs, outputs: item.row.outputs } : null,
    after: { inputs: exampleInputs(item.example), outputs: exampleOutputs(item.example) } }));
  if (options.apply) {
    for (const item of plan) {
      if (item.action === "preserve") continue;
      const payload = { inputs: exampleInputs(item.example), outputs: exampleOutputs(item.example),
        metadata: { ...item.row?.metadata, source: SOURCE, policyVersion: LIVE_POLICY_VERSION } };
      if (item.row) await client.updateExample({ id: item.row.id, ...payload });
      else await client.createExample({ dataset_id: dataset.id, ...payload });
    }
  }
  // No deletion: UI examples and historical versions/annotations remain intact.
  return { dataset: LIVE_DATASET, applied: Boolean(options.apply), changes };
}
function exampleInputs(example: LiveExample) {
  return { id: example.id, question: example.question, ...(example.followUps ? { followUps: example.followUps.map((turn) => turn.question) } : {}) };
}
function exampleOutputs(example: LiveExample) {
  return { expectedTools: example.expectedTools, maxToolCalls: example.maxToolCalls, reference: example.reference,
    instructions: example.instructions, review: example.review, policyVersion: LIVE_POLICY_VERSION, followUps: example.followUps };
}
export function reviewFrom(value: unknown): ExpectedReview | null {
  const record = reviewRecord(value);
  if (record?.outcome === "resolved" && typeof record.exerciseId === "string") return { outcome: "resolved", exerciseId: record.exerciseId };
  if (record?.outcome === "disambiguate" && Array.isArray(record.matchIds)) return { outcome: "disambiguate", matchIds: record.matchIds.map(String) };
  if (record?.outcome === "policy" && Array.isArray(record.requiredMatchIds)) return { outcome: "policy", requiredMatchIds: record.requiredMatchIds.map(String) };
  return null;
}
async function userIdForEmail(supabase: ReturnType<typeof createClient<Database>>, email: string) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match?.id) return match.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`No auth user for ${email}`);
}
async function trainingSnapshot(supabase: ReturnType<typeof createClient<Database>>, userId: string) {
  const hash = createHash("sha256");
  let setCount = 0, exerciseCount = 0;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("set_log").select("*, workout_session!inner(performed_at, finished_at)")
      .eq("user_id", userId).order("id").range(offset, offset + 499);
    if (error) throw new Error(error.message);
    hash.update(JSON.stringify(data)); setCount += data?.length ?? 0;
    if ((data?.length ?? 0) < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("exercise").select("*").eq("user_id", userId).order("id").range(offset, offset + 499);
    if (error) throw new Error(error.message);
    hash.update(JSON.stringify(data)); exerciseCount += data?.length ?? 0;
    if ((data?.length ?? 0) < 500) break;
  }
  return { sha256: hash.digest("hex"), setCount, ownedExerciseCount: exerciseCount };
}
export function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim(), split = trimmed.indexOf("=");
    if (!trimmed || trimmed.startsWith("#") || split < 1) continue;
    const key = trimmed.slice(0, split).trim();
    if (process.env[key]?.trim()) continue;
    let value = trimmed.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value) process.env[key] = value;
  }
}
