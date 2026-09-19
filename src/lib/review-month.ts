import { monthlyWindows } from "./monthly-progress";

/** Valid `?month=YYYY-MM` for Exercise review context. Invalid values are ignored. */
export function reviewMonthParam(
  month: string | string[] | undefined,
  now = new Date(),
): string | null {
  if (typeof month !== "string") return null;
  try {
    monthlyWindows(month, now);
    return month;
  } catch {
    return null;
  }
}
