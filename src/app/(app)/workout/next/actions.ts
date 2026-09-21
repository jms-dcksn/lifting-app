"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProgram } from "@/lib/program";
import { loadNextWorkout } from "@/lib/next-workout";
import { WORKOUT_PLAN_COOKIE } from "@/lib/workout-plan";
import { isLoggableExercise } from "@/lib/station";

export async function saveWorkoutChoice(key: string, slotId: string, exerciseId: string | null) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("Please sign in again.");
  const program = await getActiveProgram(supabase, userId);
  if (!program?.days.length) throw new Error("No active program. Return home to choose a program.");
  const next = await loadNextWorkout(supabase, userId, program);
  if (next.open || next.key !== key) throw new Error("Your next workout changed. Return home and reopen it.");
  if (!next.day.slots.some((slot) => slot.id === slotId)) throw new Error("Exercise slot no longer exists.");
  if (exerciseId !== null && !isLoggableExercise(next.catalog[exerciseId])) {
    throw new Error("Choose a specific exercise or machine first.");
  }
  const choices = { ...next.choices };
  if (exerciseId === null) delete choices[slotId];
  else choices[slotId] = exerciseId;
  const value = JSON.stringify({ key, choices });
  if (encodeURIComponent(value).length > 3800) throw new Error("Too many planned changes. Start the workout to make more changes.");
  (await cookies()).set(WORKOUT_PLAN_COOKIE, value, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/");
  revalidatePath("/workout/next");
}
