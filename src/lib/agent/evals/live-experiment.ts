import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import type { Database } from "@/lib/supabase/types";
import { enrichScreenContext } from "../context";
import type { AgentMessage } from "../messages";
import { runAgentTurn } from "../run";
import { bindAgentTools } from "../tools";
import { askJev } from "./jev";
import {
  LIVE_DATASET,
  LIVE_EVAL_PROJECT,
  LIVE_EXAMPLES,
  gradeFoundExercise,
  gradeRightTool,
  gradeToolCount,
  outputFromTurn,
  scoreNoul,
  type ExpectedReview,
  type LiveExample,
  type LiveTurnOutput,
} from "./live";

const DEFAULT_EVAL_EMAIL = "jms.dcksn88@gmail.com";

const DATASET_DESCRIPTION = "Live Coach reads: exerciseReview e1RM trend, disambiguation, and a miss. Local experiments trace to lifting-app-agent-evals.";

type JudgeArgs = {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
};

export async function runLiveExperiment() {
  loadLocalEnv();
  process.env.LANGSMITH_PROJECT = LIVE_EVAL_PROJECT;
  process.env.LANGSMITH_TRACING = "true";

  const missing = [
    "LANGSMITH_API_KEY",
    "AI_GATEWAY_API_KEY",
    "SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "JEV_API_KEY",
  ].filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    throw new Error(
      `Live eval needs ${missing.join(", ")} in the shell or .env.local. The chat route's LangSmith project is left alone; this script traces to ${LIVE_EVAL_PROJECT}.`,
    );
  }

  const email = process.env.EVAL_USER_EMAIL?.trim() || DEFAULT_EVAL_EMAIL;
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const userId = await userIdForEmail(supabase, email);

  console.log(`\nDataset: ${LIVE_DATASET} (${LIVE_EXAMPLES.length} examples)`);
  console.log(`Traces: ${LIVE_EVAL_PROJECT} (not the Vercel project)`);
  console.log(`User: ${email}\n`);

  const client = new Client();
  await syncLiveExamples(client);

  const screenContext = await enrichScreenContext(supabase, userId, {
    pathname: "/",
    activeProgramId: null,
    openSessionId: null,
    focusedExerciseId: null,
  });

  const results = await evaluate(
    async (inputs: { question: string; id?: string }): Promise<LiveTurnOutput> => {
      const question = inputs.question;
      const exampleId = typeof inputs.id === "string" ? inputs.id : "live";
      console.log(`\n${exampleId}: ${question}`);
      const persisted: AgentMessage[] = [{
        id: "eval-user",
        role: "user",
        parts: [{ type: "text", text: question }],
        createdAt: new Date().toISOString(),
      }];
      const generated = await runAgentTurn({
        persisted,
        threadId: `eval-${exampleId}`,
        screenContext,
        tools: bindAgentTools(supabase, userId),
        traceMetadata: { source: "local-eval", dataset: LIVE_DATASET },
      });
      const output = outputFromTurn(generated);
      console.log(`Tool calls (${output.toolCalls.length}): ${output.toolCalls.map((call) => call.name).join(", ") || "none"}`);
      console.log(`Answer:\n${output.answer || "(empty)"}\n`);
      return output;
    },
    {
      data: LIVE_DATASET,
      experimentPrefix: "exercise-review",
      maxConcurrency: 1,
      metadata: { source: "local-eval" },
      evaluators: [
        (args: JudgeArgs) => {
          const grade = gradeRightTool({
            toolCalls: toolCallsFrom(args.outputs),
            expectedTools: stringList(args.referenceOutputs?.expectedTools),
          });
          return { key: "right_tool", ...grade };
        },
        (args: JudgeArgs) => {
          const grade = gradeToolCount(
            toolCallsFrom(args.outputs).length,
            numberFrom(args.referenceOutputs?.maxToolCalls, 3),
          );
          return { key: "tool_call_count", ...grade };
        },
        (args: JudgeArgs) => {
          const expected = reviewFrom(args.referenceOutputs?.review);
          if (!expected) return { key: "found_exercise", score: 0, comment: "example has no review expectation" };
          const grade = gradeFoundExercise({
            toolResults: toolResultsFrom(args.outputs),
            expected,
          });
          return { key: "found_exercise", ...grade };
        },
        async (args: JudgeArgs) => {
          const question = typeof args.inputs.question === "string" ? args.inputs.question : "";
          const referenceText = typeof args.referenceOutputs?.reference === "string"
            ? args.referenceOutputs.reference
            : "";
          const answer = typeof args.outputs.answer === "string" ? args.outputs.answer : "";
          const instructions = instructionsFrom(args.referenceOutputs?.instructions);
          const nouls = await askJev({
            state: { question, reference: referenceText, answer },
            questions: {
              matches_reference: {
                type: "noul",
                instructions,
                criteria: {
                  true: instructions.pass,
                  false: instructions.fail,
                },
              },
            },
          });
          const noul = nouls.matches_reference;
          if (noul === undefined) throw new Error("Jev did not return matches_reference");
          const grade = scoreNoul(noul);
          return { key: "reference_match", ...grade };
        },
      ],
    },
  );

  for await (const row of results) {
    const scores = row.evaluationResults.results
      .map((result) => `${result.key}=${result.score} (${result.comment ?? ""})`)
      .join("\n");
    console.log(scores);
  }
  await awaitAllCallbacks();
}

