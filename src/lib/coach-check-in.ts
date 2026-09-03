import { dateKey, type BodyweightTrend } from "./bodyweight";
import { resolvePrescription, type ProgramPhase } from "./periodization";
import type { JointPain } from "./session-feedback";
import {
  type ExerciseDef,
  type Pattern,
} from "./strength/coefficients";

export const COACH_REPORT_VERSION = "1.0" as const;
export const COACH_REPORT_TIMEZONE = "America/Chicago";
export const WORKOUT_DURATION_TARGET_MINUTES = 45;
const MAX_PLAUSIBLE_DURATION_MINUTES = 240;
const MIN_PLAUSIBLE_DURATION_MINUTES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TrendClassification =
  | "gaining"
  | "flat"
  | "declining"
  | "insufficient_data";

export type SpecializationGroup =
  | "delts"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves";

// These are intentionally explicit and may overlap: a squat is meaningful exposure for
// both quads and glutes. This is a coaching volume proxy, not an anatomical isolation claim.
export const SPECIALIZATION_GROUPS: Record<
  SpecializationGroup,
  { label: string; patterns: Pattern[] }
> = {
  delts: {
    label: "Delts",
    patterns: ["vertical_press", "lateral_raise", "rear_delt"],
  },
  biceps: { label: "Biceps", patterns: ["elbow_flexion"] },
  triceps: { label: "Triceps", patterns: ["elbow_extension"] },
  quads: { label: "Quads", patterns: ["squat", "lunge", "knee_extension"] },
  hamstrings: { label: "Hamstrings", patterns: ["hinge", "knee_flexion"] },
  glutes: {
    label: "Glutes",
    patterns: ["squat", "hinge", "lunge", "hip_thrust"],
  },
  calves: { label: "Calves", patterns: ["calf"] },
};

export interface CoachSessionInput {
  id: string;
  performedAt: string;
  finishedAt: string | null;
  programId: string | null;
  programDayId: string | null;
  programDayName: string | null;
  weekIndex: number | null;
  readiness: number | null;
  jointPain: JointPain | null;
  note: string | null;
}

export interface CoachSetInput {
  sessionId: string;
  programSlotId: string | null;
  exerciseId: string;
  setIndex: number;
  weight: number;
  reps: number;
  rir: number | null;
  e1rm: number | null;
  isWarmup: boolean;
  createdAt: string;
}

export interface CoachSlotInput {
  id: string;
  programId: string;
  programDayId: string;
  exerciseId: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
}

export interface CoachPhaseInput extends ProgramPhase {
  programId: string;
}

export interface BuildCoachReportInput {
  generatedAt?: Date;
  timeZone?: string;
  programName?: string | null;
  plannedSessions?: number;
  sessions: CoachSessionInput[];
  sets: CoachSetInput[];
  slots: CoachSlotInput[];
  phases: CoachPhaseInput[];
  definitions: Record<string, ExerciseDef>;
  bodyweightTrend?: BodyweightTrend;
  currentBodyweight?: number | null;
}

export interface CoachWindow {
  startDate: string;
  endDate: string;
}

export interface CoachPrescriptionReport {
  exerciseId: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  targetRirMin: number;
  targetRirMax: number;
  phaseName: string | null;
}

export interface CoachWorkingSetReport {
  setNumber: number;
  weight: number;
  reps: number;
  rir: number | null;
  e1rm: number | null;
}

export interface CoachExerciseExecutionReport {
  exerciseId: string;
  exerciseName: string;
  prescription: CoachPrescriptionReport | null;
  sets: CoachWorkingSetReport[];
}

export interface CoachSessionReport {
  performedAt: string;
  finishedAt: string;
  programDayName: string | null;
  weekIndex: number | null;
  durationMinutes: number | null;
  completedWorkingSets: number;
  prescribedWorkingSets: number | null;
  exercises: CoachExerciseExecutionReport[];
  feedback: {
    readiness: number | null;
    jointPain: JointPain | null;
    note: string | null;
  };
}

export interface SpecializationVolumeReport {
  group: SpecializationGroup;
  label: string;
  workingSets: number;
  hardSets: number;
}

