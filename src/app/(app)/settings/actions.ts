"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveBodyweight(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const raw = Number(formData.get("bodyweight"));
  const bodyweight = Number.isFinite(raw) && raw > 0 ? raw : null;

  await supabase.from("profile").update({ bodyweight }).eq("id", userId);
  revalidatePath("/settings");
  revalidatePath("/");
}
