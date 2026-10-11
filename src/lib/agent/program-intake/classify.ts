import {
  CONFIDENCE_THRESHOLD,
  INTAKE_CHIP_OPTIONS,
  type ProgramDays,
  type ProgramEmphasis,
  type ProgramEquipment,
  type ProgramGoal,
  type ProgramIntake,
  type ProgramStyle,
  normalizeOmissions,
  partialProgramIntakeSchema,
} from "./ontology";

/** Jev Choice / Noul / Score field over the closed intake ontology. */
export type FieldScore<T> = {
  value: T | null;
  score: number;
};

export type IntakeClassification = {
  days: FieldScore<ProgramDays>;
  goal: FieldScore<ProgramGoal>;
  style: FieldScore<ProgramStyle>;
  equipment: FieldScore<ProgramEquipment>;
  emphasis: FieldScore<ProgramEmphasis>;
  omissions: { value: string[]; score: number };
  overallConfidence: number;
  ready: boolean;
  followUp?: string;
  chips?: string[];
  intake?: ProgramIntake;
};

const REQUIRED_FIELDS = ["days", "goal", "style"] as const;

function fieldScore<T>(value: T | null | undefined, explicit = true): FieldScore<T> {
  if (value == null) return { value: null, score: 0 };
  return { value, score: explicit ? 1 : 0.75 };
}

function overallConfidence(fields: Array<FieldScore<unknown>>): number {
  const required = fields.slice(0, REQUIRED_FIELDS.length);
  if (required.some((field) => field.value == null)) {
    const present = required.filter((field) => field.value != null).length;
    return present / REQUIRED_FIELDS.length * 0.5;
  }
  const scores = fields.map((field) => field.score);
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function followUpFor(classification: Omit<IntakeClassification, "followUp" | "chips" | "ready" | "intake">) {
  if (classification.days.value == null) {
    return {
      followUp: "How many days per week can you train? Pick 3, 4, 5, or 6.",
      chips: [...INTAKE_CHIP_OPTIONS.days],
    };
  }
  if (classification.goal.value == null) {
    return {
      followUp: "What is the main goal — strength, hypertrophy, or general fitness?",
      chips: [...INTAKE_CHIP_OPTIONS.goal],
    };
  }
  if (classification.style.value == null) {
    return {
      followUp: "Do you want classic weekly phases or fluid adaptation between sessions?",
      chips: [...INTAKE_CHIP_OPTIONS.style],
    };
  }
  if (classification.overallConfidence < CONFIDENCE_THRESHOLD) {
    return {
      followUp: "I need one more detail before I draft a split. What equipment do you have access to?",
      chips: [...INTAKE_CHIP_OPTIONS.equipment],
    };
  }
  return null;
}

export function classifyProgramIntake(input: unknown): IntakeClassification {
  const parsed = partialProgramIntakeSchema.safeParse(input);
  const partial = parsed.success ? parsed.data : {};
  const omissions = normalizeOmissions(partial.omissions);

  const classification: Omit<IntakeClassification, "followUp" | "chips" | "ready" | "intake"> = {
    days: fieldScore<ProgramDays>(partial.days as ProgramDays | undefined),
    goal: fieldScore(partial.goal),
    style: fieldScore(partial.style),
    equipment: fieldScore(partial.equipment),
    emphasis: fieldScore(partial.emphasis),
    omissions: { value: omissions, score: omissions.length ? 1 : 0.85 },
    overallConfidence: 0,
  };
  classification.overallConfidence = overallConfidence([
    classification.days,
    classification.goal,
    classification.style,
    classification.equipment,
    classification.emphasis,
    { value: classification.omissions.value, score: classification.omissions.score },
  ]);

  const missing = followUpFor(classification);
  const ready = REQUIRED_FIELDS.every((key) => classification[key].value != null)
    && classification.overallConfidence >= CONFIDENCE_THRESHOLD;

  const intake = ready
    ? {
      days: classification.days.value!,
      goal: classification.goal.value!,
      style: classification.style.value!,
      equipment: classification.equipment.value ?? undefined,
      emphasis: classification.emphasis.value ?? undefined,
      omissions: classification.omissions.value.length ? classification.omissions.value : undefined,
    }
    : undefined;

  return {
    ...classification,
    ready,
    followUp: ready ? undefined : missing?.followUp,
    chips: ready ? undefined : missing?.chips,
    intake,
  };
}

export function mergeIntakeHints(
  base: Partial<ProgramIntake>,
  hints: Partial<ProgramIntake>,
): Partial<ProgramIntake> {
  return {
    ...base,
    ...hints,
    omissions: normalizeOmissions([
      ...(base.omissions ?? []),
      ...(hints.omissions ?? []),
    ]),
  };
}
