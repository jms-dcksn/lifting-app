"use server";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachEntry } from "@/lib/coach-entry-data";
import { parseCoachFocus, type CoachFocus } from "@/lib/coach-entry";
export async function openRelevantCoach(input: CoachFocus) {
  const db = await createClient();
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims?.sub) throw Error("Sign in to open Coach.");
  const focus = parseCoachFocus({ exercise: input?.exerciseId, equipment: input?.equipmentInstanceId, month: input?.month });
  return resolveCoachEntry(db, data.claims.sub, focus);
}
