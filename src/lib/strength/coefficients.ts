// Seeded exercise catalog and population strength priors.
//
// Each exercise belongs to a movement pattern with one reference lift (coefficient 1.0).
// `coefficient` is that exercise's strength relative to the reference, expressed in e1RM.
// These are ROUGH population priors — they self-correct per user after a few sessions
// via Bayesian shrinkage (see recommend.ts). Exact values barely matter long-term.
//
// Logging conventions (so coefficients stay consistent):
//   - barbell / machine: log TOTAL load (both sides for plate-loaded).
//   - dumbbell: log the weight of ONE dumbbell.
//   - machine: a single equipment type — selectorized (pin) and plate-loaded both log
//     total load. needsCalibration — the first session is a calibration set, not a
//     prediction, because brand/leverage/stack units are arbitrary.
//
// Machine movements are seeded as GENERIC templates (no brand baked in). Brand and machine
// type (selectorized | plate_loaded) live on user-created variants (rows in the `exercise`
// table), not on these seeded templates — see src/lib/catalog.ts. A template must be
// instantiated to a concrete variant before it can be logged against.

export type Pattern =
  | "horizontal_press"
  | "vertical_press"
  | "horizontal_pull"
  | "vertical_pull"
  | "squat"
  | "hinge"
  | "lunge"
  | "knee_extension"
  | "knee_flexion"
  | "hip_thrust"
  | "calf"
  | "elbow_flexion"
  | "elbow_extension"
  | "lateral_raise"
  | "rear_delt"
  | "core";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight";

export type MachineType = "selectorized" | "plate_loaded";

// Brand is open-ended (gyms have off-brands); KNOWN_BRANDS seeds the dropdown.
export type Brand = string;

export const KNOWN_BRANDS = [
  "Hammer Strength",
  "Life Fitness",
  "Cybex",
  "Hoist",
  "Technogym",
  "Precor",
  "Matrix",
  "Nautilus",
] as const;

export const MACHINE_TYPE_LABEL: Record<MachineType, string> = {
  selectorized: "Selectorized",
  plate_loaded: "Plate-loaded",
};

export interface ExerciseDef {
  id: string;
  name: string;
  pattern: Pattern;
  equipment: Equipment;
  brand?: Brand;
  machineType?: MachineType;
  baseExerciseId?: string; // seeded template a DB variant derives from
  machineTemplate?: boolean; // seeded generic machine: must be instantiated to a variant before logging
  coefficient: number;
  isReference?: boolean;
  needsCalibration?: boolean;
  increment: number;
}

