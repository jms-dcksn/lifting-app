"use client";

import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import Link from "next/link";
import { IconSend } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import type { AgentMessage } from "@/lib/agent/messages";
import { parseSseBlock, type AgentStreamEvent } from "@/lib/agent/stream";
import { AgentTranscript } from "./agent-transcript";

export function AgentChat({
  initialMessages,
  variant,
}: {
  initialMessages: AgentMessage[];
  variant: "sheet" | "page";
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [pendingTool, setPendingTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, streamingText, pendingTool]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setPending(true);
    setError(null);
    setStreamingText("");
    setPendingTool(null);
    const optimistic: AgentMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text }],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok || !response.body) {
        throw new Error(response.status === 503 ? "Coach is not configured." : "Could not send.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const event = parseSseBlock(chunk);
          if (!event) continue;
          ({ streamed } = applyEvent(event, {
            streamed,
            setStreamingText,
            setPendingTool,
            setMessages,
            setError,
            optimisticId: optimistic.id,
          }));
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send.");
    } finally {
      setPending(false);
      setPendingTool(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {variant === "sheet" ? (
        <div className="flex items-center justify-between px-4 pb-3">
          <h2 className="text-heading">Coach</h2>
          <Link href="/coach" className="min-h-11 py-2 text-body text-muted">
            Full thread
          </Link>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <AgentTranscript
          messages={messages}
          streamingText={streamingText}
          pendingTool={pendingTool}
        />
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex items-center gap-2 px-4 py-3">
        <Input
          aria-label="Message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={pending}
        />
        <IconButton type="submit" aria-label="Send" pending={pending} disabled={!draft.trim()}>
          <IconSend />
        </IconButton>
      </form>
      {error ? <p className="px-4 pb-3 text-caption text-danger">{error}</p> : null}
    </div>
  );
}

function applyEvent(
  event: AgentStreamEvent,
  state: {
    streamed: string;
    setStreamingText: (value: string) => void;
    setPendingTool: (value: string | null) => void;
    setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
    setError: (value: string | null) => void;
    optimisticId: string;
  },
) {
  if (event.type === "text") {
    const streamed = state.streamed + event.text;
    state.setStreamingText(streamed);
    return { streamed };
  }
  if (event.type === "tool-start") {
    state.setPendingTool(event.name);
    return { streamed: state.streamed };
  }
  if (event.type === "tool-end") {
    state.setPendingTool(null);
    return { streamed: state.streamed };
  }
  if (event.type === "done" && Array.isArray(event.messages)) {
    const incoming = event.messages as AgentMessage[];
    state.setMessages((current) => {
      const withoutOptimistic = current.filter((message) => message.id !== state.optimisticId);
      const seen = new Set(withoutOptimistic.map((message) => message.id));
      return [...withoutOptimistic, ...incoming.filter((message) => !seen.has(message.id))];
    });
    state.setStreamingText("");
    return { streamed: "" };
  }
  if (event.type === "error") {
    state.setError(event.message);
  }
  return { streamed: state.streamed };
}
