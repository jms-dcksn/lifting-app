"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Program, ProgramSlot } from "@/lib/program";
import { rirLabel, type ProgramPhase } from "@/lib/periodization";
import { programEditHref, programIndexHref } from "@/lib/program-routes";
import {
  PATTERN_LABEL,
  type Equipment,
  type ExerciseDef,
} from "@/lib/strength/coefficients";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { cloneProgram, setActiveProgram } from "./actions";

export function ProgramDetail({
  program,
  defs,
}: {
  program: Program;
  defs: Record<string, ExerciseDef>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const title = program.name.trim() || "Untitled program";
  const exerciseCount = program.days.reduce((count, day) => count + day.slots.length, 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header>
        <Link href={programIndexHref()} className="text-caption text-muted hover:text-foreground">
          ← Programs
        </Link>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-display">{title}</h1>
            <p className="text-body text-muted">
              {program.days.length} days/wk · {program.weeks} weeks · {exerciseCount} exercises · {program.style}
            </p>
          </div>
          {program.isActive && (
            <span className="shrink-0 rounded-control border border-border px-2 py-1 text-caption font-medium uppercase tracking-wide text-muted">
              active
            </span>
          )}
        </div>
        {program.description && (
          <p className="mt-3 whitespace-pre-line text-body text-muted">{program.description}</p>
        )}
        {program.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {program.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border px-2 py-0.5 text-caption text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      {program.phases.length > 0 && (
        <Card>
          <h2 className="text-heading">Weekly phases</h2>
          <p className="mt-1 text-caption text-muted">
            These rules replace the default set and RIR prescription during their week range.
          </p>
          <ol className="mt-3 flex flex-col gap-2">
            {program.phases.map((phase) => (
              <li key={phase.id} className="rounded-control bg-surface p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-body font-medium">{phase.name}</h3>
                  <span className="shrink-0 text-caption tabular-nums text-muted">
                    {weekRange(phase)}
                  </span>
                </div>
                <p className="mt-1 text-caption text-muted">
                  {phaseRir(phase)}
                  {phase.setMultiplier != null
                    ? ` · ${Math.round(phase.setMultiplier * 100)}% working sets`
                    : " · normal working sets"}
                </p>
                {phase.description && <p className="mt-2 text-body">{phase.description}</p>}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        {program.days.map((day) => (
          <Card key={day.id}>
            <h2 className="break-words text-heading">{day.name}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {day.slots.map((slot) => (
                <li key={slot.id} className="rounded-control bg-surface p-3">
                  <h3 className="break-words text-body font-medium">
                    {defs[slot.exerciseId]?.name ?? slot.exerciseId}
                  </h3>
                  <p className="mt-0.5 text-caption capitalize text-muted">
                    {slotMeta(defs, slot)}
                  </p>
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
      </div>

      {program.days.length === 0 && (
        <Card>
          <p className="text-body text-muted">No days</p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={programEditHref(program.id)}
          className={buttonClasses("secondary", "sm")}
        >
          Edit
        </Link>
        {!program.isActive && (
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
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const id = await cloneProgram(program.id);
              router.push(programEditHref(id));
            })
          }
        >
          Clone
        </Button>
      </div>
    </div>
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

function slotMeta(defs: Record<string, ExerciseDef>, slot: ProgramSlot) {
  const exercise = defs[slot.exerciseId];
  const pattern = PATTERN_LABEL[slot.pattern];
  return exercise ? `${pattern} / ${equipmentLabel(exercise.equipment)}` : pattern;
}

function equipmentLabel(equipment: Equipment) {
  return equipment.replace(/_/g, " ");
}

function repRange(slot: ProgramSlot) {
  return slot.repMin === slot.repMax ? slot.repMin : `${slot.repMin}-${slot.repMax}`;
}

function weekRange(phase: ProgramPhase) {
  return phase.weekStart === phase.weekEnd
    ? `Week ${phase.weekStart}`
    : `Weeks ${phase.weekStart}–${phase.weekEnd}`;
}

function phaseRir(phase: ProgramPhase) {
  return phase.targetRirMin == null || phase.targetRirMax == null
    ? "Default RIR"
    : `${rirLabel({ targetRirMin: phase.targetRirMin, targetRirMax: phase.targetRirMax })} RIR`;
}
