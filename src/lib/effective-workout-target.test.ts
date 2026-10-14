import { describe, expect, it } from "vitest";
import { buildWorkoutTargetHistory, effectiveTargetExplanation, resolveEffectiveWorkoutTarget, type EffectiveTargetInput } from "./effective-workout-target";
import { resolvePrescription } from "./periodization";
import { stallContext, type StallHistory } from "./stall-report";
import { classifyCoachExceptions } from "./coach-exceptions";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { computeE1rm } from "./strength/e1rm";
import { sessionTarget } from "./strength/progression";
import { hydrateSlotTargets } from "./agent/tools/next-workout";

const now = new Date("2026-09-30T20:00:00Z");

function targetFixture(count = 2, exerciseId = "bb-bench") {
  const sessions = Array.from({ length: count }, (_, index) => ({ id: `s${index}`,
    performedAt: `2026-09-${15 + index * 7}T12:00:00Z`, finishedAt: `2026-09-${15 + index * 7}T13:00:00Z`,
    programId: "program", programDayId: "day", weekIndex: index + 1, isDeload: false }));
  const history: StallHistory & { sets: Array<StallHistory["sets"][number] & { set_index: number }> } = {
    userId: "user", sessions, sets: sessions.map(session => ({ id: `set-${session.id}`, user_id: "user",
      session_id: session.id, program_slot_id: "slot", exercise_id: exerciseId, equipment_instance_id: null,
      weight: 100, reps: 8, rir: 2, e1rm: computeE1rm(100, 8, 2), set_index: 0,
      is_warmup: false, is_deload: false, created_at: session.performedAt.replace("12:00", "12:05"),
      workout_session: { performed_at: session.performedAt, finished_at: session.finishedAt } })),
    slots: [{ id: "slot", programId: "program", programDayId: "day", exerciseId, targetSets: 2,
      repMin: 6, repMax: 10, targetRir: 2 }], phases: [], adaptations: [],
  };
  return history;
}

function inputFor(history = targetFixture(), overrides: Partial<EffectiveTargetInput> = {}): EffectiveTargetInput {
  const prescription = resolvePrescription(history.slots[0], 2, history.phases);
  return { slotId: "slot", exerciseId: history.slots[0].exerciseId, prescription,
    context: stallContext(history.slots[0], history.slots[0].exerciseId, null, prescription, null),
    history: buildWorkoutTargetHistory(history, EXERCISE_BY_ID, now), catalog: EXERCISE_BY_ID, stats: [], bodyweight: 180, ...overrides };
}

