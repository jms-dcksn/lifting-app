import { describe, expect, it } from "vitest";
import {
  buildCoachRecommendations,
  formatCoachRecommendations,
  type BuildCoachRecommendationsInput,
} from "./coach-recommendations";
import {
  buildCoachCheckInReport,
  type BuildCoachReportInput,
  type CoachPhaseInput,
  type CoachSessionInput,
  type CoachSetInput,
  type CoachSlotInput,
} from "./coach-check-in";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const NOW = new Date("2026-09-03T17:00:00Z");

function session(index: number, overrides: Partial<CoachSessionInput> = {}): CoachSessionInput {
  const performedAt = new Date(Date.UTC(2026, 6, 30 + index * 7, 15)).toISOString();
  return {
    id: `session-${index}`,
    performedAt,
    finishedAt: new Date(new Date(performedAt).getTime() + 45 * 60_000).toISOString(),
    programId: "program-1",
    programDayId: "day-1",
    programDayName: "Upper A",
    weekIndex: index,
    readiness: 4,
    jointPain: "none",
    note: null,
    ...overrides,
  };
}

function set(
  sessionId: string,
  overrides: Partial<CoachSetInput> = {},
): CoachSetInput {
  return {
    sessionId,
    programSlotId: "slot-1",
    exerciseId: "bb-bench",
    setIndex: 0,
    weight: 185,
    reps: 8,
    rir: 1,
    e1rm: 235,
    isWarmup: false,
    createdAt: "2026-09-01T15:05:00Z",
    ...overrides,
  };
}

const slot: CoachSlotInput = {
  id: "slot-1",
  programId: "program-1",
  programDayId: "day-1",
  exerciseId: "bb-bench",
  targetSets: 2,
  repMin: 6,
  repMax: 10,
  targetRir: 1,
};

function build(
  sessions: CoachSessionInput[],
  sets: CoachSetInput[],
  overrides: Partial<BuildCoachRecommendationsInput> = {},
) {
  const reportInput: BuildCoachReportInput = {
    generatedAt: NOW,
    programName: "Test block",
    plannedSessions: 1,
    sessions,
    sets,
    slots: [slot],
    phases: [],
    definitions: EXERCISE_BY_ID,
    currentBodyweight: 180,
  };
  return buildCoachRecommendations({
    ...reportInput,
    report: buildCoachCheckInReport(reportInput),
    activeProgramId: "program-1",
    ...overrides,
  });
}

