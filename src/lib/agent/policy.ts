/** Last N persisted messages sent to the model. The full transcript stays in Postgres. */
export const CONTEXT_MESSAGE_LIMIT = 20;

/** Soft cap after last-N. Drop old tool results before user or assistant text. */
export const MODEL_CONTEXT_CHAR_BUDGET = 24_000;

/** Max tool calls the agent may make in one turn. */
export const TOOL_CALL_BUDGET = 8;

/** Local and Preview fallback; Vercel Production uses lifting-app. */
export const LANGSMITH_PROJECT_NAME = "lifting-app-dev";

/** Gateway model id (`provider/model`). Override with server-only `AGENT_MODEL`. */
export const DEFAULT_AGENT_MODEL = "openai/gpt-5.4";

export const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

export const READ_TOOL_NAMES = [
  "weeklyCoach",
  "activeProgram",
  "exerciseReview",
  "nextWorkout",
  "calculateE1rm",
] as const;

export type ReadToolName = (typeof READ_TOOL_NAMES)[number];

export const CLIENT_NAV_TOOL_NAMES = [
  "openExerciseReview",
  "openCoachCheckIn",
  "openProgram",
] as const;

export type ClientNavToolName = (typeof CLIENT_NAV_TOOL_NAMES)[number];

/** Runs on the client only after an in-transcript confirm chip. */
export const CONFIRM_TOOL_NAMES = ["startNextWorkout", "draftProgramFromIntake"] as const;

export type ConfirmToolName = (typeof CONFIRM_TOOL_NAMES)[number];

/** Server writes. Slice 2 drafts inactive programs; saving in the builder still activates. */
export const WRITE_TOOL_NAMES = ["draftProgramFromIntake"] as const;

export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];

export const AGENT_TOOL_NAMES = [
  ...READ_TOOL_NAMES,
  ...CLIENT_NAV_TOOL_NAMES,
  ...CONFIRM_TOOL_NAMES,
  ...WRITE_TOOL_NAMES,
] as const;

export const PERIOD_TOOL_NAMES: readonly string[] = [];

export function agentModelId() {
  return process.env.AGENT_MODEL?.trim() || DEFAULT_AGENT_MODEL;
}

export function gatewayApiKey() {
  return process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || "";
}

export function enableLangSmithTracing() {
  if (!process.env.LANGSMITH_API_KEY?.trim()) return false;
  if (!process.env.LANGSMITH_TRACING) process.env.LANGSMITH_TRACING = "true";
  if (!process.env.LANGSMITH_PROJECT?.trim()) {
    process.env.LANGSMITH_PROJECT = process.env.VERCEL_ENV === "production" ? "lifting-app" : LANGSMITH_PROJECT_NAME;
  }
  return true;
}

export function agentTraceMetadata(): Record<string, string> {
  const deployment = process.env.VERCEL_ENV;
  const codeSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.LANGSMITH_REVISION_ID;
  return {
    app: "lifting-app",
    environment: deployment === "production" ? "prod" : "dev",
    source: deployment === "preview" ? "preview" : deployment === "production" ? "production" : "local",
    ...(codeSha ? { codeSha } : {}),
    ...(process.env.VERCEL_GIT_COMMIT_REF ? { branch: process.env.VERCEL_GIT_COMMIT_REF } : {}),
  };
}

export function partChars(value: unknown): number {
  return JSON.stringify(value).length;
}
