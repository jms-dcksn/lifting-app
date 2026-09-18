"use client";

import { useState, useTransition } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { IconPin } from "@/components/ui/icons";
import { toggleExercisePin } from "./actions";

export function PinButton({
  exerciseId,
  pinned,
  name,
}: {
  exerciseId: string;
  pinned: boolean;
  name: string;
}) {
  const [isPinned, setPinned] = useState(pinned);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <span className="inline-flex flex-col items-end">
      <IconButton
        variant="ghost"
        aria-label={isPinned ? `Unpin ${name}` : `Pin ${name}`}
        pending={pending}
        aria-pressed={isPinned}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await toggleExercisePin(exerciseId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setPinned(result.pinned);
          });
        }}
      >
        <IconPin filled={isPinned} />
      </IconButton>
      {error && <span role="alert" className="max-w-40 text-right text-caption text-danger">{error}</span>}
    </span>
  );
}
