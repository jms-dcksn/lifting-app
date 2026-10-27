import { cx } from "./cx";
import {
  exerciseCardLabel,
  exerciseCardLabelText,
  type ExerciseCardLabelLines,
} from "@/lib/exercise-card-label";
import type { ExerciseDef } from "@/lib/strength/coefficients";

const NAME_CLASS = {
  display: "text-display",
  heading: "text-heading",
  body: "text-body font-medium",
} as const;

export function ExerciseCardLabel({
  def,
  catalog,
  lines,
  as: Tag = "div",
  size = "heading",
  className,
}: {
  def?: ExerciseDef;
  catalog?: Record<string, ExerciseDef>;
  lines?: ExerciseCardLabelLines;
  as?: "div" | "h1" | "h2" | "h3" | "p" | "span";
  size?: keyof typeof NAME_CLASS;
  className?: string;
}) {
  const resolved = lines ?? (def ? exerciseCardLabel(def, catalog) : { name: "" });
  return (
    <Tag className={cx("min-w-0 break-words", className)}>
      <span className={cx("block", NAME_CLASS[size])}>{resolved.name}</span>
      {resolved.equipment ? (
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-caption font-medium">
          <span className="rounded-full border border-border-strong bg-surface px-2 py-0.5 text-foreground">{resolved.equipment}</span>
          {resolved.station && <span className="text-muted">{resolved.station}</span>}
        </span>
      ) : null}
      {resolved.secondary || resolved.tertiary ? (
        <span className="mt-1 block text-caption font-normal text-muted">
          {[resolved.secondary, resolved.tertiary].filter(Boolean).join(" · ")}
        </span>
      ) : null}
    </Tag>
  );
}

export function exerciseCardAriaLabel(
  def: ExerciseDef,
  catalog?: Record<string, ExerciseDef>,
): string {
  return exerciseCardLabelText(exerciseCardLabel(def, catalog));
}
