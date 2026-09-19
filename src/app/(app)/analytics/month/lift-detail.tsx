import { exerciseReviewHref } from "@/lib/exercise-review-href";
import type { MonthlyLift } from "@/lib/monthly-progress";

export function liftHref(lift: MonthlyLift, month: string) {
  return exerciseReviewHref({
    exerciseId: lift.exerciseId,
    equipmentInstanceId: lift.equipmentInstanceId,
    month,
  });
}
