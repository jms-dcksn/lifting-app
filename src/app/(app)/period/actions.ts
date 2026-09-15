"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dateKey } from "@/lib/bodyweight";
import { monthRange } from "@/lib/weight-calendar";
import {
  loadPeriodObservations,
  savePeriodObservation as savePeriodObs,
  deletePeriodObservation as deletePeriodObs,
  type PeriodObservation,
} from "@/lib/period-calendar";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

export async function loadPeriodMonth(
  month: string
): Promise<{ observations: PeriodObservation[]; today: string }> {
  const { supabase, userId } = await requireUser();
  monthRange(month);
  const observations = await loadPeriodObservations(supabase, userId, month);
  return { observations, today: dateKey(new Date()) };
}

export async function savePeriodObservation(
  date: string
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireUser();
  const today = dateKey(new Date());
  const result = await savePeriodObs(supabase, userId, date, today);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/analytics");
  }
  return result;
}

export async function deletePeriodObservation(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireUser();
  const result = await deletePeriodObs(supabase, userId, id);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/analytics");
  }
  return result;
}
