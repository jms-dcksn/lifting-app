"use client";

import { Input } from "./input";
import { InfoButton } from "./info-button";
import { formatTempo, TEMPO_EXPLANATION, TEMPO_PHASES, type Tempo } from "@/lib/tempo";

export function TempoLabel({ value }: { value: Tempo }) {
  return <span className="inline-flex items-center gap-1 text-caption text-muted">Tempo {formatTempo(value)}<InfoButton title="Exercise tempo">{TEMPO_EXPLANATION}</InfoButton></span>;
}

function editPhase(value: Tempo, index: number, raw: string): Tempo {
  const next: Tempo = [value[0], value[1], value[2], value[3]];
  next[index] = raw === "" ? NaN : Number(raw);
  return next;
}

function tempoCaption(phase: (typeof TEMPO_PHASES)[number]) {
  return phase === "Bottom pause" || phase === "Top pause" ? "Pause" : phase;
}

export function TempoRowLabel() {
  return <div role="rowheader" className="relative flex flex-col items-center justify-center px-1 leading-none text-faint">
    <span className="text-caption">Tempo</span>
    <span className="text-[10px]">sec</span>
    <span className="sr-only">Applies to every set of this exercise. {TEMPO_EXPLANATION}</span>
  </div>;
}

// Four phase cells on one row. Callers place this in the set grid so the cells
// share the weight-to-RIR column edges; outside a grid it is just four columns.
export function TempoCells({ value, onChange, inTable = false }: { value: Tempo; onChange: (value: Tempo) => void; inTable?: boolean }) {
  return <div role={inTable ? "cell" : undefined} aria-colspan={inTable ? 3 : undefined} data-tempo-cells className="col-span-3 grid min-w-0 grid-cols-4">{TEMPO_PHASES.map((phase, index) => <label key={phase} className="relative min-w-0 p-1">
    <span aria-hidden className="pointer-events-none absolute inset-x-1 top-1.5 truncate text-center text-[10px] leading-none text-muted">{tempoCaption(phase)}</span>
    <Input data-tempo-cell type="number" min={0} step={1} inputMode="numeric" aria-label={phase}
      value={Number.isNaN(value[index]) ? "" : value[index]}
      className="h-11! min-w-0 border-transparent! bg-surface! px-0.5! pt-3! text-center text-base leading-none focus:border-border-strong!"
      onChange={event => onChange(editPhase(value, index, event.target.value))} />
  </label>)}</div>;
}

export function TempoFields({ value, onChange, label = "Tempo (seconds)", variant = "stack" }: {
  value: Tempo; onChange: (value: Tempo) => void; label?: string; variant?: "stack" | "row";
}) {
  if (variant === "row") return <fieldset className="min-w-0">
    <legend className="flex items-center gap-1 text-caption text-muted">{label}<InfoButton title="Exercise tempo">{TEMPO_EXPLANATION}</InfoButton></legend>
    <TempoCells value={value} onChange={onChange} />
  </fieldset>;
  return <fieldset className="min-w-0"><legend className="flex items-center gap-1 text-caption text-muted">{label}<InfoButton title="Exercise tempo">{TEMPO_EXPLANATION}</InfoButton></legend>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{TEMPO_PHASES.map((phase, index) => <label key={phase} className="min-w-0 text-caption text-muted">{phase}
      <Input type="number" min={0} step={1} inputMode="numeric" value={Number.isNaN(value[index]) ? "" : value[index]} onChange={event => onChange(editPhase(value, index, event.target.value))} />
    </label>)}</div></fieldset>;
}
