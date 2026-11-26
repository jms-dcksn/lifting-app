"use client";

import { useRef, useState, useTransition } from "react";

export function AgentConfirmChip({
  label,
  pendingLabel,
  onConfirm,
}: {
  label: string;
  pendingLabel?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [pending, start] = useTransition();
  const confirming = useRef(false);
  const [error, setError] = useState(false);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirming.current) return;
          confirming.current = true;
          setError(false);
          start(async () => {
            try {
              await onConfirm();
            } catch {
              setError(true);
            } finally {
              confirming.current = false;
            }
          });
        }}
        className="inline-flex min-h-11 items-center rounded-card border border-border-strong bg-surface px-4 text-body font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-foreground"
      >
        {pending ? (pendingLabel ?? "Working…") : label}
      </button>
      {error ? <p role="alert" className="mt-1 text-caption text-danger">Could not complete this action. Try again.</p> : null}
    </div>
  );
}
