import Link from "next/link";
import type { Program, ProgramSlot } from "@/lib/program";
import {
  EXERCISE_BY_ID,
  PATTERN_LABEL,
  type Equipment,
} from "@/lib/strength/coefficients";
import { buttonClasses } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";

export function ProgramView({ program }: { program: Program }) {
  const editHref = `/program?id=${encodeURIComponent(program.id)}&mode=edit`;
  const title = program.name.trim() || "Untitled program";

  return (
    <div className="flex flex-1 flex-col gap-5 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-page flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-display">{title}</h1>
            <p className="text-body text-muted">
              {program.weeks} {program.weeks === 1 ? "week" : "weeks"} -{" "}
              {program.days.length} {program.days.length === 1 ? "day" : "days"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={editHref}
              aria-label={`Edit ${title}`}
              className={buttonClasses("secondary", "sm")}
            >
              Edit
            </Link>
            {program.isActive && (
              <span className="rounded-control border border-border px-2 py-1 text-caption font-medium uppercase tracking-wide text-muted">
                active
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-4 sm:overflow-x-auto sm:pb-3">
        {program.days.map((day) => (
          <Card key={day.id} className="sm:w-80 sm:shrink-0">
            <h2 className="break-words text-heading">{day.name}</h2>

            <ul className="mt-3 flex flex-col gap-2">
              {day.slots.map((slot) => (
                <li key={slot.id} className="rounded-control bg-surface p-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-body font-medium">
                      {exerciseName(slot.exerciseId)}
                    </h3>
                    <p className="mt-0.5 text-caption capitalize text-muted">
                      {slotMeta(slot)}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <StaticMetric label="Sets" value={slot.targetSets} />
                    <StaticMetric label="Reps" value={repRange(slot)} />
                    <StaticMetric label="RIR" value={slot.targetRir} />
                  </div>
                </li>
              ))}
              {day.slots.length === 0 && (
                <li className="rounded-control bg-surface p-3 text-body text-muted">
                  No exercises
                </li>
              )}
            </ul>
          </Card>
        ))}

        {program.days.length === 0 && (
          <Card className="sm:w-80 sm:shrink-0">
            <h2 className="text-heading">No days</h2>
          </Card>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 px-4 py-3 backdrop-blur [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-page">
          <Link href={editHref} className={buttonClasses("secondary", "lg", "w-full")}>
            Edit program
          </Link>
        </div>
      </div>
    </div>
  );
}

function StaticMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-center text-[10px] uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="flex h-11 min-w-0 items-center justify-center rounded-control border border-border-strong bg-background px-1 text-center text-sm font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function exerciseName(id: string) {
  return EXERCISE_BY_ID[id]?.name ?? id;
}

function slotMeta(slot: ProgramSlot) {
  const exercise = EXERCISE_BY_ID[slot.exerciseId];
  const pattern = PATTERN_LABEL[slot.pattern];
  if (!exercise) return pattern;
  return `${pattern} / ${equipmentLabel(exercise.equipment)}`;
}

function equipmentLabel(equipment: Equipment) {
  return equipment.replace(/_/g, " ");
}

function repRange(slot: ProgramSlot) {
  return slot.repMin === slot.repMax ? slot.repMin : `${slot.repMin}-${slot.repMax}`;
}
