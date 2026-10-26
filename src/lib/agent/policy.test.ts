import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_NAV_TOOL_NAMES,
  CONFIRM_TOOL_NAMES,
  CONTEXT_MESSAGE_LIMIT,
  LANGSMITH_PROJECT_NAME,
  enableLangSmithTracing,
  agentTraceMetadata,
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
    expect(LANGSMITH_PROJECT_NAME).toBe("lifting-app-dev");
    expect(WRITE_TOOL_NAMES).toEqual(["draftProgramFromIntake"]);
    expect(READ_TOOL_NAMES).toEqual([
      "weeklyCoach",
      "activeProgram",
      "exerciseReview",
      "nextWorkout",
      "calculateE1rm",
    ]);
    expect(CLIENT_NAV_TOOL_NAMES).toEqual([
      "openExerciseReview",
      "openCoachCheckIn",
      "openProgram",
    ]);
    expect(CONFIRM_TOOL_NAMES).toEqual(["startNextWorkout", "draftProgramFromIntake"]);
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


describe("LangSmith environment routing", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "preview", "production"])("defaults correctly for VERCEL_ENV=%s without using NODE_ENV", (environment) => {
    vi.stubEnv("LANGSMITH_API_KEY", "fixture-key");
    vi.stubEnv("LANGSMITH_PROJECT", "");
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("NODE_ENV", "production");
    enableLangSmithTracing();
    expect(process.env.LANGSMITH_PROJECT).toBe(environment === "production" ? "lifting-app" : "lifting-app-dev");
    expect(agentTraceMetadata()).toMatchObject({ app: "lifting-app", environment: environment === "production" ? "prod" : "dev",
      source: environment === "preview" ? "preview" : environment === "production" ? "production" : "local" });
  });

  it("preserves an explicit deployment project and disabled tracing", () => {
    vi.stubEnv("LANGSMITH_API_KEY", "fixture-key");
    vi.stubEnv("LANGSMITH_PROJECT", "lifting-app");
    vi.stubEnv("LANGSMITH_TRACING", "false");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(enableLangSmithTracing()).toBe(true);
    expect(process.env.LANGSMITH_PROJECT).toBe("lifting-app");
    expect(process.env.LANGSMITH_TRACING).toBe("false");
  });

  it("adds available revision and branch metadata without reading git at runtime", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "vercel-sha");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature-branch");
    vi.stubEnv("LANGSMITH_REVISION_ID", "local-sha");
    expect(agentTraceMetadata()).toMatchObject({ codeSha: "vercel-sha", branch: "feature-branch" });
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    expect(agentTraceMetadata().codeSha).toBe("local-sha");
  });
});
