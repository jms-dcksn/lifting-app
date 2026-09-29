import { cx } from "./cx";
import { IconDumbbell } from "./icons";
import {
  exerciseVisualSrc,
  type ExerciseVisualSize,
} from "@/lib/exercise-visual";

const SIZES: Record<ExerciseVisualSize, string> = {
  sm: "h-9 w-16",
  lg: "h-16 w-[7.11rem]",
};

export function ExerciseVisual({
  exerciseId,
  baseExerciseId,
  size = "sm",
  className,
}: {
  exerciseId?: string | null;
  baseExerciseId?: string | null;
  size?: ExerciseVisualSize;
  className?: string;
}) {
  const src = exerciseVisualSrc(exerciseId, baseExerciseId);
  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-surface text-faint",
        SIZES[size],
        className,
      )}
      data-exercise-visual={src ? "image" : "icon"}
      aria-hidden
    >
      {src ? (
        // Static public URL — do not import the raster into client islands.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-full origin-center scale-[1.35] object-cover object-center"
        />
      ) : (
        <IconDumbbell size={size === "lg" ? 28 : 20} />
      )}
    </span>
  );
}
