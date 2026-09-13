import { dateKey } from "./bodyweight";
import { monthRange, shiftMonth } from "./weight-calendar";
import type { ExerciseDef } from "./strength/coefficients";
import { eligibleRecordSet, recordScope, workoutRecords, recordCounts, type RecordSet, type ExerciseRecords } from "./strength/records";

export interface MonthlySession {
  id: string;
  user_id: string;
  performed_at: string;
  finished_at: string | null;
}
export interface MonthWindow { start: string; end: string }
export interface MonthlyPoint { sessionId: string; date: string; e1rm: number }
export interface MonthlyLift {
  key: string;
  exerciseId: string;
  equipmentInstanceId: string | null;
  name: string;
  currentBest: number | null;
  priorBest: number | null;
  delta: number | null;
  percent: number | null;
  state: "improving" | "stable" | "declining" | "new" | "not_trained" | "unavailable";
  currentExposures: number;
  priorExposures: number;
  currentPoints: MonthlyPoint[];
  priorPoints: MonthlyPoint[];
}
export interface MonthlyAchievements { sessionId: string; date: string; records: ExerciseRecords[] }
export interface MonthlyReport {
  version: "1.0";
  month: string;
  timeZone: string;
  generatedAt: string;
  inProgress: boolean;
  windows: { current: MonthWindow; prior: MonthWindow };
  current: MonthlyTotals;
  prior: MonthlyTotals;
  achievements: MonthlyAchievements[];
  lifts: MonthlyLift[];
  quality: { excludedWorkingSets: number; missingStoredEstimates: number };
}
export interface MonthlyTotals { workouts: number; repPrs: number; e1rmPrs: number; exercisesWithRecords: number; workoutsWithRecords: number }

export function monthlyWindows(month: string, now = new Date(), timeZone = "America/Chicago") {
  const today = dateKey(now, timeZone);
  if (!/^\d{4}-\d{2}$/.test(month) || month < "0002-01" || month > today.slice(0, 7)) throw new Error("Choose a valid month up to the current month.");
  const current = monthRange(month);
  const prior = monthRange(shiftMonth(month, -1));
  const inProgress = month === today.slice(0, 7);
  if (inProgress) {
    current.end = today;
    prior.end = `${prior.start.slice(0, 7)}-${String(Math.min(Number(today.slice(-2)), Number(prior.end.slice(-2)))).padStart(2, "0")}`;
  }
  return { current, prior, inProgress };
}
const rounded = (n: number) => Math.round(n * 10) / 10;
const inWindow = (day: string, window: MonthWindow) => day >= window.start && day <= window.end;

