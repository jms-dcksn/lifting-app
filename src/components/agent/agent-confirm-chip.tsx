"use client";

import { useTransition } from "react";
import { startNextSession } from "@/app/(app)/session/actions";

export function AgentConfirmChip({
  label,
  onStarted,
}: {
  label: string;
  onStarted?: () => void;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await startNextSession();
          onStarted?.();
        });
      }}
      className="inline-flex min-h-11 items-center rounded-card border border-border-strong bg-surface px-4 text-body font-medium disabled:opacity-50"
    >
      {pending ? "Starting…" : label}
    </button>
  );
}
