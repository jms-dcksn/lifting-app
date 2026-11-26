"use client";

import { lazy, Suspense, useState } from "react";
import { IconChat } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { useVisualKeyboardInset } from "@/components/ui/use-visual-keyboard-inset";

const AgentChat = lazy(() => import("./agent-chat").then(module => ({ default: module.AgentChat })));

export function AgentEntry() {
  const [open, setOpen] = useState(false);
  const keyboardInset = useVisualKeyboardInset(open);

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
        <Sheet
          onClose={() => setOpen(false)}
          ariaLabel="Coach"
          className="flex h-[85dvh] min-h-0 flex-col overflow-hidden"
          style={keyboardInset ? { bottom: keyboardInset, maxHeight: `calc(90dvh - ${keyboardInset}px)` } : undefined}
        >
          <Suspense fallback={<p role="status" className="px-4 text-body text-muted">Loading chat</p>}>
            <AgentChat variant="sheet" onNavigate={() => setOpen(false)} />
          </Suspense>
        </Sheet>
      ) : null}
    </>
  );
}
