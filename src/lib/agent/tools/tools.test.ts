import { describe, expect, it, vi } from "vitest";
import { weeklyCoach } from "./weekly-coach";
import { activeProgram } from "./active-program";
import { resolveExerciseIdentity, summarizeExerciseReview } from "./exercise-review";
import { hydrateSlotTargets } from "./next-workout";
import { weeklyFixture } from "../evals/fixtures";
import { EXERCISES } from "@/lib/strength/coefficients";
import { groupReviewSessions } from "@/lib/exercise-review-sessions";
import { sessionTarget } from "@/lib/strength/progression";

vi.mock("@/lib/coach-ui-data", () => ({
  loadCoachUi: vi.fn(async () => ({
    catalog: {},
    coachReport: weeklyFixture.report,
    coachRecommendations: weeklyFixture.recommendations,
    coachCheckIn: weeklyFixture.checkInText,
    decisions: [],
  })),
}));

vi.mock("@/lib/program", () => ({
  getActiveProgram: vi.fn(async () => ({
    id: "prog-1",
    name: "Strong Foundations",
    description: null,
    tags: [],
    weeks: 12,
    isActive: true,
    style: "classic",
    phases: [],
    days: [{
      id: "day-1",
      name: "Lower A",
      slots: [{
        id: "slot-squat",
        exerciseId: "bb-back-squat",
        pattern: "squat",
        targetSets: 3,
        repMin: 6,
        repMax: 8,
        targetRir: 1,
        restSeconds: null,
        plateauPatience: null,
      }],
    }],
  })),
}));

describe("agent read tools", () => {
  it("weeklyCoach wraps loadCoachUi and omits the catalog", async () => {
    const result = await weeklyCoach({} as never, "user-1");
    expect(result.source).toBe("weeklyCoach");
    expect(result.checkInText).toContain("3/4");
    expect(result).not.toHaveProperty("catalog");
  });

  it("activeProgram wraps getActiveProgram", async () => {
    const result = await activeProgram({} as never, "user-1");
    expect(result.source).toBe("activeProgram");
    expect(result.program?.name).toBe("Strong Foundations");
    expect(result.program?.days[0]?.slots[0]?.exerciseId).toBe("bb-back-squat");
  });

  it("exerciseReview keeps exact identity and Last / 21-day / chart summaries", () => {
    const sessions = groupReviewSessions([
      {
        id: "a",
        sessionId: "s1",
        weight: 225,
        reps: 8,
        rir: 1,
        e1rm: 292.5,
        performedAt: "2026-09-18T12:00:00.000Z",
        finishedAt: "2026-09-18T13:00:00.000Z",
        programId: "p",
      },
    ], new Date("2026-09-20T12:00:00.000Z"));
    const summary = summarizeExerciseReview({
      exerciseId: "bb-back-squat",
      exerciseName: "Barbell Back Squat",
      equipmentInstanceId: null,
      equipmentLabel: null,
      identities: [null],
      sessions,
    });
    expect(summary.last?.bestE1rm).toBe(292.5);
    expect(summary.chartLast8[0]?.e1rm).toBe(292.5);
    expect(summary.recent21Days && summary.recent21Days.kind).toBe("sessions");
  });

  it("does not guess when two squat names match", () => {
    const catalog = Object.fromEntries(EXERCISES.map((def) => [def.id, def]));
    const resolved = resolveExerciseIdentity(catalog, { name: "squat" });
    expect("needsDisambiguation" in resolved || "matches" in resolved).toBe(true);
  });

  it("nextWorkout targets use the same sessionTarget path", () => {
    const catalog = Object.fromEntries(EXERCISES.map((def) => [def.id, def]));
    const last = { weight: 225, reps: 8, rir: 1 };
    const expected = sessionTarget(
      catalog["bb-back-squat"],
      { repMin: 6, repMax: 8, targetRir: 1 },
      last,
      catalog,
      [],
      142,
    );
    const slots = hydrateSlotTargets({
      slots: [{
        id: "slot-squat",
        exerciseId: "bb-back-squat",
        targetSets: 3,
        prescription: { repMin: 6, repMax: 8, targetRir: 1 },
      }],
      catalog,
      stats: [],
      bodyweight: 142,
      progressionByExercise: {
        "bb-back-squat": [{
          programSlotId: "slot-squat",
          performedAt: "2026-09-18T12:00:00.000Z",
          weight: 225,
          reps: 8,
          rir: 1,
          e1rm: 292.5,
        }],
      },
    });
    expect(slots[0]?.target?.weight).toBe(expected?.weight);
    expect(slots[0]?.target?.targetReps).toBe(expected?.targetReps);
    expect(slots[0]?.targetEngine).toBe("sessionTarget");
  });
});
