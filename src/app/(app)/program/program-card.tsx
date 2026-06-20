"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Program, ProgramSlot } from "@/lib/program";
import {
  EXERCISE_BY_ID,
  PATTERN_LABEL,
  type Equipment,
} from "@/lib/strength/coefficients";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { cloneProgram, setActiveProgram } from "./actions";

export function ProgramCard({
  program,
  expanded,
  onToggle,
}: {
  program: Program;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const title = program.name.trim() || "Untitled program";
  const editHref = `/program?id=${encodeURIComponent(program.id)}&mode=edit`;

  return (
    <Card tone={program.isActive ? "active" : "default"} className="p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="break-words text-heading">{title}</span>
            {program.isActive && <ActivePill />}
          </span>
          <span className="mt-0.5 block text-caption text-muted">
            {program.weeks} wk · {program.days.length}{" "}
            {program.days.length === 1 ? "day" : "days"}
          </span>
          {program.tags.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1">
              {program.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border px-2 py-0.5 text-caption text-muted"
                >
                  {tag}
                </span>
              ))}
            </span>
          )}
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="animate-row-in border-t border-border p-4">
          {program.description && (
            <p className="mb-4 whitespace-pre-line text-body text-muted">
              {program.description}
            </p>
          )}

          <div className="flex flex-col gap-4">
            {program.days.map((day) => (
              <div key={day.id}>
                <h3 className="break-words text-body font-semibold">{day.name}</h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {day.slots.map((slot) => (
                    <li key={slot.id} className="rounded-control bg-surface p-3">
                      <h4 className="break-words text-body font-medium">
                        {exerciseName(slot.exerciseId)}
                      </h4>
                      <p className="mt-0.5 text-caption capitalize text-muted">{slotMeta(slot)}</p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
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
              </div>
            ))}
            {program.days.length === 0 && <p className="text-body text-muted">No days</p>}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={editHref} className={buttonClasses("secondary", "sm")}>
              Edit
            </Link>
            {!program.isActive && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  pending={pending}
                  onClick={() =>
                    start(async () => {
                      await setActiveProgram(program.id);
                      router.refresh();
                    })
                  }
                >
                  Make active
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const id = await cloneProgram(program.id);
                      router.push(`/program?id=${id}&mode=edit`);
                    })
                  }
                >
                  Clone
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function ActivePill() {
  return (
    <span className="rounded-control border border-border px-2 py-0.5 text-caption font-medium uppercase tracking-wide text-muted">
      active
    </span>
  );
}

function StaticMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-center text-[10px] uppercase tracking-wide text-muted">{label}</span>
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
