import { dateKey } from "./bodyweight";
import { shiftMonth } from "./weight-calendar";

export type ReviewMonthSide = {
  month: string;
  label: string;
  trained: boolean;
  repPrs: number | null;
  e1rmPrs: number | null;
  bestE1rm: number | null;
  volume: number | null;
  exposures: number | null;
};

export function reviewCompareDefaults(
  inboundMonth: string | null,
  now = new Date(),
  timeZone = "America/Chicago",
): { thisMonth: string; otherMonth: string } {
  const thisMonth = inboundMonth ?? dateKey(now, timeZone).slice(0, 7);
  const previous = shiftMonth(thisMonth, -1);
  if (previous < "0002-01") return { thisMonth, otherMonth: thisMonth };
  return { thisMonth, otherMonth: previous };
}

export function reviewMonthLabel(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
}

export function reviewEmptyMonthSide(month: string): ReviewMonthSide {
  return {
    month,
    label: reviewMonthLabel(month),
    trained: false,
    repPrs: null,
    e1rmPrs: null,
    bestE1rm: null,
    volume: null,
    exposures: null,
  };
}

export function reviewProgramCaption(sessions: { programName: string | null }[]) {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const session of sessions) {
    const name = session.programName?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  if (names.length === 0) return null;
  if (names.length === 1) return `Program: ${names[0]}`;
  return `Programs: ${names.join(", ")}`;
}

export function sessionsInMonths<T extends { dateKey: string }>(sessions: T[], months: string[]) {
  const selected = new Set(months);
  return sessions.filter((session) => selected.has(session.dateKey.slice(0, 7)));
}

export function formatReviewVolume(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} lb`;
}
