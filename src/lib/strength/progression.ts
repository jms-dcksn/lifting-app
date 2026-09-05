// Double-progression engine: the per-session weight/rep target for a slot.
//
// Structure (sets x rep-range @ RIR) is fixed across the block. Week-over-week overload
// comes from advancing the target off the last logged performance:
//   - first working set missed rep_min    -> recalibrate load, target rep_min
//   - first working set reached rep_max  -> add increment, reset reps to rep_min
//   - otherwise                          -> hold weight, target +1 rep toward rep_max
// No prior performance (first session or a fresh swap) -> hand off to the e1RM recommender
// at rep_min. The bump test is reps-only; RIR feeds e1RM but does not gate the bump.
//
// Keys on (program_slot_id, exercise_id) so a swap never corrupts the chain. Pure.

import { recommend, type ExerciseStat, type Confidence } from "./recommend";
import { computeE1rm, roundToIncrement, weightForTarget } from "./e1rm";
import type { ExerciseDef } from "./coefficients";

export interface SlotPrescription {
  repMin: number;
  repMax: number;
  targetRir: number;
}

export interface LastPerformance {
  weight: number; // recorded load of the most recent first working set for this slot+exercise
  reps: number;
  rir?: number | null;
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

// Recommender-derived starting weight in the unit the UI displays and logs.
// recommend() works in effective-load units; for bodyweight equipment, convert back to
// added load (negative = assisted). Without a known bodyweight the conversion is
// impossible, so there is no suggestion. Also used client-side to recompute live as
// the user changes reps/RIR before the first set.
export function startingWeight(
  def: ExerciseDef,
  reps: number,
  targetRir: number,
  defs: Record<string, ExerciseDef>,
  stats: ExerciseStat[],
  bodyweight: number | null,
): { weight: number; confidence: Confidence } | null {
  const rec = recommend(def, reps, targetRir, defs, stats);
  if (!rec) return null; // nothing logged in this pattern yet

  let weight = rec.suggestedWeight;
  if (def.equipment === "bodyweight") {
    if (bodyweight == null) return null;
    weight = roundToIncrement(rec.suggestedWeight - bodyweight, def.increment);
  }
  return { weight, confidence: rec.confidence };
}

export function sessionTarget(
  def: ExerciseDef,
  slot: SlotPrescription,
  last: LastPerformance | null,
  defs: Record<string, ExerciseDef>,
  stats: ExerciseStat[],
  bodyweight: number | null,
): SessionTarget | null {
  // No prior performance — the e1RM recommender provides the starting weight at rep_min.
  if (!last) {
    const start = startingWeight(def, slot.repMin, slot.targetRir, defs, stats, bodyweight);
    if (!start) return null;
    return {
      weight: start.weight,
      targetReps: slot.repMin,
      targetRir: slot.targetRir,
      source: "recommendation",
      confidence: start.confidence,
    };
  }

  // Has prior performance — double progression off the most recent first working set.
  // A below-floor set is a calibration miss, not a new progression rung. Derive a load
  // expected to reach rep_min at the prescribed RIR and never increase the recorded load.
  if (last.reps < slot.repMin) {
    const observedLoad = def.equipment === "bodyweight"
      ? bodyweight == null ? null : bodyweight + last.weight
      : last.weight;
    let targetWeight = last.weight;
    if (observedLoad != null && observedLoad > 0) {
      const estimatedE1rm = computeE1rm(
        observedLoad,
        last.reps,
        last.rir ?? slot.targetRir,
      );
      const targetLoad = weightForTarget(estimatedE1rm, slot.repMin, slot.targetRir);
      // Round the value the user actually loads. For bodyweight work, rounding total
      // effective load before subtracting a decimal weigh-in creates impossible plates
      // such as +35.8 lb.
      const loggedTarget = roundToIncrement(
        def.equipment === "bodyweight"
          ? targetLoad - (bodyweight as number)
          : targetLoad,
        def.increment,
      );
      targetWeight = Math.min(last.weight, loggedTarget);
    }
    return {
      weight: targetWeight,
      targetReps: slot.repMin,
      targetRir: slot.targetRir,
      source: "progression",
      last,
    };
  }

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
