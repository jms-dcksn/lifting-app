import {
  EXERCISE_BY_ID,
  MACHINE_TYPE_LABEL,
  type Equipment,
  type ExerciseDef,
  type MachineType,
  type StationTag,
} from "./strength/coefficients";

export type ExerciseCardLabelLines = {
  name: string;
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

function stationInstanceLabel(brand: string, tag: "bench" | "rack" | "platform"): string {
  return `${brand} ${STATION_LABEL[tag]}`;
}

function isMachineType(tag: StationTag | undefined): tag is MachineType {
  return tag === "plate_loaded" || tag === "selectorized";
}

function isStationType(tag: StationTag | undefined): tag is "bench" | "rack" | "platform" {
  return tag === "bench" || tag === "rack" || tag === "platform";
}

export function exerciseCardLabel(
  def: ExerciseDef,
  catalog?: Record<string, ExerciseDef>,
): ExerciseCardLabelLines {
  const base = baseExercise(def, catalog);
  const stripped = stripEquipmentPrefix(base.name);
  const brand = def.brand?.trim() || null;
  const machineType = def.machineType;

  if (base.equipment === "machine" && isMachineType(machineType)) {
    const lines: ExerciseCardLabelLines = { name: stripped };
    if (brand) lines.secondary = brand;
    lines.tertiary = MACHINE_TYPE_LABEL[machineType];
    return lines;
  }

  if (isStationType(machineType) && brand) {
    return {
      name: stripped,
      secondary: EQUIPMENT_LABEL[base.equipment],
      tertiary: stationInstanceLabel(brand, machineType),
    };
  }

  if (base.equipment === "cable" && brand) {
    return {
      name: stripped,
      secondary: brand,
      tertiary: EQUIPMENT_LABEL.cable,
    };
  }

  if (stripped !== base.name && base.equipment !== "bodyweight") {
    return {
      name: stripped,
      secondary: EQUIPMENT_LABEL[base.equipment],
    };
  }

  return { name: def.name };
}

export function exerciseCardLabelText(lines: ExerciseCardLabelLines): string {
  return [lines.name, lines.secondary, lines.tertiary].filter(Boolean).join(" ");
}
