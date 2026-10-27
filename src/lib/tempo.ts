import { z } from "zod";
import type { ExerciseDef } from "./strength/coefficients";

const seconds = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const tempoSchema = z.tuple([seconds, seconds, seconds, seconds]);
export type Tempo = z.infer<typeof tempoSchema>;
export const TEMPO_PHASES = ["Lower", "Bottom pause", "Lift", "Top pause"] as const;
export const TEMPO_EXPLANATION = "Seconds to lower, pause at the bottom, lift, and pause at the top. Zero means no pause.";

// Deliberate exercise classification, never display-name or broad-pattern inference.
export const BIG_COMPOUND_IDS: ReadonlySet<string> = new Set([
  "bb-bench", "bb-incline-bench", "db-bench", "db-incline-bench", "weighted-dip",
  "machine-chest-press", "machine-incline-chest-press", "machine-decline-chest-press", "machine-seated-dip",
  "bb-ohp", "db-shoulder-press", "machine-shoulder-press", "bb-row", "db-row", "machine-row", "machine-low-row",
  "seated-cable-row", "lat-pulldown", "machine-lat-pulldown", "weighted-pullup", "high-row",
  "bb-back-squat", "bb-front-squat", "hack-squat", "leg-press", "bb-deadlift", "bb-rdl",
  "neutral-grip-pulldown", "smith-bench", "smith-incline-bench", "smith-decline-bench",
  "bb-decline-bench", "db-decline-bench", "cable-chest-press", "bb-seal-row", "db-seal-row",
  "db-chest-supported-row", "bb-pendlay-row", "bb-underhand-row", "db-bent-over-row",
  "landmine-t-bar-row", "machine-chest-supported-t-bar-row", "machine-standing-t-bar-row",
  "landmine-meadows-row", "cable-single-arm-row", "weighted-chinup", "bb-close-grip-bench",
  "db-arnold-press", "db-goblet-squat", "db-rdl", "db-reverse-lunge", "db-walking-lunge",
  "bb-sumo-deadlift", "bb-stiff-leg-deadlift", "bb-good-morning", "smith-squat", "smith-rdl",
  "smith-split-squat", "smith-hip-thrust", "machine-lunge", "smith-shoulder-press",
  "belt-squat", "pendulum-squat", "v-squat", "reverse-v-squat", "squat-press",
  "machine-deadlift", "assisted-pullup", "assisted-chinup", "assisted-dip",
  "db-split-squat", "db-step-up", "bb-reverse-lunge", "bb-hip-thrust", "glute-drive",
]);
export function resolveTempo(def: Pick<ExerciseDef, "id" | "baseExerciseId"> | undefined, explicit?: Tempo | null): Tempo {
  return explicit ?? (BIG_COMPOUND_IDS.has(def?.baseExerciseId ?? def?.id ?? "") ? [3, 0, 1, 0] : [2, 0, 1, 0]);
}
export function formatTempo(value: Tempo): string { return value.join("-"); }
