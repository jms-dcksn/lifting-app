"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteAllPeriodObservations } from "@/lib/period-calendar";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

export async function saveProfile(formData: FormData) {
  const { supabase, userId } = await requireUser();

  const rawGoalWeight = Number(formData.get("goal_weight"));
  const goalWeight = Number.isFinite(rawGoalWeight) && rawGoalWeight > 0 ? rawGoalWeight : null;

  const rawRest = Number(formData.get("default_rest_seconds"));
  const defaultRestSeconds =
    Number.isFinite(rawRest) && rawRest > 0 ? Math.min(600, Math.round(rawRest)) : 120;

  const sex = formData.get("sex")?.toString() ?? "unspecified";
  if (!["unspecified", "male", "female"].includes(sex)) {
    throw new Error("Invalid sex value");
  }

  const { data: currentProfile } = await supabase
    .from("profile")
    .select("sex, period_tracking_enabled")
    .eq("id", userId)
    .single();

  const baseUpdates = {
    goal_weight: goalWeight,
    default_rest_seconds: defaultRestSeconds,
    sex,
  };

  const updates =
    currentProfile?.sex === "female" && sex !== "female" && currentProfile.period_tracking_enabled
      ? {
          ...baseUpdates,
          period_tracking_enabled: false,
          period_consent_version: null,
        }
      : baseUpdates;

  const { error } = await supabase
    .from("profile")
    .update(updates)
    .eq("id", userId)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to save profile: ${error.message}`);
  }

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/analytics");
}

export async function enablePeriodTracking() {
  const { supabase, userId } = await requireUser();

  const { data: profile } = await supabase
    .from("profile")
    .select("sex")
    .eq("id", userId)
    .single();

  if (profile?.sex !== "female") {
    throw new Error("Period tracking requires Female sex selection");
  }

  const { error } = await supabase
    .from("profile")
    .update({
      period_tracking_enabled: true,
      period_consent_version: "v1",
      period_consent_granted_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`Unable to enable period tracking: ${error.message}`);
  }

  revalidatePath("/settings");
  revalidatePath("/analytics");
}

export async function disablePeriodTracking(deleteHistory: boolean) {
  const { supabase, userId } = await requireUser();

  if (deleteHistory) {
    const result = await deleteAllPeriodObservations(supabase, userId);
    if (!result.ok) {
      throw new Error(result.error ?? "Unable to delete period history");
    }
  }

  const updates = deleteHistory
    ? {
        period_tracking_enabled: false,
        period_consent_version: null,
        period_consent_granted_at: null,
      }
    : {
        period_tracking_enabled: false,
      };

  const { error } = await supabase
    .from("profile")
    .update(updates)
    .eq("id", userId);

  if (error) {
    throw new Error(`Unable to disable period tracking: ${error.message}`);
  }

  revalidatePath("/settings");
  revalidatePath("/analytics");
}

export async function deletePeriodHistory() {
  const { supabase, userId } = await requireUser();

  const result = await deleteAllPeriodObservations(supabase, userId);
  if (!result.ok) {
    throw new Error(result.error ?? "Unable to delete period history");
  }

  const { error } = await supabase
    .from("profile")
    .update({
      period_consent_version: null,
      period_consent_granted_at: null,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`Unable to update profile: ${error.message}`);
  }

  revalidatePath("/settings");
}
