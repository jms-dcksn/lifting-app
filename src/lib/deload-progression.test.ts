import { describe, expect, it } from "vitest";
import { exerciseSummaries, e1rmPrFeed, weightPrs, patternStrengthTrend, sessionTonnage, type AnalyticsSetRow } from "./analytics";
import { groupReviewSessions, reviewChartPoints, reviewRecentWindow } from "./exercise-review-sessions";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { recomputeStat } from "./strength/recompute";
import { workoutRecords, type RecordSet } from "./strength/records";
import { isDeload } from "./stall-report";

const catalog = EXERCISE_BY_ID;
const now = new Date("2026-09-20T12:00:00Z");
function row(id: string, day: number, e1rm: number, isDeload = false): AnalyticsSetRow {
  const at = `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`;
  return { id, sessionId: id, exerciseId: "bb-row", weight: e1rm, reps: 8, rir: 1,
    e1rm, performedAt: at, createdAt: at, finishedAt: at, isDeload };
}
function record(s: AnalyticsSetRow): RecordSet {
  return { id: s.id, session_id: s.sessionId, user_id: "u", exercise_id: s.exerciseId,
    equipment_instance_id: null, program_slot_id: "slot", weight: s.weight, reps: s.reps,
    rir: s.rir, e1rm: s.e1rm, is_warmup: false, is_deload: s.isDeload,
    created_at: s.createdAt, workout_session: { performed_at: s.performedAt, finished_at: s.finishedAt! } };
}
const history = [row("a", 2, 200), row("b", 5, 202), row("recovery", 9, 160, true)];

describe("deload progression", () => {
  it("holds strength and trend during recovery while retaining the last training date", () => {
    expect(exerciseSummaries(history, catalog)[0]).toMatchObject({ currentE1rm: 202, bestE1rm: 202,
      delta: 2, trend: "up", e1rmSeries: [200, 202], sessionCount: 3, lastPerformedAt: history[2].performedAt });
  });
  it("compares the next normal performance against the previous normal performance", () => {
    expect(exerciseSummaries([...history, row("return", 16, 205)], catalog)[0])
      .toMatchObject({ currentE1rm: 205, delta: 3, e1rmSeries: [200, 202, 205] });
  });
  it("does not treat deload-only history as a strength baseline", () => {
    expect(exerciseSummaries([history[2]], catalog)[0]).toMatchObject({ currentE1rm: null,
      bestE1rm: null, delta: null, trend: "none", e1rmSeries: [], sessionCount: 1 });
  });
  it("excludes even unusually high deload sets from feeds and pooled strength", () => {
    const high = row("high", 10, 500, true);
    expect(e1rmPrFeed([...history, high], catalog).map(p => p.e1rm)).toEqual([200, 202]);
    expect(weightPrs([...history, high], catalog)[0].weight).toBe(202);
    expect(patternStrengthTrend([...history, high], catalog)).toEqual(patternStrengthTrend(history.slice(0, 2), catalog));
  });
  it("retains deload volume and workout count", () => {
    expect(sessionTonnage(history, catalog, null)).toHaveLength(3);
    expect(sessionTonnage([history[2]], catalog, null)[0]).toMatchObject({ tonnage: 1280, setCount: 1 });
  });
  it("cannot earn any record or establish a future record baseline", () => {
    const high = record(row("high", 10, 500, true));
    expect(workoutRecords([...history.map(record), high], "u", high.session_id, high.workout_session.performed_at, catalog)).toEqual([]);
    const next = record(row("return", 16, 205));
    expect(workoutRecords([record(history[0]), high, next], "u", next.session_id, next.workout_session.performed_at, catalog)[0])
      .toMatchObject({ e1rmRecord: { improvement: 6.5 }, topWeightRecord: { improvement: 5 } });
    expect(workoutRecords([high, next], "u", next.session_id, next.workout_session.performed_at, catalog)).toEqual([]);
  });
  it("excludes deload rep performances from candidates and same-load baselines", () => {
    const normal = record(row("normal", 2, 200));
    const recovery = { ...record(row("deload-reps", 9, 200, true)), reps: 20 };
    const next = { ...record(row("next", 16, 200)), reps: 10 };
    expect(workoutRecords([normal, recovery], "u", recovery.session_id, recovery.workout_session.performed_at, catalog)).toEqual([]);
    expect(workoutRecords([normal, recovery, next], "u", next.session_id, next.workout_session.performed_at, catalog)[0].repRecords)
      .toMatchObject([{ reps: 10, improvement: 2 }]);
  });
  it("retains recovery history but charts the last eight eligible workouts", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`s${i}`, i + 1, 200 + i));
    const deloads = [row("d1", 15, 100, true), row("d2", 16, 100, true)];
    const sessions = groupReviewSessions([...rows, ...deloads].map(s => ({ ...s, finishedAt: s.finishedAt! })), now);
    expect(sessions).toHaveLength(12);
    expect(sessions.at(-1)).toMatchObject({ isDeload: true, bestE1rm: null });
    expect(reviewChartPoints(sessions, "last8").map(p => p.e1rm)).toEqual([202, 203, 204, 205, 206, 207, 208, 209]);
    expect(reviewRecentWindow(sessions, now)).toMatchObject({ bestE1rm: 209, delta: 9 });
  });
  it("excludes recovery sets from demonstrated strength", () => {
    const def = catalog["bb-row"];
    expect(recomputeStat(def, [{ weight: 500, reps: 8, rir: 1, is_deload: true }], null).currentE1rm).toBeNull();
  });
  it("uses explicit phase classification over legacy text and volume heuristics", () => {
    expect(isDeload({ name: "Deload", description: null, setMultiplier: 0.5, isDeload: false })).toBe(false);
    expect(isDeload({ name: "Recovery", description: null, setMultiplier: null, isDeload: true })).toBe(true);
  });
});
