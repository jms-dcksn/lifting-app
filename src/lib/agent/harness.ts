import "server-only";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredToolInterface } from "@langchain/core/tools";
import {
  createDeepAgent, createFilesystemMiddleware, createSummarizationMiddleware, StateBackend,
} from "deepagents";
import { createMiddleware, toolCallLimitMiddleware } from "langchain";
import { AI_GATEWAY_BASE_URL, agentModelId, gatewayApiKey, TOOL_CALL_BUDGET } from "./policy";
import { AGENT_SYSTEM_PROMPT } from "./prompt";
import { COACH_SUMMARY_PROMPT, createTurnBudget } from "./turn-budget";

/** Prepared runtime only; serving chat stays on runAgentTurn until durable cutover. */
export function createCoachHarness(input: {
  tools: StructuredToolInterface[];
  systemPrompt?: string;
  checkpointer?: NonNullable<Parameters<typeof createDeepAgent>[0]>["checkpointer"];
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  limits?: Parameters<typeof createTurnBudget>[0]["limits"];
}) {
  const apiKey = input.apiKey ?? gatewayApiKey();
  if (!apiKey) throw new Error("AI Gateway is not configured");
  const budget = createTurnBudget(input);
  const model = new ChatOpenAI({
    model: agentModelId(), apiKey, temperature: 0, maxRetries: 0, streamUsage: true,
    configuration: { baseURL: AI_GATEWAY_BASE_URL, fetch: budget.fetch },
  });
  const backend = new StateBackend();
  const agent = createDeepAgent({
    model, systemPrompt: input.systemPrompt ?? AGENT_SYSTEM_PROMPT,
    tools: input.tools, backend, checkpointer: input.checkpointer, subagents: [],
    middleware: [
      createMiddleware({ name: "subAgentMiddleware" }),
      createFilesystemMiddleware({ backend, tools: ["read_file", "ls", "glob", "grep"], toolTokenLimitBeforeEvict: 2000, grepMaxCount: 20 }),
      createSummarizationMiddleware({ backend, model, summaryPrompt: COACH_SUMMARY_PROMPT, trigger: { type: "tokens", value: 6000 }, keep: { type: "messages", value: 4 }, trimTokensToSummarize: 6000 }),
      toolCallLimitMiddleware({ runLimit: TOOL_CALL_BUDGET, exitBehavior: "continue" }),
    ],
  }).withConfig({ signal: budget.signal, recursionLimit: 40 });
  return { agent, signal: budget.signal, usage: budget.usage };
}