export interface CoachWindowReport {
  window: CoachWindow;
  adherence: {
    completedSessions: number;
    plannedSessions: number;
  };
  duration: {
    validSessionCount: number;
    averageMinutes: number | null;
    targetMinutes: number;
    deltaFromTargetMinutes: number | null;
  };
  setExecution: {
    completedWorkingSets: number;
    linkedWorkingSets: number;
    prescribedWorkingSets: number;
    completionRate: number | null;
  };
  rirExecution: {
    averageActual: number | null;
    loggedSets: number;
    missingSets: number;
    zeroRirSets: number;
    oneRirSets: number;
    twoPlusRirSets: number;
    withinTargetSets: number;
    harderThanTargetSets: number;
    easierThanTargetSets: number;
    unmatchedTargetSets: number;
  };
  specializationVolume: SpecializationVolumeReport[];
  sessions: CoachSessionReport[];
  dataQuality: {
    unfinishedSessions: number;
    implausibleDurationSessions: number;
    sessionsMissingPrescription: number;
    unmatchedProgramSlotSets: number;
    missingRirSets: number;
  };
}

export interface ExerciseTrendReport {
  exerciseId: string;
  exerciseName: string;
  classification: TrendClassification;
  exposureCount: number;
  evidenceExposureCount: number;
  recentAverageE1rm: number | null;
  previousAverageE1rm: number | null;
  changePercent: number | null;
}

export interface FixedLoadProgressReport {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  currentBestReps: number;
  priorBestReps: number;
  repChange: number;
  currentRir: number | null;
  priorRir: number | null;
}

export interface CoachCheckInReport {
  version: typeof COACH_REPORT_VERSION;
  generatedAt: string;
  timeZone: string;
  windows: {
    current: CoachWindow;
    prior: CoachWindow;
  };
  program: {
    name: string | null;
    plannedSessionsPerWeek: number;
  };
  bodyweight: {
    latest: number | null;
    currentSevenDayAverage: number | null;
    currentObservationCount: number;
    priorSevenDayAverage: number | null;
    priorObservationCount: number;
    change: number | null;
  };
  current: CoachWindowReport;
  prior: CoachWindowReport;
  exerciseTrends: ExerciseTrendReport[];
  fixedLoadRepProgress: FixedLoadProgressReport[];
}

// Canonical factual report. Internal row identifiers are accepted only to perform joins;
// none are copied into the output. The Progress UI, text formatter, and future API consume
// this object rather than reimplementing coaching calculations.
export function buildCoachCheckInReport(
  input: BuildCoachReportInput,
): CoachCheckInReport {
  const generatedAt = input.generatedAt ?? new Date();
  const timeZone = input.timeZone ?? COACH_REPORT_TIMEZONE;
  const endDate = dateKey(generatedAt, timeZone);
  const currentWindow = windowEnding(endDate, 7);
  const priorWindow = {
    startDate: shiftDateKey(currentWindow.startDate, -7),
    endDate: shiftDateKey(currentWindow.endDate, -7),
  };
  const context: BuildContext = {
    ...input,
    generatedAt,
    timeZone,
    sessionById: new Map(input.sessions.map((session) => [session.id, session])),
    slotById: new Map(input.slots.map((slot) => [slot.id, slot])),
    slotsByDay: groupBy(input.slots, (slot) => slot.programDayId),
    phasesByProgram: groupBy(input.phases, (phase) => phase.programId),
  };
  const plannedSessions = input.plannedSessions ?? 0;

  return {
    version: COACH_REPORT_VERSION,
    generatedAt: generatedAt.toISOString(),
    timeZone,
    windows: { current: currentWindow, prior: priorWindow },
    program: {
      name: input.programName ?? null,
      plannedSessionsPerWeek: plannedSessions,
    },
    bodyweight: {
      latest: input.currentBodyweight ?? null,
      currentSevenDayAverage: input.bodyweightTrend?.current.average ?? null,
      currentObservationCount: input.bodyweightTrend?.current.observationCount ?? 0,
      priorSevenDayAverage: input.bodyweightTrend?.previous.average ?? null,
      priorObservationCount: input.bodyweightTrend?.previous.observationCount ?? 0,
      change: input.bodyweightTrend?.change ?? null,
    },
    current: buildWindowReport(context, currentWindow, plannedSessions),
    prior: buildWindowReport(context, priorWindow, plannedSessions),
    exerciseTrends: buildExerciseTrends(context),
    fixedLoadRepProgress: buildFixedLoadProgress(
      context,
      currentWindow,
      priorWindow,
    ),
  };
}

