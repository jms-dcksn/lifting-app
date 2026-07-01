import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import {
  getProgram,
  listProgramsFull,
  recentExerciseIds,
  type Program,
} from "@/lib/program";
import { PROGRAM_TEMPLATES } from "@/lib/program-templates";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { ProgramBuilder } from "./program-builder";
import { ProgramGallery, type TemplateSummary } from "./program-gallery";
import { createFromTemplate } from "./actions";

const TEMPLATE_SUMMARIES: TemplateSummary[] = PROGRAM_TEMPLATES.map((t) => ({
  id: t.id,
  name: t.name,
  dayCount: t.days.length,
  tags: t.tags,
}));

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; mode?: string }>;
}) {
  const { id, mode } = await searchParams;
  const isNew = id === "new";
  const isEdit = !!id && !isNew && mode === "edit";
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  // Builder: new program or editing an existing one.
  if (isNew || isEdit) {
    const [recent, builderCatalog] = await Promise.all([
      recentExerciseIds(supabase, userId),
      getCatalogMap(supabase, userId),
    ]);
    let initial: Program | null = null;
    if (isEdit) initial = await getProgram(supabase, userId, id!);
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <ProgramBuilder
          key={isNew ? "new" : (initial?.id ?? "new")}
          initial={isNew ? null : initial}
          recentIds={recent}
          catalog={Object.values(builderCatalog)}
          afterSaveHref="/program"
          cancelHref="/program"
        />
      </div>
    );
  }

  // Gallery (default).
  const [programs, catalog] = await Promise.all([
    listProgramsFull(supabase, userId),
    getCatalogMap(supabase, userId),
  ]);

  // First run, no programs: offer the template before showing a blank builder.
  if (programs.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-4 px-6 py-10">
        <div>
          <h1 className="text-display">Build your program</h1>
          <p className="text-body text-muted">Start from a template, or build one from scratch.</p>
        </div>
        <ul className="flex flex-col gap-3">
          {PROGRAM_TEMPLATES.map((t) => (
            <li key={t.id}>
              <form action={createFromTemplate.bind(null, t.id)} className="flex flex-col gap-1">
                <Button size="lg" className="w-full">
                  Start with {t.name}
                </Button>
                <p className="text-caption text-muted">
                  {t.days.length} days/wk · {t.tags.join(" · ")}
                </p>
              </form>
            </li>
          ))}
        </ul>
        <a href="/program?id=new" className={buttonClasses("secondary", "lg", "w-full")}>
          Build from scratch
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
      <ProgramGallery programs={programs} defs={catalog} templates={TEMPLATE_SUMMARIES} />
    </div>
  );
}
