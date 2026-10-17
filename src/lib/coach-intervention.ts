import { z } from "zod";
import type { CoachEpisode } from "./coach-episodes";
import { canonicalJson } from "./coach-episodes";
import type { PendingSuggestion } from "./fluid";

export const coachActionIntentSchema = z.object({
  episodeId: z.uuid(), occurrence: z.number().int().positive(), revision: z.number().int().positive(),
  requestId: z.uuid(), action: z.enum(["rep_change", "swap", "keep_going"]),
  replacementId: z.string().min(1).max(200).nullable(),
  sessionId: z.uuid().nullable(), scope: z.literal("program"),
}).strict().superRefine((value, ctx) => {
  if ((value.action === "swap") !== (value.replacementId !== null))
    ctx.addIssue({ code: "custom", message: "Choose a replacement only for a swap." });
});
export type CoachActionIntent = z.infer<typeof coachActionIntentSchema>;
export type CoachActionReceipt = {
  requestId: string; episodeId: string; action: CoachActionIntent["action"];
  status: "applied" | "snoozed"; adaptationId: string; sessionId: string | null;
  slotId: string; replacementId: string | null; repMin: number | null; repMax: number | null;
};
export const coachReceiptSchema: z.ZodType<CoachActionReceipt> = z.object({
  requestId: z.uuid(), episodeId: z.uuid(), action: z.enum(["rep_change", "swap", "keep_going"]),
  status: z.enum(["applied", "snoozed"]), adaptationId: z.uuid(), sessionId: z.uuid().nullable(),
  slotId: z.uuid(), replacementId: z.string().nullable(), repMin: z.number().nullable(), repMax: z.number().nullable(),
});

export function coachIntentFingerprint(intent: CoachActionIntent) { return canonicalJson(intent); }

/** A calculated target and a legacy review never authorize a structural change. */
export function availableCoachIntervention(episode: CoachEpisode, suggestion: PendingSuggestion | null) {
  if (episode.family !== "lift_performance" || episode.state !== "open" || episode.validity !== "current"
    || episode.snoozeSourceIds !== null || !suggestion) return null;
  const signal = episode.evidence?.candidate.signals.find(s => s.reason === "confirmed_plateau");
  if (!signal || signal.action !== suggestion.action) return null;
  if (signal.action === "rep_change" && (signal.repBand.repMin !== suggestion.repBand?.repMin
    || signal.repBand.repMax !== suggestion.repBand?.repMax)) return null;
  return suggestion;
}

export function episodeExplanation(episode: CoachEpisode, fresh: boolean) {
  if (episode.terminalReason === "intervention_applied") return "A confirmed intervention replaced this proposal. See the saved receipt below.";
  if (episode.terminalReason === "user_reported_ended") return "You reported this pain situation ended. This is not medical clearance.";
  if (episode.state === "resolved") return "New comparable evidence no longer supports this exception.";
  if (episode.state === "superseded") return "The original training context or evidence has changed.";
  if (!fresh) return "Current evidence could not be verified. Retry before making a training choice.";
  if (episode.validity === "blocked_by_pain") return "Performance choices are paused while a pain review is open.";
  if (episode.validity !== "current") return "Fresh comparable evidence is needed before making a training choice.";
  if (episode.snoozeSourceIds !== null) return "Keep going is snoozed for two new comparable exposures; training prescriptions are unchanged.";
  if (episode.family === "session_pain") return "Significant pain was reported for the session. No affected lift or pain-specific load reduction has been calculated. Acknowledgement does not resolve pain.";
  return "Review the evidence and current calculated target. Structural changes require your confirmation.";
}
