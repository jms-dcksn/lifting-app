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
  INCLINE_E1RM_QUESTION,
  INCLINE_E1RM_REFERENCE,
  LIVE_DATASET,
  LIVE_EVAL_PROJECT,
  REFERENCE_MATCH_INSTRUCTIONS,
  gradeRightTool,
  gradeToolCount,
  outputFromTurn,
  scoreNoul,
  type LiveTurnOutput,
} from "./live";

const EVAL_THREAD_ID = "eval-incline-bench-e1rm";
const DEFAULT_EVAL_EMAIL = "jms.dcksn88@gmail.com";

type ExampleOutputs = {
  expectedTools: string[];
  maxToolCalls: number;
  reference: string;
};

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
  const outputs: ExampleOutputs = {
    expectedTools: ["exerciseReview"],
    maxToolCalls: 3,
    reference: INCLINE_E1RM_REFERENCE,
  };

  console.log(`\nDataset: ${LIVE_DATASET}`);
  console.log(`Traces: ${LIVE_EVAL_PROJECT} (not the Vercel project)`);
  console.log(`User: ${email}`);
  console.log(`Reference:\n${INCLINE_E1RM_REFERENCE}\n`);

  const client = new Client();
  await upsertExample(client, outputs);

  const screenContext = await enrichScreenContext(supabase, userId, {
    pathname: "/",
    activeProgramId: null,
    openSessionId: null,
    focusedExerciseId: null,
  });

  const results = await evaluate(
    async (inputs: { question: string }): Promise<LiveTurnOutput> => {
      const persisted: AgentMessage[] = [{
        id: "eval-user",
        role: "user",
        parts: [{ type: "text", text: inputs.question }],
        createdAt: new Date().toISOString(),
      }];
      const generated = await runAgentTurn({
        persisted,
        threadId: EVAL_THREAD_ID,
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
      experimentPrefix: "incline-e1rm",
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
        async (args: JudgeArgs) => {
          const question = typeof args.inputs.question === "string" ? args.inputs.question : "";
          const referenceText = typeof args.referenceOutputs?.reference === "string"
            ? args.referenceOutputs.reference
            : "";
          const answer = typeof args.outputs.answer === "string" ? args.outputs.answer : "";
          const nouls = await askJev({
            state: { question, reference: referenceText, answer },
            questions: {
              matches_reference: {
                type: "noul",
                instructions: REFERENCE_MATCH_INSTRUCTIONS,
                criteria: {
                  true: REFERENCE_MATCH_INSTRUCTIONS.pass,
                  false: REFERENCE_MATCH_INSTRUCTIONS.fail,
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

async function upsertExample(client: Client, outputs: ExampleOutputs) {
  let datasetId: string;
  try {
    const dataset = await client.readDataset({ datasetName: LIVE_DATASET });
    datasetId = dataset.id;
  } catch {
    const dataset = await client.createDataset(LIVE_DATASET, {
      description: "One live Coach read: incline bench e1RM trend. Local experiments trace to lifting-app-agent-evals.",
    });
    datasetId = dataset.id;
  }

  const inputs = { question: INCLINE_E1RM_QUESTION };
  for await (const example of client.listExamples({ datasetId })) {
    if (example.inputs?.question === INCLINE_E1RM_QUESTION) {
      await client.updateExample({ id: example.id, inputs, outputs });
      return;
    }
  }
  await client.createExample({ dataset_id: datasetId, inputs, outputs });
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
