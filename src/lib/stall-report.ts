import type { CoachPhaseInput, CoachSessionInput, CoachSlotInput } from "./coach-check-in";
import { resolvePrescription } from "./periodization";
import type { ExerciseDef } from "./strength/coefficients";
import { defaultPatience, detectPlateau, foldPrescription, type AdaptationRow, type PhaseExposure } from "./strength/plateau";
import { eligibleRecordSet, recordScope, type RecordSet } from "./strength/records";

export type StallSession = Pick<CoachSessionInput, "id" | "performedAt" | "finishedAt" | "programId" | "programDayId" | "weekIndex">;
export interface StallSlot extends CoachSlotInput { plateauPatience?: number | null }
export interface StallAdaptation extends AdaptationRow { id: string; slotId: string; exerciseId?: string }
export interface StallHistory {
  userId: string;
  sessions: StallSession[];
  sets: RecordSet[];
  slots: StallSlot[];
  phases: CoachPhaseInput[];
  adaptations: StallAdaptation[];
}
export interface StallPoint extends PhaseExposure {
  sessionId: string;
  repGain: boolean;
}
export interface StallAssessment {
  slotId: string;
  exerciseId: string;
  equipmentInstanceId: string | null;
  name: string;
  state: "plateau" | "monitoring" | "insufficient_data" | "deload";
  patience: number;
  stalledExposures: number;
  stalledSinceDays: number;
  lastImprovementAt: string | null;
  phaseName: string | null;
  repMin: number;
  repMax: number;
  points: StallPoint[];
}

export function isDeload(phase: { name: string; description: string | null; setMultiplier: number | null } | null) {
  return !!phase && ((phase.setMultiplier != null && phase.setMultiplier < 1)
    || `${phase.name} ${phase.description ?? ""}`.toLowerCase().includes("deload"));
}

/** One contiguous slot/identity/prescription series. Never filter away intervening swaps. */
export function buildStallAssessments(history: StallHistory, catalog: Record<string, ExerciseDef>, asOf = new Date()): StallAssessment[] {
  const cutoff = asOf.getTime();
  const sessions = [...new Map(history.sessions.filter(s => s.finishedAt != null
    && Date.parse(s.finishedAt) <= cutoff && Date.parse(s.performedAt) <= cutoff).map(s => [s.id, s])).values()]
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.id.localeCompare(b.id));
  const bySlot = new Map<string, Map<string, RecordSet[]>>();
  for (const set of new Map(history.sets.filter(s => s.user_id === history.userId && !s.is_warmup).map(s => [s.id, s])).values()) {
    if (!set.program_slot_id) continue;
    const group = bySlot.get(set.program_slot_id) ?? new Map<string, RecordSet[]>();
    group.set(set.session_id, [...(group.get(set.session_id) ?? []), set]);
    bySlot.set(set.program_slot_id, group);
  }
  return history.slots.map(slot => {
    const adaptations = history.adaptations.filter(a => a.slotId === slot.id && Date.parse(a.createdAt) <= cutoff)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const phases = history.phases.filter(p => p.programId === slot.programId);
    let points: StallPoint[] = [];
    let context: string | null = null;
    let exerciseId = slot.exerciseId;
    let equipmentInstanceId: string | null = null;
    let phaseName: string | null = null;
    let repMin = slot.repMin;
    let repMax = slot.repMax;
    let deload = false;
    let lastSetAt = 0;
    for (const session of sessions) {
      if (session.programId !== slot.programId || session.programDayId !== slot.programDayId) continue;
      const sets = (bySlot.get(slot.id)?.get(session.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      if (!sets.length) continue;
      const last = sets[sets.length - 1];
      exerciseId = last.exercise_id;
      equipmentInstanceId = last.equipment_instance_id;
      // Late entry of an old workout must not borrow a later adaptation's context.
      lastSetAt = Date.parse(last.created_at) <= Date.parse(session.finishedAt!)
        ? Date.parse(last.created_at) : Date.parse(session.performedAt);
      const rows = adaptations.filter(a => Date.parse(a.createdAt) <= lastSetAt);
      const folded = foldPrescription(slot, rows);
      const prescription = resolvePrescription({ ...slot, repMin: folded.repMin, repMax: folded.repMax }, session.weekIndex ?? 1, phases);
      repMin = prescription.repMin;
      repMax = prescription.repMax;
      phaseName = prescription.phase?.name ?? null;
      deload = isDeload(prescription.phase);
      const nextContext = JSON.stringify([recordScope(last), prescription.phase?.id ?? null,
        folded.phaseStartAt, repMin, repMax, prescription.targetRirMin, prescription.targetRirMax, prescription.targetSets]);
      if (nextContext !== context) points = [];
      context = nextContext;
      // Mixed-identity sessions and missing historical estimates break evidence continuity.
      // A deload is a boundary, not a weak performance to count or skip over.
      const mixed = sets.some(s => recordScope(s) !== recordScope(last));
      const midSessionChange = folded.phaseStartAt != null && Date.parse(folded.phaseStartAt) > Date.parse(sets[0].created_at);
      const values = sets.map(set => ({ set, value: eligibleRecordSet(set, catalog[exerciseId]) }));
      if (deload || mixed || midSessionChange || values.some(({ set, value }) => !value || set.e1rm == null || !Number.isFinite(set.e1rm) || set.e1rm <= 0)
        || (phases.length > 0 && session.weekIndex == null)) {
        points = [];
        continue;
      }
      const repBests = new Map<number, number>();
      for (const { value } of values) repBests.set(value!.load, Math.max(repBests.get(value!.load) ?? 0, value!.reps));
      const priorReps = new Map<number, number>();
      for (const point of points) for (const mark of point.repBests ?? []) priorReps.set(mark.load, Math.max(priorReps.get(mark.load) ?? 0, mark.reps));
      const repGain = [...repBests].some(([load, reps]) => priorReps.has(load) && reps > priorReps.get(load)!);
      points.push({ sessionId: session.id, sessionAt: session.performedAt,
        bestE1rm: Math.max(...sets.map(s => Math.round(s.e1rm! * 10) / 10)),
        repBests: [...repBests].map(([load, reps]) => ({ load, reps })), repGain });
    }
    // An accepted change after the last workout invalidates its former plateau immediately.
    const current = foldPrescription(slot, adaptations);
    if (current.phaseStartAt && Date.parse(current.phaseStartAt) > lastSetAt) points = [];
    const def = catalog[exerciseId];
    const patience = slot.plateauPatience != null && slot.plateauPatience >= 1 ? slot.plateauPatience : def ? defaultPatience(def) : 3;
    const result = detectPlateau(points, patience);
    return { slotId: slot.id, exerciseId, equipmentInstanceId, name: def?.name ?? exerciseId,
      state: deload ? "deload" : result.plateaued ? "plateau" : points.length < patience + 1 ? "insufficient_data" : "monitoring",
      patience, stalledExposures: result.stalledExposures, stalledSinceDays: result.stalledSinceDays,
      lastImprovementAt: points[points.length - 1 - result.stalledExposures]?.sessionAt ?? null,
      phaseName, repMin, repMax, points };
  });
}
