import { describe, expect, it } from "vitest";
import { classifyCoachExceptions, type CoachExceptionInput } from "./coach-exceptions";
import { buildCoachCheckInReport, type CoachSessionInput } from "./coach-check-in";
import { buildCoachRecommendations } from "./coach-recommendations";
import { buildStallAssessments } from "./stall-report";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { computeE1rm } from "./strength/e1rm";

const now = new Date("2026-09-30T20:00:00Z");

function fixture(count = 2, exerciseId = "bb-bench"): CoachExceptionInput {
  const sessions = [1, 8, 15, 22, 29].slice(5 - count).map((day, index) => {
    const performedAt = `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`;
    return { id: `s${index}`, performedAt, finishedAt: performedAt.replace("12:00", "13:00"),
      programId: "p", programDayId: "d", weekIndex: index + 1, isDeload: false };
  });
  return {
    history: { userId: "u", sessions, sets: sessions.map(session => ({ id: `set-${session.id}`, user_id: "u",
      session_id: session.id, exercise_id: exerciseId, equipment_instance_id: null, program_slot_id: "slot",
      weight: 100, reps: 8, rir: 2, e1rm: computeE1rm(100, 8, 2), set_index: 0, is_warmup: false,
      is_deload: false, created_at: session.performedAt.replace("12:00", "12:05"),
      workout_session: { performed_at: session.performedAt, finished_at: session.finishedAt } })),
      slots: [{ id: "slot", programId: "p", programDayId: "d", exerciseId, targetSets: 2,
        repMin: 6, repMax: 10, targetRir: 2 }], phases: [], adaptations: [] },
    definitions: EXERCISE_BY_ID, activeProgramId: "p",
    currentSlots: [{ slotId: "slot", exerciseId, equipmentInstanceId: null, weekIndex: count, mode: "classic" }],
    feedback: [], asOf: now, evidenceSince: new Date("2026-09-01T00:00:00Z"),
  };
}

function reportInput(input: CoachExceptionInput) {
  const sessions: CoachSessionInput[] = input.history.sessions.map(session => ({ ...session,
    programDayName: "Upper", readiness: null, jointPain: input.feedback.find(f => f.sessionId === session.id)?.jointPain ?? "none", note: null }));
  const sets = input.history.sets.map(set => ({ sessionId: set.session_id, programSlotId: set.program_slot_id,
    exerciseId: set.exercise_id, setIndex: set.set_index, weight: set.weight!, reps: set.reps!, rir: set.rir,
    e1rm: set.e1rm, isWarmup: set.is_warmup, isDeload: set.is_deload, createdAt: set.created_at }));
  return { sessions, sets, slots: input.history.slots, phases: input.history.phases,
    definitions: input.definitions, generatedAt: input.asOf };
}

function proposals(input: CoachExceptionInput) {
  const report = reportInput(input);
  return buildCoachRecommendations({ ...report, activeProgramId: input.activeProgramId,
    report: buildCoachCheckInReport(report), stalls: buildStallAssessments(input.history, input.definitions, input.asOf) });
}

function reasons(input: CoachExceptionInput) {
  return classifyCoachExceptions(input).flatMap(candidate => candidate.signals.map(signal => signal.reason));
}

function misses(input: CoachExceptionInput) {
  input.history.sets.forEach(set => { set.rir = 0; });
  return input;
}

function floor(input: CoachExceptionInput) {
  input.history.sets.forEach(set => { set.reps = 4; set.rir = 2; });
  return input;
}

