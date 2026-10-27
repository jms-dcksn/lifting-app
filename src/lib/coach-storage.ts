import { z } from "zod";
import { EPISODE_DEFAULTS_VERSION, validateCoachPreferences, type CoachEpisode, type CoachPreferences, type EpisodeEvidence } from "./coach-episodes";
import { COACH_EXCEPTION_POLICY_VERSION } from "./coach-exceptions";

const id = z.string().min(1);
const time = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
const nullableNumber = z.number().nullable();
const prescription = { repMin: z.number().int().positive(), repMax: z.number().int().positive() };
const context = z.object({
  programId: id, programDayId: id, exerciseId: id, equipmentInstanceId: id.nullable(),
  phaseId: id.nullable(), adaptationStartAt: time.nullable(), ...prescription,
  targetRirMin: z.number(), targetRirMax: z.number(), targetSets: z.number().positive(),
});
const source = z.object({ sessionId: id, performedAt: time, setIds: z.array(id), firstSetId: id.nullable() });
const signalBase = { status: z.literal("recommended"), sources: z.array(source).min(1) };
const target = z.object({ weight: z.number(), targetReps: z.number().int().positive(), targetRir: z.number() });
const plateau = z.object({ plateaued: z.boolean(), stalledExposures: count, stalledSinceDays: z.number().nonnegative(), patience: z.number().positive() });
const trendBase = { classification: z.enum(["gaining", "flat", "declining", "insufficient_data"]), evidenceExposureCount: count };
const trend = z.union([
  z.object({ ...trendBase, recentAverageE1rm: z.number(), previousAverageE1rm: z.number(), changePercent: z.number() }),
  z.object({ ...trendBase, recentAverageE1rm: z.null(), previousAverageE1rm: z.null(), changePercent: z.null() }),
]);
const signal = z.union([
  z.object({ ...signalBase, reason: z.literal("significant_pain"), action: z.literal("review_pain") }),
  z.object({ ...signalBase, reason: z.enum(["repeated_effort_miss", "repeated_rep_floor"]), action: z.literal("reduce_load"), target }),
  z.object({ ...signalBase, reason: z.literal("confirmed_plateau"), action: z.enum(["review_plateau", "swap"]), plateau }),
  z.object({ ...signalBase, reason: z.literal("confirmed_plateau"), action: z.literal("rep_change"), plateau, repBand: z.object(prescription) }),
  z.object({ ...signalBase, reason: z.literal("sustained_decline"), action: z.literal("review_trend"), trend }),
]);
const lastPerformance = z.object({ weight: z.number(), reps: z.number().int().positive(), rir: nullableNumber.optional() }).passthrough();
const performance = lastPerformance.extend({ programSlotId: id.nullable(), performedAt: time, e1rm: nullableNumber }).passthrough();
const targetPerformance = performance.extend({ exerciseId: id, equipmentInstanceId: id.nullable(), sessionId: id, setId: id });
const effectiveTarget = z.object({
  status: z.literal("current_target"),
  target: target.extend({ source: z.enum(["recommendation", "progression"]), confidence: z.enum(["calibrate", "low", "medium", "high"]).optional(), last: lastPerformance.optional() }).nullable(),
  reason: z.enum(["unavailable", "manual_target", "starting_weight", "recovery", "below_rep_floor", "add_load", "add_rep", "hold_load", "repeated_effort_miss"]),
  reference: z.object({ lastSameSlot: performance.nullable(), bestRecent: performance.nullable(), selected: performance.nullable() }),
  evidence: z.array(targetPerformance),
});
export const episodeEvidenceSchema: z.ZodType<EpisodeEvidence> = z.object({
  candidate: z.object({
    policyVersion: z.literal(COACH_EXCEPTION_POLICY_VERSION), userId: id,
    scope: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("session"), sessionIds: z.array(id).min(1) }),
      z.object({ kind: z.literal("lift"), slotId: id, context }),
    ]),
    signals: z.array(signal).min(1), evidenceStart: time, evidenceEnd: time,
  }),
  name: z.string(), values: z.array(z.object({ id, weight: z.number(), reps: z.number().int().positive(), rir: nullableNumber, e1rm: nullableNumber })),
  effectiveTarget: effectiveTarget.nullable(),
});
const episodeSchema: z.ZodType<CoachEpisode> = z.object({
  contextKey: id, family: z.enum(["session_pain", "lift_performance"]), occurrence: z.number().int().positive(), revision: z.number().int().positive(),
  state: z.enum(["open", "resolved", "superseded"]), validity: z.enum(["current", "stale", "invalidated", "blocked_by_pain"]),
  evidence: episodeEvidenceSchema.nullable(), fingerprint: z.string(), attentionHistory: z.array(id), frontier: z.array(id),
  terminalReason: z.string().nullable(), snoozeSourceIds: z.array(id).nullable(),
});
const preferencesSchema = z.object({
  pain: z.boolean(), reduction: z.boolean(), plateau: z.boolean(), decline: z.boolean(), quietEnabled: z.boolean(),
  quietStart: count.max(1439), quietEnd: count.max(1439), timeZone: id,
});
export const refreshResultSchema = z.object({
  status: z.enum(["ready", "refresh_required"]), arrival: z.object({ id: z.uuid(), title: z.string() }).nullable().optional(),
});

export class CoachStorageError extends Error {
  constructor(public readonly code: "invalid_data" | "unsupported_version") {
    super(code === "unsupported_version" ? "Coach data needs a supported app version. Please retry after updating." : "Coach data is unavailable. Please retry.");
  }
}

/** Unversioned JSON is the existing episodes-v1 format; the state row owns its version. */
export function requireCoachVersion(version: unknown = EPISODE_DEFAULTS_VERSION) {
  if (version !== EPISODE_DEFAULTS_VERSION) throw new CoachStorageError("unsupported_version");
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new CoachStorageError("invalid_data");
  return result.data;
}
export function parseCoachPreferences(input: unknown, version?: unknown): CoachPreferences {
  requireCoachVersion(version);
  try { return validateCoachPreferences(parse(preferencesSchema, input)); }
  catch (error) { if (error instanceof CoachStorageError) throw error; throw new CoachStorageError("invalid_data"); }
}
export function parseEpisodeEvidence(input: unknown): EpisodeEvidence {
  const version = z.object({ candidate: z.object({ policyVersion: z.string() }) }).safeParse(input);
  if (version.success && version.data.candidate.policyVersion !== COACH_EXCEPTION_POLICY_VERSION) throw new CoachStorageError("unsupported_version");
  return parse(episodeEvidenceSchema, input);
}
export function parseCoachEpisode(input: unknown, version?: unknown): CoachEpisode {
  requireCoachVersion(version);
  const envelope = z.object({ evidence: z.unknown() }).safeParse(input);
  if (envelope.success && envelope.data.evidence != null) parseEpisodeEvidence(envelope.data.evidence);
  const result = parse(episodeSchema, input);
  if (result.evidence) parseEpisodeEvidence(result.evidence);
  return result;
}
export function parseRefreshResult(input: unknown) { return parse(refreshResultSchema, input); }
