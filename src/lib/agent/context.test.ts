import { describe, expect, it, vi } from "vitest";
import {
  enrichScreenContext,
  formatScreenContextForPrompt,
  parseScreenContextFromPath,
  parseScreenContextInput,
} from "./context";

vi.mock("@/lib/program", () => ({
  getActiveProgram: vi.fn(async () => ({ id: "prog-active" })),
}));

describe("agent screen context", () => {
  it("parses pathname fields for session, history, and program routes", () => {
    expect(parseScreenContextFromPath("/")).toEqual({
      pathname: "/",
      activeProgramId: null,
      openSessionId: null,
      focusedExerciseId: null,
    });
    expect(parseScreenContextFromPath("/session/abc-123")).toEqual({
      pathname: "/session/abc-123",
      activeProgramId: null,
      openSessionId: "abc-123",
      focusedExerciseId: null,
    });
    expect(parseScreenContextFromPath("/session/abc-123/recap")).toEqual({
      pathname: "/session/abc-123/recap",
      activeProgramId: null,
      openSessionId: null,
      focusedExerciseId: null,
    });
    expect(parseScreenContextFromPath("/history/bb-bench")).toEqual({
      pathname: "/history/bb-bench",
      activeProgramId: null,
      openSessionId: null,
      focusedExerciseId: "bb-bench",
    });
    expect(parseScreenContextFromPath("/program/prog-1")).toEqual({
      pathname: "/program/prog-1",
      activeProgramId: "prog-1",
      openSessionId: null,
      focusedExerciseId: null,
    });
  });

  it("rejects malformed context input", () => {
    expect(parseScreenContextInput(null)).toBeNull();
    expect(parseScreenContextInput({ pathname: "home" })).toBeNull();
    expect(parseScreenContextInput({
      pathname: "/",
      activeProgramId: null,
      openSessionId: null,
      focusedExerciseId: null,
    })).toEqual({
      pathname: "/",
      activeProgramId: null,
      openSessionId: null,
      focusedExerciseId: null,
    });
  });

  it("enriches activeProgramId from the active program loader", async () => {
    const enriched = await enrichScreenContext({} as never, "user-1", parseScreenContextFromPath("/"));
    expect(enriched.activeProgramId).toBe("prog-active");
  });

  it("formats context for the system prompt", () => {
    const text = formatScreenContextForPrompt({
      pathname: "/history/bb-bench",
      activeProgramId: "prog-1",
      openSessionId: null,
      focusedExerciseId: "bb-bench",
    });
    expect(text).toContain("focusedExerciseId: bb-bench");
    expect(text).toContain("activeProgramId: prog-1");
  });
});
