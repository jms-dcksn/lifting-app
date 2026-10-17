"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { confirmCoachEpisodeAction, loadEpisodeReview, openCoachEpisode } from "@/lib/coach-conversation-data";
import { coachInboxEnabled, coachStateSnapshot, refreshCoachInbox } from "@/lib/coach-inbox-data";
import { type CoachActionIntent } from "@/lib/coach-intervention";
import { WORKOUT_PLAN_COOKIE } from "@/lib/workout-plan";

async function user() {
  const db = await createClient();
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims?.sub) throw Error("Sign in to open Coach.");
  return { db, userId: data.claims.sub };
}
export async function episodeReview(episodeId: string) {
  const { db, userId } = await user();
  return loadEpisodeReview(db, userId, z.uuid().parse(episodeId));
}
export async function threadReview(threadId: string) {
  const { db, userId } = await user();
  if (!coachInboxEnabled()) return null;
  const { data, error } = await db.from("coach_episode_thread").select("episode_id").eq("user_id", userId).eq("thread_id", z.uuid().parse(threadId)).maybeSingle();
  if (error) throw Error("Coach context is unavailable.");
  return data ? loadEpisodeReview(db, userId, data.episode_id) : null;
}
export async function discussEpisode(episodeId: string) {
  const { db, userId } = await user();
  return openCoachEpisode(db, userId, z.uuid().parse(episodeId));
}
export async function confirmEpisode(input: CoachActionIntent) {
  const { db, userId } = await user();
  if (!coachInboxEnabled()) throw Error("Coach actions are unavailable.");
  const receipt = await confirmCoachEpisodeAction(db, userId, input);
  // Retry cleanup even when the database returned an existing receipt. Preserve other slots.
  if (receipt.action === "swap") {
    const jar = await cookies();
    try {
      const plan = JSON.parse(jar.get(WORKOUT_PLAN_COOKIE)?.value ?? "null");
      if (plan?.choices && typeof plan.choices === "object" && !Array.isArray(plan.choices)) {
        delete plan.choices[receipt.slotId];
        jar.set(WORKOUT_PLAN_COOKIE, JSON.stringify(plan), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 604800 });
      }
    } catch { /* A malformed browser plan cannot undo the committed intervention. */ }
  }
  await refreshCoachInbox(db, userId);
  revalidatePath("/"); revalidatePath("/coach", "layout"); revalidatePath("/program", "layout");
  if (receipt.sessionId) revalidatePath(`/session/${receipt.sessionId}`);
  return receipt;
}
export async function reviewForSlot(slotId: string) {
  const { db, userId } = await user();
  z.uuid().parse(slotId);
  if ((await refreshCoachInbox(db, userId)).status !== "ready") throw Error("Coach review is unavailable. Please retry.");
  const snapshot = await coachStateSnapshot(db, userId);
  const row = snapshot.episodes.find(row => {
    const episode = snapshot.previous.find(e => e.contextKey === row.context_key);
    return episode?.state === "open" && episode.evidence?.candidate.scope.kind === "lift" && episode.evidence.candidate.scope.slotId === slotId;
  });
  if (!row) throw Error("No current exception needs review for this lift.");
  return row.id;
}