/** Replay the canonical workout recaps; monthly comparisons use persisted estimates. */
export function buildMonthlyReport(input: {
  userId: string; month: string; sessions: MonthlySession[]; sets: RecordSet[];
  catalog: Record<string, ExerciseDef>; now?: Date; timeZone?: string;
}): MonthlyReport {
  const now = input.now ?? new Date();
  const timeZone = input.timeZone ?? "America/Chicago";
  const { current, prior, inProgress } = monthlyWindows(input.month, now, timeZone);
  const sessions = [...new Map(input.sessions.filter(s => s.user_id === input.userId && s.finished_at != null
    && Number.isFinite(Date.parse(s.performed_at)) && Date.parse(s.performed_at) <= now.getTime()
    && Date.parse(s.finished_at) <= now.getTime()).map(s => [s.id, s])).values()]
    .filter(s => dateKey(new Date(s.performed_at), timeZone) <= current.end)
    .sort((a, b) => a.performed_at.localeCompare(b.performed_at) || a.id.localeCompare(b.id));
  const sessionMap = new Map(sessions.map(s => [s.id, s]));
  const sets = [...new Map(input.sets.filter(s => s.user_id === input.userId && sessionMap.has(s.session_id))
    .map(s => [s.id, { ...s, workout_session: sessionMap.get(s.session_id)! }])).values()];
  const windowSessions = (w: MonthWindow) => sessions.filter(s => inWindow(dateKey(new Date(s.performed_at), timeZone), w));
  // Replay only the two selected windows, with the complete earlier record baseline.
  const recaps = new Map<string, ExerciseRecords[]>();
  for (const session of [...windowSessions(prior), ...windowSessions(current)]) {
    recaps.set(session.id, workoutRecords(sets, input.userId, session.id, session.performed_at, input.catalog));
  }
  function totals(w: MonthWindow): MonthlyTotals {
    const selected = windowSessions(w);
    const groups = selected.flatMap(s => recaps.get(s.id) ?? []);
    const counts = recordCounts(groups);
    return { workouts: selected.length, repPrs: counts.reps, e1rmPrs: counts.e1rm,
      exercisesWithRecords: counts.exercises, workoutsWithRecords: selected.filter(s => (recaps.get(s.id)?.length ?? 0) > 0).length };
  }
  const quality = { excludedWorkingSets: 0, missingStoredEstimates: 0 };
  const groups = new Map<string, { row: RecordSet; current: Map<string, MonthlyPoint>; prior: Map<string, MonthlyPoint>; currentIds: Set<string>; priorIds: Set<string> }>();
  for (const set of sets) {
    const day = dateKey(new Date(set.workout_session.performed_at), timeZone);
    const period = inWindow(day, current) ? "current" : inWindow(day, prior) ? "prior" : null;
    if (!period || set.is_warmup) continue;
    const values = eligibleRecordSet(set, input.catalog[set.exercise_id]);
    if (!values) { quality.excludedWorkingSets++; continue; }
    const key = recordScope(set);
    const group = groups.get(key) ?? { row: set, current: new Map(), prior: new Map(), currentIds: new Set(), priorIds: new Set() };
    group[period === "current" ? "currentIds" : "priorIds"].add(set.session_id);
    if (set.e1rm != null && Number.isFinite(set.e1rm) && set.e1rm > 0) {
      const value = rounded(set.e1rm);
      if (value > 0 && value > (group[period].get(set.session_id)?.e1rm ?? 0)) {
        group[period].set(set.session_id, { sessionId: set.session_id, date: day, e1rm: value });
      }
    } else quality.missingStoredEstimates++;
    groups.set(key, group);
  }
  const lifts: MonthlyLift[] = [...groups].map(([key, g]) => {
    const currentPoints = [...g.current.values()].sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
    const priorPoints = [...g.prior.values()].sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
    const currentBest = currentPoints.length ? Math.max(...currentPoints.map(p => p.e1rm)) : null;
    const priorBest = priorPoints.length ? Math.max(...priorPoints.map(p => p.e1rm)) : null;
    const delta = currentBest != null && priorBest != null ? rounded(currentBest - priorBest) : null;
    const state: MonthlyLift["state"] = g.currentIds.size === 0 ? "not_trained" : currentBest == null ? "unavailable" : priorBest == null ? "new"
      : delta! > 0 ? "improving" : delta! < 0 ? "declining" : "stable";
    return { key, exerciseId: g.row.exercise_id, equipmentInstanceId: g.row.equipment_instance_id,
      name: input.catalog[g.row.exercise_id].name, currentBest, priorBest, delta,
      percent: delta != null && priorBest != null && priorBest > 0 ? rounded(delta / priorBest * 100) : null,
      state, currentExposures: g.currentIds.size, priorExposures: g.priorIds.size, currentPoints, priorPoints };
  }).sort((a, b) => (b.percent ?? -Infinity) - (a.percent ?? -Infinity) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  return { version: "1.0", month: input.month, timeZone, generatedAt: now.toISOString(), inProgress,
    windows: { current, prior }, current: totals(current), prior: totals(prior), lifts, quality,
    achievements: windowSessions(current).map(s => ({ sessionId: s.id, date: dateKey(new Date(s.performed_at), timeZone), records: recaps.get(s.id) ?? [] })).filter(a => a.records.length > 0) };
}
