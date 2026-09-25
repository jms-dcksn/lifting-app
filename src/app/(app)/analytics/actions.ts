"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DECISION_STATUSES,
  type RecommendationDecisionStatus,
} from "@/lib/coach-recommendation-decisions";

const RECOMMENDATION_KEY = /^rec_[a-f0-9]{16}$/;

export type CoachDecisionResult =
  | { ok: true; deferredUntil: string | null }
  | { ok: false; error: string };

export type CoachAcceptAllResult = { ok: true } | { ok: false; error: string };

function refreshCoachSurfaces() {
  revalidatePath("/analytics");
  revalidatePath("/analytics/coach");
  revalidatePath("/analytics/month");
}

export async function saveCoachRecommendationDecision(input: {
  recommendationKey: string;
  status: RecommendationDecisionStatus | string;
}): Promise<CoachDecisionResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const recommendationKey = input.recommendationKey;
  const status = input.status;
  if (!RECOMMENDATION_KEY.test(recommendationKey)) {
    return { ok: false, error: "Invalid recommendation key." };
  }
  if (!DECISION_STATUSES.includes(status as RecommendationDecisionStatus)) {
    return { ok: false, error: "Invalid recommendation decision." };
  }

  const now = new Date();
  const deferredUntil = status === "deferred"
    ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const { error } = await supabase.from("coach_recommendation_decision").upsert(
    {
      user_id: userId,
      recommendation_key: recommendationKey,
      status,
      deferred_until: deferredUntil,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id,recommendation_key" },
  );
  if (error) return { ok: false, error: "Unable to save that decision. Try again." };

  refreshCoachSurfaces();
  return { ok: true, deferredUntil };
}

export async function acceptAllCoachRecommendations(
  recommendationKeys: string[],
): Promise<CoachAcceptAllResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const uniqueKeys = [...new Set(recommendationKeys)];
  if (
    uniqueKeys.length === 0
    || uniqueKeys.length > 100
    || uniqueKeys.some((key) => !RECOMMENDATION_KEY.test(key))
  ) {
    return { ok: false, error: "Invalid recommendation keys." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("coach_recommendation_decision").upsert(
    uniqueKeys.map((recommendationKey) => ({
      user_id: userId,
      recommendation_key: recommendationKey,
      status: "accepted" as const,
      deferred_until: null,
      updated_at: now,
    })),
    { onConflict: "user_id,recommendation_key" },
  );
  if (error) return { ok: false, error: "Unable to accept those recommendations. Try again." };

  refreshCoachSurfaces();
  return { ok: true };
}
