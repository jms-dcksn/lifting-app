import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { monthRange, validWeightDate } from "./weight-calendar";

export type PeriodObservation = {
  id: string;
  observedOn: string;
};

export async function isEligibleForPeriodTracking(
  db: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data, error } = await db
    .from("profile")
    .select("sex, period_tracking_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.sex === "female" && data.period_tracking_enabled === true;
}

export async function loadPeriodObservations(
  db: SupabaseClient<Database>,
  userId: string,
  month: string
): Promise<PeriodObservation[]> {
  const { start, end } = monthRange(month);
  return loadPeriodObservationsInRange(db, userId, start, end);
}

export async function loadPeriodObservationsInRange(
  db: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string
): Promise<PeriodObservation[]> {
  const eligible = await isEligibleForPeriodTracking(db, userId);
  if (!eligible || start > end) return [];

  const { data, error } = await db
    .from("period_observation")
    .select("id, observed_on")
    .eq("user_id", userId)
    .gte("observed_on", start)
    .lte("observed_on", end)
    .order("observed_on", { ascending: true });

  if (error) throw new Error(`Unable to load period observations: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    observedOn: row.observed_on,
  }));
}

export type PeriodWriteResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function savePeriodObservation(
  db: SupabaseClient<Database>,
  userId: string,
  observedOn: string,
  today: string
): Promise<PeriodWriteResult> {
  const eligible = await isEligibleForPeriodTracking(db, userId);
  if (!eligible) {
    return { ok: false, error: "Period tracking not enabled or not eligible" };
  }

  if (!validWeightDate(observedOn, today)) {
    return { ok: false, error: "Choose today or an earlier valid date" };
  }

  const { data, error } = await db
    .from("period_observation")
    .upsert(
      {
        user_id: userId,
        observed_on: observedOn,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,observed_on",
        ignoreDuplicates: false,
      }
    )
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id };
}

export async function deletePeriodObservation(
  db: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const eligible = await isEligibleForPeriodTracking(db, userId);
  if (!eligible) {
    return { ok: false, error: "Period tracking not enabled or not eligible" };
  }

  const { error } = await db
    .from("period_observation")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteAllPeriodObservations(
  db: SupabaseClient<Database>,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db
    .from("period_observation")
    .delete()
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
