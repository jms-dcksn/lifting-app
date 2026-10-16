import { modelsForExercise, stationModelLabel } from "./machine-models";
import type { ExerciseDef } from "./strength/coefficients";

const ALIASES: Record<string, readonly string[]> = {
  "bb-row": ["bent over barbell row", "bentover row", "pronated row"],
  "cable-curl": ["cable curl with bar", "straight bar cable curl", "bar cable curl"],
  "weighted-dip": ["weighted dips", "chest dips", "bodyweight dip"],
  "machine-seated-dip": ["machine dips", "seated dips", "triceps press"],
  "machine-preacher-curl": ["machine biceps curl", "machine arm curl"],
  "machine-row": ["horizontal row", "iso lateral row"],
  "cable-bayesian-curl": ["behind the back curl", "face away cable curl"],
  "db-chest-supported-row": ["incline dumbbell row", "supported db row"],
  "cable-mid-fly": ["cable crossover", "cable chest fly"],
};

const normalize = (text: string) => text.toLowerCase()
  .replace(/\bd[.]?b[.]?\b/g, "dumbbell").replace(/\bbb\b/g, "barbell")
  .replace(/flyes|flys|flye/g, "fly").replace(/\b(curls|rows|dips|raises|pullups)\b/g, word => word.slice(0, -1)).replace(/[^a-z0-9]+/g, " ").trim();

export function matchesExercise(def: ExerciseDef, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const baseId = def.baseExerciseId ?? def.id;
  const fields = [def.name, def.pattern, def.equipment, def.brand ?? "", stationModelLabel(def.stationModel) ?? "",
    ...(def.aliases ?? []), ...(ALIASES[baseId] ?? []),
    ...(!def.baseExerciseId ? modelsForExercise(baseId).map(model => `${model.brand} ${model.name}`) : []),
  ].map(normalize).join(" ");
  return words.every(word => fields.includes(word));
}
