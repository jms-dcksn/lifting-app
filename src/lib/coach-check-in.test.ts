import { describe, expect, it } from "vitest";
import {
  COACH_REPORT_VERSION,
  SPECIALIZATION_GROUPS,
  buildCoachCheckInReport,
  formatCoachCheckIn,
  type BuildCoachReportInput,
  type CoachPhaseInput,
  type CoachSessionInput,
  type CoachSetInput,
  type CoachSlotInput,
} from "./coach-check-in";
import { bodyweightTrend } from "./bodyweight";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const NOW = new Date("2026-09-03T17:00:00Z");

const session = (
  id: string,
  performedAt: string,
  overrides: Partial<CoachSessionInput> = {},
): CoachSessionInput => ({
  id,
  performedAt,
  finishedAt: new Date(new Date(performedAt).getTime() + 45 * 60_000).toISOString(),
  programId: "program-secret",
  programDayId: "day-secret",
  programDayName: "Upper A",
  weekIndex: 2,
  readiness: 4,
  jointPain: "none",
  note: null,
  ...overrides,
});

const set = (
  sessionId: string,
  exerciseId: string,
  overrides: Partial<CoachSetInput> = {},
): CoachSetInput => ({
  sessionId,
  programSlotId: "slot-secret",
  exerciseId,
  setIndex: 0,
  weight: 185,
  reps: 8,
  rir: 1,
  e1rm: 236,
  isWarmup: false,
  createdAt: "2026-09-01T12:05:00Z",
  ...overrides,
});

const slot = (overrides: Partial<CoachSlotInput> = {}): CoachSlotInput => ({
  id: "slot-secret",
  programId: "program-secret",
  programDayId: "day-secret",
  exerciseId: "bb-bench",
  targetSets: 3,
  repMin: 6,
  repMax: 10,
  targetRir: 1,
  ...overrides,
});

const input = (overrides: Partial<BuildCoachReportInput> = {}): BuildCoachReportInput => ({
  generatedAt: NOW,
  programName: "James HIT",
  plannedSessions: 4,
  sessions: [],
  sets: [],
  slots: [slot()],
  phases: [],
  definitions: EXERCISE_BY_ID,
  currentBodyweight: 180,
  bodyweightTrend: bodyweightTrend(
    [
      { id: "prior", loggedOn: "2026-08-25", weight: 182 },
      { id: "current-1", loggedOn: "2026-08-31", weight: 180 },
      { id: "current-2", loggedOn: "2026-09-03", weight: 179 },
    ],
    "2026-09-03",
  ),
  ...overrides,
});

