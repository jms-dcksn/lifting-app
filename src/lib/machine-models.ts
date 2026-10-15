import type { MachineType } from "./strength/coefficients";

export interface MachineModel {
  id: string;
  name: string;
  brand: string;
  machineType: MachineType;
  exercises: readonly string[];
}

function model(brand: string, id: string, name: string, machineType: MachineType, ...exercises: string[]): MachineModel {
  return { brand, id, name, machineType, exercises };
}

// Product identities, not strength conversions. Additional models remain free text.
// Sources and coverage inventory: docs/EXERCISE-CATALOG.md.
export const MACHINE_MODELS: readonly MachineModel[] = [
  model("Hammer Strength", "hs-iso-horizontal-bench", "Iso-Lateral Horizontal Bench Press", "plate_loaded", "machine-chest-press"),
  model("Hammer Strength", "hs-iso-incline", "Iso-Lateral Incline Press", "plate_loaded", "machine-incline-chest-press"),
  model("Hammer Strength", "hs-super-incline", "Iso-Lateral Super Incline Press", "plate_loaded", "machine-incline-chest-press"),
  model("Hammer Strength", "hs-wide-chest", "Iso-Lateral Wide Chest", "plate_loaded", "machine-chest-press"),
  model("Hammer Strength", "hs-iso-decline", "Iso-Lateral Decline Press", "plate_loaded", "machine-decline-chest-press"),
  model("Hammer Strength", "hs-iso-row", "Iso-Lateral Row", "plate_loaded", "machine-row"),
  model("Hammer Strength", "hs-dy-row", "Iso-Lateral D.Y. Row", "plate_loaded", "machine-row"),
  model("Hammer Strength", "hs-iso-high-row", "Iso-Lateral High Row", "plate_loaded", "high-row"),
  model("Hammer Strength", "hs-iso-low-row", "Iso-Lateral Low Row", "plate_loaded", "machine-low-row"),
  model("Hammer Strength", "hs-front-pulldown", "Iso-Lateral Front Lat Pulldown", "plate_loaded", "machine-lat-pulldown"),
  model("Hammer Strength", "hs-wide-pulldown", "Iso-Lateral Wide Pulldown", "plate_loaded", "machine-lat-pulldown"),
  model("Hammer Strength", "hs-pullover", "Plate-Loaded Pullover", "plate_loaded", "machine-pullover"),
  model("Hammer Strength", "hs-seated-biceps", "Plate-Loaded Seated Biceps", "plate_loaded", "machine-preacher-curl"),
  model("Hammer Strength", "hs-seated-dip", "Plate-Loaded Seated Dip", "plate_loaded", "machine-seated-dip"),
  model("Hammer Strength", "hs-mts-chest", "MTS Iso-Lateral Chest Press", "selectorized", "machine-chest-press"),
  model("Hammer Strength", "hs-mts-incline", "MTS Iso-Lateral Incline Press", "selectorized", "machine-incline-chest-press"),
  model("Hammer Strength", "hs-mts-decline", "MTS Iso-Lateral Decline Press", "selectorized", "machine-decline-chest-press"),
  model("Hammer Strength", "hs-mts-row", "MTS Iso-Lateral Row", "selectorized", "machine-row"),
  model("Hammer Strength", "hs-mts-high-row", "MTS Iso-Lateral High Row", "selectorized", "high-row"),
  model("Hammer Strength", "hs-mts-pulldown", "MTS Iso-Lateral Front Pulldown", "selectorized", "machine-lat-pulldown"),
  model("Hammer Strength", "hs-mts-biceps", "MTS Iso-Lateral Biceps Curl", "selectorized", "machine-preacher-curl"),
  model("Hammer Strength", "hs-mts-triceps", "MTS Iso-Lateral Triceps Extension", "selectorized", "machine-triceps-extension"),
  model("Hammer Strength", "hs-mts-shoulder", "MTS Iso-Lateral Shoulder Press", "selectorized", "machine-shoulder-press"),
  model("Hammer Strength", "hs-t-bar", "Plate-Loaded T-Bar Row (Unsupported)", "plate_loaded", "machine-standing-t-bar-row"),
  model("Hammer Strength", "hs-belt-squat", "Plate-Loaded Belt Squat", "plate_loaded", "belt-squat"),
  model("Hammer Strength", "hs-pendulum-x", "Pendulum-X Squat", "plate_loaded", "pendulum-squat"),
  model("Hammer Strength", "hs-reverse-v", "Reverse V-Squat", "plate_loaded", "reverse-v-squat"),
  model("Hammer Strength", "hs-super-squat-press", "Super Squat Press", "plate_loaded", "squat-press"),
  model("Hammer Strength", "hs-shrug", "Seated / Standing Shrug", "plate_loaded", "machine-shrug"),
  model("Hammer Strength", "hs-glute-ham-reverse-hyper", "Glute Ham / Reverse Hyper", "plate_loaded", "reverse-hyper"),
  model("Hammer Strength", "hs-tibialis", "Tibia Dorsi-Flexion", "plate_loaded", "machine-tibialis-raise"),
  model("Hammer Strength", "hs-assist-dip-chin", "Select Assist Dip Chin", "selectorized", "assisted-pullup", "assisted-chinup", "assisted-dip"),
  model("Life Fitness", "lf-insignia-chest", "Insignia Chest Press", "selectorized", "machine-chest-press"),
  model("Life Fitness", "lf-insignia-dual-chest", "Insignia Dual Axis Chest Press", "selectorized", "machine-chest-press"),
  model("Life Fitness", "lf-insignia-pulldown", "Insignia Pulldown", "selectorized", "machine-lat-pulldown"),
  model("Life Fitness", "lf-insignia-dual-pulldown", "Insignia Dual Axis Pulldown", "selectorized", "machine-lat-pulldown"),
  model("Life Fitness", "lf-insignia-biceps", "Insignia Biceps Curl", "selectorized", "machine-preacher-curl"),
  model("Life Fitness", "lf-insignia-dependent-biceps", "Insignia Biceps Curl — Dependent", "selectorized", "machine-preacher-curl"),
  model("Life Fitness", "lf-insignia-triceps-press", "Insignia Triceps Press", "selectorized", "machine-seated-dip"),
  model("Life Fitness", "lf-insignia-triceps-extension", "Insignia Triceps Extension", "selectorized", "machine-triceps-extension"),
  model("Life Fitness", "lf-insignia-assist", "Insignia Assist Dip Chin", "selectorized", "assisted-pullup", "assisted-chinup", "assisted-dip"),
  model("Life Fitness", "lf-insignia-adduction", "Insignia Hip Adduction", "selectorized", "hip-adduction"),
  model("Life Fitness", "lf-insignia-glute", "Insignia Glute", "selectorized", "machine-glute-kickback"),
  model("Life Fitness", "lf-insignia-rotation", "Insignia Torso Rotation", "selectorized", "machine-torso-rotation"),
  model("Life Fitness", "lf-signature-cable", "Signature Cable Motion", "selectorized", "cable-chest-press", "seated-cable-row", "lat-pulldown"),
  model("Cybex", "cybex-eagle-chest", "Eagle NX Dual Axis Chest Press", "selectorized", "machine-chest-press"),
  model("Cybex", "cybex-eagle-pulldown", "Eagle NX Dual Axis Pulldown", "selectorized", "machine-lat-pulldown"),
  model("Cybex", "cybex-eagle-row", "Eagle NX Row", "selectorized", "machine-row"),
  model("Cybex", "cybex-squat-press", "Plate-Loaded Squat Press", "plate_loaded", "squat-press"),
  model("Cybex", "cybex-eagle-rotation", "Eagle NX Torso Rotation", "selectorized", "machine-torso-rotation"),
  model("Hoist", "hoist-rpl-5356", "ROC-IT RPL-5356 Hack Squat / Dead Lift / Shrug", "plate_loaded", "hack-squat", "machine-deadlift", "machine-shrug"),
  model("Hoist", "hoist-rpl-5403", "ROC-IT RPL-5403 Dual Action Leg Press", "plate_loaded", "leg-press"),
  model("Hoist", "hoist-rpl-5301", "ROC-IT RPL-5301 Chest Press", "plate_loaded", "machine-chest-press"),
  model("Hoist", "hoist-rpl-5303", "ROC-IT RPL-5303 Incline Chest Press", "plate_loaded", "machine-incline-chest-press"),
  model("Hoist", "hoist-rpl-5305", "ROC-IT RPL-5305 Decline Chest Press", "plate_loaded", "machine-decline-chest-press"),
  model("Hoist", "hoist-rpl-5201", "ROC-IT RPL-5201 Lat Pulldown", "plate_loaded", "machine-lat-pulldown"),
  model("Hoist", "hoist-rpl-5203", "ROC-IT RPL-5203 Mid Row", "plate_loaded", "machine-row"),
  model("Hoist", "hoist-rpl-5102", "ROC-IT RPL-5102 Biceps Curl", "plate_loaded", "machine-preacher-curl"),
  model("Hoist", "hoist-rpl-5101", "ROC-IT RPL-5101 Seated Dip", "plate_loaded", "machine-seated-dip"),
  model("Hoist", "hoist-rs-2102", "ROC-IT RS-2102 Biceps Curl", "selectorized", "machine-preacher-curl"),
  model("Hoist", "hoist-rs-2204", "ROC-IT RS-2204 Low Back", "selectorized", "back-extension"),
  model("Hoist", "hoist-rs-2101", "ROC-IT RS-2101 Seated Dip", "selectorized", "machine-seated-dip"),
  model("Hoist", "hoist-rs-1103", "ROC-IT RS-1103 Triceps Extension", "selectorized", "machine-triceps-extension"),
  model("Hoist", "hoist-rs-2203", "ROC-IT RS-2203 Seated Mid Row", "selectorized", "machine-row"),
  model("Hoist", "hoist-rs-2201", "ROC-IT RS-2201 Lat Pulldown", "selectorized", "machine-lat-pulldown"),
  model("Hoist", "hoist-rs-1406", "ROC-IT RS-1406 Inner Thigh", "selectorized", "hip-adduction"),
  model("Hoist", "hoist-rs-1602", "ROC-IT RS-1602 Rotary Torso", "selectorized", "machine-torso-rotation"),
];

export function normalizeStationModel(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ").toLowerCase() || null;
  if (normalized && normalized.length > 100) throw new Error("Model must be 100 characters or fewer");
  return MACHINE_MODELS.find(model => model.id === normalized || model.name.toLowerCase() === normalized)?.id ?? normalized;
}

export function stationModelLabel(value?: string | null): string | null {
  return value ? MACHINE_MODELS.find(model => model.id === value)?.name ?? value : null;
}

export function modelsForExercise(exerciseId: string, brand?: string, machineType?: MachineType): MachineModel[] {
  return MACHINE_MODELS.filter(model => model.exercises.includes(exerciseId)
    && (!brand || model.brand === brand) && (!machineType || model.machineType === machineType));
}
