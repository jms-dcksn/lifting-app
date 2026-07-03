import { notFound, redirect } from "next/navigation";
import { getCatalogMap } from "@/lib/catalog";
import { getProgram, recentExerciseIds } from "@/lib/program";
import { programDetailHref } from "@/lib/program-routes";
import { createClient } from "@/lib/supabase/server";
import { ProgramBuilder } from "../program-builder";
import { ProgramDetail } from "../program-detail";

export default async function ProgramDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ id }, { mode }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const program = await getProgram(supabase, userId, id);
  if (!program) notFound();

  if (mode === "edit") {
    const [recentIds, catalog] = await Promise.all([
      recentExerciseIds(supabase, userId),
      getCatalogMap(supabase, userId),
    ]);
    const detailHref = programDetailHref(program.id);
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <ProgramBuilder
          initial={program}
          recentIds={recentIds}
          catalog={Object.values(catalog)}
          afterSaveHref={detailHref}
          cancelHref={detailHref}
        />
      </div>
    );
  }

  const catalog = await getCatalogMap(supabase, userId);
  return <ProgramDetail program={program} defs={catalog} />;
}
