"use client";

import { useTransition } from "react";

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

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await onConfirm();
        });
      }}
      className="inline-flex min-h-11 items-center rounded-card border border-border-strong bg-surface px-4 text-body font-medium disabled:opacity-50"
    >
      {pending ? (pendingLabel ?? "Working…") : label}
    </button>
  );
}
