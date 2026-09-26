"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/copy-text";

export function CoachCheckIn({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const ok = await copyTextToClipboard(text);
    setStatus(ok ? "copied" : "failed");
    window.setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      onClick={copy}
      aria-live="polite"
    >
      {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : "Copy report"}
    </Button>
  );
}
