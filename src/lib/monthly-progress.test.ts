import { describe, expect, it } from "vitest";
import { buildMonthlyReport, monthlyWindows, type MonthlySession } from "./monthly-progress";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { computeE1rm } from "./strength/e1rm";
import { recordCounts, workoutRecords, type RecordSet } from "./strength/records";

const now = new Date("2026-09-13T18:00:00Z");
const catalog = EXERCISE_BY_ID;
function session(id: string, day: string, extra: Partial<MonthlySession> = {}): MonthlySession {
  return { id, user_id: "u", performed_at: `${day}T12:00:00Z`, finished_at: `${day}T13:00:00Z`, ...extra };
}
function set(s: MonthlySession, reps = 8, extra: Partial<RecordSet> = {}): RecordSet {
  return { id: `set-${s.id}`, user_id: s.user_id, session_id: s.id, exercise_id: "bb-bench", program_slot_id: null,
    equipment_instance_id: null, weight: 100, reps, rir: 1, e1rm: computeE1rm(100, reps, 1), is_warmup: false,
    created_at: s.performed_at.replace("12:00", "12:05"), workout_session: s, ...extra };
}
function report(sessions: MonthlySession[], sets: RecordSet[]) {
  return buildMonthlyReport({ userId: "u", month: "2026-09", sessions, sets, catalog, now });
}
describe("monthly windows", () => {
  it("compares elapsed calendar days, with shorter prior months capped", () => {
    expect(monthlyWindows("2026-09", now)).toEqual({ current: { start: "2026-09-01", end: "2026-09-13" }, prior: { start: "2026-08-01", end: "2026-08-13" }, inProgress: true });
    expect(monthlyWindows("2024-03", new Date("2024-03-31T18:00:00Z")).prior.end).toBe("2024-02-29");
    expect(monthlyWindows("2025-03", new Date("2025-03-31T18:00:00Z")).prior.end).toBe("2025-02-28");
  });
  it("uses full completed months and crosses year boundaries", () => {
    expect(monthlyWindows("2026-01", now)).toEqual({ current: { start: "2026-01-01", end: "2026-01-31" }, prior: { start: "2025-12-01", end: "2025-12-31" }, inProgress: false });
  });
  it.each(["2026-13", "2026-2", "garbage", "2026-10", "0001-01"])("rejects invalid/future month %s", month => {
    expect(() => monthlyWindows(month, now)).toThrow();
  });
  it("uses Chicago's date at UTC midnight", () => {
    expect(monthlyWindows("2026-09", new Date("2026-09-14T02:00:00Z")).current.end).toBe("2026-09-13");
  });
});
describe("monthly report", () => {
  it("reconciles final distinct PRs to canonical workout recaps and keeps earlier achievements", () => {
    const sessions = [session("old", "2026-07-01"), session("prior", "2026-08-02"), session("a", "2026-09-02"), session("b", "2026-09-08")];
    const sets = sessions.map((s, i) => set(s, 6 + i));
    sets.push(set(sessions[2], 11, { id: "later", created_at: "2026-09-02T12:10:00Z", e1rm: computeE1rm(100, 11, 1) }));
    const r = report(sessions, sets);
    const recaps = sessions.slice(2).flatMap(s => workoutRecords(sets, "u", s.id, s.performed_at, catalog));
    expect(r.current.repPrs).toBe(recordCounts(recaps).reps);
    expect(r.current.e1rmPrs).toBe(recordCounts(recaps).e1rm);
    expect(r.current.topWeightPrs).toBe(recordCounts(recaps).topWeight);
    expect(r.current).toMatchObject({ repPrs: 1, e1rmPrs: 1, workouts: 2, workoutsWithRecords: 1 });
    expect(r.currentWorkouts.map((workout) => workout.date)).toEqual(["2026-09-02", "2026-09-08"]);
    expect(r.achievements[0].records[0].repRecords[0].reps).toBe(11);
    expect(r.prior.repPrs).toBe(1);
    expect(r.lifts[0].currentExposures).toBe(2);
  });
  it("recalculates edits/deletions and uses all-time baselines outside both windows", () => {
    const sessions = [session("old", "2025-01-01"), session("a", "2026-09-02")];
    const sets = [set(sessions[0], 12), set(sessions[1], 10)];
    expect(report(sessions, sets).current.repPrs).toBe(0);
    sets[0] = set(sessions[0], 8);
    expect(report(sessions, sets).current.repPrs).toBe(1);
    expect(report(sessions, sets.slice(0, 1)).current.repPrs).toBe(0);
  });
  it("does not award ties/first observations or turn missing comparison into a gain", () => {
    const sessions = [session("p", "2026-08-02"), session("c", "2026-09-02")];
    expect(report(sessions, sessions.map(s => set(s))).current.repPrs).toBe(0);
    const r = report([sessions[1]], [set(sessions[1])]);
    expect(r.current.e1rmPrs).toBe(0);
    expect(r.lifts[0]).toMatchObject({ state: "new", delta: null, percent: null });
  });
  it("isolates equipment instances and exercises; skipped lifts are not declines", () => {
    const sessions = [session("p", "2026-08-02"), session("c", "2026-09-02")];
    const r = report(sessions, [set(sessions[0], 8, { equipment_instance_id: "one" }), set(sessions[1], 12, { equipment_instance_id: "two" })]);
    expect(r.lifts.map(l => l.state).sort()).toEqual(["new", "not_trained"]);
    expect(r.current.e1rmPrs).toBe(0);
    const other = report(sessions, [set(sessions[0]), set(sessions[1], 12, { exercise_id: "db-bench" })]);
    expect(other.lifts.map(l => l.state).sort()).toEqual(["new", "not_trained"]);
  });
  it("uses stored strength values and flags missing estimates without inventing declines", () => {
    const sessions = [session("p", "2026-08-02"), session("c", "2026-09-02")];
    const r = report(sessions, [set(sessions[0], 8, { e1rm: 200 }), set(sessions[1], 10, { e1rm: 205 })]);
    expect(r.lifts[0]).toMatchObject({ currentBest: 205, priorBest: 200, delta: 5, percent: 2.5 });
    const missing = report(sessions, [set(sessions[0]), set(sessions[1], 10, { e1rm: null })]);
    expect(missing.lifts[0]).toMatchObject({ state: "unavailable", delta: null });
    expect(missing.quality.missingStoredEstimates).toBe(1);
  });
  it("preserves historical bodyweight and excludes uncalibrated/invalid/warmup sets", () => {
    const sessions = [session("p", "2026-08-02"), session("c", "2026-09-02")];
    const rows = sessions.map(s => set(s, 8, { exercise_id: "weighted-pullup", weight: 25, e1rm: computeE1rm(175, 8, 1) }));
    const r = report(sessions, rows);
    expect(r.current.repPrs).toBe(0);
    expect(r.lifts[0].state).toBe("stable");
    expect(r.lifts[0].currentBest).toBe(Math.round(rows[1].e1rm! * 10) / 10);
    expect(report(sessions, [set(sessions[1], 8, { exercise_id: "machine-chest-press" })]).quality.excludedWorkingSets).toBe(1);
    expect(report(sessions, [set(sessions[1], 8, { is_warmup: true })]).lifts).toEqual([]);
    expect(report(sessions, [set(sessions[1], 8, { weight: -1 })]).lifts).toEqual([]);
  });
  it("excludes other users, unfinished/future workouts, duplicate rows and out-of-window UTC dates", () => {
    const sessions = [session("other", "2026-09-01", { user_id: "other" }), session("open", "2026-09-02", { finished_at: null }), session("future", "2026-09-14"), session("august", "2026-09-01", { performed_at: "2026-09-01T04:59:00Z" }), session("yes", "2026-09-02")];
    const rows = sessions.map(s => set(s));
    rows.push(rows.at(-1)!);
    const r = report(sessions, rows);
    expect(r.current.workouts).toBe(1);
    expect(r.lifts[0].currentExposures).toBe(1);
  });
  it("buckets DST transition days by performed date and counts finished empty sessions", () => {
    const s = session("dst", "2026-03-08", { performed_at: "2026-03-08T07:30:00Z" });
    const r = buildMonthlyReport({ userId: "u", month: "2026-03", sessions: [s], sets: [], catalog, now });
    expect(r.current.workouts).toBe(1);
    expect(r.lifts).toEqual([]);
  });
});


