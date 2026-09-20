"use client";

import { useEffect, useState } from "react";
import { IconChat } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import type { AgentMessage } from "@/lib/agent/messages";
import { AgentChat } from "./agent-chat";

export function AgentEntry() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/agent/chat")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((body: { messages?: AgentMessage[] }) => {
        if (!cancelled) setMessages(body.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
        <Sheet onClose={() => setOpen(false)} ariaLabel="Coach" className="h-[85dvh]">
          {messages ? (
            <AgentChat initialMessages={messages} variant="sheet" />
          ) : (
            <p className="px-4 text-body text-muted">Loading</p>
          )}
        </Sheet>
      ) : null}
    </>
  );
}
