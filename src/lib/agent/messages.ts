import type { BaseMessage } from "@langchain/core/messages";
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { Json } from "@/lib/supabase/types";
import {
  CONTEXT_MESSAGE_LIMIT,
  MODEL_CONTEXT_CHAR_BUDGET,
  partChars,
} from "./policy";

export type AgentRole = "user" | "assistant" | "tool";

export type AgentTextPart = { type: "text"; text: string };
export type AgentToolCallPart = {
  type: "tool-call";
  id: string;
  name: string;
  args: unknown;
};
export type AgentToolResultPart = {
  type: "tool-result";
  id: string;
  name: string;
  result?: unknown;
  omitted?: boolean;
};

export type AgentPart = AgentTextPart | AgentToolCallPart | AgentToolResultPart;

export type AgentMessage = {
  id: string;
  role: AgentRole;
  parts: AgentPart[];
  createdAt: string;
};

export function isAgentPart(value: unknown): value is AgentPart {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return type === "text" || type === "tool-call" || type === "tool-result";
}

export function parseParts(value: Json): AgentPart[] {
  if (!Array.isArray(value)) return [];
  const parts: AgentPart[] = [];
  for (const item of value) {
    if (isAgentPart(item)) parts.push(item);
  }
  return parts;
}

export function textFromParts(parts: AgentPart[]) {
  return parts
    .filter((part): part is AgentTextPart => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function messageChars(message: AgentMessage) {
  return partChars(message.parts);
}

export function selectModelMessages(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length === 0) return [];
  let start = Math.max(0, messages.length - CONTEXT_MESSAGE_LIMIT);
  while (start > 0 && messages[start]?.role === "tool") start -= 1;
  return trimToolResultsToBudget(messages.slice(start));
}

export function trimToolResultsToBudget(
  messages: AgentMessage[],
  budget = MODEL_CONTEXT_CHAR_BUDGET,
): AgentMessage[] {
  const next = messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => ({ ...part })),
  }));
  let total = next.reduce((sum, message) => sum + messageChars(message), 0);
  if (total <= budget) return next;

  for (const message of next) {
    if (total <= budget) break;
    message.parts = message.parts.map((part) => {
      if (total <= budget || part.type !== "tool-result" || part.omitted) return part;
      const before = partChars(part);
      const stub: AgentToolResultPart = { type: "tool-result", id: part.id, name: part.name, omitted: true };
      total += partChars(stub) - before;
      return stub;
    });
  }
  return next;
}

export function toLangChainMessages(messages: AgentMessage[]): BaseMessage[] {
  const out: BaseMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      out.push(new HumanMessage(textFromParts(message.parts) || " "));
      continue;
    }
    if (message.role === "tool") {
      for (const part of message.parts) {
        if (part.type !== "tool-result") continue;
        out.push(new ToolMessage({
          tool_call_id: part.id,
          content: part.omitted ? "[omitted]" : stringifyToolResult(part.result),
          name: part.name,
        }));
      }
      continue;
    }
    const text = textFromParts(message.parts);
    const toolCalls = message.parts.flatMap((part) => {
      if (part.type !== "tool-call") return [];
      return [{
        id: part.id,
        name: part.name,
        args: (part.args && typeof part.args === "object") ? part.args as Record<string, unknown> : {},
        type: "tool_call" as const,
      }];
    });
    out.push(new AIMessage({ content: text, tool_calls: toolCalls.length ? toolCalls : undefined }));
  }
  return out;
}

export function fromLangChainMessages(messages: BaseMessage[]): Omit<AgentMessage, "id" | "createdAt">[] {
  const out: Omit<AgentMessage, "id" | "createdAt">[] = [];
  for (const message of messages) {
    if (HumanMessage.isInstance(message)) {
      const text = contentText(message.content);
      out.push({ role: "user", parts: text ? [{ type: "text", text }] : [] });
      continue;
    }
    if (ToolMessage.isInstance(message)) {
      out.push({
        role: "tool",
        parts: [{
          type: "tool-result",
          id: message.tool_call_id,
          name: typeof message.name === "string" ? message.name : "tool",
          result: parseToolResult(message.content),
        }],
      });
      continue;
    }
    if (AIMessage.isInstance(message)) {
      const parts: AgentPart[] = [];
      const text = contentText(message.content);
      if (text) parts.push({ type: "text", text });
      for (const call of message.tool_calls ?? []) {
        parts.push({
          type: "tool-call",
          id: call.id ?? crypto.randomUUID(),
          name: call.name,
          args: call.args,
        });
      }
      out.push({ role: "assistant", parts });
    }
  }
  return out;
}

export function newMessagesAfter(
  prior: AgentMessage[],
  output: BaseMessage[],
): Omit<AgentMessage, "id" | "createdAt">[] {
  const converted = fromLangChainMessages(output);
  if (converted.length <= prior.length) {
    return converted.filter((message) => message.role !== "user");
  }
  return converted.slice(prior.length);
}

function contentText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
        return block.text;
      }
      return "";
    })
    .join("");
}

function stringifyToolResult(result: unknown) {
  if (typeof result === "string") return result;
  return JSON.stringify(result ?? null);
}

function parseToolResult(content: unknown) {
  const text = contentText(content);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
