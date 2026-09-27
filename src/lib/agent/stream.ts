export type AgentStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool-start"; name: string }
  | { type: "tool-end"; name: string }
  | { type: "done"; messages: unknown }
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
