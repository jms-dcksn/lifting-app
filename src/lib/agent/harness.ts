import "server-only";
import { resolve } from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredToolInterface } from "@langchain/core/tools";
import {
  createDeepAgent, createFilesystemMiddleware, createSummarizationMiddleware, CompositeBackend,
} from "deepagents";
import { createMiddleware, toolCallLimitMiddleware } from "langchain";
import { AI_GATEWAY_BASE_URL, agentModelId, gatewayApiKey, TOOL_CALL_BUDGET } from "./policy";
import { ReadOnlySkillsBackend } from "./skills";
import { WorkingFilesBackend } from "./working-files";
import { AGENT_SYSTEM_PROMPT, COACH_SUMMARY_PROMPT } from "./prompt";

/** Durable runtime is selected only by the server-side rollout switch. */
export function createCoachHarness(input: {
  tools: StructuredToolInterface[];
  skillsDirectory?: string;
  systemPrompt?: string;
  checkpointer?: NonNullable<Parameters<typeof createDeepAgent>[0]>["checkpointer"];
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  beforeTool?: () => Promise<void>;
}) {
  const apiKey = input.apiKey ?? gatewayApiKey();
  if (!apiKey) throw new Error("AI Gateway is not configured");
  const signal = AbortSignal.any([AbortSignal.timeout(input.timeoutMs ?? 60_000), ...(input.signal ? [input.signal] : [])]);
  const network = input.fetch ?? globalThis.fetch;
  const model = new ChatOpenAI({
    model: agentModelId(), apiKey, temperature: 0, maxRetries: 0, maxTokens: 4000, streamUsage: true,
    configuration: { baseURL: AI_GATEWAY_BASE_URL, fetch: (url, init) => {
      signal.throwIfAborted();
      return network(url, { ...init, signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) });
    } },
  });
  const backend = new CompositeBackend(new WorkingFilesBackend(), {
    "/skills/": new ReadOnlySkillsBackend({ rootDir: input.skillsDirectory ?? resolve("src/lib/agent/skills"), virtualMode: true }),
  });
  const agent = createDeepAgent({
    model, systemPrompt: input.systemPrompt ?? AGENT_SYSTEM_PROMPT,
    tools: input.tools, backend, skills: ["/skills/"], checkpointer: input.checkpointer, subagents: [],
    middleware: [
      createMiddleware({ name: "subAgentMiddleware" }), //disable subagents
      createMiddleware({ name: "ownedExecution", wrapToolCall: async (request, handler) => {
        signal.throwIfAborted();
        await input.beforeTool?.();
        return handler(request);
      } }),
      createFilesystemMiddleware({ backend, tools: ["read_file", "ls", "glob", "grep"], toolTokenLimitBeforeEvict: 2000, grepMaxCount: 20 }),
      createSummarizationMiddleware({ backend, model, summaryPrompt: COACH_SUMMARY_PROMPT }),
      toolCallLimitMiddleware({ runLimit: TOOL_CALL_BUDGET, exitBehavior: "continue" }),
    ],
  }).withConfig({ signal, recursionLimit: 40 });
  return { agent, signal };
}
