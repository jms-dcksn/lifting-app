import type {
  BuildCoachReportInput,
  CoachCheckInReport,
  CoachSessionInput,
  CoachSetInput,
  CoachSlotInput,
} from "./coach-check-in";
import { dateKey } from "./bodyweight";
import { resolvePrescription } from "./periodization";
import { isDeload, type StallAssessment } from "./stall-report";
import {
  selectProgressionReference,
  sessionTarget,
  type ProgressionPerformance,
} from "./strength/progression";

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
  programDayName: string | null;
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
  stalls?: StallAssessment[];
}

interface Exposure {
  session: CoachSessionInput;
  firstSet: CoachSetInput;
  bestE1rm: number | null;
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
      programDayName: latest.programDayName,
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
  const programDayName = latest?.session.programDayName ?? null;
  const evidenceEnd = latest?.session.performedAt ?? input.report.generatedAt;
  const evidence = evidenceFields(input, exposures);

  if (!latest || !definition) {
    return recommendation({
      kind: "insufficient_data",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      programDayName,
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
      programDayName,
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
        exposure.firstSet.rir != null && exposure.firstSet.rir < exposure.targetRirMin,
  );
  if (repeatedHardMisses) {
    // Negative bodyweight loads mean assistance; subtracting an increment correctly adds
    // assistance. External loads remain bounded at zero.
    const targetWeight = definition.equipment === "bodyweight"
      ? latest.firstSet.weight - definition.increment
      : Math.max(0, latest.firstSet.weight - definition.increment);
    const targetReps = Math.max(
      latestPrescription.repMin,
      Math.min(latestPrescription.repMax, latest.firstSet.reps),
    );
    return recommendation({
      kind: "reduce_load",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      programDayName,
      evidenceEnd,
      action: `Reduce to ${targetWeight} lb × ${targetReps} and recalibrate effort`,
      targetWeight,
      targetReps,
      rationale: "The first working set was harder than the effective RIR prescription in two consecutive comparable exposures.",
      confidence: exposures.length >= 3 ? "high" : "medium",
      dataSufficiency: "Two consecutive finished exposures with first-set RIR are required for an effort-based load reduction; harder back-off sets do not trigger it.",
      ...evidence,
    });
  }

  const plateau = input.stalls?.find(s => s.slotId === slot.id && s.exerciseId === exerciseId);
  if (plateau?.state === "plateau" && plateau.points.at(-1)?.sessionId === latest.session.id) {
    return recommendation({
      kind: "plateau_review",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      programDayName,
      evidenceEnd,
      action: "Review the rep range before considering a substitution",
      rationale: `The existing plateau rule found ${plateau.stalledExposures} stalled exposures across ${plateau.stalledSinceDays} days.`,
      confidence: "high",
      dataSufficiency: `Meets the ${plateau.patience}-exposure patience rule and 14-day minimum; a swap remains a proposal requiring confirmation.`,
      ...evidence,
      windowStart: plateau.points[0].sessionAt,
      windowEnd: plateau.points.at(-1)!.sessionAt,
      exposureCount: plateau.points.length,
      summary: plateau.points.slice(-4).map(p => `${p.sessionAt.slice(0, 10)} · best e1RM ${trim(p.bestE1rm)}${p.repGain ? " · rep gain" : ""}`),
    });
  }

  const progressionReference = exerciseProgressionReference(input, slot, exerciseId);
  const referenceSet = progressionReference.selected ?? {
    programSlotId: slot.id,
    performedAt: latest.session.performedAt,
    weight: latest.firstSet.weight,
    reps: latest.firstSet.reps,
    rir: latest.firstSet.rir,
    e1rm: latest.firstSet.e1rm,
  };
  const target = sessionTarget(
    definition,
    latestPrescription,
    { weight: referenceSet.weight, reps: referenceSet.reps, rir: referenceSet.rir },
    input.definitions,
    [],
    input.currentBodyweight ?? null,
  );
  const usedCrossSlotBest = referenceSet.programSlotId !== slot.id;
  const progressionEvidence = usedCrossSlotBest
    ? {
        ...evidence,
        summary: [
          ...evidence.summary,
          `Best recent on another day: ${referenceSet.weight} lb × ${referenceSet.reps} · first-set RIR ${referenceSet.rir ?? "?"} · e1RM ${referenceSet.e1rm == null ? "?" : trim(referenceSet.e1rm)}`,
        ],
      }
    : evidence;

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
      programDayName,
      evidenceEnd,
      action: target
        ? `Keep the movement: ${target.weight} lb × ${target.targetReps}`
        : "Keep the movement and repeat the progression target",
      targetWeight: target?.weight,
      targetReps: target?.targetReps,
      rationale: "The latest exposure was down, but one poor performance does not meet the existing plateau criteria.",
      confidence: "medium",
      dataSufficiency: "Two comparable exposures support caution, not a stall, deload, or substitution call.",
      ...progressionEvidence,
    });
  }

  const confidence = exposureConfidence(exposures.length);
  if (referenceSet.reps < latestPrescription.repMin) {
    const targetWeight = target?.weight ?? referenceSet.weight;
    const targetReps = latestPrescription.repMin;
    if (targetWeight < referenceSet.weight) {
      return recommendation({
        kind: "reduce_load",
        slotId: slot.id,
        exerciseId,
        exerciseName,
        programDayName,
        evidenceEnd,
        action: `Reduce to ${targetWeight} lb and target ${targetReps} reps`,
        targetWeight,
        targetReps,
        rationale: `The first working set fell below the ${latestPrescription.repMin}–${latestPrescription.repMax} rep range, so the load is recalibrated to the rep floor at the prescribed effort.`,
        confidence,
        dataSufficiency: `${exposures.length} comparable exposure${exposures.length === 1 ? "" : "s"}; the action exactly matches sessionTarget() and remains inside the prescribed rep range.`,
        ...progressionEvidence,
      });
    }
    return recommendation({
      kind: "add_rep",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      programDayName,
      evidenceEnd,
      action: `Hold ${targetWeight} lb and target ${targetReps} reps`,
      targetWeight,
      targetReps,
      rationale: `The first working set fell below the ${latestPrescription.repMin}–${latestPrescription.repMax} rep range, but the recorded RIR supports holding load and returning to the rep floor.`,
      confidence,
      dataSufficiency: `${exposures.length} comparable exposure${exposures.length === 1 ? "" : "s"}; the action exactly matches sessionTarget() and remains inside the prescribed rep range.`,
      ...progressionEvidence,
    });
  }
  if (target && target.weight > referenceSet.weight) {
    return recommendation({
      kind: "add_load",
      slotId: slot.id,
      exerciseId,
      exerciseName,
      programDayName,
      evidenceEnd,
      action: `Add load: ${target.weight} lb × ${target.targetReps}`,
      targetWeight: target.weight,
      targetReps: target.targetReps,
      rationale: `The first working set reached the ${latestPrescription.repMax}-rep ceiling, so the existing double-progression rule adds one increment.`,
      confidence,
      dataSufficiency: `${exposures.length} comparable exposure${exposures.length === 1 ? "" : "s"}; the action exactly matches sessionTarget().`,
      ...progressionEvidence,
    });
  }

  return recommendation({
    kind: "add_rep",
    slotId: slot.id,
    exerciseId,
    exerciseName,
    programDayName,
    evidenceEnd,
    action: `Hold ${target?.weight ?? referenceSet.weight} lb and target ${target?.targetReps ?? referenceSet.reps} reps`,
    targetWeight: target?.weight ?? referenceSet.weight,
    targetReps: target?.targetReps ?? referenceSet.reps,
    rationale: usedCrossSlotBest
      ? "A stronger exposure on another program day occurred after this slot was last trained, so the target advances from that best recent performance."
      : "The rep ceiling has not been earned, so the existing double-progression rule holds load and advances reps.",
    confidence,
    dataSufficiency: `${exposures.length} comparable exposure${exposures.length === 1 ? "" : "s"}; the action exactly matches sessionTarget().`,
    ...progressionEvidence,
  });
}

