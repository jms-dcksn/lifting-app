import type {
  BuildCoachReportInput,
  CoachCheckInReport,
  CoachSessionInput,
  CoachSetInput,
  CoachSlotInput,
} from "./coach-check-in";
import { dateKey } from "./bodyweight";
import { resolvePrescription } from "./periodization";
import { detectPlateau, defaultPatience } from "./strength/plateau";
import { sessionTarget } from "./strength/progression";

export type CoachRecommendationKind =
  | "add_load"
  | "add_rep"
  | "reduce_load"
  | "keep_movement"
  | "plateau_review"
  | "deload_hold"
  | "pain_review"
  | "insufficient_data";

export type RecommendationConfidence = "insufficient" | "low" | "medium" | "high";

export interface CoachRecommendation {
  key: string;
  kind: CoachRecommendationKind;
  exerciseId: string | null;
  exerciseName: string | null;
  action: {
    label: string;
    targetWeight: number | null;
    targetReps: number | null;
  };
  rationale: string;
  evidence: {
    windowStart: string;
    windowEnd: string;
    exposureCount: number;
    summary: string[];
  };
  confidence: RecommendationConfidence;
  dataSufficiency: string;
}

export interface BuildCoachRecommendationsInput
  extends Pick<
    BuildCoachReportInput,
    "sessions" | "sets" | "slots" | "phases" | "definitions" | "currentBodyweight"
  > {
  report: CoachCheckInReport;
  activeProgramId: string | null;
}

interface Exposure {
  session: CoachSessionInput;
  firstSet: CoachSetInput;
  bestE1rm: number | null;
  averageRir: number | null;
  targetRirMin: number;
  targetRirMax: number;
}

// Deterministic proposals only. This engine reads the canonical report plus the same raw rows
// used to build it, delegates normal overload to sessionTarget(), and never mutates a program.
export function buildCoachRecommendations(
  input: BuildCoachRecommendationsInput,
): CoachRecommendation[] {
  const currentSessions = finishedSessions(input).filter(
    (session) => dateInWindow(
      session.performedAt,
      input.report.windows.current,
      input.report.timeZone,
    ),
  );
  const painful = currentSessions.filter((session) => session.jointPain === "significant");
  if (painful.length > 0) {
    const latest = painful.at(-1) as CoachSessionInput;
    return [recommendation({
      kind: "pain_review",
      slotId: "session",
      exerciseId: null,
      exerciseName: null,
      evidenceEnd: latest.performedAt,
      action: "Pause progression and review joint pain",
      rationale: "Significant joint pain was logged. Progression advice is paused until the movement and recovery context are reviewed; this is not a diagnosis.",
      exposureCount: painful.length,
      summary: painful.map((session) =>
        `${session.programDayName ?? "Workout"}: significant pain${session.note ? ` · ${session.note}` : ""}`,
      ),
      confidence: "high",
      dataSufficiency: "A significant pain flag is sufficient for a conservative stop signal; this is not a diagnosis.",
      windowStart: input.report.windows.current.startDate,
      windowEnd: input.report.windows.current.endDate,
    })];
  }

  const activeSlots = input.activeProgramId
    ? input.slots.filter((slot) => slot.programId === input.activeProgramId)
    : [];

  return activeSlots.map((slot) => recommendationForSlot(input, slot));
}

