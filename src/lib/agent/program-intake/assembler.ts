import { EXERCISE_BY_ID, EXERCISES, type ExerciseDef, type Pattern } from "@/lib/strength/coefficients";
import {
  PROGRAM_TEMPLATES,
  type ProgramTemplate,
  type TemplateSlot,
} from "@/lib/program-templates";
import { validateProgramPhases } from "@/lib/periodization";
import type { ProgramIntake } from "./ontology";
import { isOmitted, normalizeOmissions } from "./ontology";

export type AssembledProgram = {
  templateId: string;
  name: string;
  description: string;
  tags: string[];
  weeks: number;
  style: ProgramIntake["style"];
  phases: ProgramTemplate["phases"];
  days: Array<{
    name: string;
    slots: TemplateSlot[];
  }>;
};

function templateDayCount(template: ProgramTemplate): number {
  const tag = template.tags.find((value) => /^\d+-day$/.test(value));
  return tag ? Number(tag.split("-")[0]) : template.days.length;
}

function scoreTemplate(template: ProgramTemplate, intake: ProgramIntake): number {
  let score = 0;
  const days = templateDayCount(template);
  if (days === intake.days) score += 12;
  else score -= Math.abs(days - intake.days) * 4;

  if (template.tags.includes(intake.goal)) score += 6;
  if (intake.goal === "general" && template.tags.includes("hypertrophy")) score += 2;

  if (intake.emphasis) {
    if (template.tags.includes(intake.emphasis)) score += 4;
    if (intake.emphasis === "glutes" && template.tags.includes("glutes")) score += 4;
    if (intake.emphasis === "upper" && template.tags.includes("upper")) score += 2;
    if (intake.emphasis === "lower" && template.tags.includes("legs")) score += 2;
  }

  if (intake.equipment === "machines_only") {
    if (template.tags.includes("women") || template.id.includes("strong-foundations")) score += 5;
    if (template.tags.includes("kinobody")) score += 2;
  }
  if (intake.equipment === "home_dumbbells") {
    if (template.id === "essentials-3x" || template.id === "ppl-simple") score += 3;
    if (template.tags.includes("machine")) score -= 2;
  }

  if (intake.style === "fluid" && template.phases?.length) score -= 1;
  if (intake.style === "classic" && !template.phases?.length) score -= 1;

  return score;
}

export function pickTemplate(intake: ProgramIntake): ProgramTemplate {
  const ranked = PROGRAM_TEMPLATES
    .map((template) => ({ template, score: scoreTemplate(template, intake) }))
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.template ?? PROGRAM_TEMPLATES[0];
}

function candidatesForPattern(
  pattern: Pattern,
  catalog: Record<string, ExerciseDef>,
  recentExerciseIds: string[],
  omissions: ReadonlySet<string>,
): string[] {
  const recent = recentExerciseIds.filter((id) => {
    const def = catalog[id];
    return def
      && def.pattern === pattern
      && !isMachineTemplate(def)
      && !isOmitted(id, pattern, omissions);
  });
  if (recent.length) return recent;

  return EXERCISES
    .filter((def) => def.pattern === pattern && !isMachineTemplate(def) && !isOmitted(def.id, pattern, omissions))
    .map((def) => def.id);
}

function isMachineTemplate(def: ExerciseDef): boolean {
  return def.stationProfile === "machine";
}

function patchSlot(
  slot: TemplateSlot,
  recentExerciseIds: string[],
  omissions: ReadonlySet<string>,
  catalog: Record<string, ExerciseDef>,
): TemplateSlot {
  const current = catalog[slot.exerciseId];
  if (current && isMachineTemplate(current)) return slot;

  if (isOmitted(slot.exerciseId, slot.pattern, omissions)) {
    const replacement = candidatesForPattern(slot.pattern, catalog, recentExerciseIds, omissions)[0];
    if (replacement) {
      const def = catalog[replacement] ?? EXERCISE_BY_ID[replacement];
      return { ...slot, exerciseId: replacement, pattern: def.pattern };
    }
  }

  const preferred = candidatesForPattern(slot.pattern, catalog, recentExerciseIds, omissions)
    .find((id) => recentExerciseIds.includes(id));
  if (preferred) {
    const def = catalog[preferred] ?? EXERCISE_BY_ID[preferred];
    return { ...slot, exerciseId: preferred, pattern: def.pattern };
  }

  return slot;
}

export function assembleProgramDraft(input: {
  intake: ProgramIntake;
  recentExerciseIds: string[];
  catalog?: Record<string, ExerciseDef>;
}): AssembledProgram {
  const catalog = input.catalog ?? EXERCISE_BY_ID;
  const template = pickTemplate(input.intake);
  const omissions = new Set(normalizeOmissions(input.intake.omissions));

  const days = template.days.map((day) => ({
    name: day.name,
    slots: day.slots.map((slot) => patchSlot(slot, input.recentExerciseIds, omissions, catalog)),
  }));

  const assembled: AssembledProgram = {
    templateId: template.id,
    name: template.name,
    description: template.description,
    tags: [...template.tags],
    weeks: template.weeks,
    style: input.intake.style,
    phases: template.phases,
    days,
  };

  validateAssembledProgram(assembled);
  return assembled;
}

export function validateAssembledProgram(program: AssembledProgram): void {
  if (program.days.length === 0) throw new Error("Program needs at least one day");
  for (const day of program.days) {
    if (day.slots.length === 0) throw new Error(`Day ${day.name} needs at least one slot`);
    for (const slot of day.slots) {
      const def = EXERCISE_BY_ID[slot.exerciseId];
      if (!def) throw new Error(`Unknown exercise ${slot.exerciseId}`);
      if (slot.pattern !== def.pattern) {
        throw new Error(`Pattern mismatch for ${slot.exerciseId}`);
      }
    }
  }
  const phaseErrors = validateProgramPhases(
    (program.phases ?? []).map((phase, index) => ({ ...phase, id: `phase-${index}` })),
    program.weeks,
  );
  if (phaseErrors.length) throw new Error(phaseErrors[0]);
}
