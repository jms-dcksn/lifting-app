"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ExerciseCardLabel, exerciseCardAriaLabel } from "@/components/ui/exercise-card-label";
import { ExerciseVisual } from "@/components/ui/exercise-visual";
import { Card, CardLabel } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import type { ExerciseDef, Pattern } from "@/lib/strength/coefficients";
import { canSwapStation } from "@/lib/station";
import { rirLabel, type EffectivePrescription } from "@/lib/periodization";
import { ExercisePicker } from "../../program/exercise-picker";
import { SwapStationButton } from "../../program/swap-station-button";
import { startPlannedSession } from "../../session/actions";
import { saveWorkoutChoice } from "./actions";

type Slot = { id: string; exerciseId: string; baseExerciseId: string; pattern: Pattern;
  prescription: EffectivePrescription; restSeconds: number };

export function WorkoutPlanner({ planKey, programName, dayName, week, slots, catalog: initialCatalog }: {
  planKey: string; programName: string; dayName: string; week: number; slots: Slot[]; catalog: ExerciseDef[];
}) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const catalogMap = Object.fromEntries(catalog.map((d) => [d.id, d]));
  const [pickingExercise, setPickingExercise] = useState<Slot | null>(null);
  const [pickedSwap, setPickedSwap] = useState<{ slot: Slot; exercise: ExerciseDef } | null>(null);
  const [pending, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const phase = slots[0]?.prescription.phase;

  function confirmSwap(scope: "workout" | "program") {
    if (!pickedSwap || pending) return;
    const { slot, exercise } = pickedSwap;
    setError(null);
    setNotice(null);
    startSaving(async () => {
      try {
        await saveWorkoutChoice(planKey, slot.id, exercise.id, scope);
        setPickedSwap(null);
        setPickingExercise(null);
        setNotice(scope === "program"
          ? "Saved for this day for the rest of your program."
          : "Saved for this workout only.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      }
    });
  }

  function reset(slotId: string) {
    setError(null);
    setNotice(null);
    startSaving(async () => {
      try {
        await saveWorkoutChoice(planKey, slotId, null);
        setNotice("Reset to program default.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-6 py-6">
      <Link href="/" className="w-fit text-body text-muted underline underline-offset-4">← Home</Link>
      <header>
        <p className="text-caption text-muted">{programName} · Week {week}</p>
        <h1 className="text-display">{dayName}</h1>
      </header>
      {phase && <Card><CardLabel>{phase.name}</CardLabel>{phase.description && <p className="mt-1 text-body text-muted">{phase.description}</p>}</Card>}
      <p className="text-caption text-muted">{slots.length} exercises · {slots.reduce((sum, s) => sum + s.prescription.targetSets, 0)} working sets</p>
      {slots.map((slot, index) => {
        const def = catalogMap[slot.exerciseId];
        const p = slot.prescription;
        const showStationSwap = canSwapStation(def, catalogMap);
        return <Card key={slot.id}>
          <CardLabel>Exercise {index + 1}</CardLabel>
          <div className="mt-1 flex items-start gap-3">
            <ExerciseVisual exerciseId={slot.exerciseId} baseExerciseId={def?.baseExerciseId ?? slot.baseExerciseId} size="lg" />
            {def ? (
              <ExerciseCardLabel as="h2" size="heading" def={def} catalog={catalogMap} />
            ) : (
              <h2 className="text-heading">{slot.exerciseId}</h2>
            )}
          </div>
          <p className="mt-2 text-body tabular-nums">{p.targetSets} sets × {p.repMin}{p.repMin !== p.repMax ? `–${p.repMax}` : ""} reps · {rirLabel(p)} RIR</p>
          <p className="mt-1 text-caption text-muted">Rest {slot.restSeconds} seconds between sets</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {showStationSwap && (
              <SwapStationButton
                exerciseId={slot.exerciseId}
                catalog={catalog}
                disabled={pending}
                onPick={(picked) => {
                  setError(null);
                  setPickedSwap({ slot, exercise: picked });
                }}
              />
            )}
            <Button
              type="button"
              variant={showStationSwap ? "ghost" : "secondary"}
              disabled={pending}
              onClick={() => setPickingExercise(slot)}
              aria-label={`Swap ${def ? exerciseCardAriaLabel(def, catalogMap) : slot.exerciseId} for another exercise`}
            >
              Swap exercise
            </Button>
            {slot.exerciseId !== slot.baseExerciseId && <Button type="button" variant="ghost" disabled={pending}
              onClick={() => reset(slot.id)}>Reset</Button>}
          </div>
        </Card>;
      })}
      <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error && <p role="alert" className="mb-3 text-caption text-danger">{error}</p>}
        <p role="status" className="mb-2 text-caption text-muted">{pending ? "Saving…" : notice}</p>
        <form action={startPlannedSession.bind(null, planKey)}>
          <Button size="lg" className="w-full" disabled={pending || !!pickingExercise || !!pickedSwap}>Start workout</Button>
        </form>
      </div>
      {pickingExercise && <ExercisePicker catalog={catalog} patternFilter={pickingExercise.pattern} resolveStations
        onPick={(def) => {
          setCatalog((current) => current.some((d) => d.id === def.id) ? current : [...current, def]);
          setPickedSwap({ slot: pickingExercise, exercise: def });
        }} onClose={() => setPickingExercise(null)} />}
      {pickedSwap && !pickingExercise && (
        <Sheet ariaLabel="Apply exercise swap" dismissible={!pending} onClose={() => setPickedSwap(null)}>
          <div className="flex flex-col gap-3 px-4 pb-6 pt-2">
            <div className="flex items-start gap-3">
              <ExerciseVisual exerciseId={pickedSwap.exercise.id} baseExerciseId={pickedSwap.exercise.baseExerciseId} />
              <div className="min-w-0">
                <p className="text-caption text-muted">Use for…</p>
                <ExerciseCardLabel as="h2" size="heading" def={pickedSwap.exercise} catalog={catalogMap} />
              </div>
            </div>
            <Button type="button" pending={pending} onClick={() => confirmSwap("workout")}>
              This workout only
            </Button>
            <Button type="button" variant="secondary" pending={pending} onClick={() => confirmSwap("program")}>
              Remainder of program
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setPickedSwap(null)}>Cancel</Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