export async function syncLiveDataset() {
  loadLocalEnv();
  if (!process.env.LANGSMITH_API_KEY?.trim()) {
    throw new Error("Live dataset sync needs LANGSMITH_API_KEY in the shell or .env.local.");
  }
  await syncLiveExamples(new Client());
}

export async function syncLiveExamples(client: Client) {
  let datasetId: string;
  try {
    const dataset = await client.readDataset({ datasetName: LIVE_DATASET });
    datasetId = dataset.id;
  } catch {
    const dataset = await client.createDataset(LIVE_DATASET, {
      description: DATASET_DESCRIPTION,
    });
    datasetId = dataset.id;
  }
  await client.updateDataset({ datasetId, description: DATASET_DESCRIPTION });

  const existing: Array<{ id: string; inputs?: Record<string, unknown> }> = [];
  for await (const example of client.listExamples({ datasetId })) {
    existing.push({ id: example.id, inputs: example.inputs });
  }

  for (const example of LIVE_EXAMPLES) {
    const inputs = { id: example.id, question: example.question };
    const outputs = exampleOutputs(example);
    const match = existing.find((row) =>
      row.inputs?.id === example.id || row.inputs?.question === example.question
    );
    if (match) {
      await client.updateExample({ id: match.id, inputs, outputs });
      continue;
    }
    await client.createExample({ dataset_id: datasetId, inputs, outputs });
  }
}

function exampleOutputs(example: LiveExample) {
  return {
    expectedTools: example.expectedTools,
    maxToolCalls: example.maxToolCalls,
    reference: example.reference,
    instructions: example.instructions,
    review: example.review,
  };
}

async function userIdForEmail(
  supabase: ReturnType<typeof createClient<Database>>,
  email: string,
) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match?.id) return match.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`No auth user for ${email}`);
}

function instructionsFrom(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("example is missing reference instructions");
  const record = value as { pass?: unknown; fail?: unknown };
  if (typeof record.pass !== "string" || typeof record.fail !== "string") {
    throw new Error("example reference instructions are missing pass and fail");
  }
  return { ...(value as Record<string, unknown>), pass: record.pass, fail: record.fail };
}

function reviewFrom(value: unknown): ExpectedReview | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { outcome?: unknown; exerciseId?: unknown; matchIds?: unknown; name?: unknown };
  if (record.outcome === "resolved" && typeof record.exerciseId === "string") {
    return { outcome: "resolved", exerciseId: record.exerciseId };
  }
  if (record.outcome === "disambiguate" && Array.isArray(record.matchIds)) {
    const matchIds = record.matchIds.filter((id): id is string => typeof id === "string");
    return { outcome: "disambiguate", matchIds };
  }
  if (record.outcome === "miss" && typeof record.name === "string") {
    return { outcome: "miss", name: record.name };
  }
  return null;
}

function toolResultsFrom(outputs: Record<string, unknown>) {
  const results = outputs.toolResults;
  if (!Array.isArray(results)) return [];
  return results.flatMap((result) => {
    if (!result || typeof result !== "object" || !("name" in result)) return [];
    const name = (result as { name?: unknown }).name;
    if (typeof name !== "string") return [];
    return [{ name, result: (result as { result?: unknown }).result }];
  });
}

function toolCallsFrom(outputs: Record<string, unknown>) {
  const calls = outputs.toolCalls;
  if (!Array.isArray(calls)) return [];
  return calls.flatMap((call) => {
    if (!call || typeof call !== "object" || !("name" in call)) return [];
    const name = (call as { name?: unknown }).name;
    if (typeof name !== "string") return [];
    return [{ name, args: (call as { args?: unknown }).args }];
  });
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberFrom(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function loadLocalEnv() {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const split = trimmed.indexOf("=");
    if (split < 1) continue;
    const key = trimmed.slice(0, split).trim();
    if (process.env[key]?.trim()) continue;
    let value = trimmed.slice(split + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) process.env[key] = value;
  }
}
