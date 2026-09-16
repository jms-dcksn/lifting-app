"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadPeriodMonth, savePeriodObservation, deletePeriodObservation } from "@/app/(app)/period/actions";
import type { PeriodObservation } from "@/lib/period-calendar";
import { weightDateLabel } from "@/lib/weight-calendar";
import { retryServerAction } from "@/lib/retry";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Sheet, useSheetDismiss } from "./ui/sheet";

type PeriodActions = {
  load: (month: string) => Promise<{ observations: PeriodObservation[]; today: string }>;
  save: (date: string) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>;
};

const actions: PeriodActions = {
  load: loadPeriodMonth,
  save: savePeriodObservation,
  remove: deletePeriodObservation,
};

export function LogPeriodButton({ today, className }: { today: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className={className}
        onClick={() => setOpen(true)}
      >
        Log period days
      </Button>
      {open && (
        <PeriodCalendar
          today={today}
          actions={actions}
          onClose={() => setOpen(false)}
          onChange={() => router.refresh()}
        />
      )}
    </>
  );
}

function PeriodCalendar({
  today: initialToday,
  actions,
  onClose,
  onChange,
}: {
  today: string;
  actions: PeriodActions;
  onClose: () => void;
  onChange: () => void;
}) {
  const [today, setToday] = useState(initialToday);
  const [month, setMonth] = useState(initialToday.slice(0, 7));
  const [selected, setSelected] = useState(initialToday);
  const [loaded, setLoaded] = useState<{
    month: string;
    observations: PeriodObservation[];
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const loading = loaded?.month !== month;

  useEffect(() => {
    let active = true;
    actions
      .load(month)
      .then((result) => {
        if (!active) return;
        setToday(result.today);
        setLoaded({ month, observations: result.observations });
        setLoadError("");
      })
      .catch(() => {
        if (active) setLoadError("Unable to load period days. Retry to edit this month.");
      });
    return () => {
      active = false;
    };
  }, [month, revision, actions]);

  const observations = loaded?.month === month ? loaded.observations : [];
  const observation = observations.find((item) => item.observedOn === selected);
  const markers = Object.fromEntries(
    observations.map((item) => [item.observedOn, "Period day logged"])
  );

  function changeMonth(next: string) {
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
    setLoadError("");
    setStatus("");
  }

  async function changed(date: string, message: string) {
    setMonth(date.slice(0, 7));
    setSelected(date);
    setLoaded(null);
    setLoadError("");
    setStatus(message);
    setRevision((value) => value + 1);
    onChange();
  }

  return (
    <Sheet onClose={onClose} ariaLabel="Period calendar" dismissible={!busy}>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-heading">Period calendar</h2>
            <p className="text-caption text-muted">
              Mark the days you observed menstrual bleeding.
            </p>
          </div>
          <CloseButton disabled={busy} />
        </div>
        <Calendar
          month={month}
          selected={selected}
          today={today}
          markers={markers}
          disabled={busy}
          onMonth={changeMonth}
          onSelect={(day) => {
            setSelected(day);
            setStatus("");
          }}
        />
        <p role="status" className="text-caption text-muted">
          {status || (loading && !loadError ? "Loading period days…" : "")}
        </p>
        {loadError ? (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-body text-danger">{loadError}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoadError("");
                setRevision((value) => value + 1);
              }}
            >
              Retry
            </Button>
          </div>
        ) : (
          !loading && (
            <PeriodDayForm
              key={`${selected}:${observation?.id ?? "new"}`}
              date={selected}
              observation={observation}
              actions={actions}
              onBusy={setBusy}
              onChanged={changed}
            />
          )
        )}
      </div>
    </Sheet>
  );
}

function CloseButton({ disabled }: { disabled: boolean }) {
  const dismiss = useSheetDismiss();
  return (
    <Button type="button" variant="ghost" disabled={disabled} onClick={dismiss}>
      Done
    </Button>
  );
}

function PeriodDayForm({
  date,
  observation,
  actions,
  onBusy,
  onChanged,
}: {
  date: string;
  observation?: PeriodObservation;
  actions: PeriodActions;
  onBusy: (busy: boolean) => void;
  onChanged: (date: string, message: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function mark() {
    setError("");
    setPending(true);
    onBusy(true);
    try {
      const result = await retryServerAction(
        () => actions.save(date),
        { onRetry: () => setError("Retrying…") }
      );
      if (!result.ok) {
        setError(result.error ?? "Unable to mark this day");
        return;
      }
      await onChanged(date, `Marked ${weightDateLabel(date)} as a period day.`);
    } catch {
      setError(
        "Unable to confirm. Check your connection and try again."
      );
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  async function remove() {
    if (!observation) return;
    setPending(true);
    onBusy(true);
    setError("");
    try {
      const result = await retryServerAction(
        () => actions.remove(observation.id),
        { onRetry: () => setError("Retrying…") }
      );
      if (!result.ok) {
        setError(result.error ?? "Unable to remove this period day.");
        return;
      }
      await onChanged(date, `Removed period mark for ${weightDateLabel(date)}.`);
    } catch {
      setError("Unable to confirm removal. Check your connection and try again.");
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div>
        <h3 className="text-body font-semibold">{weightDateLabel(date)}</h3>
        <p className="text-caption text-muted">
          {observation
            ? "Period day recorded. Remove this mark if needed."
            : "Not marked yet. Mark this day if you observed menstrual bleeding."}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      )}
      {observation ? (
        <>
          {confirmDelete ? (
            <div className="flex flex-col gap-2 rounded-control border border-border p-3">
              <p className="text-body">Remove period mark for {weightDateLabel(date)}?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => void remove()}
                >
                  {pending ? "Removing…" : "Remove"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              Remove this period day
            </Button>
          )}
        </>
      ) : (
        <Button type="button" disabled={pending} onClick={() => void mark()}>
          {pending ? "Marking…" : "Mark as period day"}
        </Button>
      )}
    </div>
  );
}
