import { describe, expect, it } from "vitest";
import type { CoachSessionReport } from "@/lib/coach-check-in";
import { weeklyFixture } from "../evals/fixtures";
import { summarizeWeeklyCoach } from "./weekly-summary";

describe("weekly Coach summary", () => {
  it("removes large set histories and notes while preserving canonical figures, phases and pain scope", () => {
    const session: CoachSessionReport = {
      performedAt: "2026-09-18T12:00:00Z", finishedAt: "2026-09-18T13:00:00Z", programDayName: "Lower A",
      weekIndex: 4, durationMinutes: 60, completedWorkingSets: 15, prescribedWorkingSets: 15,
      feedback: { readiness: 3, jointPain: "significant", note: "private note ".repeat(1000) },
      exercises: Array.from({ length: 15 }, (_, i) => ({
        exerciseId: `exercise-${i}`, exerciseName: `Exercise ${i}`,
        prescription: { exerciseId: `exercise-${i}`, targetSets: 1, repMin: 6, repMax: 8, targetRirMin: 4, targetRirMax: 4, phaseName: "Recovery" },
        sets: Array.from({ length: 6 }, (_, index) => ({ setNumber: index + 1, weight: 100, reps: 8, rir: 4, e1rm: null })),
      })),
    };
    const report = { ...weeklyFixture.report,
      current: { ...weeklyFixture.report.current, sessions: Array.from({ length: 3 }, () => session) },
      prior: { ...weeklyFixture.report.prior, sessions: Array.from({ length: 4 }, () => session) },
    };
    const result = summarizeWeeklyCoach({ coachReport: report, coachRecommendations: weeklyFixture.recommendations, decisions: [] });
    expect(Buffer.byteLength(JSON.stringify(report))).toBeGreaterThan(128 * 1024);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(15 * 1024);
    for (const window of ["current", "prior"] as const) {
      const { sessions, ...metrics } = report[window];
      const { sessions: summaries, ...actual } = result.report[window];
      expect(actual).toEqual(metrics);
      expect(summaries).toHaveLength(sessions.length);
      expect(summaries[0]).toMatchObject({ phases: ["Recovery"], feedback: { readiness: 3, jointPain: "significant" } });
      expect(summaries[0]).not.toHaveProperty("exercises");
      expect(summaries[0]?.feedback).not.toHaveProperty("note");
    }
    expect(result.report.exerciseTrends).toEqual(report.exerciseTrends);
    expect(result.report.fixedLoadRepProgress).toEqual(report.fixedLoadRepProgress);
    expect(result.report.bodyweight).toEqual(report.bodyweight);
    expect(result.recommendations).toEqual(weeklyFixture.recommendations);
    expect(session.exercises[0]?.sets).toHaveLength(6);
    expect(session.feedback.note).toContain("private note");
  });
});
