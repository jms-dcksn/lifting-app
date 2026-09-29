import { classifyProgramIntake } from "../program-intake/classify";
import { assembleProgramDraft, validateAssembledProgram } from "../program-intake/assembler";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";

export function gradeIntakeClassification(input: {
  fields: Record<string, unknown>;
  expectReady: boolean;
}) {
  const result = classifyProgramIntake(input.fields);
  const reasons: string[] = [];
  if (result.ready !== input.expectReady) {
    reasons.push(`ready ${result.ready} expected ${input.expectReady}`);
  }
  if (!input.expectReady && !result.followUp) {
    reasons.push("missing follow-up");
  }
  if (input.expectReady && !result.intake) {
    reasons.push("missing intake");
  }
  return { pass: reasons.length === 0, reasons, result };
}

export function gradeTemplateInvariants(input: {
  intake: Record<string, unknown>;
  recentExerciseIds?: string[];
}) {
  const classified = classifyProgramIntake(input.intake);
  if (!classified.intake) {
    return { pass: false, reasons: ["intake not ready"] };
  }
  const draft = assembleProgramDraft({
    intake: classified.intake,
    recentExerciseIds: input.recentExerciseIds ?? [],
    catalog: EXERCISE_BY_ID,
  });
  const reasons: string[] = [];
  try {
    validateAssembledProgram(draft);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "invalid assembled program");
  }
  for (const day of draft.days) {
    for (const slot of day.slots) {
      const def = EXERCISE_BY_ID[slot.exerciseId];
      if (!def) reasons.push(`unknown exercise ${slot.exerciseId}`);
      else if (slot.pattern !== def.pattern) reasons.push(`pattern mismatch ${slot.exerciseId}`);
    }
  }
  return { pass: reasons.length === 0, reasons, draft };
}
