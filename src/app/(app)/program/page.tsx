import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProgram,
  listProgramsFull,
  recentExerciseIds,
  type Program,
} from "@/lib/program";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { ProgramBuilder } from "./program-builder";
import { ProgramGallery } from "./program-gallery";
import { createFromTemplate } from "./actions";

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
    const recent = await recentExerciseIds(supabase, userId);
    let initial: Program | null = null;
    if (isEdit) initial = await getProgram(supabase, userId, id!);
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <ProgramBuilder
          key={isNew ? "new" : (initial?.id ?? "new")}
          initial={isNew ? null : initial}
          recentIds={recent}
          afterSaveHref="/program"
          cancelHref="/program"
        />
      </div>
    );
  }

  // Gallery (default).
  const programs = await listProgramsFull(supabase, userId);

  // First run, no programs: offer the template before showing a blank builder.
  if (programs.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-4 px-6 py-10">
        <div>
          <h1 className="text-display">Build your program</h1>
          <p className="text-body text-muted">Start from a template, or build one from scratch.</p>
        </div>
        <form action={createFromTemplate}>
          <Button size="lg" className="w-full">
            Start with Push / Pull / Legs
          </Button>
        </form>
        <a href="/program?id=new" className={buttonClasses("secondary", "lg", "w-full")}>
          Build from scratch
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
      <ProgramGallery programs={programs} />
    </div>
  );
}
