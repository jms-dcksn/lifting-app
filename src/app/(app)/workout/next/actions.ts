"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProgram } from "@/lib/program";
import { loadNextWorkout } from "@/lib/next-workout";
import { WORKOUT_PLAN_COOKIE } from "@/lib/workout-plan";
import { isLoggableExercise } from "@/lib/station";
import { swapProgramSlotExercise } from "../../session/actions";

const PLAN_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

async function requireNextWorkout(key: string, slotId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("Please sign in again.");
  const program = await getActiveProgram(supabase, userId);
  if (!program?.days.length) throw new Error("No active program. Return home to choose a program.");
  const next = await loadNextWorkout(supabase, userId, program);
  if (next.open || next.key !== key) throw new Error("Your next workout changed. Return home and reopen it.");
  if (!next.day.slots.some((slot) => slot.id === slotId)) throw new Error("Exercise slot no longer exists.");
  return { next };
}

function writePlanCookie(key: string, choices: Record<string, string>) {
  const value = JSON.stringify({ key, choices });
  if (encodeURIComponent(value).length > 3800) {
    throw new Error("Too many planned changes. Start the workout to make more changes.");
  }
  return value;
}

export async function saveWorkoutChoice(
  key: string,
  slotId: string,
  exerciseId: string | null,
  scope: "workout" | "program" = "workout",
) {
  const { next } = await requireNextWorkout(key, slotId);
  if (exerciseId !== null && !isLoggableExercise(next.catalog[exerciseId])) {
    throw new Error("Choose a specific exercise or machine first.");
  }
  if (scope !== "workout" && scope !== "program") throw new Error("Invalid swap scope");

  if (exerciseId !== null && scope === "program") {
    await swapProgramSlotExercise({ programSlotId: slotId, exerciseId });
    const choices = { ...next.choices };
    delete choices[slotId];
    (await cookies()).set(WORKOUT_PLAN_COOKIE, writePlanCookie(key, choices), PLAN_COOKIE);
    revalidatePath("/");
    revalidatePath("/workout/next");
    return;
  }

  const choices = { ...next.choices };
  if (exerciseId === null) delete choices[slotId];
  else choices[slotId] = exerciseId;
  (await cookies()).set(WORKOUT_PLAN_COOKIE, writePlanCookie(key, choices), PLAN_COOKIE);
  revalidatePath("/");
  revalidatePath("/workout/next");
}