function exerciseProgressionReference(
  input: BuildCoachRecommendationsInput,
  slot: CoachSlotInput,
  exerciseId: string,
) {
  const sessionById = new Map(finishedSessions(input).map((session) => [session.id, session]));
  const firstByExposure = new Map<string, CoachSetInput>();
  for (const set of input.sets) {
    if (set.isWarmup || set.exerciseId !== exerciseId) continue;
    const session = sessionById.get(set.sessionId);
    if (!session) continue;
    const key = `${set.sessionId}:${set.programSlotId ?? "adhoc"}`;
    const current = firstByExposure.get(key);
    if (!current || set.setIndex < current.setIndex || (
      set.setIndex === current.setIndex && set.createdAt < current.createdAt
    )) {
      firstByExposure.set(key, set);
    }
  }
  const performances: ProgressionPerformance[] = [...firstByExposure.values()].map((set) => {
    const session = sessionById.get(set.sessionId) as CoachSessionInput;
    return {
      programSlotId: set.programSlotId,
      performedAt: session.performedAt,
      weight: set.weight,
      reps: set.reps,
      rir: set.rir,
      e1rm: set.e1rm,
    };
  });
  return selectProgressionReference(performances, slot.id);
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
    const e1rms = comparable.flatMap((set) => set.e1rm == null ? [] : [set.e1rm]);
    return [{
      session,
      firstSet: comparable[0],
      bestE1rm: e1rms.length === 0 ? null : Math.max(...e1rms),
      targetRirMin: prescription.targetRirMin,
      targetRirMax: prescription.targetRirMax,
    }];
  });
  const latest = raw.at(-1);
  if (!latest) return [];
  const phaseKey = (e: Exposure) => resolvePrescription(slot, e.session.weekIndex ?? 1,
    input.phases.filter(p => p.programId === slot.programId)).phase?.id ?? null;
  let start = raw.length - 1;
  while (start > 0 && raw[start - 1].firstSet.exerciseId === latest.firstSet.exerciseId
    && phaseKey(raw[start - 1]) === phaseKey(latest)) start--;
  const assessment = input.stalls?.find(s => s.slotId === slot.id);
  const comparable = assessment ? new Set(assessment.points.map(p => p.sessionId)) : null;
  return raw.slice(start).filter(e => !comparable || comparable.has(e.session.id) || e === latest);
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
      return `${set.weight} lb × ${set.reps} · first-set RIR ${set.rir == null ? "?" : set.rir} · best e1RM ${exposure.bestE1rm == null ? "?" : trim(exposure.bestE1rm)}`;
    }),
  };
}

function recommendation(input: {
  kind: CoachRecommendationKind;
  slotId: string;
  exerciseId: string | null;
  exerciseName: string | null;
  programDayName: string | null;
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
    programDayName: input.programDayName,
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
      `${item.programDayName ? `${item.programDayName} · ` : ""}${item.exerciseName ?? "Overall review"}: ${item.action.label}`,
      `Why: ${item.rationale}`,
      `Evidence: ${item.evidence.exposureCount} exposure${item.evidence.exposureCount === 1 ? "" : "s"}, ${item.evidence.windowStart}–${item.evidence.windowEnd} · confidence ${item.confidence}`,
    );
  }
  return lines.join("\n");
}