describe("Coach exception policy", () => {
  it.each([
    ["add_load", (input: CoachExceptionInput) => { input.history.sets.forEach(set => { set.reps = 10; }); }, []],
    ["add_rep", () => {}, []],
    ["reduce_load", (input: CoachExceptionInput) => { misses(input); }, ["repeated_effort_miss"]],
    ["keep_movement", (input: CoachExceptionInput) => { input.history.sets[1].e1rm = 100; }, []],
    ["deload_hold", (input: CoachExceptionInput) => { input.history.sessions[1].isDeload = true; }, []],
    ["pain_review", (input: CoachExceptionInput) => { input.feedback = [{ sessionId: "s1", jointPain: "significant" }]; }, ["significant_pain"]],
    ["insufficient_data", (input: CoachExceptionInput) => { input.history.sets = []; }, []],
  ] as const)("classifies %s from canonical evidence independently of its priority", (kind, arrange, expected) => {
    const input = fixture();
    arrange(input);
    expect(proposals(input)[0].kind).toBe(kind);
    expect(reasons(input)).toEqual(expected);
  });

  it("uses canonical confirmed plateaus, including equipment-specific patience", () => {
    const input = fixture(5);
    expect(proposals(input)[0].kind).toBe("plateau_review");
    expect(reasons(input)).toEqual(["confirmed_plateau"]);
    expect(reasons(fixture(4))).toEqual([]);
    expect(reasons(fixture(4, "db-curl"))).toEqual(["confirmed_plateau"]);
  });

  it("gives the two reduce_load causes distinct typed reasons", () => {
    expect(proposals(misses(fixture()))[0].loadReductionReason).toBe("repeated_effort_miss");
    expect(proposals(floor(fixture(1)))[0].loadReductionReason).toBe("below_rep_floor");
    expect(proposals(fixture())[0].loadReductionReason).toBeNull();
  });

  it("keeps an isolated below-floor recalibration quiet, but not two independent reductions", () => {
    expect(reasons(floor(fixture(1)))).toEqual([]);
    const input = floor(fixture());
    expect(reasons(input)).toEqual(["repeated_rep_floor"]);
    expect(classifyCoachExceptions(input)[0].signals[0]).toMatchObject({ status: "recommended",
      target: { weight: 95, targetReps: 6 } });
    input.history.sets[0].rir = 10;
    expect(reasons(input)).toEqual([]);
  });

  it.each(["in_range", "below_floor_hold", "below_floor_cross_day"])("keeps add_rep subcase %s silent", subcase => {
    const input = fixture(1);
    if (subcase !== "in_range") { floor(input); input.history.sets[0].rir = 10; }
    if (subcase === "below_floor_cross_day") {
      input.history.sessions.push({ ...input.history.sessions[0], id: "other", programDayId: "other-day",
        performedAt: "2026-09-30T12:00:00Z", finishedAt: "2026-09-30T13:00:00Z" });
      input.history.sets.push({ ...input.history.sets[0], id: "other-set", session_id: "other", program_slot_id: "other-slot",
        weight: 105, reps: 8, rir: 2, e1rm: 200, created_at: "2026-09-30T12:05:00Z" });
    }
    expect(proposals(input)[0].kind).toBe("add_rep");
    expect(reasons(input)).toEqual([]);
  });

  it("requires two consecutive first-set misses, not back-off effort or repeated reads", () => {
    const input = fixture();
    input.history.sets[1].rir = 0;
    expect(reasons(input)).toEqual([]);
    input.history.sets[1].rir = 2;
    input.history.sets.push(...input.history.sets.map(set => ({ ...set, id: `${set.id}-backoff`, set_index: 1,
      rir: 0, created_at: set.created_at.replace("12:05", "12:01") })));
    expect(reasons(input)).toEqual([]);
    const isolated = misses(fixture(1));
    isolated.history.sets.push({ ...isolated.history.sets[0] });
    expect(reasons(isolated)).toEqual([]);
    expect(reasons(isolated)).toEqual([]);
  });

  it("groups effort, plateau and decline into one exact-slot candidate with source references", () => {
    const input = misses(fixture(5));
    input.history.sets.forEach((set, index) => { set.e1rm = [160, 160, 159, 140, 139][index]; });
    const candidates = classifyCoachExceptions(input);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ userId: "u", policyVersion: "1.0", scope: { kind: "lift", slotId: "slot",
      context: { exerciseId: "bb-bench", equipmentInstanceId: null, repMin: 6, repMax: 10, targetRirMin: 2 } } });
    expect(reasons(input)).toEqual(["repeated_effort_miss", "confirmed_plateau", "sustained_decline"]);
    expect(candidates[0].signals[0].sources.map(source => [source.sessionId, source.setIds])).toEqual([
      ["s3", ["set-s3"]], ["s4", ["set-s4"]],
    ]);
    expect(candidates[0].signals.every(signal => signal.status === "recommended")).toBe(true);
  });

  it.each([
    [[150, 150, 150, 150], "flat"],
    [[130, 130, 150, 150], "gaining"],
    [[150, 150, 150, 130], "flat"],
    [[150, 150, 130, 130], "declining"],
    [[150, 150, 148.5, 148.5], "flat"],
  ] as const)("uses the factual trend rule for %j", (values, expected) => {
    const input = fixture(4);
    input.history.sets.forEach((set, index) => { set.e1rm = values[index]; });
    const report = buildCoachCheckInReport(reportInput(input));
    expect(report.exerciseTrends[0].classification).toBe(expected);
    expect(reasons(input)).toEqual(expected === "declining" ? ["sustained_decline"] : []);
  });

  it("does not treat fixed-load rep gains as a plateau or current decline", () => {
    const input = fixture(5);
    input.history.sets[4].reps = 9;
    expect(reasons(input)).toEqual([]);
    input.history.sets.forEach((set, index) => { set.e1rm = [160, 160, 160, 130, 130][index]; });
    expect(reasons(input)).toEqual([]);
  });

  it("keeps significant pain at session scope and suppresses conflicting lift signals", () => {
    const input = misses(fixture(5));
    input.feedback = [{ sessionId: "s3", jointPain: "significant" }, { sessionId: "s4", jointPain: "significant" }];
    const [candidate] = classifyCoachExceptions(input);
    expect(candidate.scope).toEqual({ kind: "session", sessionIds: ["s3", "s4"] });
    expect(candidate.signals).toEqual([{ reason: "significant_pain", action: "review_pain", status: "recommended",
      sources: [
        { sessionId: "s3", performedAt: input.history.sessions[3].performedAt, setIds: [], firstSetId: null },
        { sessionId: "s4", performedAt: input.history.sessions[4].performedAt, setIds: [], firstSetId: null },
      ] }]);
    input.activeProgramId = null;
    expect(reasons(input)).toEqual(["significant_pain"]);
  });

  it("pain does not turn a PR into a load prescription", () => {
    const input = fixture(1);
    input.history.sets[0].reps = 12;
    input.feedback = [{ sessionId: "s0", jointPain: "significant" }];
    expect(reasons(input)).toEqual(["significant_pain"]);
    expect(classifyCoachExceptions(input)[0].signals[0]).not.toHaveProperty("target");
  });

  it.each(["none", "mild", null] as const)("keeps %s pain quiet", jointPain => {
    const input = fixture(); input.feedback = [{ sessionId: "s1", jointPain }];
    expect(reasons(input)).toEqual([]);
  });

  it.each(["unfinished", "future", "stale", "missing_session"])("ignores %s pain evidence", kind => {
    const input = fixture(1); input.feedback = [{ sessionId: "s0", jointPain: "significant" }];
    if (kind === "unfinished") input.history.sessions[0].finishedAt = null;
    if (kind === "future") input.history.sessions[0].finishedAt = "2026-10-01T12:00:00Z";
    if (kind === "stale") input.evidenceSince = new Date("2026-09-30T00:00:00Z");
    if (kind === "missing_session") input.feedback[0].sessionId = "missing";
    expect(reasons(input)).toEqual([]);
  });

  it.each(["rep_change", "swap"] as const)("returns the canonical Fluid %s intervention", action => {
    const input = fixture(5);
    input.currentSlots[0].mode = "fluid";
    if (action === "swap") input.history.adaptations.push({ id: "a", slotId: "slot", action: "rep_change",
      newExerciseId: null, newRepMin: 6, newRepMax: 10, createdAt: "2026-08-31T12:00:00Z" });
    expect(classifyCoachExceptions(input)[0].signals[0]).toMatchObject({ reason: "confirmed_plateau", action,
      ...(action === "rep_change" ? { repBand: { repMin: 12, repMax: 15 } } : {}) });
  });

  it("preserves Fluid's two-exposure snooze", () => {
    const input = fixture(5); input.currentSlots[0].mode = "fluid";
    input.history.adaptations = [{ id: "dismiss", slotId: "slot", action: "dismiss", newExerciseId: null,
      newRepMin: null, newRepMax: null, createdAt: "2026-09-23T12:00:00Z" }];
    expect(reasons(input)).toEqual([]);
    input.history.adaptations[0].createdAt = "2026-09-16T12:00:00Z";
    expect(reasons(input)).toEqual(["confirmed_plateau"]);
  });

  it("does not bypass a Fluid plateau snooze with an overlapping decline", () => {
    const input = fixture(5); input.currentSlots[0].mode = "fluid";
    input.history.sets.forEach((set, index) => { set.e1rm = [160, 160, 159, 140, 139][index]; });
    input.history.adaptations = [{ id: "dismiss", slotId: "slot", action: "dismiss", newExerciseId: null,
      newRepMin: null, newRepMax: null, createdAt: "2026-09-23T12:00:00Z" }];
    expect(reasons(input)).toEqual([]);
    input.history.adaptations[0].createdAt = "2026-09-16T12:00:00Z";
    expect(reasons(input)).toEqual(["confirmed_plateau", "sustained_decline"]);
  });

  it.each(["session_deload", "set_deload", "recovery", "upcoming_phase", "phase_boundary", "adaptation_boundary",
    "applied_after_latest", "identity_boundary", "equipment_boundary", "mixed_identity", "missing_estimate",
    "missing_rir", "unfinished", "future", "future_set", "warmup", "foreign_owner", "missing_index", "unknown_week"])(
    "cannot create a repeated-effort alert across %s", kind => {
      const input = misses(fixture()); const previous = input.history.sets[0];
      if (kind === "session_deload") input.history.sessions[0].isDeload = true;
      if (kind === "set_deload") previous.is_deload = true;
      if (kind === "recovery") input.history.slots[0].targetRir = 4;
      if (kind === "upcoming_phase" || kind === "phase_boundary" || kind === "unknown_week") {
        input.history.phases = [{ id: "phase", programId: "p", name: "Build", position: 0, description: null,
          weekStart: 2, weekEnd: 3, targetRirMin: 2, targetRirMax: 2, setMultiplier: 1, isDeload: false }];
        if (kind === "upcoming_phase") { input.history.phases[0].weekStart = 3; input.currentSlots[0].weekIndex = 3; }
        if (kind === "unknown_week") input.history.sessions[0].weekIndex = null;
      }
      if (kind === "adaptation_boundary" || kind === "applied_after_latest") input.history.adaptations = [{
        id: "a", slotId: "slot", action: "rep_change", newExerciseId: null, newRepMin: 6, newRepMax: 10,
        createdAt: kind === "applied_after_latest" ? "2026-09-30T12:00:00Z" : "2026-09-23T12:00:00Z",
      }];
      if (kind === "identity_boundary") previous.exercise_id = "db-bench";
      if (kind === "equipment_boundary") previous.equipment_instance_id = "other";
      if (kind === "mixed_identity") input.history.sets.push({ ...previous, id: "mixed", exercise_id: "db-bench" });
      if (kind === "missing_estimate") previous.e1rm = null;
      if (kind === "missing_rir") previous.rir = null;
      if (kind === "unfinished") input.history.sessions[0].finishedAt = null;
      if (kind === "future") input.history.sessions[0].finishedAt = "2026-10-01T12:00:00Z";
      if (kind === "future_set") previous.created_at = "2026-10-01T12:00:00Z";
      if (kind === "warmup") previous.is_warmup = true;
      if (kind === "foreign_owner") previous.user_id = "other";
      if (kind === "missing_index") previous.set_index = NaN;
      expect(reasons(input)).toEqual([]);
    });

  it.each(["exercise", "instance", "program"])("rejects a stale current %s context", kind => {
    const input = misses(fixture());
    if (kind === "exercise") input.currentSlots[0].exerciseId = "db-bench";
    if (kind === "instance") input.currentSlots[0].equipmentInstanceId = "other";
    if (kind === "program") input.activeProgramId = "other";
    expect(reasons(input)).toEqual([]);
  });

  it("does not combine repeated slots or machine instances into an exception", () => {
    const input = misses(fixture());
    input.history.slots.push({ ...input.history.slots[0], id: "other-slot" });
    input.currentSlots.push({ ...input.currentSlots[0], slotId: "other-slot" });
    input.history.sets[1].program_slot_id = "other-slot";
    expect(reasons(input)).toEqual([]);
    input.history.sets[1].program_slot_id = "slot";
    const machine = { ...EXERCISE_BY_ID["bb-bench"], id: "machine-variant", equipment: "machine" as const,
      stationProfile: "none" as const, needsCalibration: true };
    input.definitions = { ...EXERCISE_BY_ID, [machine.id]: machine };
    input.history.slots[0].exerciseId = machine.id; input.currentSlots[0].exerciseId = machine.id;
    input.history.sets.forEach(set => { set.exercise_id = machine.id; set.equipment_instance_id = "one"; });
    input.currentSlots[0].equipmentInstanceId = "one";
    expect(reasons(input)).toEqual(["repeated_effort_miss"]);
    input.history.sets[0].equipment_instance_id = "two";
    expect(reasons(input)).toEqual([]);
    input.history.sets.forEach(set => { set.exercise_id = "machine-chest-press"; });
    input.history.slots[0].exerciseId = "machine-chest-press"; input.currentSlots[0].exerciseId = "machine-chest-press";
    expect(reasons(input)).toEqual([]);
  });

  it("handles assistance without substituting current bodyweight for historical evidence", () => {
    const input = misses(fixture(2, "weighted-pullup"));
    input.history.sets.forEach(set => { set.weight = -30; set.e1rm = computeE1rm(150, 8, 0); });
    expect(classifyCoachExceptions(input)[0].signals[0]).toMatchObject({ target: { weight: -35 } });
    floor(input);
    input.history.sets.forEach(set => { set.e1rm = computeE1rm(150, 4, 2); });
    expect(reasons(input)).toEqual(["repeated_rep_floor"]);
    input.history.sets[0].e1rm = null;
    expect(reasons(input)).toEqual([]);
  });

  it("requires fresh supporting exposures and never revives stale plateau/decline evidence", () => {
    const input = misses(fixture(5));
    input.history.sets.forEach((set, index) => { set.e1rm = [160, 160, 159, 140, 139][index]; });
    input.evidenceSince = new Date("2026-09-28T00:00:00Z");
    expect(reasons(input)).toEqual([]);
    input.evidenceSince = new Date("2026-09-30T00:00:00Z");
    expect(reasons(input)).toEqual([]);
  });

  it("is repeatable, independent of input ordering and does not mutate training history", () => {
    const input = misses(fixture(5)); const before = structuredClone(input);
    const expected = classifyCoachExceptions(input);
    expect(classifyCoachExceptions(input)).toEqual(expected);
    expect(input).toEqual(before);
    input.history.sets.reverse(); input.history.sessions.reverse(); input.currentSlots.push(input.currentSlots[0]);
    input.history.sets.push({ ...input.history.sets[0] });
    expect(classifyCoachExceptions(input)).toEqual(expected);
  });

  it("preserves separate slot contexts and orders meaningful causes independently of slot order", () => {
    const input = fixture(5);
    input.history.slots.push({ ...input.history.slots[0], id: "other-slot", repMin: 8, repMax: 12 });
    input.currentSlots.push({ ...input.currentSlots[0], slotId: "other-slot" });
    input.history.sets.push(...input.history.sets.map(set => ({ ...set, id: `${set.id}-other`,
      program_slot_id: "other-slot", rir: 0 })));
    const candidates = classifyCoachExceptions(input);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ scope: { slotId: "other-slot", context: { repMin: 8, repMax: 12 } } });
    expect(candidates[0].signals[0].reason).toBe("repeated_effort_miss");
    expect(candidates[1]).toMatchObject({ scope: { slotId: "slot", context: { repMin: 6, repMax: 10 } } });
    expect(candidates[1].signals[0].reason).toBe("confirmed_plateau");
  });

  it("keeps successful records and improving strength quiet", () => {
    const input = fixture(5);
    input.history.sets.forEach((set, index) => { set.e1rm = 130 + index * 10; set.weight = 100 + index * 5; set.reps = 10; });
    expect(proposals(input)[0].kind).toBe("add_load");
    expect(proposals(input)[0].priority).toBe("now");
    expect(reasons(input)).toEqual([]);
  });

  it.each([new Date("invalid"), new Date("2026-10-01T00:00:00Z")])("rejects an invalid evidence cutoff", evidenceSince => {
    expect(() => classifyCoachExceptions({ ...fixture(), evidenceSince })).toThrow("Invalid Coach exception evidence window");
  });
});
