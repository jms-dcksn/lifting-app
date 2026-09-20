import { describe, expect, it } from "vitest";
import {
  CONTEXT_MESSAGE_LIMIT,
  LANGSMITH_PROJECT_NAME,
  MODEL_CONTEXT_CHAR_BUDGET,
  READ_TOOL_NAMES,
  TOOL_CALL_BUDGET,
  WRITE_TOOL_NAMES,
} from "./policy";
import { selectModelMessages, type AgentMessage } from "./messages";

function message(
  id: string,
  role: AgentMessage["role"],
  parts: AgentMessage["parts"],
): AgentMessage {
  return { id, role, parts, createdAt: "2026-09-20T00:00:00.000Z" };
}

describe("agent policy", () => {
  it("names last-N, budget, and a dedicated LangSmith project", () => {
    expect(CONTEXT_MESSAGE_LIMIT).toBeGreaterThan(0);
    expect(MODEL_CONTEXT_CHAR_BUDGET).toBeGreaterThan(1000);
    expect(TOOL_CALL_BUDGET).toBeGreaterThan(0);
    expect(LANGSMITH_PROJECT_NAME).toBe("lifting-app-agent");
    expect(WRITE_TOOL_NAMES).toEqual([]);
    expect(READ_TOOL_NAMES).toEqual([
      "weeklyCoach",
      "activeProgram",
      "exerciseReview",
      "nextWorkout",
    ]);
  });

  it("sends only the last N messages and drops old tool results first", () => {
    const history = Array.from({ length: 24 }, (_, index) => {
      if (index % 3 === 0) {
        return message(`u${index}`, "user", [{ type: "text", text: `q${index}` }]);
      }
      if (index % 3 === 1) {
        return message(`a${index}`, "assistant", [
          { type: "text", text: `a${index}` },
          { type: "tool-call", id: `c${index}`, name: "weeklyCoach", args: {} },
        ]);
      }
      return message(`t${index}`, "tool", [{
        type: "tool-result",
        id: `c${index - 1}`,
        name: "weeklyCoach",
        result: { blob: "x".repeat(8000) },
      }]);
    });
    const windowed = selectModelMessages(history);
    expect(windowed.length).toBeLessThanOrEqual(CONTEXT_MESSAGE_LIMIT + 1);
    expect(windowed.at(-1)?.id).toBe(history.at(-1)?.id);
    const omitted = windowed.flatMap((message) =>
      message.parts.filter((part) => part.type === "tool-result" && part.omitted),
    );
    expect(omitted.length).toBeGreaterThan(0);
    expect(windowed.some((message) => message.role === "user")).toBe(true);
  });
});
