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
//   - machines (machine_plate / machine_pin): needsCalibration — the first session is a
//     calibration set, not a prediction, because brand/leverage/stack units are arbitrary.
//
// Equipment seen at Lifetime: barbell, dumbbell (to ~120lb), cables, and machines from
// Hammer Strength (plate-loaded ISO-lateral), Life Fitness / Hoist (selectorized pin),
// and Technogym (selectorized). Brands are tagged so machine instances can be told apart.

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
  | "rear_delt";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine_plate"
  | "machine_pin"
  | "bodyweight";

export type Brand = "Hammer Strength" | "Life Fitness" | "Hoist" | "Technogym";

export interface ExerciseDef {
  id: string;
  name: string;
  pattern: Pattern;
  equipment: Equipment;
  brand?: Brand;
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
  { id: "hs-chest-press", name: "Chest Press (Hammer Strength)", pattern: "horizontal_press", equipment: "machine_plate", brand: "Hammer Strength", coefficient: 0.9, needsCalibration: true, increment: 5 },
  { id: "lf-chest-press", name: "Chest Press (Life Fitness)", pattern: "horizontal_press", equipment: "machine_pin", brand: "Life Fitness", coefficient: 0.85, needsCalibration: true, increment: 10 },
  { id: "pec-deck", name: "Pec Deck / Chest Fly (Technogym)", pattern: "horizontal_press", equipment: "machine_pin", brand: "Technogym", coefficient: 0.5, needsCalibration: true, increment: 10 },

  // --- Vertical press (ref: barbell overhead press) ---
  { id: "bb-ohp", name: "Barbell Overhead Press", pattern: "vertical_press", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "db-shoulder-press", name: "Dumbbell Shoulder Press", pattern: "vertical_press", equipment: "dumbbell", coefficient: 0.42, increment: 5 },
  { id: "hs-shoulder-press", name: "Shoulder Press (Hammer Strength)", pattern: "vertical_press", equipment: "machine_plate", brand: "Hammer Strength", coefficient: 0.95, needsCalibration: true, increment: 5 },
  { id: "lf-shoulder-press", name: "Shoulder Press (Life Fitness)", pattern: "vertical_press", equipment: "machine_pin", brand: "Life Fitness", coefficient: 0.9, needsCalibration: true, increment: 10 },

  // --- Horizontal pull (ref: barbell row) ---
  { id: "bb-row", name: "Barbell Row", pattern: "horizontal_pull", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "db-row", name: "Dumbbell Row", pattern: "horizontal_pull", equipment: "dumbbell", coefficient: 0.45, increment: 5 },
  { id: "hs-iso-row", name: "ISO-Lateral Row (Hammer Strength)", pattern: "horizontal_pull", equipment: "machine_plate", brand: "Hammer Strength", coefficient: 0.9, needsCalibration: true, increment: 5 },
  { id: "seated-cable-row", name: "Seated Cable Row", pattern: "horizontal_pull", equipment: "cable", coefficient: 0.85, needsCalibration: true, increment: 10 },

  // --- Vertical pull (ref: lat pulldown) ---
  { id: "lat-pulldown", name: "Lat Pulldown (Cable)", pattern: "vertical_pull", equipment: "cable", coefficient: 1.0, isReference: true, needsCalibration: true, increment: 10 },
  { id: "weighted-pullup", name: "Weighted Pull-up", pattern: "vertical_pull", equipment: "bodyweight", coefficient: 1.3, increment: 5 },
  { id: "hs-high-row", name: "High Row (Hammer Strength)", pattern: "vertical_pull", equipment: "machine_plate", brand: "Hammer Strength", coefficient: 1.1, needsCalibration: true, increment: 5 },
  { id: "hoist-lat-pulldown", name: "Lat Pulldown (Hoist)", pattern: "vertical_pull", equipment: "machine_pin", brand: "Hoist", coefficient: 1.0, needsCalibration: true, increment: 10 },

  // --- Squat (ref: barbell back squat) ---
  { id: "bb-back-squat", name: "Barbell Back Squat", pattern: "squat", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "bb-front-squat", name: "Barbell Front Squat", pattern: "squat", equipment: "barbell", coefficient: 0.82, increment: 5 },
  { id: "hack-squat", name: "Hack Squat (Machine)", pattern: "squat", equipment: "machine_plate", coefficient: 1.1, needsCalibration: true, increment: 10 },
  { id: "leg-press", name: "Leg Press (Plate-Loaded)", pattern: "squat", equipment: "machine_plate", coefficient: 2.5, needsCalibration: true, increment: 10 },

  // --- Hinge (ref: barbell deadlift) ---
  { id: "bb-deadlift", name: "Barbell Deadlift", pattern: "hinge", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "bb-rdl", name: "Romanian Deadlift", pattern: "hinge", equipment: "barbell", coefficient: 0.85, increment: 5 },

  // --- Hip thrust ---
  { id: "bb-hip-thrust", name: "Barbell Hip Thrust", pattern: "hip_thrust", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "hs-glute-drive", name: "Glute Drive (Hammer Strength)", pattern: "hip_thrust", equipment: "machine_plate", brand: "Hammer Strength", coefficient: 0.9, needsCalibration: true, increment: 10 },

  // --- Knee extension / flexion ---
  { id: "leg-extension", name: "Leg Extension", pattern: "knee_extension", equipment: "machine_pin", coefficient: 1.0, isReference: true, needsCalibration: true, increment: 10 },
  { id: "seated-leg-curl", name: "Seated Leg Curl", pattern: "knee_flexion", equipment: "machine_pin", coefficient: 1.0, isReference: true, needsCalibration: true, increment: 10 },

  // --- Calf ---
  { id: "standing-calf-raise", name: "Standing Calf Raise", pattern: "calf", equipment: "machine_plate", coefficient: 1.0, isReference: true, needsCalibration: true, increment: 10 },

  // --- Arms ---
  { id: "bb-curl", name: "Barbell Curl", pattern: "elbow_flexion", equipment: "barbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "db-curl", name: "Dumbbell Curl", pattern: "elbow_flexion", equipment: "dumbbell", coefficient: 0.45, increment: 5 },
  { id: "cable-curl", name: "Cable Curl", pattern: "elbow_flexion", equipment: "cable", coefficient: 0.9, needsCalibration: true, increment: 10 },
  { id: "cable-pushdown", name: "Cable Triceps Pushdown", pattern: "elbow_extension", equipment: "cable", coefficient: 1.0, isReference: true, needsCalibration: true, increment: 10 },
  { id: "db-skullcrusher", name: "Dumbbell Skullcrusher", pattern: "elbow_extension", equipment: "dumbbell", coefficient: 0.5, increment: 5 },

  // --- Delts ---
  { id: "db-lateral-raise", name: "Dumbbell Lateral Raise", pattern: "lateral_raise", equipment: "dumbbell", coefficient: 1.0, isReference: true, increment: 5 },
  { id: "cable-lateral-raise", name: "Cable Lateral Raise", pattern: "lateral_raise", equipment: "cable", coefficient: 0.9, needsCalibration: true, increment: 5 },
  { id: "reverse-pec-deck", name: "Reverse Pec Deck (Rear Delt)", pattern: "rear_delt", equipment: "machine_pin", brand: "Technogym", coefficient: 1.0, isReference: true, needsCalibration: true, increment: 10 },
];

export const EXERCISE_BY_ID: Record<string, ExerciseDef> = Object.fromEntries(
  EXERCISES.map((e) => [e.id, e]),
);