describe("buildCoachCheckInReport", () => {
  it("builds versioned, non-overlapping windows and strips internal row identifiers", () => {
    const sessions = [
      session("prior-session-secret", "2026-08-27T15:00:00Z"),
      session("current-session-secret", "2026-08-28T15:00:00Z"),
    ];
    const report = buildCoachCheckInReport(input({
      sessions,
      sets: [
        set(sessions[0].id, "bb-bench", { createdAt: "2026-08-27T15:05:00Z" }),
        set(sessions[1].id, "bb-bench", { createdAt: "2026-08-28T15:05:00Z" }),
      ],
    }));

    expect(report.version).toBe(COACH_REPORT_VERSION);
    expect(report.windows).toEqual({
      current: { startDate: "2026-08-28", endDate: "2026-09-03" },
      prior: { startDate: "2026-08-21", endDate: "2026-08-27" },
    });
    expect(report.current.adherence.completedSessions).toBe(1);
    expect(report.prior.adherence.completedSessions).toBe(1);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("current-session-secret");
    expect(serialized).not.toContain("slot-secret");
    expect(serialized).not.toContain("program-secret");
  });

  it("uses effective deload prescriptions and retains them through a substitution", () => {
    const deload: CoachPhaseInput = {
      id: "phase-secret",
      programId: "program-secret",
      position: 0,
      name: "Deload",
      description: null,
      weekStart: 6,
      weekEnd: 6,
      targetRirMin: 3,
      targetRirMax: 4,
      setMultiplier: 0.5,
    };
    const current = session("current", "2026-09-01T15:00:00Z", { weekIndex: 6 });
    const report = buildCoachCheckInReport(input({
      sessions: [current],
      phases: [deload],
      sets: [
        set(current.id, "db-bench", { weight: 70, rir: 3, e1rm: 95 }),
        set(current.id, "db-bench", { setIndex: 1, weight: 70, reps: 7, rir: 4, e1rm: 92 }),
      ],
    }));

    expect(report.current.setExecution).toMatchObject({
      completedWorkingSets: 2,
      prescribedWorkingSets: 2,
      completionRate: 1,
    });
    const execution = report.current.sessions[0].exercises[0];
    expect(execution.exerciseId).toBe("db-bench");
    expect(execution.prescription).toMatchObject({
      exerciseId: "bb-bench",
      targetSets: 2,
      targetRirMin: 3,
      targetRirMax: 4,
      phaseName: "Deload",
    });
    expect(report.current.rirExecution.withinTargetSets).toBe(2);
  });

  it("reports unfinished sessions, implausible duration, missing RIR, and unmatched slots", () => {
    const badDuration = session("bad-duration", "2026-09-01T15:00:00Z", {
      finishedAt: "2026-09-01T15:01:00Z",
    });
    const open = session("open", "2026-09-02T15:00:00Z", { finishedAt: null });
    const report = buildCoachCheckInReport(input({
      sessions: [badDuration, open],
      sets: [set(badDuration.id, "bb-bench", { programSlotId: null, rir: null })],
    }));

    expect(report.current.duration.averageMinutes).toBeNull();
    expect(report.current.dataQuality).toMatchObject({
      unfinishedSessions: 1,
      implausibleDurationSessions: 1,
      unmatchedProgramSlotSets: 1,
      missingRirSets: 1,
    });
    expect(report.current.rirExecution).toMatchObject({
      missingSets: 1,
      loggedSets: 0,
    });
  });

  it("compares best reps only at the same exercise and raw load across windows", () => {
    const prior = session("prior", "2026-08-25T15:00:00Z");
    const current = session("current", "2026-09-01T15:00:00Z");
    const report = buildCoachCheckInReport(input({
      sessions: [prior, current],
      sets: [
        set(prior.id, "bb-bench", { weight: 185, reps: 8, rir: 1, createdAt: "2026-08-25T15:05:00Z" }),
        set(prior.id, "bb-bench", { weight: 190, reps: 6, createdAt: "2026-08-25T15:06:00Z" }),
        set(current.id, "bb-bench", { weight: 185, reps: 10, rir: 2, createdAt: "2026-09-01T15:05:00Z" }),
        set(current.id, "db-bench", { weight: 70, reps: 12, createdAt: "2026-09-01T15:06:00Z" }),
      ],
    }));

    expect(report.fixedLoadRepProgress).toEqual([
      expect.objectContaining({
        exerciseId: "bb-bench",
        weight: 185,
        currentBestReps: 10,
        priorBestReps: 8,
        repChange: 2,
        currentRir: 2,
        priorRir: 1,
      }),
    ]);
  });

  it("requires four exposures and will not call one poor session a decline", () => {
    const sessions = [
      session("s1", "2026-08-01T15:00:00Z"),
      session("s2", "2026-08-08T15:00:00Z"),
      session("s3", "2026-08-15T15:00:00Z"),
      session("s4", "2026-08-22T15:00:00Z"),
    ];
    const report = buildCoachCheckInReport(input({
      sessions,
      sets: sessions.map((item, index) => set(item.id, "bb-bench", {
        e1rm: [100, 102, 101, 80][index],
        createdAt: item.performedAt,
      })),
    }));

    expect(report.exerciseTrends[0]).toMatchObject({
      classification: "flat",
      evidenceExposureCount: 4,
    });
  });

  it("classifies sustained gaining and declining evidence across four exposures", () => {
    const sessions = [1, 2, 3, 4].map((week) =>
      session(`s${week}`, `2026-08-${String(week * 6).padStart(2, "0")}T15:00:00Z`),
    );
    const report = buildCoachCheckInReport(input({
      sessions,
      sets: [
        ...sessions.map((item, index) => set(item.id, "bb-bench", {
          e1rm: [100, 101, 104, 105][index],
          createdAt: item.performedAt,
        })),
        ...sessions.map((item, index) => set(item.id, "bb-curl", {
          e1rm: [105, 104, 100, 99][index],
          createdAt: item.performedAt,
        })),
      ],
    }));

    expect(report.exerciseTrends.find((trend) => trend.exerciseId === "bb-bench")?.classification).toBe("gaining");
    expect(report.exerciseTrends.find((trend) => trend.exerciseId === "bb-curl")?.classification).toBe("declining");
  });

  it("uses explicit specialization mappings and counts 0–1 RIR hard sets", () => {
    const current = session("current", "2026-09-01T15:00:00Z");
    const exercises = [
      "bb-ohp",
      "bb-curl",
      "cable-pushdown",
      "bb-back-squat",
      "seated-leg-curl",
      "bb-hip-thrust",
      "standing-calf-raise",
    ];
    const report = buildCoachCheckInReport(input({
      sessions: [current],
      sets: exercises.map((exerciseId, index) => set(current.id, exerciseId, {
        programSlotId: null,
        rir: index % 2,
        createdAt: `2026-09-01T15:${String(index).padStart(2, "0")}:00Z`,
      })),
    }));

    expect(SPECIALIZATION_GROUPS.delts.patterns).toContain("vertical_press");
    expect(report.current.specializationVolume).toEqual([
      expect.objectContaining({ group: "delts", workingSets: 1, hardSets: 1 }),
      expect.objectContaining({ group: "biceps", workingSets: 1, hardSets: 1 }),
      expect.objectContaining({ group: "triceps", workingSets: 1, hardSets: 1 }),
      expect.objectContaining({ group: "quads", workingSets: 1, hardSets: 1 }),
      expect.objectContaining({ group: "hamstrings", workingSets: 1, hardSets: 1 }),
      expect.objectContaining({ group: "glutes", workingSets: 2, hardSets: 2 }),
      expect.objectContaining({ group: "calves", workingSets: 1, hardSets: 1 }),
    ]);
  });

  it("formats the canonical report as readable text without recomputing metrics", () => {
    const current = session("current", "2026-09-01T15:00:00Z", {
      jointPain: "significant",
      note: "Right shoulder hurt during pressing.",
    });
    const report = buildCoachCheckInReport(input({
      sessions: [current],
      sets: [set(current.id, "bb-bench")],
    }));
    const output = formatCoachCheckIn(report);

    expect(output).toContain("Report schema: 1.0");
    expect(output).toContain("Duration: 45.0 min average · target 45 min");
    expect(output).toContain("Current 7-day average: 179.5 lb (2 observations)");
    expect(output).toContain("Delts: 0 / 0");
    expect(output).toContain("Barbell Bench Press: 3×6–10 @ 1 RIR");
    expect(output).toContain("SIGNIFICANT; pause progression advice and review");
    expect(output).not.toContain("current-session-secret");
  });

  it("returns deliberate thin-data states rather than classifying absence as flat", () => {
    const report = buildCoachCheckInReport(input());

    expect(report.current.adherence.completedSessions).toBe(0);
    expect(report.current.duration.averageMinutes).toBeNull();
    expect(report.current.setExecution.completionRate).toBeNull();
    expect(report.exerciseTrends).toEqual([]);
    expect(report.fixedLoadRepProgress).toEqual([]);
  });
});
