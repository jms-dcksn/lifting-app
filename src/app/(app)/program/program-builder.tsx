"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EXERCISE_BY_ID, type ExerciseDef } from "@/lib/strength/coefficients";
import type { Program } from "@/lib/program";
import { saveProgram, type SaveDayInput, type SaveSlotInput } from "./actions";
import { ExercisePicker } from "./exercise-picker";

const uid = () => crypto.randomUUID();

function blankProgram(): Program {
  return { id: uid(), name: "", weeks: 5, isActive: true, days: [] };
}

// Local editable mirror of SaveProgramInput. Program type already matches closely.
type Draft = Program;

export function ProgramBuilder({
  initial,
  recentIds,
}: {
  initial: Program | null;
  recentIds: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial ?? blankProgram());
  const [pickerDayId, setPickerDayId] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(fn: (d: Draft) => Draft) {
    setDraft((d) => fn(structuredClone(d)));
  }

  function addDay() {
    update((d) => {
      d.days.push({ id: uid(), name: `Day ${d.days.length + 1}`, slots: [] });
      return d;
    });
  }

  function removeDay(dayId: string) {
    update((d) => ({ ...d, days: d.days.filter((x) => x.id !== dayId) }));
  }

  function moveDay(index: number, dir: -1 | 1) {
    update((d) => {
      const j = index + dir;
      if (j < 0 || j >= d.days.length) return d;
      [d.days[index], d.days[j]] = [d.days[j], d.days[index]];
      return d;
    });
  }

  function renameDay(dayId: string, name: string) {
    update((d) => {
      const day = d.days.find((x) => x.id === dayId);
      if (day) day.name = name;
      return d;
    });
  }

  function addSlot(dayId: string, ex: ExerciseDef) {
    update((d) => {
      const day = d.days.find((x) => x.id === dayId);
      if (day) {
        day.slots.push({
          id: uid(),
          exerciseId: ex.id,
          pattern: ex.pattern,
          targetSets: 3,
          repMin: 8,
          repMax: 12,
          targetRir: 2,
        });
      }
      return d;
    });
    setPickerDayId(null);
  }

  function updateSlot(dayId: string, slotId: string, patch: Partial<ProgramSlotLike>) {
    update((d) => {
      const slot = d.days.find((x) => x.id === dayId)?.slots.find((s) => s.id === slotId);
      if (slot) Object.assign(slot, patch);
      return d;
    });
  }

  function removeSlot(dayId: string, slotId: string) {
    update((d) => {
      const day = d.days.find((x) => x.id === dayId);
      if (day) day.slots = day.slots.filter((s) => s.id !== slotId);
      return d;
    });
  }

  function moveSlot(dayId: string, index: number, dir: -1 | 1) {
    update((d) => {
      const day = d.days.find((x) => x.id === dayId);
      if (!day) return d;
      const j = index + dir;
      if (j < 0 || j >= day.slots.length) return d;
      [day.slots[index], day.slots[j]] = [day.slots[j], day.slots[index]];
      return d;
    });
  }

  function handleSave() {
    setError(null);
    if (draft.days.length === 0 || draft.days.every((d) => d.slots.length === 0)) {
      setError("Add at least one day with one exercise.");
      return;
    }
    startSave(async () => {
      try {
        await saveProgram({
          id: draft.id,
          name: draft.name,
          weeks: draft.weeks,
          days: draft.days.map<SaveDayInput>((d) => ({
            id: d.id,
            name: d.name,
            slots: d.slots.map<SaveSlotInput>((s) => ({
              id: s.id,
              exerciseId: s.exerciseId,
              pattern: s.pattern,
              targetSets: s.targetSets,
              repMin: s.repMin,
              repMax: s.repMax,
              targetRir: s.targetRir,
            })),
          })),
        });
        router.push("/");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-5 px-4 py-5 pb-28">
      <div className="flex flex-col gap-3">
        <input
          value={draft.name}
          onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
          placeholder="Program name"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-lg font-semibold outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">Repeat for</span>
          <Stepper
            value={draft.weeks}
            min={4}
            max={6}
            onChange={(v) => update((d) => ({ ...d, weeks: v }))}
          />
          <span className="text-zinc-500">weeks</span>
        </div>
      </div>

      {draft.days.map((day, di) => (
        <section key={day.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <input
              value={day.name}
              onChange={(e) => renameDay(day.id, e.target.value)}
              className="flex-1 rounded-lg border border-zinc-300 px-2 py-1.5 font-medium outline-none dark:border-zinc-700 dark:bg-zinc-900"
            />
            <ReorderButtons onUp={() => moveDay(di, -1)} onDown={() => moveDay(di, 1)} />
            <button onClick={() => removeDay(day.id)} className="px-1 text-sm text-red-500">
              ✕
            </button>
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {day.slots.map((slot, si) => (
              <li key={slot.id} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{exerciseName(slot.exerciseId)}</span>
                  <span className="flex items-center gap-1">
                    <ReorderButtons
                      onUp={() => moveSlot(day.id, si, -1)}
                      onDown={() => moveSlot(day.id, si, 1)}
                    />
                    <button
                      onClick={() => removeSlot(day.id, slot.id)}
                      className="px-1 text-sm text-red-500"
                    >
                      ✕
                    </button>
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <NumField label="Sets" value={slot.targetSets} min={1} max={10}
                    onChange={(v) => updateSlot(day.id, slot.id, { targetSets: v })} />
                  <NumField label="Rep min" value={slot.repMin} min={1} max={30}
                    onChange={(v) => updateSlot(day.id, slot.id, { repMin: v })} />
                  <NumField label="Rep max" value={slot.repMax} min={1} max={30}
                    onChange={(v) => updateSlot(day.id, slot.id, { repMax: v })} />
                  <NumField label="RIR" value={slot.targetRir} min={0} max={5}
                    onChange={(v) => updateSlot(day.id, slot.id, { targetRir: v })} />
                </div>
              </li>
            ))}
          </ul>

          <button
            onClick={() => setPickerDayId(day.id)}
            className="mt-3 w-full rounded-lg border border-dashed border-zinc-300 py-2 text-sm text-zinc-500 dark:border-zinc-700"
          >
            + Add exercise
          </button>
        </section>
      ))}

      <button
        onClick={addDay}
        className="rounded-xl border border-zinc-300 py-3 text-sm font-medium dark:border-zinc-700"
      >
        + Add day
      </button>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/90 p-3 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-zinc-900 py-3 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {saving ? "Saving…" : "Save & make active"}
        </button>
      </div>

      {pickerDayId && (
        <ExercisePicker
          recentIds={recentIds}
          onPick={(ex) => addSlot(pickerDayId, ex)}
          onClose={() => setPickerDayId(null)}
        />
      )}
    </div>
  );
}

type ProgramSlotLike = Draft["days"][number]["slots"][number];

function exerciseName(id: string) {
  return EXERCISE_BY_ID[id]?.name ?? id;
}

function ReorderButtons({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <span className="flex">
      <button onClick={onUp} className="px-1 text-zinc-400">↑</button>
      <button onClick={onDown} className="px-1 text-zinc-400">↓</button>
    </span>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-center text-[10px] uppercase tracking-wide text-zinc-400">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Math.min(max, Math.max(min, Number.isFinite(n) ? n : min)));
        }}
        className="w-full min-w-0 rounded-md border border-zinc-300 bg-transparent py-1.5 text-center text-sm font-semibold tabular-nums outline-none dark:border-zinc-700"
      />
    </label>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
      <button onClick={() => onChange(clamp(value - 1))} className="px-3 py-1.5 text-zinc-500">−</button>
      <span className="w-8 text-center font-semibold tabular-nums">{value}</span>
      <button onClick={() => onChange(clamp(value + 1))} className="px-3 py-1.5 text-zinc-500">+</button>
    </div>
  );
}
