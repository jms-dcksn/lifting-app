import { parseDateKey } from "./bodyweight";

export const MIN_WEIGHT_DATE = "0001-01-01";

export function validWeightDate(value: string, today: string) {
  try {
    parseDateKey(value);
    return value >= MIN_WEIGHT_DATE && value <= today;
  } catch {
    return false;
  }
}

export function monthRange(month: string) {
  const start = `${month}-01`;
  const date = new Date(parseDateKey(start));
  if (start < MIN_WEIGHT_DATE) throw new Error("Invalid month");
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return { start, end: date.toISOString().slice(0, 10) };
}

export function shiftDate(value: string, days: number) {
  const date = new Date(parseDateKey(value));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function shiftMonth(month: string, count: number) {
  const date = new Date(parseDateKey(`${month}-01`));
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 7);
}

export function calendarDays(month: string): Array<string | null> {
  const { start, end } = monthRange(month);
  // Monday first, matching the training balance calendar.
  const offset = (new Date(parseDateKey(start)).getUTCDay() + 6) % 7;
  const days: Array<string | null> = Array(offset).fill(null);
  for (let day = 1; day <= Number(end.slice(-2)); day++) {
    days.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (days.length % 7) days.push(null);
  return days;
}

export function weightDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(parseDateKey(value)));
}
