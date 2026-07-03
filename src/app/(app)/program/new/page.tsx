import { redirect } from "next/navigation";
import { getCatalogMap } from "@/lib/catalog";
import { recentExerciseIds } from "@/lib/program";
import { programIndexHref } from "@/lib/program-routes";
import { createClient } from "@/lib/supabase/server";
import { ProgramBuilder } from "../program-builder";

export default async function NewProgramPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const [recentIds, catalog] = await Promise.all([
    recentExerciseIds(supabase, userId),
    getCatalogMap(supabase, userId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
      <ProgramBuilder
        initial={null}
        recentIds={recentIds}
        catalog={Object.values(catalog)}
        afterSaveHref={programIndexHref()}
        cancelHref={programIndexHref()}
      />
    </div>
  );
}
