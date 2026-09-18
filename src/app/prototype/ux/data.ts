// THROW AWAY. Sample gym state for the /prototype/ux visual study.
// Question: what should a PR-first visual language look like?

export type LiftId =
  | "bb-back-squat"
  | "bb-deadlift"
  | "bb-bench"
  | "bb-ohp"
  | "bb-row"
  | "weighted-pullup"
  | "bb-hip-thrust"
  | "db-split-squat"
  | "lat-pulldown"
  | "db-lateral-raise";

export type PatternId =
  | "squat"
  | "hinge"
  | "horizontal_press"
  | "vertical_press"
  | "horizontal_pull"
  | "vertical_pull";

export interface SampleLift {
  id: LiftId;
  pattern: PatternId | "hip_thrust" | "lunge" | "lateral_raise";
  name: string;
  short: string;
  e1rm: number;
  unit: "lb" | "added";
  delta: number;
  lastPr: string;
  spark: number[];
  recentPr?: "e1rm" | "rep" | "both";
  compound?: boolean;
}

export const COMPOUNDS: SampleLift[] = [
  {
    id: "bb-back-squat",
    pattern: "squat",
    name: "Barbell Back Squat",
    short: "Squat",
    e1rm: 405,
    unit: "lb",
    delta: 10,
    lastPr: "12d",
    spark: [380, 385, 390, 392, 405],
    compound: true,
  },
  {
    id: "bb-deadlift",
    pattern: "hinge",
    name: "Barbell Deadlift",
    short: "Deadlift",
    e1rm: 495,
    unit: "lb",
    delta: 0,
    lastPr: "28d",
    spark: [495, 495, 490, 495, 495],
    compound: true,
  },
  {
    id: "bb-bench",
    pattern: "horizontal_press",
    name: "Barbell Bench Press",
    short: "Bench",
    e1rm: 275,
    unit: "lb",
    delta: 5,
    lastPr: "2d",
    spark: [255, 260, 265, 270, 275],
    recentPr: "e1rm",
    compound: true,
  },
  {
    id: "bb-ohp",
    pattern: "vertical_press",
    name: "Barbell Overhead Press",
    short: "OHP",
    e1rm: 165,
    unit: "lb",
    delta: 5,
    lastPr: "5d",
    spark: [150, 155, 155, 160, 165],
    recentPr: "rep",
    compound: true,
  },
  {
    id: "bb-row",
    pattern: "horizontal_pull",
    name: "Barbell Row",
    short: "Row",
    e1rm: 225,
    unit: "lb",
    delta: 0,
    lastPr: "21d",
    spark: [220, 225, 225, 225, 225],
    compound: true,
  },
  {
    id: "weighted-pullup",
    pattern: "vertical_pull",
    name: "Weighted Pull-up",
    short: "Pull-up",
    e1rm: 62,
    unit: "added",
    delta: 2,
    lastPr: "7d",
    spark: [50, 55, 55, 60, 62],
    compound: true,
  },
];

export const EXTRAS: SampleLift[] = [
  {
    id: "bb-hip-thrust",
    pattern: "hip_thrust",
    name: "Barbell Hip Thrust",
    short: "Hip Thrust",
    e1rm: 365,
    unit: "lb",
    delta: 15,
    lastPr: "3d",
    spark: [320, 330, 345, 350, 365],
    recentPr: "e1rm",
  },
  {
    id: "db-split-squat",
    pattern: "lunge",
    name: "Bulgarian Split Squat",
    short: "Split Squat",
    e1rm: 90,
    unit: "lb",
    delta: 5,
    lastPr: "9d",
    spark: [75, 80, 80, 85, 90],
  },
  {
    id: "lat-pulldown",
    pattern: "vertical_pull",
    name: "Lat Pulldown",
    short: "Pulldown",
    e1rm: 190,
    unit: "lb",
    delta: -5,
    lastPr: "40d",
    spark: [200, 195, 195, 190, 190],
  },
  {
    id: "db-lateral-raise",
    pattern: "lateral_raise",
    name: "Dumbbell Lateral Raise",
    short: "Laterals",
    e1rm: 32,
    unit: "lb",
    delta: 2,
    lastPr: "4d",
    spark: [25, 27, 30, 30, 32],
  },
];

export const ALL_LIFTS: SampleLift[] = [...COMPOUNDS, ...EXTRAS];

export const PATTERN_META: Record<
  PatternId,
  { label: string; mark: string; compoundId: LiftId }
> = {
  squat: { label: "Squat", mark: "SQ", compoundId: "bb-back-squat" },
  hinge: { label: "Hinge", mark: "DL", compoundId: "bb-deadlift" },
  horizontal_press: { label: "Press", mark: "BP", compoundId: "bb-bench" },
  vertical_press: { label: "Overhead", mark: "OH", compoundId: "bb-ohp" },
  horizontal_pull: { label: "Row", mark: "RW", compoundId: "bb-row" },
  vertical_pull: { label: "Pull", mark: "PU", compoundId: "weighted-pullup" },
};

export const NEXT_WORKOUT = {
  day: "Push",
  week: 4,
  weeks: 8,
  program: "Strong Foundations",
  sets: 18,
  exercises: [
    { id: "bb-bench" as LiftId, name: "Barbell Bench Press", rx: "3 × 5–8", target: "185 × 6" },
    { id: "bb-ohp" as LiftId, name: "Overhead Press", rx: "3 × 5–8", target: "115 × 6" },
    { id: "weighted-dip" as const, name: "Weighted Dip", rx: "3 × 8–12", target: "+25 × 8" },
    { id: "db-lateral-raise" as LiftId, name: "Lateral Raise", rx: "3 × 12–15", target: "20 × 12" },
    { id: "cable-pushdown" as const, name: "Triceps Pushdown", rx: "3 × 10–12", target: "50 × 10" },
    { id: "db-skullcrusher" as const, name: "Skullcrusher", rx: "3 × 8–12", target: "30 × 8" },
  ],
};

export const WEEK_RECORDS = [
  { id: "bb-bench" as LiftId, name: "Bench", kind: "e1RM", detail: "275 lb  +5" },
  { id: "bb-ohp" as LiftId, name: "OHP", kind: "Rep", detail: "115 × 8  +1" },
];

export const FEED = [
  { id: "f1", kind: "pr" as const, liftId: "bb-bench" as LiftId, title: "Bench e1RM", value: "275 lb", delta: "+5 lb", when: "Tue" },
  { id: "f2", kind: "pr" as const, liftId: "bb-ohp" as LiftId, title: "OHP reps", value: "115 × 8", delta: "+1 rep", when: "Tue" },
  { id: "f3", kind: "session" as const, title: "Push complete", value: "18 sets", delta: "2 PRs", when: "Tue" },
  { id: "f4", kind: "pr" as const, liftId: "bb-hip-thrust" as LiftId, title: "Hip Thrust e1RM", value: "365 lb", delta: "+15 lb", when: "Sun" },
  { id: "f5", kind: "hold" as const, liftId: "bb-back-squat" as LiftId, title: "Squat held", value: "405 lb", delta: "no change", when: "Sat" },
  { id: "f6", kind: "stall" as const, liftId: "bb-row" as LiftId, title: "Row stalling", value: "21 days", delta: "review", when: "—" },
  { id: "f7", kind: "weight" as const, title: "Bodyweight", value: "182.4 lb", delta: "−0.6", when: "Today" },
];

export function liftById(id: string) {
  return ALL_LIFTS.find((lift) => lift.id === id);
}

export function signed(n: number) {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return "0";
}
