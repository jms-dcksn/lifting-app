import Link from "next/link";
import type { ProgramSummary } from "@/lib/program-summary";
import { programDetailHref } from "@/lib/program-routes";
import { cx } from "@/components/ui/cx";
import { RemoveProgramButton } from "./remove-program-button";

export function ProgramTile({ program }: { program: ProgramSummary }) {
  const title = program.name.trim() || "Untitled program";
  const primaryTag = program.tags[0];

  return (
    <div
      className={cx(
        "relative flex min-h-36 flex-col rounded-card border p-4 transition-[border-color,background-color] hover:border-border-strong active:bg-surface",
        program.isActive ? "border-border-strong" : "border-border",
      )}
    >
      <Link
        href={programDetailHref(program.id)}
        className="absolute inset-0 rounded-card"
        aria-label={title}
      />
      <span className="relative flex items-start justify-between gap-3">
        <span className="min-w-0 break-words text-heading">{title}</span>
        <span className="relative z-10 flex shrink-0 items-start gap-1">
          {program.isActive && (
            <span className="mt-1.5 rounded-control border border-border px-2 py-0.5 text-caption font-medium uppercase tracking-wide text-muted">
              active
            </span>
          )}
          <RemoveProgramButton programId={program.id} name={title} variant="icon" />
        </span>
      </span>

      <span className="mt-auto pt-5 text-caption text-muted">
        {program.dayCount} days/wk · {program.weeks} weeks · {program.exerciseCount} exercises
      </span>

      <span className="mt-2 flex flex-wrap gap-1">
        <span className="rounded-full border border-border px-2 py-0.5 text-caption text-muted">
          {program.style}
        </span>
        {primaryTag && (
          <span className="rounded-full border border-border px-2 py-0.5 text-caption text-muted">
            {primaryTag}
          </span>
        )}
      </span>
    </div>
  );
}