export function formatCoachCheckIn(report: CoachCheckInReport): string {
  const current = report.current;
  const prior = report.prior;
  const duration = current.duration.averageMinutes;
  const rir = current.rirExecution;
  const lines = [
    "WEEKLY TRAINING CHECK-IN",
    `Report schema: ${report.version}`,
    `Generated: ${report.generatedAt} (${report.timeZone})`,
    `Current window: ${report.windows.current.startDate}–${report.windows.current.endDate}`,
    `Prior window: ${report.windows.prior.startDate}–${report.windows.prior.endDate}`,
    `Program: ${report.program.name ?? "Not specified"}`,
    "",
    "SESSION EXECUTION",
    `Adherence: ${current.adherence.completedSessions}/${current.adherence.plannedSessions || "?"} sessions (prior ${prior.adherence.completedSessions}/${prior.adherence.plannedSessions || "?"})`,
    `Duration: ${duration == null ? "not available" : `${formatDecimal(duration)} min average`} · target ${current.duration.targetMinutes} min${current.duration.deltaFromTargetMinutes == null ? "" : ` · ${signedDecimal(current.duration.deltaFromTargetMinutes)} min vs target`}`,
    `Working sets: ${current.setExecution.completedWorkingSets}/${current.setExecution.prescribedWorkingSets || "?"} completed${current.setExecution.completionRate == null ? "" : ` (${Math.round(current.setExecution.completionRate * 100)}%)`} · prior ${prior.setExecution.completedWorkingSets}/${prior.setExecution.prescribedWorkingSets || "?"}`,
    `RIR actual: ${rir.averageActual == null ? "not logged" : `${formatDecimal(rir.averageActual)} average`} · ${rir.zeroRirSets} at 0 · ${rir.oneRirSets} at 1 · ${rir.twoPlusRirSets} at 2+ · ${rir.missingSets} missing`,
    `RIR vs prescription: ${rir.withinTargetSets} in range · ${rir.harderThanTargetSets} harder · ${rir.easierThanTargetSets} easier · ${rir.unmatchedTargetSets} unmatched`,
    "",
    "BODYWEIGHT",
    `Latest: ${report.bodyweight.latest == null ? "not logged" : `${report.bodyweight.latest} lb`}`,
    `Current 7-day average: ${formatAverage(report.bodyweight.currentSevenDayAverage, report.bodyweight.currentObservationCount)}`,
    `Prior 7-day average: ${formatAverage(report.bodyweight.priorSevenDayAverage, report.bodyweight.priorObservationCount)}`,
    `Change: ${report.bodyweight.change == null ? "not available" : `${signedDecimal(report.bodyweight.change)} lb`}`,
    "",
    "SPECIALIZATION VOLUME (working / hard sets at 0–1 RIR)",
    ...current.specializationVolume.map(
      (group) => `${group.label}: ${group.workingSets} / ${group.hardSets}`,
    ),
    "",
    "PERFORMANCE TREND (last 4 comparable exposures)",
    ...(report.exerciseTrends.length > 0
      ? report.exerciseTrends.map((trend) => {
          const comparison =
            trend.changePercent == null
              ? "needs 4 exposures"
              : `${signedDecimal(trend.changePercent)}% recent-two vs prior-two`;
          return `${trend.exerciseName}: ${trend.classification.replace("_", " ")} · ${comparison}`;
        })
      : ["No exercise exposures available."]),
    "",
    "FIXED-LOAD REP PROGRESS (current vs prior window)",
    ...(report.fixedLoadRepProgress.length > 0
      ? report.fixedLoadRepProgress.map(
          (progress) =>
            `${progress.exerciseName} at ${progress.weight} lb: ${progress.currentBestReps} vs ${progress.priorBestReps} reps (${signedInteger(progress.repChange)}) · RIR ${progress.currentRir ?? "?"} vs ${progress.priorRir ?? "?"}`,
        )
      : ["No like-for-like exercise/load comparison across both windows."]),
    "",
    "CURRENT-WINDOW SESSIONS",
    ...(current.sessions.length > 0
      ? current.sessions.flatMap((session) => formatSession(session, report.timeZone))
      : ["No finished sessions in this window."]),
    "",
    "DATA QUALITY",
    ...formatDataQuality(current),
    "",
    "COACH REVIEW",
    "Use these factual signals to assess load/rep progression, fatigue, specialization volume, and recovery. Propose changes with rationale; do not claim the program was modified.",
  ];

  return lines.join("\n");
}