describe("effective workout targets", () => {
  it.each([
    [8, 2, "add_rep", 100, 9],
    [10, 2, "add_load", 105, 6],
    [4, 2, "below_rep_floor", 95, 6],
    [8, 0, "repeated_effort_miss", 95, 8],
  ] as const)("shares %s reps @ %s RIR targets across the raw engine and agent hydration", (reps, rir, reason, weight, targetReps) => {
    const history = targetFixture(); history.sets.forEach(set => { set.reps = reps; set.rir = rir; set.e1rm = computeE1rm(100, reps, rir); });
    const input = inputFor(history);
    const current = resolveEffectiveWorkoutTarget(input);
    const [agent] = hydrateSlotTargets({ slots: [{ id: input.slotId, exerciseId: input.exerciseId, targetSets: 2,
      prescription: input.prescription, targetContext: input.context }], catalog: input.catalog, stats: [], bodyweight: 180, targetHistory: input.history });
    expect(current).toMatchObject({ status: "current_target", reason, target: { weight, targetReps, targetRir: 2 } });
    expect(agent.effectiveTarget).toEqual(current);
    expect(agent.target).toMatchObject({ weight, targetReps, targetRir: 2 });
    expect(agent.targetExplanation).toBe(effectiveTargetExplanation(current));
    if (reason !== "repeated_effort_miss") expect(current.target).toEqual(sessionTarget(input.catalog[input.exerciseId], input.prescription,
      current.reference.selected, input.catalog, [], 180));
  });

  it("retains source identities and agrees with #210's reduction evidence", () => {
    const history = targetFixture(); history.sets.forEach(set => { set.rir = 0; });
    const target = resolveEffectiveWorkoutTarget(inputFor(history));
    const [candidate] = classifyCoachExceptions({ history, definitions: EXERCISE_BY_ID, activeProgramId: "program",
      currentSlots: [{ slotId: "slot", exerciseId: "bb-bench", equipmentInstanceId: null, weekIndex: 2, mode: "classic" }],
      feedback: [], asOf: now, evidenceSince: new Date("2026-09-01T00:00:00Z") });
    expect(candidate.signals[0]).toMatchObject({ reason: "repeated_effort_miss", target: {
      weight: target.target!.weight, targetReps: target.target!.targetReps, targetRir: target.target!.targetRir,
    } });
    expect(target.evidence.map(point => [point.sessionId, point.setId])).toEqual([["s0", "set-s0"], ["s1", "set-s1"]]);
  });

  it("never compounds a reduction or modifies the logged source/slots", () => {
    const history = targetFixture(); history.sets.forEach(set => { set.rir = 0; });
    const before = structuredClone(history); const input = inputFor(history);
    const result = resolveEffectiveWorkoutTarget(input);
    expect(resolveEffectiveWorkoutTarget(input)).toEqual(result);
    expect(resolveEffectiveWorkoutTarget(input).target?.weight).toBe(95);
    expect(history).toEqual(before);
    expect(input.history.effortBySlot.slot.exposures.at(-1)?.weight).toBe(100);
    expect(result.status).toBe("current_target");
    expect(effectiveTargetExplanation(result)).toContain("not a program change");
  });

  it("gives 4+ RIR recovery priority over repeated effort misses", () => {
    const history = targetFixture(); history.slots[0].targetRir = 4;
    history.sets.forEach(set => { set.weight = 150; set.reps = 7; set.rir = 1; set.e1rm = computeE1rm(150, 7, 1); });
    expect(resolveEffectiveWorkoutTarget(inputFor(history))).toMatchObject({ reason: "recovery",
      target: { weight: 135, targetReps: 7, targetRir: 4 } });
  });

  it("does not layer effort reduction onto a stored deload", () => {
    const history = targetFixture(); history.sets.forEach(set => { set.rir = 0; });
    const result = resolveEffectiveWorkoutTarget(inputFor(history, { isDeload: true }));
    expect(result.reason).toBe("recovery");
    expect(result.target).toMatchObject({ weight: 100, targetReps: 9 });
  });

  it("cannot let a latest-week effort proposal override the upcoming phase", () => {
    const history = targetFixture(); history.sets.forEach(set => { set.rir = 0; });
    history.phases = [{ id: "new-phase", programId: "program", name: "Build", description: null, position: 0,
      weekStart: 3, weekEnd: 4, targetRirMin: 3, targetRirMax: 3, setMultiplier: 1, isDeload: false }];
    const prescription = resolvePrescription(history.slots[0], 3, history.phases);
    const context = stallContext(history.slots[0], "bb-bench", null, prescription, null);
    expect(resolveEffectiveWorkoutTarget(inputFor(history, { context, prescription }))).toMatchObject({
      reason: "add_rep", target: { weight: 100, targetReps: 9, targetRir: 3 },
    });
  });

  it.each(["single_miss", "backoff_only", "phase", "adaptation", "swap", "instance", "missing_rir", "missing_e1rm", "deload"])(
    "does not lower a target for %s evidence", kind => {
      const history = targetFixture(); history.sets.forEach(set => { set.rir = 0; });
      if (kind === "single_miss") history.sets[0].rir = 2;
      if (kind === "backoff_only") {
        history.sets.forEach(set => { set.rir = 2; });
        history.sets.push(...history.sets.map(set => ({ ...set, id: `${set.id}-backoff`, set_index: 1, rir: 0 })));
      }
      if (kind === "phase") history.phases = [{ id: "phase", programId: "program", name: "Same RIR", description: null,
        position: 0, weekStart: 2, weekEnd: 2, targetRirMin: 2, targetRirMax: 2, setMultiplier: 1 }];
      if (kind === "adaptation") history.adaptations = [{ id: "a", slotId: "slot", action: "rep_change", newRepMin: 6,
        newRepMax: 10, newExerciseId: null, createdAt: "2026-09-18T12:00:00Z" }];
      if (kind === "swap") history.sets[0].exercise_id = "db-bench";
      if (kind === "instance") history.sets[0].equipment_instance_id = "different";
      if (kind === "missing_rir") history.sets[0].rir = null;
      if (kind === "missing_e1rm") history.sets[0].e1rm = null;
      if (kind === "deload") { history.sessions[0].isDeload = true; history.sets[0].is_deload = true; }
      expect(resolveEffectiveWorkoutTarget(inputFor(history)).reason).not.toBe("repeated_effort_miss");
    });

  it("keeps repeated slots separate while retaining ordinary exercise-wide best-recent progression", () => {
    const history = targetFixture(); history.sets[0].rir = 0;
    history.sets[1].program_slot_id = "other";
    history.sets[1].weight = 110;
    history.sets[1].e1rm = computeE1rm(110, 8, 2);
    const result = resolveEffectiveWorkoutTarget(inputFor(history));
    expect(result).toMatchObject({ reason: "add_rep", target: { weight: 110, targetReps: 9 } });
    expect(result.reference.lastSameSlot?.weight).toBe(100);
  });

  it("an explicit exercise choice never borrows the original lift's effort reduction", () => {
    const history = targetFixture(); history.sets.forEach(set => { set.rir = 0; });
    const input = inputFor(history);
    const changed = resolveEffectiveWorkoutTarget({ ...input, exerciseId: "db-bench", context: input.context ? { ...input.context, exerciseId: "db-bench" } : null });
    expect(changed).toMatchObject({ reason: "unavailable", target: null });
    expect(changed.evidence).toEqual([]);
  });

  it("supports bodyweight assistance and preserves unavailable recovery targets", () => {
    const history = targetFixture(2, "weighted-pullup");
    history.sets.forEach(set => { set.weight = -30; set.rir = 0; set.e1rm = computeE1rm(150, 8, 0); });
    expect(resolveEffectiveWorkoutTarget(inputFor(history))).toMatchObject({ reason: "repeated_effort_miss", target: { weight: -35, targetReps: 8 } });
    const prescription = { ...inputFor(history).prescription, targetRir: 4 };
    expect(resolveEffectiveWorkoutTarget(inputFor(history, { prescription, bodyweight: null }))).toMatchObject({ reason: "unavailable", target: null });
  });

  it("uses the same current bodyweight for below-floor recalibration and every consumer", () => {
    const history = targetFixture(1, "weighted-pullup");
    history.sets[0] = { ...history.sets[0], weight: 60, reps: 2, rir: 2, e1rm: computeE1rm(240, 2, 2) };
    expect(resolveEffectiveWorkoutTarget(inputFor(history))).toMatchObject({ reason: "below_rep_floor", target: { weight: 30, targetReps: 6 } });
  });

  it("pain remains review-required without inventing a pain-specific target reduction", () => {
    const history = targetFixture(); const input = inputFor(history);
    const [pain] = classifyCoachExceptions({ history, definitions: EXERCISE_BY_ID, activeProgramId: "program",
      currentSlots: [], feedback: [{ sessionId: "s1", jointPain: "significant" }], asOf: now,
      evidenceSince: new Date("2026-09-01T00:00:00Z") });
    expect(pain.scope.kind).toBe("session"); expect(pain.signals[0]).not.toHaveProperty("target");
    expect(resolveEffectiveWorkoutTarget(input)).toMatchObject({ reason: "add_rep", target: { weight: 100, targetReps: 9 } });
  });

  it("keeps unknown targets explicit and calibration separate from effort reductions", () => {
    const history = targetFixture(0);
    expect(resolveEffectiveWorkoutTarget(inputFor(history))).toMatchObject({ reason: "unavailable", target: null });
    expect(resolveEffectiveWorkoutTarget(inputFor(history, { stats: [{ exerciseId: "db-bench", currentE1rm: 100, personalCoefficient: null, confidenceN: 2 }] })))
      .toMatchObject({ reason: "starting_weight", target: { source: "recommendation" } });
  });

  it("bounds the snapshot before an open workout and excludes foreign/unfinished/future data", () => {
    const history = targetFixture(); history.sets[0].rir = 0;
    const start = new Date("2026-09-20T12:00:00Z");
    const snapshot = buildWorkoutTargetHistory(history, EXERCISE_BY_ID, start);
    expect(snapshot.progressionByExercise["bb-bench"].map(row => row.sessionId)).toEqual(["s0"]);
    expect(snapshot.effortBySlot).toEqual({});
    const input = inputFor(history, { history: snapshot });
    expect(resolveEffectiveWorkoutTarget(input).target?.weight).toBe(100);
    history.sets[0].user_id = "other";
    expect(buildWorkoutTargetHistory(history, EXERCISE_BY_ID, start).progressionByExercise).toEqual({});
  });

  it("cannot guess the first set when an exposure includes missing set-index evidence", () => {
    const history = targetFixture();
    history.sets.push(...history.sets.map(set => ({ ...set, id: `${set.id}-backoff`, set_index: 1, rir: 0 })));
    history.sets[0].set_index = NaN;
    const input = inputFor(history);
    expect(input.history.effortBySlot.slot).toBeUndefined();
    expect(resolveEffectiveWorkoutTarget(input).reason).not.toBe("repeated_effort_miss");
  });

  it("compacts long history without dropping a stronger reference inside the slot's anchor window", () => {
    const history = targetFixture(0);
    history.sessions = Array.from({ length: 100 }, (_, index) => {
      const performedAt = new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString();
      return { id: `s${index}`, programId: "program", programDayId: "day", weekIndex: 1,
        performedAt, finishedAt: performedAt.replace("12:00", "13:00"), isDeload: false };
    });
    history.sets = history.sessions.map((session, index) => ({ id: `set-${index}`, user_id: "user", session_id: session.id,
      program_slot_id: index === 0 ? "slot" : "other", exercise_id: "bb-bench", equipment_instance_id: null,
      weight: index === 50 ? 400 : 100 + index, reps: 8, rir: 2, e1rm: index === 50 ? 500 : 130 + index, set_index: 0,
      is_warmup: false, created_at: session.performedAt.replace("12:00", "12:05"),
      workout_session: { performed_at: session.performedAt, finished_at: session.finishedAt } }));
    const input = inputFor(history);
    expect(input.history.progressionByExercise["bb-bench"]).toHaveLength(6);
    expect(resolveEffectiveWorkoutTarget(input)).toMatchObject({ reason: "add_rep", target: { weight: 400, targetReps: 9 } });
    history.sets[80].program_slot_id = "slot";
    expect(resolveEffectiveWorkoutTarget(inputFor(history))).toMatchObject({ target: { weight: 199, targetReps: 9 } });
  });
});