function recommendationForSlot(
  input: BuildCoachRecommendationsInput,
  slot: CoachSlotInput,
): CoachRecommendation {
  const exposures = slotExposures(input, slot);
  const latest = exposures.at(-1);
  const definition = latest
    ? input.definitions[latest.firstSet.exerciseId]
    : input.definitions[slot.exerciseId];
  const exerciseId = latest?.firstSet.exerciseId ?? slot.exerciseId;
  const exerciseName = definition?.name ?? exerciseId;
  const evidenceEnd = latest?.session.performedAt ?? input.report.generatedAt;
  const evidence = evidenceFields(input, exposures);

  if (!latest || !definition) {
    return recommendation({
      kind: "insufficient_data",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      evidenceEnd,
      action: `Log ${exerciseName}`,
      rationale: "There is no finished, slot-linked exposure to support a progression recommendation.",
      confidence: "insufficient",
      dataSufficiency: "One finished exposure with a linked working set is required.",
      ...evidence,
    });
  }

  const phases = input.phases.filter((phase) => phase.programId === slot.programId);
  const latestPrescription = resolvePrescription(
    slot,
    latest.session.weekIndex ?? 1,
    phases,
  );
  if (isDeload(latestPrescription.phase)) {
    return recommendation({
      kind: "deload_hold",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      evidenceEnd,
      action: "Follow the deload prescription",
      rationale: "This is a deload exposure, so normal overload recommendations are suppressed.",
      confidence: "high",
      dataSufficiency: "The stored session week resolves to an explicit deload phase.",
      ...evidence,
    });
  }

  const repeatedHardMisses = exposures.slice(-2).length === 2
    && exposures.slice(-2).every(
      (exposure) =>
        exposure.averageRir != null && exposure.averageRir < exposure.targetRirMin,
  );
  if (repeatedHardMisses) {
    // Negative bodyweight loads mean assistance; subtracting an increment correctly adds
    // assistance. External loads remain bounded at zero.
    const targetWeight = definition.equipment === "bodyweight"
      ? latest.firstSet.weight - definition.increment
      : Math.max(0, latest.firstSet.weight - definition.increment);
    return recommendation({
      kind: "reduce_load",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      evidenceEnd,
      action: `Reduce to ${targetWeight} lb and recalibrate effort`,
      targetWeight,
      targetReps: latest.firstSet.reps,
      rationale: "Actual effort was harder than the effective RIR prescription in two consecutive comparable exposures.",
      confidence: exposures.length >= 3 ? "high" : "medium",
      dataSufficiency: "Two consecutive finished exposures with complete RIR are required for an effort-based load reduction.",
      ...evidence,
    });
  }

  const plateauExposures = exposures.flatMap((exposure) =>
    exposure.bestE1rm == null
      ? []
      : [{ sessionAt: exposure.session.performedAt, bestE1rm: exposure.bestE1rm }],
  );
  const plateau = detectPlateau(plateauExposures, defaultPatience(definition));
  if (plateau.plateaued) {
    return recommendation({
      kind: "plateau_review",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      evidenceEnd,
      action: "Review the rep range before considering a substitution",
      rationale: `The existing plateau rule found ${plateau.stalledExposures} stalled exposures across ${plateau.stalledSinceDays} days.`,
      confidence: "high",
      dataSufficiency: `Meets the ${defaultPatience(definition)}-exposure patience rule and 14-day minimum; a swap remains a proposal requiring confirmation.`,
      ...evidence,
    });
  }

  const previous = exposures.at(-2);
  if (
    previous?.bestE1rm != null
    && latest.bestE1rm != null
    && latest.bestE1rm < previous.bestE1rm * 0.99
  ) {
    return recommendation({
      kind: "keep_movement",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      evidenceEnd,
      action: "Keep the movement and repeat the progression target",
      rationale: "The latest exposure was down, but one poor performance does not meet the existing plateau criteria.",
      confidence: "medium",
      dataSufficiency: "Two comparable exposures support caution, not a stall, deload, or substitution call.",
      ...evidence,
    });
  }

  const target = sessionTarget(
    definition,
    latestPrescription,
    { weight: latest.firstSet.weight, reps: latest.firstSet.reps },
    input.definitions,
    [],
    input.currentBodyweight ?? null,
  );
  const confidence = exposureConfidence(exposures.length);
  if (target && target.weight > latest.firstSet.weight) {
    return recommendation({
      kind: "add_load",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      evidenceEnd,
      action: `Add load: ${target.weight} lb × ${target.targetReps}`,
      targetWeight: target.weight,
      targetReps: target.targetReps,
      rationale: `The first working set reached the ${latestPrescription.repMax}-rep ceiling, so the existing double-progression rule adds one increment.`,
      confidence,
      dataSufficiency: `${exposures.length} comparable exposure${exposures.length === 1 ? "" : "s"}; the action exactly matches sessionTarget().`,
      ...evidence,
    });
  }

  return recommendation({
    kind: "add_rep",
    slotId: slot.id,
    exerciseId,
    exerciseName,
    evidenceEnd,
    action: `Hold ${target?.weight ?? latest.firstSet.weight} lb and target ${target?.targetReps ?? latest.firstSet.reps} reps`,
    targetWeight: target?.weight ?? latest.firstSet.weight,
    targetReps: target?.targetReps ?? latest.firstSet.reps,
    rationale: "The rep ceiling has not been earned, so the existing double-progression rule holds load and advances reps.",
    confidence,
    dataSufficiency: `${exposures.length} comparable exposure${exposures.length === 1 ? "" : "s"}; the action exactly matches sessionTarget().`,
    ...evidence,
  });
}