describe("buildCoachRecommendations", () => {
  it("adds load exactly as sessionTarget does when the rep ceiling is earned", () => {
    const latest = session(5);
    const recommendation = build([latest], [set(latest.id, { reps: 10 })])[0];

    expect(recommendation).toMatchObject({
      kind: "add_load",
      action: { targetWeight: 190, targetReps: 6 },
      confidence: "low",
    });
  });

  it("holds load and adds a rep for flat performance below the ceiling", () => {
    const sessions = [session(3), session(4), session(5)];
    const recommendation = build(
      sessions,
      sessions.map((item) => set(item.id, { reps: 8, e1rm: 235, createdAt: item.performedAt })),
    )[0];

    expect(recommendation).toMatchObject({
      kind: "add_rep",
      action: { targetWeight: 185, targetReps: 9 },
      confidence: "high",
    });
  });

  it("reduces load and returns to rep_min after a below-range first set", () => {
    const latest = session(5);
    const recommendation = build(
      [latest],
      [set(latest.id, { weight: 185, reps: 4, rir: 1 })],
    )[0];

    expect(recommendation).toMatchObject({
      kind: "reduce_load",
      action: { targetWeight: 175, targetReps: 6 },
    });
    expect(recommendation.rationale).toContain("6–10 rep range");
  });

  it("keeps weighted pull-up recommendations inside the prescribed rep range", () => {
    const latest = session(5);
    const pullupSlot = { ...slot, exerciseId: "weighted-pullup", targetRir: 2 };
    const reportInput: BuildCoachReportInput = {
      generatedAt: NOW,
      sessions: [latest],
      sets: [set(latest.id, {
        exerciseId: "weighted-pullup",
        weight: 60,
        reps: 2,
        rir: 2,
      })],
      slots: [pullupSlot],
      phases: [],
      definitions: EXERCISE_BY_ID,
      currentBodyweight: 180,
    };
    const recommendation = buildCoachRecommendations({
      ...reportInput,
      report: buildCoachCheckInReport(reportInput),
      activeProgramId: "program-1",
    })[0];

    expect(recommendation).toMatchObject({
      kind: "reduce_load",
      action: { targetWeight: 30, targetReps: 6 },
    });
  });

  it("keeps a movement after one regressed exposure", () => {
    const sessions = [session(4), session(5)];
    const recommendation = build(sessions, [
      set(sessions[0].id, { e1rm: 240, createdAt: sessions[0].performedAt }),
      set(sessions[1].id, { e1rm: 220, createdAt: sessions[1].performedAt }),
    ])[0];

    expect(recommendation.kind).toBe("keep_movement");
    expect(recommendation.rationale).toContain("one poor performance");
  });

  it("requires repeated harder-than-target RIR misses before reducing load", () => {
    const sessions = [session(3), session(4), session(5)];
    const oneMiss = build(sessions.slice(1), [
      set(sessions[1].id, { rir: 1, createdAt: sessions[1].performedAt }),
      set(sessions[2].id, { rir: 0, createdAt: sessions[2].performedAt }),
    ])[0];
    const repeated = build(sessions, sessions.map((item) =>
      set(item.id, { rir: 0, createdAt: item.performedAt }),
    ))[0];

    expect(oneMiss.kind).not.toBe("reduce_load");
    expect(repeated).toMatchObject({
      kind: "reduce_load",
      action: { targetWeight: 180 },
    });
  });

  it("preserves negative assisted-bodyweight load when recalibrating", () => {
    const sessions = [session(4), session(5)];
    const pullupSlot = { ...slot, exerciseId: "weighted-pullup" };
    const reportInput: BuildCoachReportInput = {
      generatedAt: NOW,
      sessions,
      sets: sessions.map((item) => set(item.id, {
        exerciseId: "weighted-pullup",
        weight: -20,
        rir: 0,
        createdAt: item.performedAt,
      })),
      slots: [pullupSlot],
      phases: [],
      definitions: EXERCISE_BY_ID,
      currentBodyweight: 180,
    };
    const recommendation = buildCoachRecommendations({
      ...reportInput,
      report: buildCoachCheckInReport(reportInput),
      activeProgramId: "program-1",
    })[0];

    expect(recommendation).toMatchObject({
      kind: "reduce_load",
      action: { targetWeight: -25 },
    });
  });

  it("uses the existing plateau criteria before proposing a plateau review", () => {
    const sessions = [session(0), session(1), session(2), session(3), session(4), session(5)];
    const e1rms = [230, 240, 238, 239, 237, 238];
    const recommendation = build(
      sessions,
      sessions.map((item, index) => set(item.id, {
        e1rm: e1rms[index],
        createdAt: item.performedAt,
      })),
    )[0];

    expect(recommendation.kind).toBe("plateau_review");
    expect(recommendation.dataSufficiency).toContain("4-exposure patience rule");
  });

  it("suppresses normal overload during an effective deload week", () => {
    const latest = session(5, { weekIndex: 6 });
    const deload: CoachPhaseInput = {
      id: "phase-1",
      programId: "program-1",
      position: 0,
      name: "Deload",
      description: null,
      weekStart: 6,
      weekEnd: 6,
      targetRirMin: 3,
      targetRirMax: 4,
      setMultiplier: 0.5,
    };
    const recommendation = build([latest], [set(latest.id, { reps: 10, rir: 4 })], {
      phases: [deload],
    })[0];

    expect(recommendation.kind).toBe("deload_hold");
  });

  it("stops progression advice for significant pain", () => {
    const latest = session(5, { jointPain: "significant", note: "Shoulder pain" });
    const recommendation = build([latest], [set(latest.id)])[0];

    expect(recommendation).toMatchObject({
      kind: "pain_review",
      confidence: "high",
    });
    expect(recommendation.rationale).toContain("not a diagnosis");
  });

  it("reports insufficient data instead of guessing", () => {
    const recommendation = build([], [])[0];

    expect(recommendation).toMatchObject({
      kind: "insufficient_data",
      confidence: "insufficient",
      evidence: { exposureCount: 0 },
    });
  });

  it("formats action, rationale, evidence window, and confidence", () => {
    const latest = session(5);
    const output = formatCoachRecommendations(build([latest], [set(latest.id, { reps: 10 })]));

    expect(output).toContain("COACH RECOMMENDATIONS");
    expect(output).toContain("Why:");
    expect(output).toContain("Evidence: 1 exposure");
    expect(output).toContain("confidence low");
  });
});
