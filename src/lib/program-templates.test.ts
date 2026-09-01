import { describe, expect, it } from "vitest";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { PROGRAM_TEMPLATES, TEMPLATE_BY_ID } from "./program-templates";
import { resolvePrescription, validateProgramPhases } from "./periodization";

describe("program templates", () => {
  it("have unique ids", () => {
    const ids = PROGRAM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(TEMPLATE_BY_ID).length).toBe(ids.length);
  });

  it("stay within the builder's 4-12 week block range", () => {
    for (const t of PROGRAM_TEMPLATES) {
      expect(t.weeks, t.id).toBeGreaterThanOrEqual(4);
      expect(t.weeks, t.id).toBeLessThanOrEqual(12);
    }
  });

  it("have at least one day, and every day at least one slot", () => {
    for (const t of PROGRAM_TEMPLATES) {
      expect(t.days.length, t.id).toBeGreaterThan(0);
      for (const d of t.days) expect(d.slots.length, `${t.id} / ${d.name}`).toBeGreaterThan(0);
    }
  });

  it("every slot references a seeded exercise with a matching pattern", () => {
    for (const t of PROGRAM_TEMPLATES) {
      for (const d of t.days) {
        for (const slot of d.slots) {
          const label = `${t.id} / ${d.name} / ${slot.exerciseId}`;
          const def = EXERCISE_BY_ID[slot.exerciseId];
          expect(def, label).toBeDefined();
          expect(slot.pattern, label).toBe(def.pattern);
        }
      }
    }
  });

  it("every slot has a sane prescription", () => {
    for (const t of PROGRAM_TEMPLATES) {
      for (const d of t.days) {
        for (const slot of d.slots) {
          const label = `${t.id} / ${d.name} / ${slot.exerciseId}`;
          expect(slot.targetSets, label).toBeGreaterThanOrEqual(1);
          expect(slot.repMin, label).toBeGreaterThanOrEqual(1);
          expect(slot.repMax, label).toBeGreaterThanOrEqual(slot.repMin);
          expect(slot.targetRir, label).toBeGreaterThanOrEqual(0);
          expect(slot.targetRir, label).toBeLessThanOrEqual(4);
          if (slot.restSeconds !== null) expect(slot.restSeconds, label).toBeGreaterThan(0);
        }
      }
    }
  });

  it("has valid non-overlapping phase rules", () => {
    for (const template of PROGRAM_TEMPLATES) {
      expect(validateProgramPhases(
        (template.phases ?? []).map((phase, index) => ({ ...phase, id: `${template.id}-${index}` })),
        template.weeks,
      ), template.id).toEqual([]);
    }
  });

  it("encodes the James HIT block boundaries", () => {
    const template = TEMPLATE_BY_ID["james-hit-specialization"];
    const phases = template.phases!.map((phase, index) => ({ ...phase, id: `phase-${index}` }));
    const base = { targetSets: 3, repMin: 8, repMax: 12, targetRir: 1 };

    expect(resolvePrescription(base, 1, phases)).toMatchObject({ targetRirMin: 2, targetRirMax: 2 });
    expect(resolvePrescription(base, 2, phases)).toMatchObject({ targetRirMin: 1, targetRirMax: 1 });
    expect(resolvePrescription(base, 4, phases)).toMatchObject({ targetRirMin: 0, targetRirMax: 1 });
    expect(resolvePrescription(base, 6, phases)).toMatchObject({ targetSets: 2, targetRirMin: 3, targetRirMax: 4 });
    expect(resolvePrescription(base, 7, phases)).toMatchObject({ targetRirMin: 2, targetRirMax: 2 });
    expect(resolvePrescription(base, 12, phases)).toMatchObject({ targetSets: 2, targetRirMin: 3, targetRirMax: 4 });
  });
});