function slotExposures(input: BuildCoachRecommendationsInput, slot: CoachSlotInput): Exposure[] {
  const sessions = finishedSessions(input).filter(
    (session) =>
      session.programId === slot.programId && session.programDayId === slot.programDayId,
  );
  const bySession = new Map(input.sets.map((set) => [set.sessionId, [] as CoachSetInput[]]));
  for (const set of input.sets) {
    if (set.isWarmup || set.programSlotId !== slot.id) continue;
    const list = bySession.get(set.sessionId) ?? [];
    list.push(set);
    bySession.set(set.sessionId, list);
  }

  const raw = sessions.flatMap((session) => {
    const sets = (bySession.get(session.id) ?? [])
      .sort((a, b) => a.setIndex - b.setIndex || a.createdAt.localeCompare(b.createdAt));
    if (sets.length === 0) return [];
    const exerciseId = sets.at(-1)?.exerciseId ?? slot.exerciseId;
    const comparable = sets.filter((set) => set.exerciseId === exerciseId);
    const phases = input.phases.filter((phase) => phase.programId === slot.programId);
    const prescription = resolvePrescription(slot, session.weekIndex ?? 1, phases);
    const rir = comparable.flatMap((set) => set.rir == null ? [] : [set.rir]);
    const e1rms = comparable.flatMap((set) => set.e1rm == null ? [] : [set.e1rm]);
    return [{
      session,
      firstSet: comparable[0],
      bestE1rm: e1rms.length === 0 ? null : Math.max(...e1rms),
      averageRir: rir.length === 0 ? null : rir.reduce((sum, value) => sum + value, 0) / rir.length,
      targetRirMin: prescription.targetRirMin,
      targetRirMax: prescription.targetRirMax,
    }];
  });
  const currentExercise = raw.at(-1)?.firstSet.exerciseId;
  return raw.filter((exposure) => exposure.firstSet.exerciseId === currentExercise);
}

function finishedSessions(input: Pick<BuildCoachRecommendationsInput, "sessions" | "report">) {
  const generated = new Date(input.report.generatedAt).getTime();
  return input.sessions
    .filter(
      (session) =>
        session.finishedAt != null
        && new Date(session.performedAt).getTime() <= generated,
    )
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
}

function evidenceFields(input: BuildCoachRecommendationsInput, exposures: Exposure[]) {
  return {
    windowStart: exposures[0]?.session.performedAt ?? input.report.windows.current.startDate,
    windowEnd: exposures.at(-1)?.session.performedAt ?? input.report.windows.current.endDate,
    exposureCount: exposures.length,
    summary: exposures.slice(-4).map((exposure) => {
      const set = exposure.firstSet;
      return `${set.weight} lb × ${set.reps} · RIR ${exposure.averageRir == null ? "?" : trim(exposure.averageRir)} · e1RM ${exposure.bestE1rm == null ? "?" : trim(exposure.bestE1rm)}`;
    }),
  };
}

function recommendation(input: {
  kind: CoachRecommendationKind;
  slotId: string;
  exerciseId: string | null;
  exerciseName: string | null;
  evidenceEnd: string;
  action: string;
  targetWeight?: number | null;
  targetReps?: number | null;
  rationale: string;
  windowStart: string;
  windowEnd: string;
  exposureCount: number;
  summary: string[];
  confidence: RecommendationConfidence;
  dataSufficiency: string;
}): CoachRecommendation {
  return {
    key: stableKey([
      input.kind,
      input.slotId,
      input.exerciseId ?? "all",
      input.evidenceEnd,
      input.action,
      input.targetWeight ?? "",
      input.targetReps ?? "",
      ...input.summary,
    ].join("|")),
    kind: input.kind,
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    action: {
      label: input.action,
      targetWeight: input.targetWeight ?? null,
      targetReps: input.targetReps ?? null,
    },
    rationale: input.rationale,
    evidence: {
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      exposureCount: input.exposureCount,
      summary: input.summary,
    },
    confidence: input.confidence,
    dataSufficiency: input.dataSufficiency,
  };
}

function isDeload(phase: { name: string; description: string | null; setMultiplier: number | null } | null) {
  if (!phase) return false;
  return (
    (phase.setMultiplier != null && phase.setMultiplier < 1)
    || `${phase.name} ${phase.description ?? ""}`.toLowerCase().includes("deload")
  );
}

function exposureConfidence(count: number): RecommendationConfidence {
  if (count >= 3) return "high";
  if (count === 2) return "medium";
  return "low";
}

function dateInWindow(
  timestamp: string,
  window: { startDate: string; endDate: string },
  timeZone: string,
) {
  const date = dateKey(new Date(timestamp), timeZone);
  return date >= window.startDate && date <= window.endDate;
}

function stableKey(value: string) {
  let first = 2166136261;
  let second = 2246822507;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `rec_${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function trim(value: number) {
  return (Math.round(value * 10) / 10).toString();
}

export function formatCoachRecommendations(recommendations: CoachRecommendation[]) {
  const lines = ["COACH RECOMMENDATIONS"];
  if (recommendations.length === 0) return [...lines, "No current recommendations."].join("\n");
  for (const item of recommendations) {
    lines.push(
      `${item.exerciseName ?? "Overall review"}: ${item.action.label}`,
      `Why: ${item.rationale}`,
      `Evidence: ${item.evidence.exposureCount} exposure${item.evidence.exposureCount === 1 ? "" : "s"}, ${item.evidence.windowStart}–${item.evidence.windowEnd} · confidence ${item.confidence}`,
    );
  }
  return lines.join("\n");
}
