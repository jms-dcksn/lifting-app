"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dateKey } from "@/lib/bodyweight";
import { monthRange, validWeightDate } from "@/lib/weight-calendar";
import type { WeightWrite, WeightWriteResult } from "@/lib/weight-calendar-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (error || !userId) throw new Error("Sign in again to manage your weight history.");
  return { supabase, userId };
}

export async function loadWeightMonth(month: string) {
  const { supabase, userId } = await requireUser();
  const today = dateKey(new Date());
  const { start, end } = monthRange(month);
  if (start > today) throw new Error("Choose this month or an earlier month.");
  const { data, error } = await supabase.from("bodyweight_log")
    .select("id, logged_on, weight").eq("user_id", userId)
    .gte("logged_on", start).lte("logged_on", end).order("logged_on");
  if (error) throw new Error("Unable to load weight history. Please try again.");
  // At most 31 rows: the database enforces one observation per user/date.
  return { today, entries: (data ?? []).map(row => ({ id: row.id, loggedOn: row.logged_on, weight: row.weight })) };
}

export async function writeWeightEntry(input: WeightWrite): Promise<WeightWriteResult> {
  const { supabase, userId } = await requireUser();
  if (!input || !validWeightDate(input.loggedOn, dateKey(new Date()))) {
    return { ok: false, error: "Choose today or an earlier valid date." };
  }
  if (!Number.isFinite(input.weight) || input.weight <= 0 || input.weight > 1500) {
    return { ok: false, error: "Enter a weight greater than 0 and no more than 1,500 lb." };
  }
  if ((input.entryId != null && !UUID.test(input.entryId))
    || (input.replaceEntryId != null && !UUID.test(input.replaceEntryId))) {
    return { ok: false, error: "This reading is no longer available. Reload the calendar." };
  }
  const { data, error } = await supabase.rpc("save_bodyweight_entry", {
    p_entry_id: input.entryId,
    p_logged_on: input.loggedOn,
    p_weight: input.weight,
    p_replace_entry_id: input.replaceEntryId ?? null,
  });
  if (error?.code === "23505") {
    const { data: existing, error: readError } = await supabase.from("bodyweight_log")
      .select("id, logged_on, weight").eq("user_id", userId).eq("logged_on", input.loggedOn).maybeSingle();
    if (!readError && existing) return {
      ok: false, error: "That date already has a reading. Replace it?",
      conflict: { id: existing.id, loggedOn: existing.logged_on, weight: existing.weight },
    };
  }
  if (error || !data) return { ok: false, error: error?.code === "P0002"
    ? "This reading was removed. Reload the calendar before trying again."
    : "Unable to save your reading. Your changes have not been applied. Please try again." };
  refreshWeightViews();
  return { ok: true, id: data };
}

export async function removeWeightEntry(id: string) {
  const { supabase, userId } = await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Invalid reading." };
  const { error } = await supabase.from("bodyweight_log").delete()
    .eq("id", id).eq("user_id", userId).select("id").single();
  if (error) return { ok: false, error: "Unable to remove this reading. Reload the calendar and try again." };
  refreshWeightViews();
  return { ok: true };
}

function refreshWeightViews() {
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/analytics");
  revalidatePath("/analytics/month");
  revalidatePath("/workout/next");
  revalidatePath("/session/[id]", "page");
}
