"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";
import type { EditorIssue, PlannedSet, PlannedSlot } from "@/lib/workout-editor";

export function setRange(min: number, max: number) {
  return min === max ? String(min) : `${min}–${max}`;
}

export function PlannedSetTable({ slot, index, assisted, issues, onWeight, onEdit }: {
  slot: PlannedSlot;
  index: number;
  assisted: boolean;
  issues: EditorIssue[];
  onWeight: (setId: string, value: number | null) => void;
  onEdit: (setId: string, field: "repMin" | "rirMin") => void;
}) {
  return <table className="mt-3 w-full table-fixed border-separate border-spacing-0 text-center tabular-nums">
    <caption className="sr-only">Exercise {index + 1} working sets{assisted ? "; negative pounds indicate assistance" : ""}</caption>
    <thead className="text-caption text-muted">
      <tr>{["Set", assisted ? "Load · lb" : "Weight · lb", "Reps", "RIR"].map((title, i) =>
        <th key={title} scope="col" className={`border-y border-border bg-surface px-1 py-2 font-normal ${i === 0 ? "w-8" : ""}`}>{title}</th>)}
      </tr>
    </thead>
    <tbody>{slot.sets.map((set, setIndex) => {
      const path = `slots.${index}.sets.${setIndex}`;
      return <tr key={set.id}>
        <th scope="row" className="border-b border-border px-1 py-1 text-caption font-normal text-muted">{setIndex + 1}</th>
        <td className="border-b border-border p-1">
          <Input type="number" inputMode="decimal" step="any" value={Number.isNaN(set.weight) ? "" : set.weight ?? ""}
            data-field={`${path}.weight`} aria-label={`Exercise ${index + 1} set ${setIndex + 1} ${assisted ? "load (negative lb assistance)" : "weight (lb)"}`}
            aria-invalid={issues.some(issue => issue.path === `${path}.weight`) || undefined}
            aria-describedby={issues.some(issue => issue.path === `${path}.weight`) ? "editor-errors" : undefined}
            aria-description={set.suggestedWeight === null ? "Leave blank for suggested weight when available." : `Leave blank to use the suggested ${set.suggestedWeight} lb.`}
            placeholder={set.suggestedWeight === null ? "Auto" : `${set.suggestedWeight} auto`}
            className="h-11! min-w-0 border-transparent! bg-surface! px-1! text-center text-base placeholder:text-caption placeholder:text-muted! focus:border-border-strong!"
            onChange={event => onWeight(set.id, event.target.validity.badInput ? NaN : event.target.value === "" ? null : Number(event.target.value))} />
        </td>
        {(["reps", "rir"] as const).map(kind => {
          const min = kind === "reps" ? "repMin" : "rirMin";
          const max = kind === "reps" ? "repMax" : "rirMax";
          const invalid = issues.some(issue => issue.path === `${path}.${min}` || issue.path === `${path}.${max}`);
          return <td key={kind} className="border-b border-border p-1">
            <Button type="button" variant="ghost" className="w-full bg-surface px-1! font-medium text-foreground!"
              aria-label={`Edit ${kind === "reps" ? "reps" : "RIR"} for set ${setIndex + 1} of exercise ${index + 1}`}
              aria-description={`${setRange(set[min], set[max])} ${kind === "reps" ? "reps" : "RIR"}`}
              aria-invalid={invalid || undefined} onClick={() => onEdit(set.id, min)}>
              {Number.isFinite(set[min]) && Number.isFinite(set[max]) ? setRange(set[min], set[max]) : "Edit"}
            </Button>
          </td>;
        })}
      </tr>;
    })}</tbody>
  </table>;
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
