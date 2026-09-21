"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import {
  canPinExercise,
  defaultCompoundIds,
  isExercisePinned,
  nextExtraPosition,
} from "@/lib/board";
import { needsStation } from "@/lib/strength/coefficients";
import { loadTrainedExerciseIds, loadUserPinRows } from "@/lib/pins-data";

const EXERCISE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (error || !userId) throw new Error("Sign in again to manage pins.");
  return { supabase, userId };
}

function refreshPinViews() {
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/settings");
  revalidatePath("/session/[id]", "page");
  revalidatePath("/history/[exerciseId]", "page");
}

export async function toggleExercisePin(exerciseId: string): Promise<
  { ok: true; pinned: boolean } | { ok: false; error: string }
> {
  const { supabase, userId } = await requireUser();
  if (!EXERCISE_ID.test(exerciseId)) return { ok: false, error: "Unknown exercise." };

  const [catalog, pins, historyIds] = await Promise.all([
    getCatalogMap(supabase, userId),
    loadUserPinRows(supabase, userId),
    loadTrainedExerciseIds(supabase, userId),
  ]);
  const def = catalog[exerciseId];
  if (!def) return { ok: false, error: "Choose a loggable exercise." };
  const defaults = defaultCompoundIds(catalog);
  // Default-compound tiles keep template ids (Slice 4 family-latest). Hide/unhide
  // those keys; extra pins still require a resolved, loggable identity.
  if (needsStation(def) && !defaults.includes(exerciseId)) {
    return { ok: false, error: "Choose a loggable exercise." };
  }
  const pinned = isExercisePinned(pins, defaults, exerciseId);
  const isDefault = defaults.includes(exerciseId);

  if (pinned) {
    if (isDefault) {
      const { error } = await supabase.from("user_exercise_pin").upsert({
        user_id: userId,
        exercise_id: exerciseId,
        position: 0,
        updated_at: new Date().toISOString(),
      });
      if (error) return { ok: false, error: "Unable to unpin. Please try again." };
    } else {
      const { error } = await supabase
        .from("user_exercise_pin")
        .delete()
        .eq("user_id", userId)
        .eq("exercise_id", exerciseId);
      if (error) return { ok: false, error: "Unable to unpin. Please try again." };
    }
    refreshPinViews();
    return { ok: true, pinned: false };
  }

  const allowed = canPinExercise(pins, defaults, historyIds, exerciseId);
  if (!allowed.ok) return allowed;

  if (isDefault) {
    const { error } = await supabase
      .from("user_exercise_pin")
      .delete()
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId);
    if (error) return { ok: false, error: "Unable to pin. Please try again." };
  } else {
    const { error } = await supabase.from("user_exercise_pin").insert({
      user_id: userId,
      exercise_id: exerciseId,
      position: nextExtraPosition(pins, defaults),
    });
    if (error) return { ok: false, error: "Unable to pin. Please try again." };
  }
  refreshPinViews();
  return { ok: true, pinned: true };
}
