import { stationModelLabel } from "./machine-models";
import {
  EXERCISE_BY_ID,
  type Equipment,
  type ExerciseDef,
} from "./strength/coefficients";

export type ExerciseCardLabelLines = {
  name: string;
  equipment?: string;
  station?: string;
  secondary?: string;
  tertiary?: string;
};

const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable",
  machine: "Machine",
  bodyweight: "Bodyweight",
};

const STATION_LABEL: Record<"bench" | "rack" | "platform", string> = {
  bench: "Bench",
  rack: "Rack",
  platform: "Platform",
};

export function stripEquipmentPrefix(name: string): string {
  return name.replace(/^(Barbell|Dumbbell|Machine|Cable)\s+/i, "");
}

function baseExercise(def: ExerciseDef, catalog?: Record<string, ExerciseDef>): ExerciseDef {
  if (!def.baseExerciseId) return def;
  return catalog?.[def.baseExerciseId] ?? EXERCISE_BY_ID[def.baseExerciseId] ?? def;
}

export function exerciseCardLabel(
  def: ExerciseDef,
  catalog?: Record<string, ExerciseDef>,
): ExerciseCardLabelLines {
  const base = baseExercise(def, catalog);
  const isMachine = base.equipment === "machine" || base.stationProfile === "machine";
  const brand = [def.brand?.trim(), stationModelLabel(def.stationModel)].filter(Boolean).join(" · ") || null;
  const lines: ExerciseCardLabelLines = {
    name: stripEquipmentPrefix(base.name),
    equipment: isMachine ? "Machine" : EQUIPMENT_LABEL[base.equipment],
  };
  if (isMachine && base.loadMode === "assisted") lines.station = "Assisted";
  if (brand) lines.secondary = brand;

  // A weight stack is shared by cables and dedicated machines; it is not a category.
  if (isMachine) {
    if (def.machineType === "selectorized") lines.tertiary = "Weight stack";
    if (def.machineType === "plate_loaded") lines.tertiary = "Plate-loaded";
  }
  const station = def.machineType ?? base.stationProfile;
  if (base.equipment === "barbell" && (station === "bench" || station === "rack" || station === "platform")) {
    lines.station = STATION_LABEL[station];
  }
  return lines;
}

export function exerciseCardLabelText(lines: ExerciseCardLabelLines): string {
  return [lines.name, lines.equipment, lines.station, lines.secondary, lines.tertiary].filter(Boolean).join(" ");
}
