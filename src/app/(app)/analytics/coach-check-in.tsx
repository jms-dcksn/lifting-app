"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CoachCheckIn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="secondary" className="w-full" onClick={copy}>
      {copied ? "Copied — paste it into our chat" : "Copy weekly coach check-in"}
    </Button>
  );
}
