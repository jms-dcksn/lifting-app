import type { JointPain } from "./session-feedback";
import { resolvePrescription } from "./periodization";
import { buildStallAssessments, isDeload, stallContext, type StallContext, type StallHistory } from "./stall-report";
import type { ExerciseDef } from "./strength/coefficients";
import { repeatedEffortReduction } from "./strength/effort";
import { detectPlateau, foldPrescription, nextLadderAction, pickRepBand, SNOOZE_EXPOSURES } from "./strength/plateau";
import { sessionTarget } from "./strength/progression";
import { historicalBodyweight, type RecordSet } from "./strength/records";
import { classifyPerformanceTrend } from "./strength/trend";

export const COACH_EXCEPTION_POLICY_VERSION = "1.0";

export interface CoachExceptionSource {
  sessionId: string;
  performedAt: string;
  setIds: string[];
  firstSetId: string | null;
}

type RecommendedTarget = { weight: number; targetReps: number; targetRir: number };
type SignalEvidence = { status: "recommended"; sources: CoachExceptionSource[] };
type PlateauEvidence = { plateau: ReturnType<typeof detectPlateau> & { patience: number } };

export type CoachExceptionSignal = SignalEvidence & (
  | { reason: "significant_pain"; action: "review_pain" }
  | { reason: "repeated_effort_miss" | "repeated_rep_floor"; action: "reduce_load"; target: RecommendedTarget }
  | (PlateauEvidence & { reason: "confirmed_plateau"; action: "review_plateau" | "swap" })
  | (PlateauEvidence & { reason: "confirmed_plateau"; action: "rep_change"; repBand: { repMin: number; repMax: number } })
  | { reason: "sustained_decline"; action: "review_trend"; trend: ReturnType<typeof classifyPerformanceTrend> }
);

const REASON_ORDER: Record<CoachExceptionSignal["reason"], number> = {
  significant_pain: 0,
  repeated_effort_miss: 1,
  repeated_rep_floor: 1,
  confirmed_plateau: 2,
  sustained_decline: 3,
};

export interface CoachExceptionCandidate {
  policyVersion: typeof COACH_EXCEPTION_POLICY_VERSION;
  userId: string;
  scope:
    | { kind: "session"; sessionIds: string[] }
    | { kind: "lift"; slotId: string; context: StallContext };
  signals: CoachExceptionSignal[];
  evidenceStart: string;
  evidenceEnd: string;
}

export interface CurrentCoachExceptionSlot {
  slotId: string;
  exerciseId: string;
  equipmentInstanceId: string | null;
  weekIndex: number;
  mode: "classic" | "fluid";
}

export interface CoachExceptionInput {
  history: Omit<StallHistory, "sets"> & { sets: Array<RecordSet & { set_index: number }> };
  definitions: Record<string, ExerciseDef>;
  activeProgramId: string | null;
  currentSlots: CurrentCoachExceptionSlot[];
  feedback: Array<{ sessionId: string; jointPain: JointPain | null }>;
  asOf: Date;
  // Caller chooses the evidence cutoff; bootstrap/episode retention belong to #212/#195.
  evidenceSince: Date;
}

