import { describe, it, expect } from "vitest";
import {
  effectiveCoefficient,
  estimatePatternStrength,
  recommend,
  type ExerciseStat,
} from "@/lib/strength/recommend";
import { weightForTarget, roundToIncrement } from "@/lib/strength/e1rm";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";

const defs = EXERCISE_BY_ID;
const stat = (exerciseId: string, e: Partial<ExerciseStat> = {}): ExerciseStat => ({
  exerciseId,
  currentE1rm: 0,
  personalCoefficient: null,
  confidenceN: 0,
  ...e,
});

describe("effectiveCoefficient", () => {
  it("returns the population prior when there is no personal coefficient", () => {
    const def = defs["machine-chest-press"]; // coefficient 0.9
    expect(effectiveCoefficient(def)).toBe(0.9);
    expect(effectiveCoefficient(def, stat("machine-chest-press"))).toBe(0.9);
  });

  it("shrinks the personal coefficient toward the prior by confidence (k=4)", () => {
    const def = defs["machine-chest-press"]; // prior 0.9
    const s = stat("machine-chest-press", { personalCoefficient: 1.2, confidenceN: 4 });
    // (4*1.2 + 4*0.9) / (4 + 4) = 1.05
    expect(effectiveCoefficient(def, s)).toBeCloseTo(1.05, 6);
  });

  it("approaches the personal coefficient as confidence grows", () => {
    const def = defs["machine-chest-press"];
    const lowN = effectiveCoefficient(def, stat("machine-chest-press", { personalCoefficient: 1.5, confidenceN: 1 }));
    const highN = effectiveCoefficient(def, stat("machine-chest-press", { personalCoefficient: 1.5, confidenceN: 50 }));
    expect(highN).toBeGreaterThan(lowN);
    expect(highN).toBeCloseTo(1.5, 1);
  });
});

describe("estimatePatternStrength", () => {
  it("returns null when nothing is logged in the pattern", () => {
    expect(estimatePatternStrength("horizontal_press", defs, [])).toBeNull();
  });

  it("expresses a single variant in reference-lift units (divide by its coefficient)", () => {
    // dumbbell bench coeff 0.42, e1RM 84 -> reference bench strength 200
    const s = [stat("db-bench", { currentE1rm: 84 })];
    expect(estimatePatternStrength("horizontal_press", defs, s)).toBeCloseTo(200, 6);
  });

  it("pools multiple variants, weighting by data volume", () => {
    const s = [
      stat("bb-bench", { currentE1rm: 200, confidenceN: 0 }), // ref => 200, weight 1
      stat("db-bench", { currentE1rm: 84, confidenceN: 0 }), // ref => 200, weight 1
    ];
    expect(estimatePatternStrength("horizontal_press", defs, s)).toBeCloseTo(200, 6);
  });

  it("ignores variants from other patterns", () => {
    const s = [
      stat("bb-bench", { currentE1rm: 200 }),
      stat("bb-back-squat", { currentE1rm: 400 }), // squat pattern, irrelevant here
    ];
    expect(estimatePatternStrength("horizontal_press", defs, s)).toBeCloseTo(200, 6);
  });
});

describe("recommend", () => {
  it("returns null when nothing in the pattern has been logged", () => {
    expect(recommend(defs["bb-bench"], 5, 2, defs, [])).toBeNull();
  });

  it("uses direct history on the exact exercise (high confidence once seasoned)", () => {
    const stats = [stat("bb-bench", { currentE1rm: 200, confidenceN: 3 })];
    const rec = recommend(defs["bb-bench"], 5, 2, defs, stats)!;
    expect(rec.predictedE1rm).toBe(200);
    expect(rec.confidence).toBe("high");
    expect(rec.suggestedWeight).toBe(roundToIncrement(weightForTarget(200, 5, 2), 5));
  });

  it("is medium confidence with thin direct history", () => {
    const stats = [stat("bb-bench", { currentE1rm: 200, confidenceN: 1 })];
    expect(recommend(defs["bb-bench"], 5, 2, defs, stats)!.confidence).toBe("medium");
  });

  it("derives an unseen exercise from pattern strength (low confidence)", () => {
    const stats = [stat("bb-bench", { currentE1rm: 200 })]; // pattern strength ~200
    const rec = recommend(defs["db-bench"], 8, 2, defs, stats)!; // coeff 0.42
    expect(rec.predictedE1rm).toBeCloseTo(200 * 0.42, 6);
    expect(rec.confidence).toBe("low");
  });

  it("biases a fresh machine conservative and flags it for calibration", () => {
    const stats = [stat("bb-bench", { currentE1rm: 200 })];
    const plain = recommend(defs["bb-incline-bench"], 8, 2, defs, stats)!; // free weight, no discount
    const machine = recommend(defs["machine-chest-press"], 8, 2, defs, stats)!; // needsCalibration
    expect(machine.confidence).toBe("calibrate");
    // discounted 15% off the naive predicted weight
    const naive = roundToIncrement(weightForTarget(200 * 0.9, 8, 2), 5);
    expect(machine.suggestedWeight).toBe(roundToIncrement(naive * 0.85, 5));
    expect(plain.confidence).toBe("low");
  });
});
