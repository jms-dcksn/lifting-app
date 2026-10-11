import { z } from "zod";

/** Closed intake ontology for program drafting (Slice 2). */
export const PROGRAM_DAYS = [3, 4, 5, 6] as const;
export const PROGRAM_GOALS = ["strength", "hypertrophy", "general"] as const;
export const PROGRAM_STYLES = ["classic", "fluid"] as const;
export const PROGRAM_EQUIPMENT = ["full_gym", "home_dumbbells", "machines_only"] as const;
export const PROGRAM_EMPHASIS = [
  "balanced",
  "glutes",
  "upper",
  "lower",
  "arms",
  "back",
] as const;

export type ProgramDays = (typeof PROGRAM_DAYS)[number];
export type ProgramGoal = (typeof PROGRAM_GOALS)[number];
export type ProgramStyle = (typeof PROGRAM_STYLES)[number];
export type ProgramEquipment = (typeof PROGRAM_EQUIPMENT)[number];
export type ProgramEmphasis = (typeof PROGRAM_EMPHASIS)[number];

export type ProgramIntake = {
  days: ProgramDays;
  goal: ProgramGoal;
  style: ProgramStyle;
  equipment?: ProgramEquipment;
  emphasis?: ProgramEmphasis;
  omissions?: string[];
};

export const programIntakeSchema = z.object({
  days: z.enum(["3", "4", "5", "6"]).transform((value) => Number(value) as ProgramDays),
  goal: z.enum(PROGRAM_GOALS),
  style: z.enum(PROGRAM_STYLES),
  equipment: z.enum(PROGRAM_EQUIPMENT).optional(),
  emphasis: z.enum(PROGRAM_EMPHASIS).optional(),
  omissions: z.array(z.string().min(1)).optional(),
});

export const partialProgramIntakeSchema = z.object({
  days: z.union([
    z.enum(["3", "4", "5", "6"]).transform((value) => Number(value) as ProgramDays),
    z.number().int().min(3).max(6),
  ]).optional(),
  goal: z.enum(PROGRAM_GOALS).optional(),
  style: z.enum(PROGRAM_STYLES).optional(),
  equipment: z.enum(PROGRAM_EQUIPMENT).optional(),
  emphasis: z.enum(PROGRAM_EMPHASIS).optional(),
  omissions: z.array(z.string().min(1)).optional(),
});

export const CONFIDENCE_THRESHOLD = 0.65;

export const INTAKE_CHIP_OPTIONS: Record<string, readonly string[]> = {
  days: ["3 days", "4 days", "5 days", "6 days"],
  goal: ["Strength", "Hypertrophy", "General fitness"],
  style: ["Classic phases", "Fluid adaptation"],
  equipment: ["Full gym", "Dumbbells at home", "Machines only"],
};

const OMISSION_ALIASES: Record<string, string[]> = {
  deadlift: ["bb-deadlift", "hinge"],
  deadlifts: ["bb-deadlift", "hinge"],
  rdl: ["bb-rdl", "hinge"],
  rdls: ["bb-rdl", "hinge"],
  squat: ["bb-back-squat", "squat"],
  squats: ["bb-back-squat", "squat"],
  bench: ["bb-bench", "horizontal_press"],
  "barbell bench": ["bb-bench", "horizontal_press"],
  pullup: ["weighted-pullup", "vertical_pull"],
  pullups: ["weighted-pullup", "vertical_pull"],
  "pull-up": ["weighted-pullup", "vertical_pull"],
  "pull-ups": ["weighted-pullup", "vertical_pull"],
};

export function normalizeOmissions(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const out = new Set<string>();
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const aliases = OMISSION_ALIASES[key];
    if (aliases) {
      aliases.forEach((alias) => out.add(alias));
      continue;
    }
    out.add(trimmed);
  }
  return [...out];
}

export function isOmitted(
  exerciseId: string,
  pattern: string,
  omissions: ReadonlySet<string>,
): boolean {
  return omissions.has(exerciseId) || omissions.has(pattern);
}
