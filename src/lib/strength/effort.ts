import type { ExerciseDef } from "./coefficients";
import type { LastPerformance, SlotPrescription } from "./progression";

export type LoadReductionReason = "repeated_effort_miss" | "below_rep_floor";

// Callers supply consecutive comparable first working sets, oldest first.
export function repeatedEffortReduction(
  def: ExerciseDef,
  prescription: SlotPrescription,
  exposures: Array<LastPerformance & { targetRirMin: number }>,
) {
  const recent = exposures.slice(-2);
  if (recent.length !== 2 || !recent.every(set => set.rir != null && set.rir < set.targetRirMin)) {
    return null;
  }
  const latest = recent[1];
  return {
    weight: def.equipment === "bodyweight"
      ? latest.weight - def.increment
      : Math.max(0, latest.weight - def.increment),
    targetReps: Math.max(prescription.repMin, Math.min(prescription.repMax, latest.reps)),
  };
}
