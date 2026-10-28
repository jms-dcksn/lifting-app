"use client";

import { Input } from "./input";
import { InfoButton } from "./info-button";
import { formatTempo, TEMPO_EXPLANATION, TEMPO_PHASES, type Tempo } from "@/lib/tempo";

export function TempoLabel({ value }: { value: Tempo }) {
  return <span className="inline-flex items-center gap-1 text-caption text-muted">Tempo {formatTempo(value)}<InfoButton title="Exercise tempo">{TEMPO_EXPLANATION}</InfoButton></span>;
}
export function TempoFields({ value, onChange, label = "Tempo (seconds)" }: { value: Tempo; onChange: (value: Tempo) => void; label?: string }) {
  return <fieldset className="min-w-0"><legend className="flex items-center gap-1 text-caption text-muted">{label}<InfoButton title="Exercise tempo">{TEMPO_EXPLANATION}</InfoButton></legend>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{TEMPO_PHASES.map((phase, index) => <label key={phase} className="min-w-0 text-caption text-muted">{phase}
      <Input type="number" min={0} step={1} inputMode="numeric" value={Number.isNaN(value[index]) ? "" : value[index]} onChange={event => {
        const next: Tempo = [...value]; next[index] = event.target.value === "" ? NaN : Number(event.target.value); onChange(next);
      }} />
    </label>)}</div></fieldset>;
}