// Pure eligibility only. No proposal text, ranking, legacy decisions, delivery or writes.
export function classifyCoachExceptions(input: CoachExceptionInput): CoachExceptionCandidate[] {
  const { definitions, asOf, evidenceSince } = input;
  const cutoff = asOf.getTime();
  const since = evidenceSince.getTime();
  if (!Number.isFinite(cutoff) || !Number.isFinite(since) || since > cutoff) {
    throw new Error("Invalid Coach exception evidence window");
  }
  const history = { ...input.history, sets: input.history.sets.filter(set => Date.parse(set.created_at) <= cutoff) };
  const sessions = new Map(history.sessions.filter(session => session.finishedAt != null
    && Date.parse(session.finishedAt) <= cutoff && Date.parse(session.performedAt) <= cutoff)
    .map(session => [session.id, session]));
  const painfulIds = new Set(input.feedback.filter(feedback => feedback.jointPain === "significant")
    .map(feedback => feedback.sessionId));
  const painSources = [...sessions.values()].filter(session => painfulIds.has(session.id)
    && Date.parse(session.performedAt) >= since)
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.id.localeCompare(b.id))
    .map(session => ({ sessionId: session.id, performedAt: session.performedAt, setIds: [], firstSetId: null }));
  if (painSources.length) {
    return [candidate(history.userId, { kind: "session", sessionIds: painSources.map(source => source.sessionId) },
      [{ reason: "significant_pain", action: "review_pain", status: "recommended", sources: painSources }])];
  }

  const assessments = buildStallAssessments(history, definitions, asOf);
  const ownedSets = [...new Map(history.sets.filter(set => set.user_id === history.userId && !set.is_warmup)
    .map(set => [set.id, set])).values()];
  const setsByExposure = new Map<string, typeof ownedSets>();
  for (const set of ownedSets) {
    const key = `${set.program_slot_id}:${set.session_id}`;
    const sets = setsByExposure.get(key) ?? [];
    sets.push(set);
    setsByExposure.set(key, sets);
  }
  const candidates: CoachExceptionCandidate[] = [];
  const contexts = [...new Map(input.currentSlots.map(context => [context.slotId, context])).values()]
    .sort((a, b) => a.slotId.localeCompare(b.slotId));
  for (const current of contexts) {
    const slot = history.slots.find(slot => slot.id === current.slotId && slot.programId === input.activeProgramId);
    const assessment = assessments.find(assessment => assessment.slotId === current.slotId);
    const def = definitions[current.exerciseId];
    if (!slot || !assessment?.context || !def || !Number.isInteger(current.weekIndex) || current.weekIndex < 1) continue;
    const rows = history.adaptations.filter(row => row.slotId === slot.id && Date.parse(row.createdAt) <= cutoff)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const folded = foldPrescription(slot, rows);
    const prescription = resolvePrescription({ ...slot, repMin: folded.repMin, repMax: folded.repMax },
      current.weekIndex, history.phases.filter(phase => phase.programId === slot.programId));
    const context = stallContext(slot, current.exerciseId, current.equipmentInstanceId, prescription, folded.phaseStartAt);
    if (isDeload(prescription.phase) || prescription.targetRir >= 4
      || JSON.stringify(context) !== JSON.stringify(assessment.context)) continue;

    const points = assessment.points.filter(point => Date.parse(point.sessionAt) >= since);
    const exposures = points.map(point => {
      const sets = [...(setsByExposure.get(`${slot.id}:${point.sessionId}`) ?? [])]
        .sort((a, b) => a.set_index - b.set_index || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      return { point, sets, first: sets[0], source: {
        sessionId: point.sessionId, performedAt: point.sessionAt, setIds: sets.map(set => set.id), firstSetId: sets[0]?.id ?? null,
      } };
    });
    if (!exposures.length || exposures.some(exposure => !exposure.first
      || exposure.sets.some(set => !Number.isInteger(set.set_index) || set.set_index < 0))) continue;
    const recent = exposures.slice(-2);
    const effort = repeatedEffortReduction(def, prescription, recent.map(exposure => ({
      weight: exposure.first.weight!, reps: exposure.first.reps!, rir: exposure.first.rir,
      targetRirMin: prescription.targetRirMin,
    })));
    const signals: CoachExceptionSignal[] = [];
    if (effort) signals.push({ reason: "repeated_effort_miss", action: "reduce_load", target: { ...effort, targetRir: prescription.targetRir },
      status: "recommended", sources: recent.map(exposure => exposure.source) });

    const floorTargets = recent.map(exposure => {
      const first = exposure.first;
      if (first.reps! >= prescription.repMin) return null;
      const target = sessionTarget(def, prescription, { weight: first.weight!, reps: first.reps!, rir: first.rir },
        definitions, [], def.equipment === "bodyweight" ? historicalBodyweight(first) : null);
      return target && target.weight < first.weight! ? target : null;
    });
    if (!effort && floorTargets.length === 2 && floorTargets.every(target => target != null)) {
      const target = floorTargets[1]!;
      signals.push({ reason: "repeated_rep_floor", action: "reduce_load",
        target: { weight: target.weight, targetReps: target.targetReps, targetRir: target.targetRir },
        status: "recommended", sources: recent.map(exposure => exposure.source) });
    }

    const plateau = detectPlateau(points, assessment.patience);
    const snoozed = folded.lastDismissAt != null && assessment.points.filter(point =>
      Date.parse(point.sessionAt) > Date.parse(folded.lastDismissAt!)).length < SNOOZE_EXPOSURES;
    const plateauSnoozed = plateau.plateaued && current.mode === "fluid" && snoozed;
    if (plateau.plateaued && !plateauSnoozed) {
      const evidence = { status: "recommended" as const, sources: exposures.map(exposure => exposure.source),
        plateau: { ...plateau, patience: assessment.patience } };
      const action = current.mode === "fluid" ? nextLadderAction(folded.ladderStep) : "review_plateau";
      signals.push(action === "rep_change"
        ? { ...evidence, reason: "confirmed_plateau", action, repBand: pickRepBand(folded, folded.recentBands) }
        : { ...evidence, reason: "confirmed_plateau", action });
    }

    const trend = classifyPerformanceTrend(points.map(point => point.bestE1rm));
    if (trend.classification === "declining" && !plateauSnoozed && !recent.some(exposure => exposure.point.repGain)) {
      signals.push({ reason: "sustained_decline", action: "review_trend", trend, status: "recommended",
        sources: exposures.slice(-4).map(exposure => exposure.source) });
    }
    if (signals.length) candidates.push(candidate(history.userId, { kind: "lift", slotId: slot.id, context }, signals));
  }
  return candidates.sort((a, b) => REASON_ORDER[a.signals[0].reason] - REASON_ORDER[b.signals[0].reason]);
}

function candidate(userId: string, scope: CoachExceptionCandidate["scope"], signals: CoachExceptionSignal[]): CoachExceptionCandidate {
  const dates = signals.flatMap(signal => signal.sources.map(source => source.performedAt)).sort();
  return { policyVersion: COACH_EXCEPTION_POLICY_VERSION, userId, scope, signals,
    evidenceStart: dates[0], evidenceEnd: dates[dates.length - 1] };
}
