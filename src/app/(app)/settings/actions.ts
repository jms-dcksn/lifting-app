"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const rawBodyweight = Number(formData.get("bodyweight"));
  const bodyweight = Number.isFinite(rawBodyweight) && rawBodyweight > 0 ? rawBodyweight : null;

  const rawGoalWeight = Number(formData.get("goal_weight"));
  const goalWeight = Number.isFinite(rawGoalWeight) && rawGoalWeight > 0 ? rawGoalWeight : null;

  // Clamp rest to a sane range; fall back to the 120s default on junk input.
  const rawRest = Number(formData.get("default_rest_seconds"));
  const defaultRestSeconds =
    Number.isFinite(rawRest) && rawRest > 0 ? Math.min(600, Math.round(rawRest)) : 120;

  await supabase.from("profile").update({
    bodyweight,
    goal_weight: goalWeight,
    default_rest_seconds: defaultRestSeconds,
  }).eq("id", userId);

  revalidatePath("/settings");
  revalidatePath("/");
}
