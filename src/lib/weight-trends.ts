import { bodyweightTrend, parseDateKey, type BodyweightEntry } from "./bodyweight";

const DAY = 86_400_000;
export type WeightRange = "30" | "90" | "6m" | "all";
export const shiftWeightDay = (day: string, offset: number) => new Date(parseDateKey(day) + offset * DAY).toISOString().slice(0, 10);

export function weightRangeStart(today: string, range: WeightRange, first?: string) {
  if (range === "all") return first && first < today ? first : shiftWeightDay(today, -89);
  if (range !== "6m") return shiftWeightDay(today, -(Number(range) - 1));
  const date = new Date(parseDateKey(today));
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 6);
  const end = new Date(date.getTime());
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  date.setUTCDate(Math.min(day, end.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

export function weightChartData(entries: BodyweightEntry[], today: string, range: WeightRange) {
  const valid = entries.filter(entry => {
    try { return parseDateKey(entry.loggedOn) <= parseDateKey(today) && Number.isFinite(entry.weight) && entry.weight > 0; }
    catch { return false; }
  }).sort((a, b) => a.loggedOn.localeCompare(b.loggedOn));
  const start = weightRangeStart(today, range, valid[0]?.loggedOn);
  const byDate = new Map(valid.map(entry => [entry.loggedOn, entry]));
  // Emit every day with a rolling value plus its following gap marker. This keeps
  // all-history bounded by observations even for extremely old backdated entries.
  const dates = new Set([start, today]);
  for (const entry of valid) {
    for (let offset = 0; offset <= 7; offset++) {
      const day = shiftWeightDay(entry.loggedOn, offset);
      if (day >= start && day <= today) dates.add(day);
    }
  }
  return [...dates].sort().map(day => {
    const windowEntries = Array.from({ length: 7 }, (_, offset) => byDate.get(shiftWeightDay(day, -offset)))
      .filter((entry): entry is BodyweightEntry => !!entry);
    const window = bodyweightTrend(windowEntries, day).current;
    return { date: day, timestamp: parseDateKey(day), reading: byDate.get(day)?.weight ?? null,
      average: window.average, count: window.observationCount, start: window.start };
  });
}

// Monday–Sunday, matching Progress's ISO-week convention. Date-only weigh-ins
// retain their calendar dates; the current week ends today and is marked partial.
export function weeklyWeightData(entries: BodyweightEntry[], today: string) {
  const weekday = new Date(parseDateKey(today)).getUTCDay();
  const monday = shiftWeightDay(today, -((weekday + 6) % 7));
  return Array.from({ length: 12 }, (_, index) => {
    const start = shiftWeightDay(monday, (index - 11) * 7);
    const fullEnd = shiftWeightDay(start, 6);
    const end = fullEnd > today ? today : fullEnd;
    const window = bodyweightTrend(entries.filter(entry => entry.loggedOn >= start), end).current;
    return { ...window, start, partial: end < fullEnd };
  });
}

// No frozen goal baseline exists in the current schema. Report signed distance,
// never infer gain/loss intent or a completion percentage from a visible range.
export function weightGoalDistance(average: number | null, goal: number | null) {
  if (average == null || goal == null || !Number.isFinite(average) || !Number.isFinite(goal) || goal <= 0) return null;
  const delta = average - goal;
  return { pounds: Math.abs(delta), position: Math.abs(delta) < 0.05 ? "at" as const : delta > 0 ? "above" as const : "below" as const };
}
