// Cross-exercise weight recommender.
//
// Model: one latent "pattern strength" per user per movement pattern, expressed in the
// reference lift's e1RM. Each exercise has a coefficient vs that reference. To recommend
// a weight for any exercise (even one never performed):
//
//   predicted_e1RM(exercise) = pattern_strength * coefficient(exercise)
//   suggested_weight         = weightForTarget(predicted_e1RM, reps, RIR)
//
// Coefficients start at population priors and shrink toward each user's observed ratios.

import { weightForTarget, roundToIncrement } from "./e1rm";
import type { ExerciseDef, Pattern } from "./coefficients";

export interface ExerciseStat {
  exerciseId: string;
  currentE1rm: number;
  personalCoefficient?: number | null; // observed ratio vs pattern strength, once known
  confidenceN: number; // how many sessions back the personal coefficient
}

const PRIOR_WEIGHT = 4; // k: trust placed in the population prior during shrinkage

// Population prior shrunk toward the user's observed personal coefficient.
export function effectiveCoefficient(def: ExerciseDef, stat?: ExerciseStat): number {
  if (!stat || stat.personalCoefficient == null || stat.confidenceN === 0) {
    return def.coefficient;
  }
  const n = stat.confidenceN;
  return (n * stat.personalCoefficient + PRIOR_WEIGHT * def.coefficient) / (n + PRIOR_WEIGHT);
}

// One strength number per pattern, in reference-lift e1RM units, pooled from every
// logged variant: each contributes variant_e1RM / its_effective_coefficient.
export function estimatePatternStrength(
  pattern: Pattern,
  defs: Record<string, ExerciseDef>,
  stats: ExerciseStat[],
): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const stat of stats) {
    const def = defs[stat.exerciseId];
    if (!def || def.pattern !== pattern || !stat.currentE1rm) continue;
    const coeff = effectiveCoefficient(def, stat);
    if (coeff <= 0) continue;
    const referenceE1rm = stat.currentE1rm / coeff;
    const w = 1 + Math.min(stat.confidenceN, 5); // weight by data volume
    weightedSum += referenceE1rm * w;
    weightTotal += w;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : null;
}

export type Confidence = "calibrate" | "low" | "medium" | "high";

export interface Recommendation {
  exerciseId: string;
  predictedE1rm: number;
  suggestedWeight: number;
  reps: number;
  targetRir: number;
  confidence: Confidence;
}

export function recommend(
  target: ExerciseDef,
  reps: number,
  targetRir: number,
  defs: Record<string, ExerciseDef>,
  stats: ExerciseStat[],
): Recommendation | null {
  const own = stats.find((s) => s.exerciseId === target.id);

  // Direct history on this exact exercise is the most reliable signal.
  if (own?.currentE1rm) {
    return {
      exerciseId: target.id,
      predictedE1rm: own.currentE1rm,
      suggestedWeight: roundToIncrement(
        weightForTarget(own.currentE1rm, reps, targetRir),
        target.increment,
      ),
      reps,
      targetRir,
      confidence: own.confidenceN >= 3 ? "high" : "medium",
    };
  }

  // No direct history — derive from pattern strength.
  const patternStrength = estimatePatternStrength(target.pattern, defs, stats);
  if (patternStrength == null) return null; // nothing logged in this pattern yet

  const predictedE1rm = patternStrength * effectiveCoefficient(target, own ?? undefined);
  let weight = roundToIncrement(
    weightForTarget(predictedE1rm, reps, targetRir),
    target.increment,
  );

  // Machines: the first exposure is a guess (arbitrary leverage/stack units).
  // Bias conservative and flag it so the UI asks for a calibration set.
  let confidence: Confidence = "low";
  if (target.needsCalibration) {
    weight = roundToIncrement(weight * 0.85, target.increment);
    confidence = "calibrate";
  }

  return { exerciseId: target.id, predictedE1rm, suggestedWeight: weight, reps, targetRir, confidence };
}
