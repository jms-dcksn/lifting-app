"use server";
import { z } from "zod";
import { parseCoachEpisode, requireCoachVersion } from "@/lib/coach-storage";
import { createClient } from "@/lib/supabase/server";
import {
  coachInboxEnabled,
  coachJson,
  parseCoachNotice,
  loadCoachInbox,
  refreshCoachInbox,
  reportPainEnded,
} from "@/lib/coach-inbox-data";
import {
  validateCoachPreferences,
  type CoachPreferences,
} from "@/lib/coach-episodes";

async function requireUser() {
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) throw new Error("Sign in to open Coach.");
  return { client, userId };
}
export async function refreshInbox(allowArrival = false) {
  const { client, userId } = await requireUser();
  const refresh = await refreshCoachInbox(
    client,
    userId,
    allowArrival === true,
  );
  if (refresh.status === "disabled") return { refresh, page: null };
  try {
    return { refresh, page: await loadCoachInbox(client, userId) };
  } catch {
    return { refresh: { status: "unavailable" as const }, page: null };
  }
}
export async function moreNotices(cursor: string) {
  const { client, userId } = await requireUser();
  if (!coachInboxEnabled()) throw new Error("Coach inbox is unavailable.");
  return loadCoachInbox(client, userId, z.string().max(250).parse(cursor));
}
export async function markNotice(id: string, acknowledge = false) {
  const { client } = await requireUser();
  const { error } = await client.rpc("mark_coach_notice", {
    p_id: z.uuid().parse(id),
    p_acknowledge: acknowledge === true,
  });
  if (error) throw new Error("Unable to update this notice. Please retry.");
}
export async function savePreferences(
  input: CoachPreferences,
  version: number,
) {
  const { client } = await requireUser();
  const settings = validateCoachPreferences(input);
  const { error } = await client.rpc("save_coach_preferences", {
    p_settings: coachJson(settings),
    p_version: z.number().int().nonnegative().parse(version),
  });
  if (error)
    throw new Error(
      "Preferences changed or could not be saved. Reload and try again.",
    );
}
export async function endPainReview(episodeId: string, revision: number) {
  const { client, userId } = await requireUser();
  await reportPainEnded(
    client,
    userId,
    episodeId,
    z.number().int().positive().parse(revision),
  );
}
export async function clearInboxHistory(confirmed: boolean) {
  if (confirmed !== true)
    throw new Error("Confirm before clearing Coach history.");
  const { client } = await requireUser();
  const { error } = await client.rpc("clear_coach_history", {});
  if (error) throw new Error("Unable to clear Coach history. Please retry.");
}
export async function openNotice(id: string) {
  const { client, userId } = await requireUser();
  z.uuid().parse(id);
  const refresh = await refreshCoachInbox(client, userId);
  const [noticeResult, stateResult] = await Promise.all([
    client.from("coach_notice").select("*").eq("user_id", userId).eq("id", id).maybeSingle(),
    client.from("coach_refresh_state").select("defaults_version").eq("user_id", userId).maybeSingle(),
  ]);
  const { data: notice, error } = noticeResult;
  const { data: state, error: stateError } = stateResult;
  if (error || stateError) throw new Error("Unable to load this notice.");
  if (!notice) return null;
  const { data: episode, error: episodeError } = await client
    .from("coach_episode")
    .select("id,data")
    .eq("user_id", userId)
    .eq("id", notice.episode_id)
    .maybeSingle();
  if (episodeError || !episode) return null;
  requireCoachVersion(state?.defaults_version);
  const validatedNotice = parseCoachNotice(notice);
  const validatedEpisode = parseCoachEpisode(episode.data, state?.defaults_version);
  await markNotice(id);
  return {
    notice: validatedNotice,
    episode: validatedEpisode,
    episodeId: episode.id,
    fresh: refresh.status === "ready",
  };
}
