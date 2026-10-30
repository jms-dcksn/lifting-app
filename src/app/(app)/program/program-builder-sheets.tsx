"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";
import { TempoFields } from "@/components/ui/tempo";
import { resolveTempo, tempoSchema } from "@/lib/tempo";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import type { Program } from "@/lib/program";

type Slot = Program["days"][number]["slots"][number];

function SheetActions({ applyLabel, cancelLabel }: { applyLabel: string; cancelLabel: string }) {
  const dismiss = useSheetDismiss();
  return <div className="mt-4 flex gap-3 border-t border-border pt-3">
    <Button type="button" variant="secondary" aria-label={cancelLabel} onClick={dismiss}>Cancel</Button>
    <Button type="submit" className="flex-1">{applyLabel}</Button>
  </div>;
}

export function ProgramRepRangeSheet({ name, slot, onApply, onClose }: {
  name: string; slot: Slot; onApply: (patch: Pick<Slot, "repMin" | "repMax">) => void; onClose: () => void;
}) {
  return <Sheet ariaLabel={`Rep range for ${name}`} onClose={onClose}>
    <RepRangeForm name={name} slot={slot} onApply={onApply} />
  </Sheet>;
}

function RepRangeForm({ name, slot, onApply }: {
  name: string; slot: Slot; onApply: (patch: Pick<Slot, "repMin" | "repMax">) => void;
}) {
  const dismiss = useSheetDismiss();
  const [minimum, setMinimum] = useState(String(slot.repMin));
  const [maximum, setMaximum] = useState(String(slot.repMax));
  const [error, setError] = useState<string | null>(null);
  return <form className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]" onSubmit={event => {
    event.preventDefault();
    const repMin = Number(minimum), repMax = Number(maximum);
    if (!Number.isInteger(repMin) || !Number.isInteger(repMax) || repMin < 1 || repMax > 30 || repMin > repMax) {
      setError("Use whole reps from 1 to 30; maximum must be at least minimum."); return;
    }
    onApply({ repMin, repMax }); dismiss();
  }}>
    <p className="text-caption text-muted">{name}</p><h2 className="mt-1 text-heading">Rep range</h2>
    <div className="mt-4 grid grid-cols-2 gap-3">
      <label className="flex min-w-0 flex-col gap-1 text-caption text-muted">Minimum reps
        <Input autoFocus type="number" inputMode="numeric" aria-label="Minimum reps" value={minimum} onChange={e => setMinimum(e.target.value)} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-caption text-muted">Maximum reps
        <Input type="number" inputMode="numeric" aria-label="Maximum reps" value={maximum} onChange={e => setMaximum(e.target.value)} />
      </label>
    </div>
    {error && <p role="alert" className="mt-3 text-caption text-danger">{error}</p>}
    <SheetActions applyLabel="Apply range" cancelLabel="Cancel range" />
  </form>;
}

export function ProgramSlotOptionsSheet({ name, slot, def, adaptive, onApply, onRemove, onClose }: {
  name: string; slot: Slot; def?: ExerciseDef; adaptive: boolean;
  onApply: (patch: Partial<Slot>) => void; onRemove: () => void; onClose: () => void;
}) {
  return <Sheet ariaLabel={`Options for ${name}`} onClose={onClose}>
    <SlotOptionsForm {...{ name, slot, def, adaptive, onApply, onRemove }} />
  </Sheet>;
}

function SlotOptionsForm({ name, slot, def, adaptive, onApply, onRemove }: {
  name: string; slot: Slot; def?: ExerciseDef; adaptive: boolean;
  onApply: (patch: Partial<Slot>) => void; onRemove: () => void;
}) {
  const dismiss = useSheetDismiss();
  const [rest, setRest] = useState(slot.restSeconds === null ? "" : String(slot.restSeconds));
  const [tempo, setTempo] = useState(resolveTempo(def, slot.tempo));
  const [tempoEdited, setTempoEdited] = useState(false);
  const [group, setGroup] = useState(slot.supersetGroup ?? "");
  const [patience, setPatience] = useState(slot.plateauPatience === null ? "" : String(slot.plateauPatience));
  const [error, setError] = useState<string | null>(null);
  return <form className="max-h-[80dvh] overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]" onSubmit={event => {
    event.preventDefault();
    const seconds = rest.trim() === "" ? null : Number(rest);
    if (seconds !== null && (!Number.isInteger(seconds) || seconds < 1 || seconds > 600)) {
      setError("Rest must be 1–600 whole seconds, or blank for default."); return;
    }
    if (!tempoSchema.safeParse(tempo).success) { setError("Enter four non-negative whole seconds."); return; }
    onApply({ restSeconds: seconds, ...(tempoEdited ? { tempo } : {}), supersetGroup: group.trim() || null,
      ...(adaptive ? { plateauPatience: patience === "" ? null : Number(patience) } : {}) });
    dismiss();
  }}>
    <p className="text-caption text-muted">{name}</p><h2 className="mt-1 text-heading">Exercise options</h2>
    <div className="mt-4 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-caption text-muted">Rest {group ? "after round" : "between sets"} (seconds)
        <Input type="number" inputMode="numeric" aria-label="Rest seconds" placeholder="Default" value={rest} onChange={e => setRest(e.target.value)} />
      </label>
      <TempoFields variant="row" value={tempo} onChange={value => { setTempo(value); setTempoEdited(true); }} />
      <label className="flex flex-col gap-1 text-caption text-muted">Superset group
        <Input aria-label="Superset group" value={group} maxLength={16} placeholder="None (e.g. A)" onChange={e => setGroup(e.target.value)} />
      </label>
      {adaptive && <label className="flex flex-col gap-1 text-caption text-muted">Patience
        <select aria-label="Patience" className="min-h-11 rounded-control border border-border bg-background px-3" value={patience} onChange={e => setPatience(e.target.value)}>
          <option value="">Auto</option><option value="2">Low (2)</option><option value="3">Normal (3)</option>
          <option value="4">High (4)</option><option value="5">Very high (5)</option>
        </select>
      </label>}
      <Button type="button" variant="destructive" onClick={onRemove}>Remove exercise</Button>
    </div>
    {error && <p role="alert" className="mt-3 text-caption text-danger">{error}</p>}
    <SheetActions applyLabel="Apply options" cancelLabel="Cancel options" />
  </form>;
}
