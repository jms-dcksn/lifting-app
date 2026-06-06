// Double-progression engine: the per-session weight/rep target for a slot.
//
// Structure (sets x rep-range @ RIR) is fixed across the block. Week-over-week overload
// comes from advancing the target off the last logged performance:
//   - first working set reached rep_max  -> add increment, reset reps to rep_min
//   - otherwise                          -> hold weight, target +1 rep toward rep_max
// No prior performance (first session or a fresh swap) -> hand off to the e1RM recommender
// at rep_min. The bump test is reps-only; RIR feeds e1RM but does not gate the bump.
//
// Keys on (program_slot_id, exercise_id) so a swap never corrupts the chain. Pure.

import { recommend, type ExerciseStat, type Confidence } from "./recommend";
import type { ExerciseDef } from "./coefficients";

export interface SlotPrescription {
  repMin: number;
  repMax: number;
  targetRir: number;
}

export interface LastPerformance {
  weight: number; // recorded load of the most recent first working set for this slot+exercise
  reps: number;
}

export type TargetSource = "recommendation" | "progression";

export interface SessionTarget {
  weight: number;
  targetReps: number;
  targetRir: number;
  source: TargetSource;
  confidence?: Confidence; // present when source = "recommendation"
  last?: LastPerformance; // present when source = "progression"
}

export function sessionTarget(
  def: ExerciseDef,
  slot: SlotPrescription,
  last: LastPerformance | null,
  defs: Record<string, ExerciseDef>,
  stats: ExerciseStat[],
): SessionTarget | null {
  // No prior performance — the e1RM recommender provides the starting weight at rep_min.
  if (!last) {
    const rec = recommend(def, slot.repMin, slot.targetRir, defs, stats);
    if (!rec) return null; // nothing logged in this pattern yet
    return {
      weight: rec.suggestedWeight,
      targetReps: slot.repMin,
      targetRir: slot.targetRir,
      source: "recommendation",
      confidence: rec.confidence,
    };
  }

  // Has prior performance — double progression off the most recent first working set.
  if (last.reps >= slot.repMax) {
    return {
      weight: last.weight + def.increment,
      targetReps: slot.repMin,
      targetRir: slot.targetRir,
      source: "progression",
      last,
    };
  }
  return {
    weight: last.weight,
    targetReps: Math.min(slot.repMax, last.reps + 1),
    targetRir: slot.targetRir,
    source: "progression",
    last,
  };
}
