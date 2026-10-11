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

const SECONDARY_CLASS = {
  display: "text-body text-muted",
  heading: "text-body text-muted",
  body: "text-caption text-muted",
} as const;

const TERTIARY_CLASS = {
  display: "text-caption text-muted",
  heading: "text-caption text-muted",
  body: "text-caption text-muted",
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
    <Tag className={cx("min-w-0", className)}>
      <span className={cx("block", NAME_CLASS[size])}>{resolved.name}</span>
      {resolved.secondary ? (
        <span className={cx("block", SECONDARY_CLASS[size])}>{resolved.secondary}</span>
      ) : null}
      {resolved.tertiary ? (
        <span className={cx("block", TERTIARY_CLASS[size])}>{resolved.tertiary}</span>
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
