// Estimated 1RM from a logged set, using an RPE/RIR load model.
//
// Why not a bare Epley formula: it drifts in the 1-12 rep range you train in.
// Insight: an RPE load table collapses to a single curve over "reps to failure"
// (effective reps = reps performed + RIR, since RPE = 10 - RIR). We store that
// curve (the RPE-10 column of the RTS table) and interpolate.

// %1RM by reps-to-failure.
const PCT_BY_RTF: Record<number, number> = {
  1: 1.0, 2: 0.955, 3: 0.922, 4: 0.892, 5: 0.863, 6: 0.837,
  7: 0.811, 8: 0.786, 9: 0.762, 10: 0.739, 11: 0.707, 12: 0.68,
};
const MAX_RTF = 12;

// %1RM for a (possibly fractional) reps-to-failure value.
export function pctOf1RM(repsToFailure: number): number {
  const n = Math.max(1, repsToFailure);
  if (n <= 1) return 1;
  if (n >= MAX_RTF) return 1 / (1 + n / 30); // Epley fallback beyond the table
  const lo = Math.floor(n);
  const hi = Math.ceil(n);
  if (lo === hi) return PCT_BY_RTF[lo];
  return PCT_BY_RTF[lo] + (n - lo) * (PCT_BY_RTF[hi] - PCT_BY_RTF[lo]);
}

// Estimated 1RM from a working set. RIR defaults to 2 when not recorded.
export function computeE1rm(weight: number, reps: number, rir = 2): number {
  return weight / pctOf1RM(reps + Math.max(0, rir));
}

// Inverse: load needed to hit `reps` at a target RIR, given an e1RM.
export function weightForTarget(e1rm: number, reps: number, targetRir = 2): number {
  return e1rm * pctOf1RM(reps + Math.max(0, targetRir));
}

// Round a load to the nearest achievable increment (plate math / stack step).
export function roundToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return Math.round(weight);
  return Math.round(weight / increment) * increment;
}
