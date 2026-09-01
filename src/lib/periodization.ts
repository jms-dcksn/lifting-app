export interface Prescription {
  targetSets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
}

export interface ProgramPhase {
  id: string;
  position: number;
  name: string;
  description: string | null;
  weekStart: number;
  weekEnd: number;
  targetRirMin: number | null;
  targetRirMax: number | null;
  setMultiplier: number | null;
}

export interface EffectivePrescription extends Prescription {
  targetRirMin: number;
  targetRirMax: number;
  phase: ProgramPhase | null;
}

// Odd deload set counts round up so a three-set slot becomes two rather than one. Every
// prescribed movement retains at least one working set.
export function effectiveSetCount(targetSets: number, multiplier: number) {
  return Math.max(1, Math.ceil(targetSets * multiplier));
}

// Phase ordering is a deterministic fallback for malformed overlapping data. Authoring
// validates overlaps before persistence; the resolver itself stays safe for historical rows.
export function phaseForWeek(phases: ProgramPhase[], week: number) {
  return [...phases]
    .sort((a, b) => a.position - b.position)
    .find((phase) => week >= phase.weekStart && week <= phase.weekEnd) ?? null;
}

export function resolvePrescription(
  base: Prescription,
  week: number,
  phases: ProgramPhase[],
): EffectivePrescription {
  const phase = phaseForWeek(phases, week);
  const targetRirMin = phase?.targetRirMin ?? base.targetRir;
  const targetRirMax = phase?.targetRirMax ?? base.targetRir;

  return {
    ...base,
    targetSets:
      phase?.setMultiplier == null
        ? base.targetSets
        : effectiveSetCount(base.targetSets, phase.setMultiplier),
    // Existing recommendation and set-entry APIs accept one RIR value. Use the upper edge
    // of a range so a 0–1 RIR prescription defaults conservatively to 1 while displaying
    // the full acceptable range.
    targetRir: targetRirMax,
    targetRirMin,
    targetRirMax,
    phase,
  };
}

export function validateProgramPhases(phases: ProgramPhase[], programWeeks: number) {
  const errors: string[] = [];
  const ordered = [...phases].sort((a, b) => a.weekStart - b.weekStart || a.position - b.position);

  for (const phase of ordered) {
    if (phase.weekStart < 1 || phase.weekEnd < phase.weekStart || phase.weekEnd > programWeeks) {
      errors.push(`${phase.name}: week range must sit within weeks 1–${programWeeks}.`);
    }
    if ((phase.targetRirMin == null) !== (phase.targetRirMax == null)) {
      errors.push(`${phase.name}: both RIR bounds are required.`);
    }
    if (
      phase.targetRirMin != null
      && phase.targetRirMax != null
      && (phase.targetRirMin < 0 || phase.targetRirMax > 10 || phase.targetRirMin > phase.targetRirMax)
    ) {
      errors.push(`${phase.name}: RIR range is invalid.`);
    }
    if (phase.targetRirMin == null && phase.setMultiplier == null) {
      errors.push(`${phase.name}: at least one prescription override is required.`);
    }
  }

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].weekStart <= ordered[index - 1].weekEnd) {
      errors.push(`${ordered[index].name}: week range overlaps ${ordered[index - 1].name}.`);
    }
  }

  return errors;
}

export function rirLabel(prescription: Pick<EffectivePrescription, "targetRirMin" | "targetRirMax">) {
  return prescription.targetRirMin === prescription.targetRirMax
    ? `${prescription.targetRirMax}`
    : `${prescription.targetRirMin}–${prescription.targetRirMax}`;
}
