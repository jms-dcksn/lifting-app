"use client";

import { useState } from "react";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import { canSwapStation, stationTemplateFor, swapStationLabel } from "@/lib/station";
import { Button } from "@/components/ui/button";
import { StationPicker } from "./exercise-picker";

function toCatalogMap(catalog: Record<string, ExerciseDef> | ExerciseDef[]): Record<string, ExerciseDef> {
  return Array.isArray(catalog) ? Object.fromEntries(catalog.map((d) => [d.id, d])) : catalog;
}

export function SwapStationButton({
  exerciseId,
  catalog,
  disabled,
  onPick,
  className,
  size = "sm",
}: {
  exerciseId: string;
  catalog: Record<string, ExerciseDef> | ExerciseDef[];
  disabled?: boolean;
  onPick: (def: ExerciseDef) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const catalogMap = toCatalogMap(catalog);
  const def = catalogMap[exerciseId];
  const template = stationTemplateFor(def, catalogMap);
  const label = swapStationLabel(def, catalogMap);
  const [open, setOpen] = useState(false);

  if (!def || !canSwapStation(def, catalogMap) || !label || !template) return null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size={size}
        className={className}
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={`${label} for ${def.name}`}
      >
        {label}
      </Button>
      {open && (
        <StationPicker
          template={template}
          onPick={(picked) => {
            onPick(picked);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
