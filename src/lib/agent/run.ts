import { createAgent, toolCallLimitMiddleware } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import type { Callbacks } from "@langchain/core/callbacks/manager";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { AgentScreenContext } from "./context";
import { formatScreenContextForPrompt } from "./context";
import {
  AI_GATEWAY_BASE_URL,
  TOOL_CALL_BUDGET,
  agentModelId,
  gatewayApiKey,
} from "./policy";
import { AGENT_SYSTEM_PROMPT } from "./prompt";
import {
  newMessagesAfter,
  selectModelMessages,
  toLangChainMessages,
  type AgentMessage,
} from "./messages";
import type { AgentStreamEvent } from "./stream";

export function createGatewayModel() {
  const apiKey = gatewayApiKey();
  if (!apiKey) throw new Error("AI Gateway is not configured");
  return new ChatOpenAI({
    model: agentModelId(),
    apiKey,
    temperature: 0,
    configuration: { baseURL: AI_GATEWAY_BASE_URL },
  });
}

export async function runAgentTurn(input: {
  persisted: AgentMessage[];
  threadId: string;
  screenContext?: AgentScreenContext;
  tools: StructuredToolInterface[];
  model?: BaseChatModel;
  callbacks?: Callbacks;
  onEvent?: (event: AgentStreamEvent) => void;
}): Promise<Array<Omit<AgentMessage, "id" | "createdAt">>> {
  const windowed = selectModelMessages(input.persisted);
  const model = input.model ?? createGatewayModel();
  const systemPrompt = input.screenContext
    ? `${AGENT_SYSTEM_PROMPT}${formatScreenContextForPrompt(input.screenContext)}`
    : AGENT_SYSTEM_PROMPT;
  const agent = createAgent({
    model,
    tools: input.tools,
    systemPrompt,
    middleware: [
      toolCallLimitMiddleware({
        runLimit: TOOL_CALL_BUDGET,
        exitBehavior: "continue",
      }),
    ],
  });

  // LangSmith groups a conversation's traces by metadata.thread_id.
  const run = await agent.streamEvents(
    { messages: toLangChainMessages(windowed) },
    { version: "v3", metadata: { thread_id: input.threadId }, callbacks: input.callbacks },
  );

  const emit = input.onEvent ?? (() => {});
  const messageLoop = (async () => {
    for await (const message of run.messages) {
      for await (const token of message.text) {
        if (token) emit({ type: "text", text: token });
      }
    }
  })();
  const toolLoop = (async () => {
    for await (const call of run.toolCalls) {
      emit({ type: "tool-start", name: call.name });
      try {
        await call.output;
      } catch {
        // Tool errors still close the start/end pair so the UI does not hang.
      }
      emit({ type: "tool-end", name: call.name });
    }
  })();

  const [output] = await Promise.all([run.output, messageLoop, toolLoop]);
  return newMessagesAfter(windowed, output.messages);
}
