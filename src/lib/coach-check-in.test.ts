import { describe, expect, it } from "vitest";
import type { AnalyticsSetRow } from "./analytics";
import { buildCoachCheckIn } from "./coach-check-in";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const row = (overrides: Partial<AnalyticsSetRow>): AnalyticsSetRow => ({
  id: "set-1",
  sessionId: "session-1",
  exerciseId: "bb-bench",
  weight: 185,
  reps: 8,
  rir: 1,
  e1rm: 236,
  createdAt: "2026-08-29T12:00:00Z",
  performedAt: "2026-08-29T12:00:00Z",
  finishedAt: "2026-08-29T13:00:00Z",
  programId: "program-1",
  isWarmup: false,
  ...overrides,
});

describe("buildCoachCheckIn", () => {
  it("summarizes adherence, RIR, pattern volume, and performance", () => {
    const output = buildCoachCheckIn(
      [row({}), row({ id: "set-2", exerciseId: "cable-pushdown", weight: 70, reps: 12, rir: 0, e1rm: 98 })],
      EXERCISE_BY_ID,
      { now: new Date("2026-08-31T12:00:00Z"), programName: "James HIT", plannedSessions: 4 },
    );

    expect(output).toContain("Program: James HIT");
    expect(output).toContain("Adherence: 1/4 sessions");
    expect(output).toContain("RIR: 0.5 average · 1 at 0 · 1 at 1 · 0 at 2+");
    expect(output).toContain("Horizontal Press: 1 / 1");
    expect(output).toContain("Barbell Bench Press: 185 lb × 8 @ 1 RIR");
  });

  it("excludes unfinished and out-of-window sessions", () => {
    const output = buildCoachCheckIn(
      [
        row({ finishedAt: null }),
        row({ id: "old", sessionId: "old", performedAt: "2026-08-01T12:00:00Z", finishedAt: "2026-08-01T13:00:00Z" }),
      ],
      EXERCISE_BY_ID,
      { now: new Date("2026-08-31T12:00:00Z"), plannedSessions: 4 },
    );

    expect(output).toContain("Adherence: 0/4 sessions");
    expect(output).toContain("Working sets: 0");
    expect(output).toContain("No finished-session performances in this window.");
  });

  it("includes optional feedback and explicitly flags significant joint pain", () => {
    const output = buildCoachCheckIn([row({})], EXERCISE_BY_ID, {
      now: new Date("2026-08-31T12:00:00Z"),
      sessionFeedback: [
        {
          sessionId: "session-1",
          performedAt: "2026-08-29T12:00:00Z",
          finishedAt: "2026-08-29T13:00:00Z",
          readiness: 2,
          jointPain: "significant",
          note: "Right shoulder hurt during pressing.",
        },
      ],
    });

    expect(output).toContain("SESSION FEEDBACK");
    expect(output).toContain("readiness 2/5");
    expect(output).toContain("joint pain significant — SIGNIFICANT; pause progression advice and review");
    expect(output).toContain("Note: Right shoulder hurt during pressing.");
  });

  it("handles missing and unfinished feedback without inventing a fatigue signal", () => {
    const output = buildCoachCheckIn([row({})], EXERCISE_BY_ID, {
      now: new Date("2026-08-31T12:00:00Z"),
      sessionFeedback: [
        {
          sessionId: "open-session",
          performedAt: "2026-08-30T12:00:00Z",
          finishedAt: null,
          readiness: 1,
          jointPain: null,
          note: null,
        },
      ],
    });

    expect(output).toContain("No session feedback logged in this window.");
    expect(output).not.toContain("readiness 1/5");
  });
});
