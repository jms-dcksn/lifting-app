"use client";

import { useState } from "react";
import { IconChat } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { AgentChat } from "./agent-chat";

export function AgentEntry() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        type="button"
        aria-label="Coach"
        className="fixed right-4 z-30 bottom-[calc(4.25rem+env(safe-area-inset-bottom)+0.75rem)] bg-background"
        onClick={() => setOpen(true)}
      >
        <IconChat />
      </IconButton>
      {open ? (
        <Sheet onClose={() => setOpen(false)} ariaLabel="Coach" className="flex h-[85dvh] min-h-0 flex-col overflow-hidden">
          <AgentChat variant="sheet" />
        </Sheet>
      ) : null}
    </>
  );
}
