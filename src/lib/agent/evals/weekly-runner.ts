import { summarizeWeeklyCoach } from "../tools/weekly-summary";
import { tool } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { bindAgentTools } from "../tools";
import { runAgentTurn } from "../run";
import { outputFromTurn } from "./live";
import { experimentMetadata } from "./experiment-client";
import type { WeeklyInputs } from "./weekly-cases";

export async function runWeeklyTurn(inputs: WeeklyInputs, model?: BaseChatModel, traceMetadata?: Record<string, string>) {
  const evidence = inputs.evidence.weeklyCoach;
  const weekly = summarizeWeeklyCoach({ coachReport: evidence.report, coachRecommendations: evidence.recommendations, decisions: evidence.decisions });
  // Reuse real names/descriptions/schemas; replace every execution, including writes.
  const tools = bindAgentTools({} as never, "synthetic-owner").map((definition) => tool(async () => {
    if (definition.name === "weeklyCoach") return JSON.stringify(weekly);
    if (definition.name === "nextWorkout") return JSON.stringify({ source: "nextWorkout", workout: inputs.evidence.weeklyCoach.currentWorkout });
    return JSON.stringify({ status: "unavailable", reason: "No fixture supplied for this tool. No action performed." });
  }, { name: definition.name, description: definition.description, schema: definition.schema }));
  const generated = await runAgentTurn({ persisted: [...inputs.history, {
    id: `${inputs.id}-question`, role: "user", createdAt: inputs.asOf, parts: [{ type: "text", text: inputs.question }],
  }], threadId: `weekly-eval-${inputs.id}`, tools, model,
    traceMetadata: { ...experimentMetadata("weekly-coach"), ...traceMetadata } });
  return outputFromTurn(generated);
}
