"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import type { Program } from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { withViewTransition } from "@/components/ui/view-transition";
import { saveProgram, type SaveDayInput, type SaveSlotInput } from "./actions";
import { ExercisePicker } from "./exercise-picker";
import { TagInput } from "./tag-input";

const uid = () => crypto.randomUUID();

const MAX_DAYS = 6;

function blankProgram(): Program {
  return { id: uid(), name: "", description: null, tags: [], weeks: 5, style: "classic", isActive: true, days: [] };
}

// Local editable mirror of SaveProgramInput. Program type already matches closely.
type Draft = Program;

export function ProgramBuilder({
  initial,
  recentIds,
  catalog,
  afterSaveHref = "/",
  cancelHref,
}: {
  initial: Program | null;
  recentIds: string[];
  catalog: ExerciseDef[];
  afterSaveHref?: string;
  cancelHref?: string;
}) {
  const router = useRouter();
  const byId = useMemo(() => Object.fromEntries(catalog.map((d) => [d.id, d])), [catalog]);
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
    withViewTransition(() =>
      update((d) => {
        const j = index + dir;
        if (j < 0 || j >= d.days.length) return d;
        [d.days[index], d.days[j]] = [d.days[j], d.days[index]];
        return d;
      }),
    );
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
          restSeconds: null,
          plateauPatience: null,
        });
      }
      return d;
    });
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
    withViewTransition(() =>
      update((d) => {
        const day = d.days.find((x) => x.id === dayId);
        if (!day) return d;
        const j = index + dir;
        if (j < 0 || j >= day.slots.length) return d;
        [day.slots[index], day.slots[j]] = [day.slots[j], day.slots[index]];
        return d;
      }),
    );
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
          description: draft.description,
          tags: draft.tags,
          weeks: draft.weeks,
          style: draft.style,
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
              restSeconds: s.restSeconds,
              plateauPatience: s.plateauPatience,
            })),
          })),
        });
        if (cancelHref) router.replace(afterSaveHref);
        else router.push(afterSaveHref);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function handleCancel() {
    if (cancelHref) router.replace(cancelHref);
  }

  const saveLabel = initial?.isActive ? "Save changes" : "Save & make active";

  return (
    <div className="flex flex-1 flex-col gap-5 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-page flex-col gap-3">
        <Input
          value={draft.name}
          onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
          placeholder="Program name"
          enterKeyHint="done"
          autoComplete="off"
          className="text-lg font-semibold"
        />
        <textarea
          value={draft.description ?? ""}
          onChange={(e) => update((d) => ({ ...d, description: e.target.value || null }))}
          placeholder="Description (optional)"
          rows={2}
          className="w-full resize-none rounded-control border border-border-strong bg-transparent p-2 text-body outline-none"
        />
        <TagInput value={draft.tags} onChange={(tags) => update((d) => ({ ...d, tags }))} />
        <div className="flex items-center gap-3 text-body">
          <span className="text-muted">Repeat for</span>
          <Stepper
            label="Weeks"
            layout="row"
            inputMode="numeric"
            value={draft.weeks}
            step={1}
            min={4}
            max={6}
            onChange={(v) => update((d) => ({ ...d, weeks: v }))}
          />
          <span className="text-muted">weeks</span>
        </div>
      </div>

      {/* Days: vertical stack on phones, horizontal scroller when width allows. */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-4 sm:overflow-x-auto sm:pb-3">
        {draft.days.map((day, di) => (
          <Card
            key={day.id}
            className="sm:w-80 sm:shrink-0"
            style={{ viewTransitionName: `vt-${day.id}` }}
          >
            <div className="flex items-center gap-1">
              <Input
                value={day.name}
                onChange={(e) => renameDay(day.id, e.target.value)}
                aria-label="Day name"
                enterKeyHint="done"
                autoComplete="off"
                className="h-11 flex-1 px-2 font-medium"
              />
              <ReorderButtons
                what={day.name}
                onUp={() => moveDay(di, -1)}
                onDown={() => moveDay(di, 1)}
              />
              <RemoveButton what={day.name} onClick={() => removeDay(day.id)} />
            </div>

            <ul className="mt-3 flex flex-col gap-2">
              {day.slots.map((slot, si) => (
                <li
                  key={slot.id}
                  style={{ viewTransitionName: `vt-${slot.id}` }}
                  className="rounded-control bg-surface p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-body font-medium">{exerciseName(byId, slot.exerciseId)}</span>
                    <span className="flex items-center gap-1">
                      <ReorderButtons
                        what={exerciseName(byId, slot.exerciseId)}
                        onUp={() => moveSlot(day.id, si, -1)}
                        onDown={() => moveSlot(day.id, si, 1)}
                      />
                      <RemoveButton
                        what={exerciseName(byId, slot.exerciseId)}
                        onClick={() => removeSlot(day.id, slot.id)}
                      />
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
                  <RestField
                    value={slot.restSeconds}
                    onChange={(v) => updateSlot(day.id, slot.id, { restSeconds: v })}
                  />
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setPickerDayId(day.id)}
              className="mt-3 h-11 w-full rounded-control border border-dashed border-border-strong text-body font-medium text-foreground active:bg-surface"
            >
              + Add exercise
            </button>
          </Card>
        ))}

        {draft.days.length < MAX_DAYS && (
          <button
            type="button"
            onClick={addDay}
            className="h-11 w-full rounded-control border border-dashed border-border-strong text-body font-medium text-foreground active:bg-surface sm:h-auto sm:min-h-32 sm:w-64 sm:shrink-0 sm:self-stretch sm:rounded-card"
          >
            + Add day
          </button>
        )}
      </div>

      {error && <p className="text-body text-danger">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 px-4 py-3 backdrop-blur [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-page">
          <div className="flex gap-2">
            <Button
              type="button"
              size="lg"
              className="min-w-0 flex-1"
              onClick={handleSave}
              pending={saving}
            >
              {saveLabel}
            </Button>
            {cancelHref && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="shrink-0"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {pickerDayId && (
        <ExercisePicker
          catalog={catalog}
          recentIds={recentIds}
          onPick={(ex) => addSlot(pickerDayId, ex)}
          onClose={() => setPickerDayId(null)}
        />
      )}
    </div>
  );
}

type ProgramSlotLike = Draft["days"][number]["slots"][number];

function exerciseName(byId: Record<string, ExerciseDef>, id: string) {
  return byId[id]?.name ?? id;
}

function ReorderButtons({
  what,
  onUp,
  onDown,
}: {
  what: string;
  onUp: () => void;
  onDown: () => void;
}) {
  const cls =
    "flex h-10 w-9 items-center justify-center text-muted active:bg-surface rounded-control";
  return (
    <span className="flex">
      <button type="button" aria-label={`Move ${what} up`} onClick={onUp} className={cls}>
        ↑
      </button>
      <button type="button" aria-label={`Move ${what} down`} onClick={onDown} className={cls}>
        ↓
      </button>
    </span>
  );
}

function RemoveButton({ what, onClick }: { what: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Remove ${what}`}
      onClick={onClick}
      className="flex h-10 w-9 items-center justify-center rounded-control text-body text-danger active:bg-surface"
    >
      ✕
    </button>
  );
}

// Optional per-slot rest override. Empty = use the user's default rest (stored as null).
function RestField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="mt-2 flex items-center justify-between gap-2 text-caption text-muted">
      <span className="uppercase tracking-wide">Rest (s)</span>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        placeholder="default"
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) && n > 0 ? Math.min(600, Math.round(n)) : null);
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 w-24 rounded-control border border-border-strong bg-transparent text-center text-sm font-semibold tabular-nums"
      />
    </label>
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
      <span className="text-center text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Math.min(max, Math.max(min, Number.isFinite(n) ? n : min)));
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 w-full min-w-0 rounded-control border border-border-strong bg-transparent text-center text-sm font-semibold tabular-nums"
      />
    </label>
  );
}
