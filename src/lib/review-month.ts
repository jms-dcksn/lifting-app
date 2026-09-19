import { monthlyWindows } from "./monthly-progress";

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
