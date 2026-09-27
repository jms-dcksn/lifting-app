import type { ThreadSummary } from "./chat-state";
import type { AgentMessage } from "./messages";

export type AgentStreamEvent =
  | { type: "thread"; thread: ThreadSummary; userMessage: AgentMessage }
  | { type: "text"; text: string }
  | { type: "tool-start"; name: string }
  | { type: "tool-end"; name: string }
  | { type: "done"; messages: AgentMessage[] }
  | { type: "error"; message: string };

export function encodeSse(event: AgentStreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseSseBlock(block: string): AgentStreamEvent | null {
  const line = block.split("\n").find((row) => row.startsWith("data:"));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(5).trim()) as AgentStreamEvent;
  } catch {
    return null;
  }
}

export async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) yield event;
    }
  }
}