interface BuildContext extends BuildCoachReportInput {
  generatedAt: Date;
  timeZone: string;
  sessionById: Map<string, CoachSessionInput>;
  slotById: Map<string, CoachSlotInput>;
  slotsByDay: Map<string, CoachSlotInput[]>;
  phasesByProgram: Map<string, CoachPhaseInput[]>;
}

function buildWindowReport(
  context: BuildContext,
  window: CoachWindow,
  plannedSessions: number,
): CoachWindowReport {
  const windowSessions = context.sessions.filter((session) =>
    timestampInWindow(session.performedAt, window, context.timeZone),
  );
  const finishedSessions = windowSessions
    .filter(
      (session): session is CoachSessionInput & { finishedAt: string } =>
        session.finishedAt != null,
    )
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  const finishedIds = new Set(finishedSessions.map((session) => session.id));
  const workingSets = context.sets
    .filter((set) => !set.isWarmup && finishedIds.has(set.sessionId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const durations = finishedSessions.map((session) => sessionDuration(session));
  const validDurations = durations.filter((value): value is number => value != null);
  let prescribedWorkingSets = 0;
  let sessionsMissingPrescription = 0;
  for (const session of finishedSessions) {
    const sessionSlots = session.programDayId
      ? context.slotsByDay.get(session.programDayId) ?? []
      : [];
    if (sessionSlots.length === 0) {
      sessionsMissingPrescription += 1;
      continue;
    }
    for (const slot of sessionSlots) {
      prescribedWorkingSets += effectivePrescription(context, session, slot).targetSets;
    }
  }

  const linkedSets = workingSets.filter(
    (set) => matchedSlot(context, context.sessionById.get(set.sessionId), set) != null,
  );
  const rirRows = workingSets.filter(
    (set): set is CoachSetInput & { rir: number } => set.rir != null,
  );
  const rirExecution = {
    averageActual:
      rirRows.length === 0
        ? null
        : rirRows.reduce((sum, set) => sum + set.rir, 0) / rirRows.length,
    loggedSets: rirRows.length,
    missingSets: workingSets.length - rirRows.length,
    zeroRirSets: rirRows.filter((set) => set.rir === 0).length,
    oneRirSets: rirRows.filter((set) => set.rir === 1).length,
    twoPlusRirSets: rirRows.filter((set) => set.rir >= 2).length,
    withinTargetSets: 0,
    harderThanTargetSets: 0,
    easierThanTargetSets: 0,
    unmatchedTargetSets: 0,
  };

  for (const set of rirRows) {
    const session = context.sessionById.get(set.sessionId);
    const slot = matchedSlot(context, session, set);
    if (!session || !slot) {
      rirExecution.unmatchedTargetSets += 1;
      continue;
    }
    const prescription = effectivePrescription(context, session, slot);
    if (set.rir < prescription.targetRirMin) rirExecution.harderThanTargetSets += 1;
    else if (set.rir > prescription.targetRirMax) rirExecution.easierThanTargetSets += 1;
    else rirExecution.withinTargetSets += 1;
  }

  return {
    window,
    adherence: {
      completedSessions: finishedSessions.length,
      plannedSessions,
    },
    duration: {
      validSessionCount: validDurations.length,
      averageMinutes: average(validDurations),
      targetMinutes: WORKOUT_DURATION_TARGET_MINUTES,
      deltaFromTargetMinutes:
        validDurations.length === 0
          ? null
          : (average(validDurations) as number) - WORKOUT_DURATION_TARGET_MINUTES,
    },
    setExecution: {
      completedWorkingSets: workingSets.length,
      linkedWorkingSets: linkedSets.length,
      prescribedWorkingSets,
      completionRate:
        prescribedWorkingSets === 0 ? null : workingSets.length / prescribedWorkingSets,
    },
    rirExecution,
    specializationVolume: specializationVolume(workingSets, context.definitions),
    sessions: finishedSessions.map((session) =>
      buildSessionReport(context, session, workingSets),
    ),
    dataQuality: {
      unfinishedSessions: windowSessions.length - finishedSessions.length,
      implausibleDurationSessions: durations.length - validDurations.length,
      sessionsMissingPrescription,
      unmatchedProgramSlotSets: workingSets.length - linkedSets.length,
      missingRirSets: workingSets.length - rirRows.length,
    },
  };
}

function buildSessionReport(
  context: BuildContext,
  session: CoachSessionInput & { finishedAt: string },
  windowSets: CoachSetInput[],
): CoachSessionReport {
  const sets = windowSets.filter((set) => set.sessionId === session.id);
  const sessionSlots = session.programDayId
    ? context.slotsByDay.get(session.programDayId) ?? []
    : [];
  const grouped = new Map<string, CoachSetInput[]>();
  for (const set of sets) {
    const key = `${set.programSlotId ?? "unmatched"}:${set.exerciseId}`;
    const list = grouped.get(key) ?? [];
    list.push(set);
    grouped.set(key, list);
  }

  const exercises = [...grouped.values()].map((groupSets) => {
    const first = groupSets[0];
    const slot = matchedSlot(context, session, first);
    const effective = slot ? effectivePrescription(context, session, slot) : null;
    return {
      exerciseId: first.exerciseId,
      exerciseName: context.definitions[first.exerciseId]?.name ?? first.exerciseId,
      prescription:
        slot && effective
          ? {
              exerciseId: slot.exerciseId,
              targetSets: effective.targetSets,
              repMin: effective.repMin,
              repMax: effective.repMax,
              targetRirMin: effective.targetRirMin,
              targetRirMax: effective.targetRirMax,
              phaseName: effective.phase?.name ?? null,
            }
          : null,
      sets: groupSets
        .sort((a, b) => a.setIndex - b.setIndex || a.createdAt.localeCompare(b.createdAt))
        .map((set) => ({
          setNumber: set.setIndex + 1,
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
          e1rm: set.e1rm,
        })),
    };
  });

  return {
    performedAt: session.performedAt,
    finishedAt: session.finishedAt,
    programDayName: session.programDayName,
    weekIndex: session.weekIndex,
    durationMinutes: sessionDuration(session),
    completedWorkingSets: sets.length,
    prescribedWorkingSets:
      sessionSlots.length === 0
        ? null
        : sessionSlots.reduce(
            (sum, slot) =>
              sum + effectivePrescription(context, session, slot).targetSets,
            0,
          ),
    exercises,
    feedback: {
      readiness: session.readiness,
      jointPain: session.jointPain,
      note: session.note,
    },
  };
}

function buildExerciseTrends(context: BuildContext): ExerciseTrendReport[] {
  const finishedIds = new Set(
    context.sessions
      .filter(
        (session) =>
          session.finishedAt != null
          && new Date(session.performedAt).getTime() <= context.generatedAt.getTime(),
      )
      .map((session) => session.id),
  );
  const byExerciseSession = new Map<string, Map<string, number>>();
  for (const set of context.sets) {
    if (set.isWarmup || !finishedIds.has(set.sessionId) || set.e1rm == null || set.e1rm <= 0) {
      continue;
    }
    const bySession = byExerciseSession.get(set.exerciseId) ?? new Map<string, number>();
    const prior = bySession.get(set.sessionId);
    if (prior == null || set.e1rm > prior) bySession.set(set.sessionId, set.e1rm);
    byExerciseSession.set(set.exerciseId, bySession);
  }

  return [...byExerciseSession.entries()]
    .map(([exerciseId, bySession]) => {
      const exposures = [...bySession.entries()]
        .map(([sessionId, e1rm]) => ({
          e1rm,
          performedAt: context.sessionById.get(sessionId)?.performedAt ?? "",
        }))
        .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
      const evidence = exposures.slice(-4);
      if (evidence.length < 4) {
        return {
          exerciseId,
          exerciseName: context.definitions[exerciseId]?.name ?? exerciseId,
          classification: "insufficient_data" as const,
          exposureCount: exposures.length,
          evidenceExposureCount: evidence.length,
          recentAverageE1rm: null,
          previousAverageE1rm: null,
          changePercent: null,
        };
      }

      const previous = evidence.slice(0, 2).map((exposure) => exposure.e1rm);
      const recent = evidence.slice(2).map((exposure) => exposure.e1rm);
      const previousAverage = average(previous) as number;
      const recentAverage = average(recent) as number;
      const threshold = 0.01;
      // Both recent marks must clear both prior marks in the same direction. One poor or
      // exceptional session therefore cannot manufacture a declining/gaining classification.
      const gaining = Math.min(...recent) > Math.max(...previous) * (1 + threshold);
      const declining = Math.max(...recent) < Math.min(...previous) * (1 - threshold);
      const classification: TrendClassification = gaining
        ? "gaining"
        : declining
          ? "declining"
          : "flat";

      return {
        exerciseId,
        exerciseName: context.definitions[exerciseId]?.name ?? exerciseId,
        classification,
        exposureCount: exposures.length,
        evidenceExposureCount: 4,
        recentAverageE1rm: recentAverage,
        previousAverageE1rm: previousAverage,
        changePercent: ((recentAverage - previousAverage) / previousAverage) * 100,
      };
    })
    .sort((a, b) => {
      const rank: Record<TrendClassification, number> = {
        declining: 0,
        flat: 1,
        gaining: 2,
        insufficient_data: 3,
      };
      return rank[a.classification] - rank[b.classification]
        || a.exerciseName.localeCompare(b.exerciseName);
    });
}

function buildFixedLoadProgress(
  context: BuildContext,
  currentWindow: CoachWindow,
  priorWindow: CoachWindow,
): FixedLoadProgressReport[] {
  const finished = new Set(
    context.sessions
      .filter((session) => session.finishedAt != null)
      .map((session) => session.id),
  );
  const current = bestRepsByLoad(context, currentWindow, finished);
  const prior = bestRepsByLoad(context, priorWindow, finished);

  return [...current.entries()]
    .flatMap(([key, currentSet]) => {
      const priorSet = prior.get(key);
      if (!priorSet) return [];
      return [{
        exerciseId: currentSet.exerciseId,
        exerciseName:
          context.definitions[currentSet.exerciseId]?.name ?? currentSet.exerciseId,
        weight: currentSet.weight,
        currentBestReps: currentSet.reps,
        priorBestReps: priorSet.reps,
        repChange: currentSet.reps - priorSet.reps,
        currentRir: currentSet.rir,
        priorRir: priorSet.rir,
      }];
    })
    .sort((a, b) => b.repChange - a.repChange || a.exerciseName.localeCompare(b.exerciseName));
}

function bestRepsByLoad(
  context: BuildContext,
  window: CoachWindow,
  finishedSessionIds: Set<string>,
) {
  const best = new Map<string, CoachSetInput>();
  for (const set of context.sets) {
    const session = context.sessionById.get(set.sessionId);
    if (
      set.isWarmup
      || !session
      || !finishedSessionIds.has(set.sessionId)
      || !timestampInWindow(session.performedAt, window, context.timeZone)
    ) {
      continue;
    }
    const key = `${set.exerciseId}:${set.weight}`;
    const prior = best.get(key);
    if (!prior || set.reps > prior.reps || (set.reps === prior.reps && (set.rir ?? -1) > (prior.rir ?? -1))) {
      best.set(key, set);
    }
  }
  return best;
}

function specializationVolume(
  sets: CoachSetInput[],
  definitions: Record<string, ExerciseDef>,
): SpecializationVolumeReport[] {
  return (Object.entries(SPECIALIZATION_GROUPS) as Array<
    [SpecializationGroup, (typeof SPECIALIZATION_GROUPS)[SpecializationGroup]]
  >).map(([group, definition]) => {
    const matching = sets.filter((set) => {
      const pattern = definitions[set.exerciseId]?.pattern;
      return pattern != null && definition.patterns.includes(pattern);
    });
    return {
      group,
      label: definition.label,
      workingSets: matching.length,
      hardSets: matching.filter((set) => set.rir != null && set.rir <= 1).length,
    };
  });
}

function effectivePrescription(
  context: BuildContext,
  session: CoachSessionInput,
  slot: CoachSlotInput,
) {
  const phases = context.phasesByProgram.get(slot.programId) ?? [];
  return resolvePrescription(
    {
      targetSets: slot.targetSets,
      repMin: slot.repMin,
      repMax: slot.repMax,
      targetRir: slot.targetRir,
    },
    session.weekIndex ?? 1,
    phases,
  );
}

function matchedSlot(
  context: BuildContext,
  session: CoachSessionInput | undefined,
  set: CoachSetInput,
) {
  if (!session || !set.programSlotId) return null;
  const slot = context.slotById.get(set.programSlotId);
  if (!slot || slot.programDayId !== session.programDayId) return null;
  return slot;
}

function sessionDuration(session: { performedAt: string; finishedAt: string | null }) {
  if (!session.finishedAt) return null;
  const start = new Date(session.performedAt).getTime();
  const end = new Date(session.finishedAt).getTime();
  const minutes = (end - start) / 60_000;
  if (
    !Number.isFinite(minutes)
    || minutes < MIN_PLAUSIBLE_DURATION_MINUTES
    || minutes > MAX_PLAUSIBLE_DURATION_MINUTES
  ) {
    return null;
  }
  return minutes;
}

function timestampInWindow(timestamp: string, window: CoachWindow, timeZone: string) {
  const key = dateKey(new Date(timestamp), timeZone);
  return key >= window.startDate && key <= window.endDate;
}

function windowEnding(endDate: string, days: number): CoachWindow {
  return { startDate: shiftDateKey(endDate, -(days - 1)), endDate };
}

function shiftDateKey(value: string, days: number) {
  const timestamp = Date.parse(`${value}T00:00:00Z`) + days * DAY_MS;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    const list = grouped.get(value) ?? [];
    list.push(item);
    grouped.set(value, list);
  }
  return grouped;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatSession(session: CoachSessionReport, timeZone: string) {
  const painFlag =
    session.feedback.jointPain === "significant"
      ? " — SIGNIFICANT; pause progression advice and review"
      : "";
  const lines = [
    `${dateLabel(session.performedAt, timeZone)} · ${session.programDayName ?? "Unknown day"} · ${session.durationMinutes == null ? "duration unavailable" : `${formatDecimal(session.durationMinutes)} min`} · ${session.completedWorkingSets}/${session.prescribedWorkingSets ?? "?"} sets`,
    `  Feedback: readiness ${session.feedback.readiness ?? "not logged"}${session.feedback.readiness == null ? "" : "/5"} · joint pain ${session.feedback.jointPain ?? "not logged"}${painFlag}${session.feedback.note ? ` · ${session.feedback.note}` : ""}`,
  ];
  for (const exercise of session.exercises) {
    const prescription = exercise.prescription
      ? `${exercise.prescription.targetSets}×${exercise.prescription.repMin}–${exercise.prescription.repMax} @ ${rirRange(exercise.prescription)} RIR${exercise.prescription.phaseName ? ` (${exercise.prescription.phaseName})` : ""}`
      : "prescription unmatched";
    lines.push(`  ${exercise.exerciseName}: ${prescription}`);
    for (const set of exercise.sets) {
      lines.push(
        `    ${set.setNumber}. ${set.weight} lb × ${set.reps} @ ${set.rir ?? "?"} RIR${set.e1rm == null ? "" : ` · e1RM ${Math.round(set.e1rm)} lb`}`,
      );
    }
  }
  return lines;
}

function formatDataQuality(report: CoachWindowReport) {
  const quality = report.dataQuality;
  const warnings = [
    quality.unfinishedSessions > 0
      ? `${quality.unfinishedSessions} unfinished session(s) excluded from completion metrics.`
      : null,
    quality.implausibleDurationSessions > 0
      ? `${quality.implausibleDurationSessions} finished session(s) had durations outside ${MIN_PLAUSIBLE_DURATION_MINUTES}–${MAX_PLAUSIBLE_DURATION_MINUTES} minutes and were excluded from the duration average.`
      : null,
    quality.sessionsMissingPrescription > 0
      ? `${quality.sessionsMissingPrescription} finished session(s) could not be matched to a program-day prescription.`
      : null,
    quality.unmatchedProgramSlotSets > 0
      ? `${quality.unmatchedProgramSlotSets} working set(s) could not be matched to a program slot.`
      : null,
    quality.missingRirSets > 0
      ? `${quality.missingRirSets} working set(s) are missing actual RIR.`
      : null,
  ].filter((warning): warning is string => warning != null);
  return warnings.length > 0 ? warnings : ["No known data-quality warnings."];
}

function rirRange(prescription: CoachPrescriptionReport) {
  return prescription.targetRirMin === prescription.targetRirMax
    ? `${prescription.targetRirMin}`
    : `${prescription.targetRirMin}–${prescription.targetRirMax}`;
}

function formatAverage(value: number | null, count: number) {
  if (value == null) return "not available (no observations)";
  return `${formatDecimal(value)} lb (${count} observation${count === 1 ? "" : "s"})`;
}

function formatDecimal(value: number) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function signedDecimal(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}

function signedInteger(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function dateLabel(timestamp: string, timeZone: string) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}
