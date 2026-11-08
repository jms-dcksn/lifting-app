import { createHash } from "node:crypto";
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { fromLangChainMessages, toLangChainMessages, type AgentMessage } from "./messages";
import { presentCoachReviewSeed } from "@/lib/coach-discussion";

/** UUIDv8 for private, request-derived identities. */
export function stableUuid(key: string) {
  const bytes = createHash("sha256").update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Historical import never runs tools. Unfinished calls become explicit unavailable results. */
export function bootstrapMessages(rows: AgentMessage[]): BaseMessage[] {
  const imported = rows.flatMap(row => toLangChainMessages([presentCoachReviewSeed(row)]).map((message, index) => {
    const id = `ui:${row.id}${index ? `:${index}` : ""}`;
    if (HumanMessage.isInstance(message)) return new HumanMessage({ id, content: message.content });
    if (AIMessage.isInstance(message)) return new AIMessage({ id, content: message.content, tool_calls: message.tool_calls });
    if (ToolMessage.isInstance(message)) return new ToolMessage({ id, content: message.content, tool_call_id: message.tool_call_id, name: message.name });
    throw new Error("Unsupported historical message");
  }));
  return closeIncompleteCalls(imported);
}

export function closeIncompleteCalls(messages: BaseMessage[]): BaseMessage[] {
  const result: BaseMessage[] = [];
  const pending = new Map<string, string>();
  const close = () => {
    for (const [id, name] of pending) result.push(new ToolMessage({
      id: `bootstrap:unavailable:${id}`, tool_call_id: id, name,
      content: "Historical tool outcome unavailable after interruption. Do not infer success or repeat a write. Check current authorized domain state.",
    }));
    pending.clear();
  };
  for (const message of messages) {
    if (ToolMessage.isInstance(message)) {
      if (pending.delete(message.tool_call_id)) result.push(message);
      else result.push(new AIMessage({ id: message.id, content: "Historical tool result unavailable: its original call is missing." }));
      continue;
    }
    close();
    result.push(message);
    if (AIMessage.isInstance(message)) for (const call of message.tool_calls ?? []) {
      if (call.id) pending.set(call.id, call.name);
    }
  }
  close();
  return result;
}

export function projectionMessages(threadId: string, messages: BaseMessage[]) {
  return messages.flatMap(message => {
    if (!message.id || message.id.startsWith("ui:") || message.id.startsWith("bootstrap:")
      || HumanMessage.isInstance(message) || message.additional_kwargs.lc_source) return [];
    const converted = fromLangChainMessages([message]);
    return converted.map((row, index) => ({ ...row, id: stableUuid(`projection:${threadId}:${message.id}:${index}`) }));
  });
}
