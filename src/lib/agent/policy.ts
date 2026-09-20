/** Last N persisted messages sent to the model. The full transcript stays in Postgres. */
export const CONTEXT_MESSAGE_LIMIT = 20;

/** Soft cap after last-N. Drop old tool results before user or assistant text. */
export const MODEL_CONTEXT_CHAR_BUDGET = 24_000;

/** Max tool calls the agent may make in one turn. */
export const TOOL_CALL_BUDGET = 8;

/** Dedicated LangSmith project for this agent. Do not share with other apps. */
export const LANGSMITH_PROJECT_NAME = "lifting-app-agent";

/** Gateway model id (`provider/model`). Override with server-only `AGENT_MODEL`. */
export const DEFAULT_AGENT_MODEL = "openai/gpt-5.4";

export const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

export const READ_TOOL_NAMES = [
  "weeklyCoach",
  "activeProgram",
  "exerciseReview",
  "nextWorkout",
] as const;

export type ReadToolName = (typeof READ_TOOL_NAMES)[number];

/** Slice 0 has no writes. Later slices add names here; the route still applies this list. */
export const WRITE_TOOL_NAMES: readonly string[] = [];

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
    process.env.LANGSMITH_PROJECT = LANGSMITH_PROJECT_NAME;
  }
  return true;
}

export function partChars(value: unknown): number {
  return JSON.stringify(value).length;
}
