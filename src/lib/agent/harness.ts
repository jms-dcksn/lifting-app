import "server-only";
import { resolve } from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import {
  createDeepAgent, createFilesystemMiddleware, createSummarizationMiddleware, CompositeBackend,
} from "deepagents";
import { createMiddleware, toolCallLimitMiddleware } from "langchain";
import { AI_GATEWAY_BASE_URL, agentModelId, gatewayApiKey, DEEP_AGENT_TOOL_CALL_BUDGET, DEEP_AGENT_TIMEOUT_MS } from "./policy";
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
  const signal = AbortSignal.any([AbortSignal.timeout(input.timeoutMs ?? DEEP_AGENT_TIMEOUT_MS), ...(input.signal ? [input.signal] : [])]);
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
  const toolLimiter = toolCallLimitMiddleware({ runLimit: DEEP_AGENT_TOOL_CALL_BUDGET, exitBehavior: "continue" });
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
      createFilesystemMiddleware({ backend, tools: ["read_file", "ls", "glob", "grep"], toolTokenLimitBeforeEvict: 20_000, grepMaxCount: 20,
        customToolDescriptions: { read_file: "Read an absolute file path using optional zero-based offset and line limit. Working-file lines longer than 2 KiB are wrapped into display lines without changing stored content. Continue using the returned next offset; reads are bounded to 200 display lines / 8 KiB. Skill files use original line offsets." } }),
      createSummarizationMiddleware({ backend, model, summaryPrompt: COACH_SUMMARY_PROMPT }),
      toolLimiter,
      createMiddleware({ name: "finishAtToolLimit", stateSchema: toolLimiter.stateSchema,
        wrapModelCall: (request, handler) => {
          if ((request.state.runToolCallCount?.["__all__"] ?? 0) < DEEP_AGENT_TOOL_CALL_BUDGET) return handler(request);
          return handler({ ...request, tools: [], toolChoice: "none",
            systemMessage: request.systemMessage.concat("\nTool access is finished for this turn. Answer from the evidence already available and clearly state anything you could not verify.") });
        },
        afterAgent: (state) => {
          const last = state.messages.at(-1);
          if (ToolMessage.isInstance(last) && last.content === "Tool call limit exceeded. Do not make additional tool calls.") {
            return { messages: [new AIMessage("I couldn’t finish this review within the available tool calls. Please ask about a specific workout or exercise so I can focus the review.")] };
          }
        },
      }),
    ],
  }).withConfig({ signal, recursionLimit: 120 });
  return { agent, signal };
}
