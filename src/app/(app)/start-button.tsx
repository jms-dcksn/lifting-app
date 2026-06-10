"use client";

import { useFormStatus } from "react-dom";

// Disable while the action is pending so a double-tap can't start two sessions.
export function StartButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="w-full rounded-xl bg-zinc-900 py-4 text-lg font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
    >
      {pending ? "Starting…" : "Start next workout"}
    </button>
  );
}
