import { tempoSchema, type Tempo } from "./tempo";
import { z } from "zod";
import { effectiveSetCount, type EffectivePrescription } from "./periodization";
import { isLoggableExercise } from "./station";
import { validateSupersets } from "./superset";
import { validExerciseWeight } from "./strength/load-mode";
import type { ExerciseDef, Pattern } from "./strength/coefficients";

const reps = z.number().int().min(1).max(100);
const rir = z.number().min(0).max(5);
export const plannedSetSchema = z.object({
  id: z.string().uuid(), repMin: reps, repMax: reps,
  rirMin: rir, rirMax: rir, repsEdited: z.boolean(), rirEdited: z.boolean(),
  weight: z.number().finite().min(-2000).max(2000).nullable(),
  suggestedWeight: z.number().finite().nullable(),
  targetReps: reps, seedAt: z.string().datetime().nullable(), contextAt:z.string().datetime().nullable().optional(),
}).strict().refine(s => s.repMin <= s.repMax, { path: ["repMax"], message: "Maximum reps must be at least minimum reps." })
  .refine(s => s.rirMin <= s.rirMax, { path: ["rirMax"], message: "Maximum RIR must be at least minimum RIR." });
export type PlannedSet = z.infer<typeof plannedSetSchema>;
const slotSchema = z.object({
  tempo: tempoSchema.nullable().optional(), resolvedTempo: tempoSchema.optional(),
  id: z.string().uuid(), programSlotId: z.string().uuid().nullable(), exerciseId: z.string().min(1).max(250),
  equipmentInstanceId: z.string().uuid().nullable().optional(),
  pattern: z.string().min(1), restSeconds: z.number().int().min(0).max(1800),
  supersetGroup: z.string().max(16).nullable(), sets: z.array(plannedSetSchema).min(1).max(30),
  normalSets: z.array(plannedSetSchema).min(1).max(30).optional(),
}).strict();
export const draftVariantSchema = z.object({ id: z.string().min(1).max(250), baseExerciseId: z.string(), brand: z.string().max(100).nullable(), machineType: z.enum(["selectorized", "plate_loaded", "bench", "rack", "platform"]), stationModel: z.string().max(150).nullable() }).strict();
const phaseSchema = z.object({ id:z.string(),position:z.number().int(),name:z.string(),description:z.string().nullable(),
  weekStart:z.number().int(),weekEnd:z.number().int(),targetRirMin:z.number().nullable(),targetRirMax:z.number().nullable(),
  setMultiplier:z.number().nullable(),isDeload:z.boolean().optional() });
export const workoutEditorSchema = z.object({ version: z.literal(1), dayName:z.string().optional(),phase:phaseSchema.nullable().optional(), slots: z.array(slotSchema).min(1).max(100), variants: z.array(draftVariantSchema).max(100).optional() }).strict();
export type WorkoutEditorPlan = z.infer<typeof workoutEditorSchema>;
export type PlannedSlot = WorkoutEditorPlan["slots"][number];
export type EditorIssue = { path: string; message: string };

export function validateEditorPlan(value: unknown, catalog: Record<string, ExerciseDef>): EditorIssue[] {
  const parsed = workoutEditorSchema.safeParse(value);
  if (!parsed.success) return parsed.error.issues.map(e => ({ path: e.path.join("."), message: e.message }));
  const issues: EditorIssue[] = [];
  const ids = new Set<string>();
  for (const [i, slot] of parsed.data.slots.entries()) {
    if (ids.has(slot.id)) issues.push({ path: `slots.${i}`, message: "Exercise identifiers must be unique." });
    ids.add(slot.id);
    const def = catalog[slot.exerciseId];
    if (!isLoggableExercise(def) || def?.pattern !== slot.pattern) issues.push({ path: `slots.${i}.exerciseId`, message: "Choose a specific exercise or station first." });
    for (const [j, set] of slot.sets.entries()) {
      if (ids.has(set.id)) issues.push({ path: `slots.${i}.sets.${j}`, message: "Set identifiers must be unique." });
      ids.add(set.id);
      if (def && set.weight !== null && !validExerciseWeight(def, set.weight)) issues.push({ path: `slots.${i}.sets.${j}.weight`, message: "Enter a valid load for this equipment." });
      if (set.targetReps < set.repMin || set.targetReps > set.repMax) issues.push({ path: `slots.${i}.sets.${j}.targetReps`, message: "Target reps must be within the rep range." });
    }
  }
  const groupError = validateSupersets(parsed.data.slots);
  if (groupError) issues.push({ path: "slots", message: groupError });
  return issues;
}

