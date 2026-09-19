import type { MonthlyLift } from "@/lib/monthly-progress";

export function liftHref(lift: MonthlyLift, month: string) {
  return `/history/${encodeURIComponent(lift.exerciseId)}?${new URLSearchParams({ month, equipment: lift.equipmentInstanceId ?? "none" })}`;
}
