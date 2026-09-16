"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadWeightMonth, removeWeightEntry, writeWeightEntry } from "@/app/(app)/weight/actions";
import type { BodyweightEntry } from "@/lib/bodyweight";
import type { WeightCalendarActions } from "@/lib/weight-calendar-contract";
import { validWeightDate, weightDateLabel } from "@/lib/weight-calendar";
import { retryServerAction } from "@/lib/retry";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { InfoButton } from "./ui/info-button";
import { Input } from "./ui/input";
import { Sheet, useSheetDismiss } from "./ui/sheet";

const actions: WeightCalendarActions = { load: loadWeightMonth, save: writeWeightEntry, remove: removeWeightEntry };

export function LogWeightButton({ today, initialDate, label = "Log weight", className }: {
  today: string; initialDate?: string; label?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return <>
    <Button type="button" variant="secondary" className={className} onClick={() => setOpen(true)}>{label}</Button>
    {open && <WeightCalendar today={today} initialDate={initialDate} actions={actions}
      onClose={() => setOpen(false)} onChange={() => router.refresh()} />}
  </>;
}

// Explicit actions keep this view reusable and allow browser verification with isolated fixtures.
export function WeightCalendar({ today: initialToday, initialDate, actions, onClose, onChange }: {
  today: string; initialDate?: string; actions: WeightCalendarActions; onClose: () => void; onChange: () => void;
}) {
  const start = initialDate ?? initialToday;
  const [today, setToday] = useState(initialToday);
  const [month, setMonth] = useState(start.slice(0, 7));
  const [selected, setSelected] = useState(start);
  const [loaded, setLoaded] = useState<{ month: string; entries: BodyweightEntry[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const loading = loaded?.month !== month;

  useEffect(() => {
    let active = true;
    actions.load(month).then(result => {
      if (!active) return;
      setToday(result.today);
      setLoaded({ month, entries: result.entries });
      setLoadError("");
    }).catch(() => {
      if (active) setLoadError("Unable to load readings. Retry to edit this month.");
    });
    return () => { active = false; };
  }, [month, revision, actions]);

  const entries = loaded?.month === month ? loaded.entries : [];
  const entry = entries.find(item => item.loggedOn === selected);
  const markers = Object.fromEntries(entries.map(item => [item.loggedOn, `${item.weight} lb logged`]));

  function changeMonth(next: string) {
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
    setLoadError("");
    setStatus("");
  }

  async function changed(date: string, message: string) {
    // The mutation succeeded even if a subsequent refresh fails. Never offer to re-save it.
    setMonth(date.slice(0, 7));
    setSelected(date);
    setLoaded(null);
    setLoadError("");
    setStatus(message);
    setRevision(value => value + 1);
    onChange();
  }

  return <Sheet onClose={onClose} ariaLabel="Weight calendar" dismissible={!busy}>
    <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1">
          <h2 className="text-heading">Weight calendar</h2>
          <InfoButton title="Weight calendar">
            Dot marks a logged day. Outline is today.
          </InfoButton>
        </div>
        <CloseButton disabled={busy} />
      </div>
      <Calendar month={month} selected={selected} today={today} markers={markers} disabled={busy}
        onMonth={changeMonth} onSelect={day => { setSelected(day); setStatus(""); }} />
      <p role="status" className="text-caption text-muted">{status || (loading && !loadError ? "Loading readings…" : "")}</p>
      {loadError ? <div role="alert" className="flex flex-col gap-2">
        <p className="text-body text-danger">{loadError}</p>
        <Button type="button" variant="secondary" onClick={() => { setLoadError(""); setRevision(value => value + 1); }}>Retry</Button>
      </div> : !loading && <WeightEntryForm key={`${selected}:${entry?.id ?? "new"}`} today={today} date={selected} entry={entry}
        actions={actions} onBusy={setBusy} onChanged={changed} />}
    </div>
  </Sheet>;
}

function CloseButton({ disabled }: { disabled: boolean }) {
  const dismiss = useSheetDismiss();
  return <Button type="button" variant="ghost" disabled={disabled} onClick={dismiss}>Done</Button>;
}

function WeightEntryForm({ today, date, entry, actions, onBusy, onChanged }: {
  today: string; date: string; entry?: BodyweightEntry; actions: WeightCalendarActions;
  onBusy: (busy: boolean) => void; onChanged: (date: string, message: string) => Promise<void>;
}) {
  const [weight, setWeight] = useState(entry?.weight.toString() ?? "");
  const [targetDate, setTargetDate] = useState(date);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<BodyweightEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(replaceEntryId?: string) {
    setError("");
    if (!validWeightDate(targetDate, today)) { setError("Choose today or an earlier valid date."); return; }
    setPending(true); onBusy(true);
    try {
      const result = await retryServerAction(
        () => actions.save({ entryId: entry?.id ?? null, loggedOn: targetDate, weight: Number(weight), replaceEntryId }),
        { onRetry: () => setError("Retrying…") }
      );
      if (!result.ok) { setError(result.error); setConflict(result.conflict ?? null); return; }
      await onChanged(targetDate, `Saved ${Number(weight)} lb for ${weightDateLabel(targetDate)}.`);
    } catch {
      setError("Unable to confirm the save. Your input is still here. Check your connection and try again.");
    } finally { setPending(false); onBusy(false); }
  }

  async function remove() {
    if (!entry) return;
    setPending(true); onBusy(true); setError("");
    try {
      const result = await retryServerAction(
        () => actions.remove(entry.id),
        { onRetry: () => setError("Retrying…") }
      );
      if (!result.ok) { setError(result.error ?? "Unable to remove this reading."); return; }
      await onChanged(date, `Removed the reading for ${weightDateLabel(date)}.`);
    } catch { setError("Unable to confirm removal. Check your connection and try again."); }
    finally { setPending(false); onBusy(false); }
  }

  return <form className="flex flex-col gap-3 border-t border-border pt-4"
    onSubmit={event => { event.preventDefault(); void save(); }}>
    <div>
      <h3 className="text-body font-semibold">{weightDateLabel(date)}</h3>
      {entry && <p className="text-caption text-muted tabular-nums">{entry.weight} lb</p>}
    </div>
    <label className="flex min-w-0 flex-col gap-1 text-caption text-muted">Weight (lb)
      <Input name="weight" type="number" inputMode="decimal" step="0.01" min="0.01" max="1500" required value={weight}
        disabled={pending} placeholder="e.g. 149.2" aria-describedby={error ? "weight-entry-error" : undefined}
        onChange={event => { setWeight(event.target.value); setConflict(null); setError(""); setConfirmDelete(false); }} />
    </label>
    {entry && <details>
      <summary className="cursor-pointer py-2 text-caption text-muted">Correct the date</summary>
      <label className="mt-2 flex min-w-0 flex-col gap-1 text-caption text-muted">Move reading to
        <Input type="date" value={targetDate} max={today} min="0001-01-01" required disabled={pending}
          onChange={event => { setTargetDate(event.target.value); setConflict(null); setError(""); setConfirmDelete(false); }} />
      </label>
    </details>}
    {error && <p id="weight-entry-error" role="alert" className="text-body text-danger">{error}</p>}
    {conflict ? <div className="flex flex-col gap-2 rounded-control border border-border-strong p-3">
      <p className="text-body">Replace {conflict.weight} lb on {weightDateLabel(conflict.loggedOn)} with {weight} lb?</p>
      <Button type="button" variant="destructive" pending={pending} onClick={() => void save(conflict.id)}>Replace existing reading</Button>
      <Button type="button" variant="ghost" disabled={pending} onClick={() => { setConflict(null); setError(""); }}>Keep existing reading</Button>
    </div> : <Button type="submit" pending={pending} size="lg">{entry ? targetDate !== date ? "Move reading" : "Update reading" : "Save reading"}</Button>}
    {entry && (confirmDelete ? <div className="flex flex-col gap-2">
      <p className="text-caption text-muted">Remove {entry.weight} lb from {weightDateLabel(date)}?</p>
      <Button type="button" variant="destructive" pending={pending} onClick={() => void remove()}>Confirm removal</Button>
      <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirmDelete(false)}>Keep reading</Button>
    </div> : <Button type="button" variant="ghost" disabled={pending} onClick={() => { setConfirmDelete(true); setConflict(null); setError(""); }}>Remove reading</Button>)}
  </form>;
}
