import type { AgentPart } from "./messages";

export function intakeChipsFromParts(parts: AgentPart[]): string[] {
  for (const part of parts) {
    if (part.type !== "tool-result" || part.omitted) continue;
    const result = part.result;
    if (!result || typeof result !== "object") continue;
    const chips = (result as { chips?: unknown }).chips;
    if (!Array.isArray(chips)) continue;
    const labels = chips.filter((chip): chip is string => typeof chip === "string" && chip.trim().length > 0);
    if (labels.length) return labels;
  }
  return [];
}
