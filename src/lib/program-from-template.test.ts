import { describe, expect, it } from "vitest";
import { assembleProgramDraft } from "./agent/program-intake/assembler";
import { buildProgramTreeFromDraft, buildProgramTreeFromTemplate } from "./program-from-template";
import { TEMPLATE_BY_ID } from "./program-templates";

describe("program tree deload phases", () => {
  const template = TEMPLATE_BY_ID["james-hit-specialization"];
  const options = { programId: "program-1", isActive: false };

  it("preserves explicit recovery flags for gallery and Coach programs", () => {
    const draft = assembleProgramDraft({
      intake: { days: 4, goal: "hypertrophy", style: "classic", equipment: "full_gym", emphasis: "back" },
      recentExerciseIds: [],
    });
    expect(draft.templateId).toBe(template.id);

    for (const tree of [
      buildProgramTreeFromTemplate(template, options),
      buildProgramTreeFromDraft(draft, options),
    ]) {
      expect(tree.phases.filter((phase) => phase.isDeload).map((phase) => phase.weekStart))
        .toEqual([6, 12]);
      expect(tree.phases.filter((phase) => !phase.isDeload)).toHaveLength(6);
    }
  });

  it("keeps fluid programs free of weekly phases", () => {
    const draft = assembleProgramDraft({
      intake: { days: 4, goal: "hypertrophy", style: "fluid", equipment: "full_gym" },
      recentExerciseIds: [],
    });
    expect(buildProgramTreeFromTemplate(template, { ...options, style: "fluid" }).phases).toEqual([]);
    expect(buildProgramTreeFromDraft(draft, options).phases).toEqual([]);
  });
});
