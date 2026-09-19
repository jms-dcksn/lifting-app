"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dateKey } from "@/lib/bodyweight";
import { parseMeasurementWrite } from "@/lib/body-measurements";

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (error || !userId) throw new Error("Sign in again to manage your measurements.");
  return { supabase, userId };
}

export async function writeMeasurements(input: unknown) {
  const { supabase, userId } = await requireUser();
  const parsed = parseMeasurementWrite(input, dateKey(new Date()));
  if (!parsed.ok) return parsed;
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from("body_measurement_log").upsert(
    parsed.readings.map((reading) => ({
      user_id: userId,
      logged_on: parsed.loggedOn,
      site: reading.site,
      inches: reading.inches,
      updated_at: updatedAt,
    })),
    { onConflict: "user_id,logged_on,site" },
  );
  if (error) {
    return { ok: false as const, error: "Unable to save your measurements. Please try again." };
  }
  revalidatePath("/analytics/body");
  return { ok: true as const };
}
