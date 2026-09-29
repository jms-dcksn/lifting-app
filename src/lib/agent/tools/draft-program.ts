import type { SupabaseClient } from "@supabase/supabase-js";
import { programEditHref } from "@/lib/program-routes";
import {
  buildProgramTreeFromDraft,
  persistProgramTree,
  shouldActivateFirstProgram,
} from "@/lib/program-from-template";
import type { Database } from "@/lib/supabase/types";
import { recentExerciseIds } from "@/lib/program";
import { assembleProgramDraft } from "../program-intake/assembler";
import { classifyProgramIntake } from "../program-intake/classify";

type Client = SupabaseClient<Database>;

export async function draftProgramFromIntake(
  supabase: Client,
  userId: string,
  input: unknown,
) {
  const classification = classifyProgramIntake(input);
  if (!classification.ready || !classification.intake) {
    return {
      source: "draftProgramFromIntake" as const,
      status: "needs_intake" as const,
      classification,
      followUp: classification.followUp,
      chips: classification.chips,
    };
  }

  const recentIds = await recentExerciseIds(supabase, userId);
  const draft = assembleProgramDraft({
    intake: classification.intake,
    recentExerciseIds: recentIds,
  });
  const programId = crypto.randomUUID();
  const activate = await shouldActivateFirstProgram(supabase);
  const tree = buildProgramTreeFromDraft(draft, { programId, isActive: activate });
  await persistProgramTree(supabase, tree);

  const href = programEditHref(programId);
  return {
    source: "draftProgramFromIntake" as const,
    status: "draft" as const,
    programId,
    templateId: draft.templateId,
    name: draft.name,
    style: draft.style,
    isActive: activate,
    dayCount: draft.days.length,
    action: "navigate" as const,
    href,
    classification,
  };
}
