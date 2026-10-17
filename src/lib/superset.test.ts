import { describe, expect, it } from "vitest";
import { isSupersetEnd, supersetLabel, validateSupersets } from "./superset";
import { buildProgramTreeFromTemplate } from "./program-from-template";
import { TEMPLATE_BY_ID } from "./program-templates";

describe("superset representation", () => {
  const slots = [{}, { supersetGroup: "C" }, { supersetGroup: "C" }, {}];

  it("labels members in day order and rests only after the final member", () => {
    expect(slots.map((_, index) => supersetLabel(slots, index))).toEqual([null, "C1", "C2", null]);
    expect(slots.map((_, index) => isSupersetEnd(slots, index))).toEqual([true, false, true, true]);
    expect(validateSupersets(slots)).toBeNull();
    expect(validateSupersets([{}, {}])).toBeNull();
  });

  it("rejects orphaned, separated, or invalid groups before saving", () => {
    expect(validateSupersets([slots[1]])).toMatch(/at least two/);
    expect(validateSupersets([slots[1], {}, slots[2]])).toMatch(/together/);
    expect(validateSupersets([{ supersetGroup: "bad name" }])).toMatch(/start with a letter/);
  });

  it("carries the Ogus C1/C2 pair into a new Classic program without linking other slots", () => {
    const tree = buildProgramTreeFromTemplate(TEMPLATE_BY_ID["ogus-october-26"], {
      programId: "new-program", isActive: false,
    });
    expect(tree.style).toBe("classic");
    expect(tree.days[0].slots.every((slot) => slot.supersetGroup === null)).toBe(true);
    const lower = tree.days[1].slots;
    expect(lower.filter((slot) => slot.supersetGroup === "C").map((slot) => slot.exerciseId))
      .toEqual(["straight-leg-machine-adductor", "good-boy-external-rotation"]);
    expect(lower.map((_, index) => supersetLabel(lower, index)))
      .toEqual([null, null, "C1", "C2", null, null, null]);
  });
});