export function normalizeGroups<T extends { supersetGroup?: string | null }>(slots: T[]): T[] {
  // A split run becomes independent exercises; singleton groups dissolve.
  const invalid = new Set<string>();
  for (const slot of slots) if (slot.supersetGroup) {
    const indexes = slots.flatMap((s, i) => s.supersetGroup === slot.supersetGroup ? [i] : []);
    if (indexes.length < 2 || indexes.at(-1)! - indexes[0] + 1 !== indexes.length) invalid.add(slot.supersetGroup);
  }
  return slots.map(s => invalid.has(s.supersetGroup ?? "") ? { ...s, supersetGroup: null } : s);
}

export function recoverySets(rows: PlannedSet[], prescription: EffectivePrescription): PlannedSet[] {
  if(!rows.length) return [];
  const phase = prescription.phase;
  const count = phase?.setMultiplier == null ? rows.length : effectiveSetCount(rows.length, phase.setMultiplier);
  const selected=Array.from({length:count},(_,i)=>rows[i]??{...rows[rows.length-1],
    id:rows[rows.length-1].id.slice(0,24)+(BigInt("0x"+rows[rows.length-1].id.slice(24))^BigInt(i+1)).toString(16).padStart(12,"0")});
  return selected.map(row => {
    const recovery = phase?.isDeload ?? (phase?.setMultiplier != null && phase.setMultiplier < 1);
    return { ...row,
      repMin: row.repsEdited ? row.repMin : prescription.repMin,
      repMax: row.repsEdited ? row.repMax : prescription.repMax,
      rirMin: recovery || !row.rirEdited ? prescription.targetRirMin : row.rirMin,
      rirMax: recovery || !row.rirEdited ? prescription.targetRirMax : row.rirMax,
    };
  });
}

export function newPlannedSet(id: string, p: Pick<EffectivePrescription, "repMin" | "repMax" | "targetRirMin" | "targetRirMax">,
  target?: { weight: number; targetReps: number } | null): PlannedSet {
  return { id, repMin: p.repMin, repMax: p.repMax, rirMin: p.targetRirMin, rirMax: p.targetRirMax,
    repsEdited: false, rirEdited: false, weight: null, suggestedWeight: target?.weight ?? null,
    targetReps: target?.targetReps ?? p.repMin, seedAt: null };
}

export function editorSlot(input: { tempo?: Tempo | null; resolvedTempo?: Tempo; id: string; exerciseId: string; pattern: Pattern; restSeconds: number;
  targetSets?:number;repMin?:number;repMax?:number;targetRir?:number;
  supersetGroup?: string | null; prescription: EffectivePrescription;
  targetContext?: {equipmentInstanceId: string | null} | null;
  effectiveTarget: { target: { weight: number; targetReps: number } | null }; plannedSets?: PlannedSet[]; normalSets?: PlannedSet[] }): PlannedSlot {
  const normalSets=input.normalSets ?? Array.from({length:input.targetSets??input.prescription.targetSets},(_,i)=>newPlannedSet(
    input.id.slice(0,24)+(i+1).toString(16).padStart(12,"0"),
    {repMin:input.repMin??input.prescription.repMin,repMax:input.repMax??input.prescription.repMax,
      targetRirMin:input.targetRir??input.prescription.targetRirMin,targetRirMax:input.targetRir??input.prescription.targetRirMax},input.effectiveTarget.target));
  return { tempo: input.tempo ?? null, resolvedTempo: input.resolvedTempo, id: input.id, programSlotId: input.id, exerciseId: input.exerciseId, pattern: input.pattern,
    equipmentInstanceId:input.targetContext?.equipmentInstanceId??null,
    restSeconds: input.restSeconds, supersetGroup: input.supersetGroup ?? null,
    sets: input.plannedSets ?? Array.from({ length: input.prescription.targetSets }, (_, i) => newPlannedSet(
      // Deterministic UUIDs for legacy uniform rows, distinct within an occurrence's slot.
      input.id.slice(0, 24) + (i + 1).toString(16).padStart(12, "0"), input.prescription, input.effectiveTarget.target)),
    normalSets };
}

export function parseStoredPlan(value: unknown): WorkoutEditorPlan {
  return workoutEditorSchema.parse(value);
}