describe("monthly fixed-load rep comparisons", () => {
  it("shows rep gains despite flat stored estimates, without counting them as e1RM gains", () => {
    const a = session("a", "2026-08-02"), b = session("b", "2026-09-02");
    const result = report([a, b], [set(a, 8, { e1rm: 140 }), set(b, 10, { e1rm: 140 })]);
    expect(result.lifts[0].state).toBe("stable");
    expect(result.lifts[0].repGains).toEqual([{ load: 100, priorReps: 8, currentReps: 10 }]);
  });
  it("does not compare reps across loads, equipment, or outside the comparison window", () => {
    const a = session("a", "2026-08-02"), b = session("b", "2026-09-02"), late = session("late", "2026-08-30");
    const result = report([a, b, late], [set(a, 8), set(b, 10, { weight: 110 }), set(b, 12, { id: "machine", equipment_instance_id: "different" }), set(late, 6, { weight: 110 })]);
    expect(result.lifts.every(l => l.repGains.length === 0)).toBe(true);
  });
  it("uses the best reps in each period and recomputes after a historical edit", () => {
    const a = session("a", "2026-08-02"), b = session("b", "2026-09-02");
    const rows = [set(a, 8), set(a, 12, { id: "backoff" }), set(b, 10)];
    expect(report([a, b], rows).lifts[0].repGains).toEqual([]);
    expect(report([a, b], rows.filter(s => s.id !== "backoff")).lifts[0].repGains[0].currentReps).toBe(10);
  });
});
