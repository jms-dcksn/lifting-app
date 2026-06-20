import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveProgram,
  getProgram,
  listPrograms,
  recentExerciseIds,
  type Program,
} from "@/lib/program";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { ProgramBuilder } from "./program-builder";
import { ProgramList } from "./program-list";
import { ProgramView } from "./program-view";
import { createFromTemplate } from "./actions";

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; mode?: string }>;
}) {
  const { id, mode } = await searchParams;
  const isNew = id === "new";
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const [programs, recent] = await Promise.all([
    listPrograms(supabase, userId),
    recentExerciseIds(supabase, userId),
  ]);

  let initial: Program | null = null;
  if (id && !isNew) initial = await getProgram(supabase, userId, id);
  else if (!id) initial = await getActiveProgram(supabase, userId);

  // First run, no programs: offer the template before showing a blank builder.
  if (!initial && programs.length === 0 && !isNew) {
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

  const editable = isNew || mode === "edit" || !initial;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
      {editable ? (
        <ProgramBuilder
          key={isNew ? "new" : (initial?.id ?? "new")}
          initial={isNew ? null : initial}
          recentIds={recent}
        />
      ) : initial ? (
        <ProgramView program={initial} />
      ) : null}
      <ProgramList programs={programs} selectedId={initial?.id ?? "new"} />
    </div>
  );
}
