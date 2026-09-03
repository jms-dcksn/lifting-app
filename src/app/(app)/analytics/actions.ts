"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const RECOMMENDATION_KEY = /^rec_[a-f0-9]{16}$/;
const DECISION_STATUSES = ["accepted", "dismissed", "deferred"] as const;
type DecisionStatus = (typeof DECISION_STATUSES)[number];

export async function saveCoachRecommendationDecision(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const recommendationKey = String(formData.get("recommendation_key") ?? "");
  const status = String(formData.get("status") ?? "") as DecisionStatus;
  if (!RECOMMENDATION_KEY.test(recommendationKey)) {
    throw new Error("Invalid recommendation key.");
  }
  if (!DECISION_STATUSES.includes(status)) {
    throw new Error("Invalid recommendation decision.");
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
  if (error) throw new Error(`Unable to save recommendation decision: ${error.message}`);

  revalidatePath("/analytics");
}