export const EXERCISES: ExerciseDef[] = [
  // --- Horizontal press (ref: barbell bench) ---
  { id: "bb-bench", name: "Barbell Bench Press", pattern: "horizontal_press", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "bb-incline-bench", name: "Barbell Incline Bench", pattern: "horizontal_press", equipment: "barbell", coefficient: 0.82, increment: 5 },
  { id: "db-bench", name: "Dumbbell Bench Press", pattern: "horizontal_press", equipment: "dumbbell", coefficient: 0.42, increment: 5 },
  { id: "db-incline-bench", name: "Dumbbell Incline Bench", pattern: "horizontal_press", equipment: "dumbbell", coefficient: 0.36, increment: 5 },
  { id: "machine-chest-press", name: "Machine Chest Press", pattern: "horizontal_press", equipment: "machine", coefficient: 0.9, needsCalibration: true, machineTemplate: true, increment: 5 },
  { id: "pec-deck", name: "Pec Deck / Chest Fly", pattern: "horizontal_press", equipment: "machine", coefficient: 0.5, needsCalibration: true, machineTemplate: true, increment: 10 },

  // --- Vertical press (ref: barbell overhead press) ---
  { id: "bb-ohp", name: "Barbell Overhead Press", pattern: "vertical_press", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "db-shoulder-press", name: "Dumbbell Shoulder Press", pattern: "vertical_press", equipment: "dumbbell", coefficient: 0.42, increment: 5 },
  { id: "machine-shoulder-press", name: "Machine Shoulder Press", pattern: "vertical_press", equipment: "machine", coefficient: 0.95, needsCalibration: true, machineTemplate: true, increment: 5 },

  // --- Horizontal pull (ref: barbell row) ---
  { id: "bb-row", name: "Barbell Row", pattern: "horizontal_pull", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "db-row", name: "Dumbbell Row", pattern: "horizontal_pull", equipment: "dumbbell", coefficient: 0.45, increment: 5 },
  { id: "machine-row", name: "Machine Row (ISO-Lateral)", pattern: "horizontal_pull", equipment: "machine", coefficient: 0.9, needsCalibration: true, machineTemplate: true, increment: 5 },
  { id: "seated-cable-row", name: "Seated Cable Row", pattern: "horizontal_pull", equipment: "cable", coefficient: 0.85, needsCalibration: true, increment: 10 },

  // --- Vertical pull (ref: lat pulldown) ---
  { id: "lat-pulldown", name: "Lat Pulldown (Cable)", pattern: "vertical_pull", equipment: "cable", coefficient: 1.0, isReference: true, needsCalibration: true, increment: 10 },
  { id: "weighted-pullup", name: "Weighted Pull-up", pattern: "vertical_pull", equipment: "bodyweight", coefficient: 1.3, increment: 5 },
  { id: "high-row", name: "High Row", pattern: "vertical_pull", equipment: "machine", coefficient: 1.1, needsCalibration: true, machineTemplate: true, increment: 5 },

  // --- Squat (ref: barbell back squat) ---
  { id: "bb-back-squat", name: "Barbell Back Squat", pattern: "squat", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "bb-front-squat", name: "Barbell Front Squat", pattern: "squat", equipment: "barbell", coefficient: 0.82, increment: 5 },
  { id: "hack-squat", name: "Hack Squat", pattern: "squat", equipment: "machine", coefficient: 1.1, needsCalibration: true, machineTemplate: true, increment: 10 },
  { id: "leg-press", name: "Leg Press", pattern: "squat", equipment: "machine", coefficient: 2.5, needsCalibration: true, machineTemplate: true, increment: 10 },

  // --- Hinge (ref: barbell deadlift) ---
  { id: "bb-deadlift", name: "Barbell Deadlift", pattern: "hinge", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "bb-rdl", name: "Romanian Deadlift", pattern: "hinge", equipment: "barbell", coefficient: 0.85, increment: 5 },

  // --- Hip thrust ---
  { id: "bb-hip-thrust", name: "Barbell Hip Thrust", pattern: "hip_thrust", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "glute-drive", name: "Glute Drive", pattern: "hip_thrust", equipment: "machine", coefficient: 0.9, needsCalibration: true, machineTemplate: true, increment: 10 },

  // --- Knee extension / flexion ---
  { id: "leg-extension", name: "Leg Extension", pattern: "knee_extension", equipment: "machine", coefficient: 1.0, isReference: true, needsCalibration: true, machineTemplate: true, increment: 10 },
  { id: "seated-leg-curl", name: "Seated Leg Curl", pattern: "knee_flexion", equipment: "machine", coefficient: 1.0, isReference: true, needsCalibration: true, machineTemplate: true, increment: 10 },

  // --- Calf ---
  { id: "standing-calf-raise", name: "Standing Calf Raise", pattern: "calf", equipment: "machine", coefficient: 1.0, isReference: true, needsCalibration: true, machineTemplate: true, increment: 10 },

  // --- Arms ---
  { id: "bb-curl", name: "Barbell Curl", pattern: "elbow_flexion", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "db-curl", name: "Dumbbell Curl", pattern: "elbow_flexion", equipment: "dumbbell", coefficient: 0.45, increment: 5 },
  { id: "cable-curl", name: "Cable Curl", pattern: "elbow_flexion", equipment: "cable", coefficient: 0.9, needsCalibration: true, increment: 10 },
  { id: "cable-pushdown", name: "Cable Triceps Pushdown", pattern: "elbow_extension", equipment: "cable", coefficient: 1.0, isReference: true, needsCalibration: true, increment: 10 },
  { id: "db-skullcrusher", name: "Dumbbell Skullcrusher", pattern: "elbow_extension", equipment: "dumbbell", coefficient: 0.5, increment: 5 },

  // --- Delts ---
  { id: "db-lateral-raise", name: "Dumbbell Lateral Raise", pattern: "lateral_raise", equipment: "dumbbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "cable-lateral-raise", name: "Cable Lateral Raise", pattern: "lateral_raise", equipment: "cable", coefficient: 0.9, needsCalibration: true, increment: 5 },
  { id: "reverse-pec-deck", name: "Reverse Pec Deck (Rear Delt)", pattern: "rear_delt", equipment: "machine", coefficient: 1.0, isReference: true, needsCalibration: true, machineTemplate: true, increment: 10 },

  // --- Core ---
  { id: "cable-crunch", name: "Cable Crunch", pattern: "core", equipment: "cable", coefficient: 1.0, isReference: true, needsCalibration: true, increment: 10 },
];

export const EXERCISE_BY_ID: Record<string, ExerciseDef> = Object.fromEntries(
  EXERCISES.map((e) => [e.id, e]),
);

// Human-readable movement-pattern names for analytics surfaces.
export const PATTERN_LABEL: Record<Pattern, string> = {
  horizontal_press: "Horizontal Press",
  vertical_press: "Vertical Press",
  horizontal_pull: "Horizontal Pull",
  vertical_pull: "Vertical Pull",
  squat: "Squat",
  hinge: "Hinge",
  lunge: "Lunge",
  knee_extension: "Knee Extension",
  knee_flexion: "Knee Flexion",
  hip_thrust: "Hip Thrust",
  calf: "Calf",
  elbow_flexion: "Elbow Flexion",
  elbow_extension: "Elbow Extension",
  lateral_raise: "Lateral Raise",
  rear_delt: "Rear Delt",
  core: "Core",
};
