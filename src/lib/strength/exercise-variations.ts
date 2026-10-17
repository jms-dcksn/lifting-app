import type { Equipment, ExerciseDef, Pattern, StationProfile } from "./coefficients";

// Separate identities for changes in support, implement, grip, or resistance path.
// These are conservative population priors, not measured strength conversions.
function lift(
  id: string, name: string, pattern: Pattern, equipment: Equipment,
  coefficient: number, stationProfile: StationProfile = "none",
  extra: Partial<ExerciseDef> = {},
): ExerciseDef {
  return {
    id, name, pattern, equipment, coefficient, stationProfile,
    increment: equipment === "dumbbell" ? 2.5 : 5,
    ...(stationProfile === "machine" || stationProfile === "cable" ? { needsCalibration: true } : {}),
    ...extra,
  };
}

const curl = (id: string, name: string, equipment: Equipment, coefficient = 0.4) =>
  lift(id, name, "elbow_flexion", equipment, coefficient, equipment === "cable" ? "cable" : "none");
const fly = (id: string, name: string, equipment: Equipment) =>
  lift(id, name, "chest_fly", equipment, equipment === "dumbbell" ? 1 : 2, equipment === "cable" ? "cable" : "none", { isReference: id === "db-flat-fly" });
const machine = (id: string, name: string, pattern: Pattern, coefficient = 1, extra: Partial<ExerciseDef> = {}) =>
  lift(id, name, pattern, "machine", coefficient, "machine", {
    ...(id.startsWith("smith-") ? { allowedMachineTypes: ["plate_loaded"] as const } : {}), ...extra,
  });

