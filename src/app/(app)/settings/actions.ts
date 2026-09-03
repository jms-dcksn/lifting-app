"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dateKey } from "@/lib/bodyweight";

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

  // Clamp rest to a sane range; fall back to the 120s default on junk input.
  const rawRest = Number(formData.get("default_rest_seconds"));
  const defaultRestSeconds =
    Number.isFinite(rawRest) && rawRest > 0 ? Math.min(600, Math.round(rawRest)) : 120;

  const { error } = await supabase
    .from("profile")
    .update({
      goal_weight: goalWeight,
      default_rest_seconds: defaultRestSeconds,
    })
    .eq("id", userId)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to save profile: ${error.message}`);
  }

  revalidatePath("/settings");
  revalidatePath("/");
}

export async function saveBodyweightEntry(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const entryId = String(formData.get("entry_id") ?? "").trim() || null;
  const loggedOn = String(formData.get("logged_on") ?? "").trim();
  const weight = Number(formData.get("weight"));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(loggedOn) || loggedOn > dateKey(new Date())) {
    throw new Error("Choose today or an earlier valid date.");
  }
  if (!Number.isFinite(weight) || weight <= 0 || weight > 1500) {
    throw new Error("Enter a valid bodyweight in pounds.");
  }

  const now = new Date().toISOString();
  if (!entryId) {
    const { error } = await supabase.from("bodyweight_log").upsert(
      { user_id: userId, logged_on: loggedOn, weight, updated_at: now },
      { onConflict: "user_id,logged_on" },
    );
    if (error) throw new Error(`Unable to save weigh-in: ${error.message}`);
  } else {
    const { data: existing, error: existingError } = await supabase
      .from("bodyweight_log")
      .select("logged_on")
      .eq("id", entryId)
      .eq("user_id", userId)
      .single();
    if (existingError) throw new Error(`Unable to find weigh-in: ${existingError.message}`);

    if (existing.logged_on === loggedOn) {
      const { error } = await supabase
        .from("bodyweight_log")
        .update({ weight, updated_at: now })
        .eq("id", entryId)
        .eq("user_id", userId)
        .select("id")
        .single();
      if (error) throw new Error(`Unable to update weigh-in: ${error.message}`);
    } else {
      // Moving onto an occupied date deterministically replaces that date's value.
      // Upsert first so a failed write leaves the original observation intact.
      const { data: saved, error: saveError } = await supabase
        .from("bodyweight_log")
        .upsert(
          { user_id: userId, logged_on: loggedOn, weight, updated_at: now },
          { onConflict: "user_id,logged_on" },
        )
        .select("id")
        .single();
      if (saveError) throw new Error(`Unable to update weigh-in: ${saveError.message}`);

      if (saved.id !== entryId) {
        const { error: deleteError } = await supabase
          .from("bodyweight_log")
          .delete()
          .eq("id", entryId)
          .eq("user_id", userId)
          .select("id")
          .single();
        if (deleteError) {
          throw new Error(`Weigh-in moved, but the old entry could not be removed: ${deleteError.message}`);
        }
      }
    }
  }

  revalidateWeightPaths();
}

export async function deleteBodyweightEntry(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const entryId = String(formData.get("entry_id") ?? "").trim();
  if (!entryId) throw new Error("Missing weigh-in identifier.");

  const { error } = await supabase
    .from("bodyweight_log")
    .delete()
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("id")
    .single();
  if (error) throw new Error(`Unable to remove weigh-in: ${error.message}`);

  revalidateWeightPaths();
}

function revalidateWeightPaths() {
  revalidatePath("/settings");
  revalidatePath("/analytics");
  revalidatePath("/session/[id]", "page");
}
