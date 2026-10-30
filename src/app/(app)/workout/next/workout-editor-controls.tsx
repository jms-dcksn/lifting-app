"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { setRange } from "@/components/ui/planned-set-table";
import { Input } from "@/components/ui/input";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";
import { TempoCells, TempoRowLabel } from "@/components/ui/tempo";
import type { Tempo } from "@/lib/tempo";
import type { EditorIssue, PlannedSet, PlannedSlot } from "@/lib/workout-editor";

export function PlannedSetTable({ slot, index, assisted, issues, tempo, onTempo, onWeight, onEdit }: {
  slot: PlannedSlot;
  index: number;
  assisted: boolean;
  issues: EditorIssue[];
  tempo: Tempo;
  onTempo: (value: Tempo) => void;
  onWeight: (setId: string, value: number | null) => void;
  onEdit: (setId: string, field: "repMin" | "rirMin") => void;
}) {
  const titles = ["Set", assisted ? "Load · lb" : "Weight · lb", "Reps", "RIR"];
  return <div role="table" aria-label={`Exercise ${index + 1} working sets${assisted ? "; negative pounds indicate assistance" : ""}`}
    className="mt-3 grid w-full min-w-0 grid-cols-[auto_repeat(3,minmax(0,1fr))] text-center tabular-nums">
    <div role="row" className="col-span-4 grid grid-cols-subgrid text-caption text-muted">
      {titles.map(title => <div key={title} role="columnheader" className="border-y border-border bg-surface px-1 py-2 font-normal">{title}</div>)}
    </div>
    <div role="row" data-tempo-row className="col-span-4 grid grid-cols-subgrid items-center border-b border-border">
      <TempoRowLabel />
      <TempoCells inTable value={tempo} onChange={onTempo} />
    </div>
    {slot.sets.map((set, setIndex) => {
      const path = `slots.${index}.sets.${setIndex}`;
      return <div role="row" data-set-row key={set.id} className="col-span-4 grid grid-cols-subgrid items-center border-b border-border">
        <div role="rowheader" className="px-1 text-caption font-normal text-muted">{setIndex + 1}</div>
        <div role="cell" data-set-column="weight" className="min-w-0 p-1">
          <Input type="number" inputMode="decimal" step="any" value={Number.isNaN(set.weight) ? "" : set.weight ?? ""}
            data-field={`${path}.weight`} aria-label={`Exercise ${index + 1} set ${setIndex + 1} ${assisted ? "load (negative lb assistance)" : "weight (lb)"}`}
            aria-invalid={issues.some(issue => issue.path === `${path}.weight`) || undefined}
            aria-describedby={issues.some(issue => issue.path === `${path}.weight`) ? "editor-errors" : undefined}
            aria-description={set.suggestedWeight === null ? "Leave blank for suggested weight when available." : `Leave blank to use the suggested ${set.suggestedWeight} lb.`}
            placeholder={set.suggestedWeight === null ? "Auto" : `${set.suggestedWeight} auto`}
            className="h-11! min-w-0 border-transparent! bg-surface! px-1! text-center text-base placeholder:text-caption placeholder:text-muted! focus:border-border-strong!"
            onChange={event => onWeight(set.id, event.target.validity.badInput ? NaN : event.target.value === "" ? null : Number(event.target.value))} />
        </div>
        {(["reps", "rir"] as const).map(kind => {
          const min = kind === "reps" ? "repMin" : "rirMin";
          const max = kind === "reps" ? "repMax" : "rirMax";
          const invalid = issues.some(issue => issue.path === `${path}.${min}` || issue.path === `${path}.${max}`);
          return <div role="cell" key={kind} data-set-column={kind} className="min-w-0 p-1">
            <Button type="button" variant="ghost" className="w-full bg-surface px-1! font-medium text-foreground!"
              aria-label={`Edit ${kind === "reps" ? "reps" : "RIR"} for set ${setIndex + 1} of exercise ${index + 1}`}
              aria-description={`${setRange(set[min], set[max])} ${kind === "reps" ? "reps" : "RIR"}`}
              aria-invalid={invalid || undefined} onClick={() => onEdit(set.id, min)}>
              {Number.isFinite(set[min]) && Number.isFinite(set[max]) ? setRange(set[min], set[max]) : "Edit"}
            </Button>
          </div>;
        })}
      </div>;
    })}
  </div>;
}

export function EditorSheet({ title, context, focusField, issues, onClose, onDone, doneLabel = "Done", secondary, children }: {
  title: string;
  context: string;
  focusField?: string;
  issues: EditorIssue[];
  onClose: () => void;
  onDone?: () => boolean;
  doneLabel?: string;
  secondary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return <Sheet ariaLabel={title} onClose={onClose} className="flex flex-col">
    <EditorSheetBody {...{ title, context, focusField, issues, onDone, doneLabel, secondary }}>{children}</EditorSheetBody>
  </Sheet>;
}

function EditorSheetBody({ title, context, focusField, issues, onDone, doneLabel, secondary, children }: {
  title: string; context: string; focusField?: string; issues: EditorIssue[];
  onDone?: () => boolean; doneLabel: string; secondary?: React.ReactNode; children: React.ReactNode;
}) {
  const dismiss = useSheetDismiss();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusField) return;
    const frame = requestAnimationFrame(() => {
      const control = [...(body.current?.querySelectorAll<HTMLElement>("[data-field]") ?? [])].find(el => el.dataset.field === focusField);
      control?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusField]);
  return <>
    <div className="px-4 pb-3"><p className="text-caption text-muted">{context}</p><h2 className="mt-1 text-heading">{title}</h2></div>
    <div ref={body} className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4">
      {children}
      {issues.length > 0 && <div role="alert" tabIndex={-1} id="editor-sheet-errors" className="text-caption text-danger">{issues.map((issue, i) => <p key={i}>{issue.message}</p>)}</div>}
    </div>
    <div className="flex shrink-0 gap-3 border-t border-border px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {secondary}
      <Button type="button" className="flex-1" onClick={() => { if (!onDone || onDone()) dismiss(); }}>{doneLabel}</Button>
    </div>
  </>;
}

export type EditorPanel =
  | { kind: "set"; slotId: string; setId: string; field: keyof PlannedSet }
  | { kind: "options"; slotId: string; field?: string }
  | { kind: "discard" };