export const EXERCISE_VARIATIONS: ExerciseDef[] = [
  // Ogus variations retain distinct loading identities instead of borrowing generic history.
  machine("machine-single-arm-chest-fly", "Single Arm Machine Chest Fly", "chest_fly", 1),
  lift("neutral-grip-pulldown", "Neutral Grip Pulldown", "vertical_pull", "cable", 1, "cable"),
  lift("cable-skullcrusher-daisy-chains", "Cable Skullcrusher (Daisy Chains)", "elbow_extension", "cable", 0.85, "cable"),
  curl("db-lean-back-preacher-curl", "Lean Back DB Preacher Curls", "dumbbell"),
  lift("cable-boxy-face-pull", "Boxy Face Pull", "lateral_raise", "cable", 0.9, "cable"),
  machine("smith-ogus-45-back-extension", "Ogus 45 - Smith Machine 45 Degree Back Extension", "hinge", 0.4),
  machine("straight-leg-machine-adductor", "Straight Leg Machine Adductor", "hip_adduction", 1),
  machine("good-boy-external-rotation", "Good Boy External Rotation (on Adductor Machine)", "hip_thrust", 1),
  lift("weighted-hanging-leg-raise", "Weighted Hanging Leg Raise", "core", "bodyweight", 1),

  curl("db-spider-curl", "Dumbbell Spider Curl", "dumbbell"),
  curl("ez-spider-curl", "EZ-Bar Spider Curl", "barbell", 0.8),
  curl("db-incline-curl", "Incline Dumbbell Curl", "dumbbell"),
  curl("db-concentration-curl", "Dumbbell Concentration Curl", "dumbbell"),
  curl("db-preacher-curl", "Dumbbell Preacher Curl", "dumbbell"),
  curl("ez-preacher-curl", "EZ-Bar Preacher Curl", "barbell", 0.8),
  curl("ez-curl", "EZ-Bar Curl", "barbell", 1),
  curl("db-hammer-curl", "Dumbbell Hammer Curl", "dumbbell", 0.5),
  curl("db-hammer-preacher-curl", "Dumbbell Hammer Preacher Curl", "dumbbell"),
  curl("cable-bayesian-curl", "Bayesian Cable Curl", "cable", 0.45),
  curl("cable-bayesian-hammer-curl", "Bayesian Cable Hammer Curl", "cable", 0.45),
  curl("cable-preacher-curl", "Cable Preacher Curl", "cable", 0.8),
  curl("cable-lying-low-curl", "Lying Cable Curl (Low Pulley)", "cable", 0.8),
  curl("cable-lying-high-curl", "Lying Cable Curl (High Pulley)", "cable", 0.8),
  curl("ez-reverse-curl", "Reverse EZ-Bar Curl", "barbell", 0.6),
  curl("db-incline-hammer-curl", "Incline Dumbbell Hammer Curl", "dumbbell"),
  curl("cable-high-curl", "High Cable Double-Biceps Curl", "cable", 0.4),
  curl("db-zottman-curl", "Dumbbell Zottman Curl", "dumbbell", 0.35),
  curl("db-lying-curl", "Lying Dumbbell Curl", "dumbbell", 0.35),

  fly("db-flat-fly", "Flat Dumbbell Fly", "dumbbell"),
  fly("db-incline-fly", "Incline Dumbbell Fly", "dumbbell"),
  fly("db-decline-fly", "Decline Dumbbell Fly", "dumbbell"),
  fly("cable-mid-fly", "Standing Cable Fly (Mid-Height)", "cable"),
  fly("cable-low-high-fly", "Standing Cable Fly (Low-to-High)", "cable"),
  fly("cable-high-low-fly", "Standing Cable Fly (High-to-Low)", "cable"),
  fly("cable-flat-bench-fly", "Flat Bench Cable Fly", "cable"),
  fly("cable-incline-bench-fly", "Incline Bench Cable Fly", "cable"),
  fly("cable-decline-bench-fly", "Decline Bench Cable Fly", "cable"),
  fly("cable-seated-fly", "Seated Cable Fly", "cable"),
  fly("cable-press-around", "Single-Arm Cable Press-Around", "cable"),
  machine("smith-bench", "Smith Machine Flat Bench Press", "horizontal_press", 0.9),
  machine("smith-incline-bench", "Smith Machine Incline Bench Press", "horizontal_press", 0.8),
  machine("smith-decline-bench", "Smith Machine Decline Bench Press", "horizontal_press", 0.95),
  lift("bb-decline-bench", "Barbell Decline Bench Press", "horizontal_press", "barbell", 1.05, "bench"),
  lift("db-decline-bench", "Dumbbell Decline Bench Press", "horizontal_press", "dumbbell", 0.45),
  lift("cable-chest-press", "Cable Chest Press", "horizontal_press", "cable", 0.6, "cable"),

  lift("bb-seal-row", "Barbell Seal Row", "horizontal_pull", "barbell", 0.8),
  lift("db-seal-row", "Dumbbell Seal Row", "horizontal_pull", "dumbbell", 0.35),
  lift("db-chest-supported-row", "Incline Chest-Supported Dumbbell Row", "horizontal_pull", "dumbbell", 0.35),
  lift("bb-pendlay-row", "Pendlay Row", "horizontal_pull", "barbell", 0.85),
  lift("bb-underhand-row", "Underhand Barbell Row / Yates Row", "horizontal_pull", "barbell", 0.95),
  lift("db-bent-over-row", "Bent-Over Dumbbell Row", "horizontal_pull", "dumbbell", 0.4),
  lift("landmine-t-bar-row", "Landmine T-Bar Row", "horizontal_pull", "barbell", 0.8),
  machine("machine-chest-supported-t-bar-row", "Chest-Supported T-Bar Row", "horizontal_pull", 0.85),
  machine("machine-standing-t-bar-row", "Standing T-Bar Row Machine", "horizontal_pull", 0.9),
  lift("landmine-meadows-row", "Meadows Row", "horizontal_pull", "barbell", 0.4),
  lift("cable-single-arm-row", "Single-Arm Cable Row", "horizontal_pull", "cable", 0.4, "cable"),
  lift("cable-straight-arm-pulldown", "Straight-Arm Cable Pulldown", "vertical_pull", "cable", 0.45, "cable"),
  lift("db-pullover", "Dumbbell Pullover", "vertical_pull", "dumbbell", 0.35),
  lift("weighted-chinup", "Weighted Chin-Up", "vertical_pull", "bodyweight", 1.35),

  lift("cable-overhead-triceps", "Cable Overhead Triceps Extension", "elbow_extension", "cable", 0.85, "cable"),
  lift("db-overhead-triceps", "Dumbbell Overhead Triceps Extension", "elbow_extension", "dumbbell", 0.45),
  lift("ez-skullcrusher", "EZ-Bar Skullcrusher", "elbow_extension", "barbell", 0.9),
  lift("bb-close-grip-bench", "Close-Grip Barbell Bench Press", "horizontal_press", "barbell", 0.85, "bench"),
  lift("cable-triceps-kickback", "Cable Triceps Kickback", "elbow_extension", "cable", 0.25, "cable"),
  lift("db-reverse-fly", "Dumbbell Reverse Fly", "rear_delt", "dumbbell", 0.25),
  lift("db-incline-reverse-fly", "Incline-Supported Dumbbell Reverse Fly", "rear_delt", "dumbbell", 0.25),
  lift("cable-reverse-fly", "Cable Reverse Fly", "rear_delt", "cable", 0.5, "cable"),
  lift("cable-face-pull", "Cable Face Pull", "rear_delt", "cable", 0.75, "cable"),
  lift("db-arnold-press", "Dumbbell Arnold Press", "vertical_press", "dumbbell", 0.35),
  lift("db-shrug", "Dumbbell Shrug", "traps", "dumbbell", 0.45),

  lift("db-goblet-squat", "Dumbbell Goblet Squat", "squat", "dumbbell", 0.3),
  lift("db-rdl", "Dumbbell Romanian Deadlift", "hinge", "dumbbell", 0.4),
  lift("db-reverse-lunge", "Dumbbell Reverse Lunge", "lunge", "dumbbell", 1),
  lift("db-walking-lunge", "Walking Dumbbell Lunge", "lunge", "dumbbell", 0.9),
  lift("bb-sumo-deadlift", "Sumo Deadlift", "hinge", "barbell", 1, "platform"),
  lift("bb-stiff-leg-deadlift", "Stiff-Leg Deadlift", "hinge", "barbell", 0.75, "platform"),
  lift("bb-good-morning", "Barbell Good Morning", "hinge", "barbell", 0.4, "rack"),
  machine("smith-squat", "Smith Machine Squat", "squat"),
  machine("smith-rdl", "Smith Machine Romanian Deadlift", "hinge", 0.85),
  machine("smith-split-squat", "Smith Machine Bulgarian Split Squat", "lunge", 1.8),
  machine("smith-hip-thrust", "Smith Machine Hip Thrust", "hip_thrust", 0.9),
  machine("machine-lunge", "Machine Lunge / Split Squat", "lunge", 1.8),
  machine("smith-shoulder-press", "Smith Machine Shoulder Press", "vertical_press", 0.9),
  lift("ab-wheel-rollout", "Ab Wheel Rollout", "core", "bodyweight", 1, "none", { loadMode: "reps_only" }),
  lift("hanging-leg-raise", "Hanging Straight-Leg Raise", "core", "bodyweight", 1, "none", { loadMode: "reps_only" }),

  machine("belt-squat", "Belt Squat", "squat"),
  machine("pendulum-squat", "Pendulum Squat", "squat"),
  machine("v-squat", "V-Squat", "squat"),
  machine("reverse-v-squat", "Reverse V-Squat", "squat"),
  machine("squat-press", "Machine Squat Press", "squat", 2.5),
  machine("machine-shrug", "Machine Seated / Standing Shrug", "traps"),
  machine("machine-deadlift", "Machine Deadlift", "hinge"),
  lift("assisted-pullup", "Machine-Assisted Pull-Up", "vertical_pull", "bodyweight", 1.3, "machine", { loadMode: "assisted", allowedMachineTypes: ["selectorized"] }),
  lift("assisted-chinup", "Machine-Assisted Chin-Up", "vertical_pull", "bodyweight", 1.35, "machine", { loadMode: "assisted", allowedMachineTypes: ["selectorized"] }),
  lift("assisted-dip", "Machine-Assisted Dip", "horizontal_press", "bodyweight", 1.05, "machine", { loadMode: "assisted", allowedMachineTypes: ["selectorized"] }),
  machine("hip-adduction", "Machine Hip Adduction", "hip_adduction", 1, { isReference: true }),
  machine("machine-glute-kickback", "Machine Glute Kickback / Hip Extension", "hip_extension", 1, { isReference: true }),
  lift("cable-glute-kickback", "Cable Glute Kickback", "hip_extension", "cable", 0.5, "cable"),
  machine("machine-torso-rotation", "Machine Torso Rotation", "core_rotation", 1, { isReference: true }),
  machine("machine-tibialis-raise", "Machine Tibialis Raise / Dorsi-Flexion", "ankle_dorsiflexion", 1, { isReference: true }),
  machine("reverse-hyper", "Machine Reverse Hyperextension", "hinge", 0.4),
  lift("glute-ham-raise", "Glute-Ham Raise", "knee_flexion", "bodyweight", 1, "none", { loadMode: "reps_only" }),
];
