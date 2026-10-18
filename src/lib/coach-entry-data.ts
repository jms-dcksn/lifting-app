import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { coachInboxEnabled, coachStateSnapshot, refreshCoachInbox } from "./coach-inbox-data";
import { openCoachEpisode } from "./coach-conversation-data";
import { coachConversationHref, type CoachFocus } from "./coach-entry";
import { parseCoachEpisode } from "./coach-storage";
import { exceptionCopy, signalCategory } from "./coach-episodes";

type Client = SupabaseClient<Database>;
export async function resolveCoachEntry(db: Client, userId: string, focus: CoachFocus) {
  const fallback = coachConversationHref(focus, null);
  if (!coachInboxEnabled()) return { kind: "navigate" as const, href: fallback };
  if ((await refreshCoachInbox(db, userId)).status !== "ready") return { kind: "unavailable" as const, href: fallback };
  const snapshot = await coachStateSnapshot(db, userId);
  const matches = snapshot.episodes.flatMap(row => {
    const episode = parseCoachEpisode(row.data);
    if (episode.state !== "open" || !episode.evidence) return [];
    const scope = episode.evidence.candidate.scope;
    const relevant = !focus.exerciseId || (scope.kind === "lift" && scope.context.exerciseId === focus.exerciseId
      && scope.context.equipmentInstanceId === focus.equipmentInstanceId);
    if (!relevant) return [];
    return [{ id: row.id, title: exceptionCopy(episode.evidence, signalCategory(episode.evidence.candidate.signals[0])).title,
      validity: episode.validity }];
  });
  if (matches.length === 1) {
    const thread = await openCoachEpisode(db, userId, matches[0].id);
    if (thread) return { kind: "navigate" as const, href: coachConversationHref(focus, thread) };
  }
  if (matches.length > 0) return { kind: "choose" as const, episodes: matches, href: fallback };
  return { kind: "navigate" as const, href: fallback };
}
