"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadPreviousNotes, type NotesSelection } from "@/lib/previous-notes";

const selectionSchema = z.object({
  exerciseId:z.string().min(1).max(300), equipmentInstanceId:z.uuid().nullable(),
  excludeSessionId:z.uuid().optional(),
  cursor:z.object({finishedAt:z.iso.datetime({offset:true}),id:z.uuid()}).nullable().optional(),
});
export async function getPreviousNotes(input: NotesSelection) {
  const selection = selectionSchema.parse(input);
  const db = await createClient();
  const {data,error} = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if(error || typeof userId !== "string") throw new Error("Please sign in to read previous notes.");
  return loadPreviousNotes(db,userId,selection);
}
