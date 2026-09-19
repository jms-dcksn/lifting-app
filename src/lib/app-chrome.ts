import { dateKey } from "./bodyweight";

export function isTrackPath(pathname: string) {
  return pathname === "/analytics" || pathname.startsWith("/analytics/")
    || pathname.startsWith("/history/");
}

/** Hide the tab bar on immersive flows that already own a sticky primary CTA. */
export function hideAppChrome(pathname: string, search = "") {
  if (pathname.startsWith("/session/")) return true;
  if (pathname === "/workout/next" || pathname.startsWith("/workout/next/")) return true;
  if (pathname === "/program/new" || pathname.startsWith("/program/new/")) return true;
  if (pathname.startsWith("/program/") && new URLSearchParams(search).get("mode") === "edit") {
    return true;
  }
  return false;
}

export function addDateKey(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function inLocalDays(iso: string, today: string, dayCount: number, timeZone?: string) {
  const key = dateKey(new Date(iso), timeZone);
  return key <= today && key >= addDateKey(today, -(dayCount - 1));
}
