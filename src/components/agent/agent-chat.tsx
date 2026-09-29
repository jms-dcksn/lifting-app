"use client";

import { useEffect, useLayoutEffect, useReducer, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "@/components/ui/cx";
import { IconHistory, IconPlus, IconSend } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { clientActionsFromParts } from "@/lib/agent/client-tools";
import { parseScreenContextFromPath } from "@/lib/agent/context";
import {
  canNavigate,
  chatReducer,
  fullScreenHref,
  initialChatState,
  transcriptView,
  type AgentChatSnapshot,
  type ThreadId,
  type ThreadSummary,
} from "@/lib/agent/chat-state";
import type { AgentMessage } from "@/lib/agent/messages";
import { readSseEvents } from "@/lib/agent/stream";
import { AgentTranscript } from "./agent-transcript";

export function AgentChat({
  initial,
  variant,
  onNavigate,
}: {
  initial?: AgentChatSnapshot;
  variant: "sheet" | "page";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [{ threads, screen, error }, dispatch] = useReducer(chatReducer, initial, initialChatState);
  const [draft, setDraft] = useState("");
  const [confirmedCallIds, setConfirmedCallIds] = useState<Set<string>>(() => new Set());
  const scroller = useRef<HTMLDivElement>(null);
  const stickToEnd = useRef(true);
  const navigable = canNavigate(screen);
  const href = screen.name === "loading" ? null : fullScreenHref(screen.conversation);
  const shownHref = useRef(href);
  const view = screen.name === "chat" ? transcriptView(screen.conversation, screen.turn) : null;
  const inChat = view !== null;

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetchSnapshot("/api/agent/chat").then(
      (snapshot) => {
        if (!cancelled) dispatch({ type: "loaded", snapshot });
      },
      () => {
        if (!cancelled) dispatch({ type: "failed", error: "Could not load chats." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [initial]);

  useEffect(() => {
    if (variant !== "page" || !href || href === shownHref.current) return;
    shownHref.current = href;
    window.history.replaceState(null, "", href);
  }, [variant, href]);

  useLayoutEffect(() => {
    stickToEnd.current = true;
  }, [screen.name, href]);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (node && inChat && stickToEnd.current) node.scrollTop = node.scrollHeight;
  });

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || screen.name !== "chat" || screen.turn) return;
    const { conversation } = screen;
    setDraft("");
    dispatch({ type: "send", optimisticId: `local-${Date.now()}`, text });
    let userTextStored = false;
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          threadId: conversation.kind === "saved" ? conversation.threadId : null,
          context: parseScreenContextFromPath(pathname),
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(response.status === 503 ? "Coach is not configured." : "Could not send.");
      }
      for await (const streamEvent of readSseEvents(response.body)) {
        if (streamEvent.type === "thread") userTextStored = true;
        dispatch({ type: "event", event: streamEvent });
        if (streamEvent.type === "done") {
          runClientActions(streamEvent.messages, router, onNavigate);
        }
      }
      dispatch({ type: "closed", error: "Connection lost." });
    } catch (caught) {
      dispatch({ type: "closed", error: caught instanceof Error ? caught.message : "Could not send." });
    } finally {
      if (!userTextStored) setDraft((current) => current || text);
    }
  }

  async function openThread(threadId: ThreadId) {
    if (screen.name !== "history" || screen.opening) return;
    dispatch({ type: "open", threadId });
    try {
      dispatch({ type: "loaded", snapshot: await fetchSnapshot(`/api/agent/chat?thread=${threadId}`) });
    } catch {
      dispatch({ type: "failed", error: "Could not open chat." });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-4 pb-3">
        {variant === "page" ? (
          <h1 className="mr-auto text-display">Coach</h1>
        ) : (
          <h2 className="mr-auto text-heading">Coach</h2>
        )}
        <IconButton
          type="button"
          variant="ghost"
          aria-label="Chat history"
          aria-pressed={screen.name === "history"}
          disabled={!navigable}
          onClick={() => dispatch({ type: "toggle-history" })}
        >
          <IconHistory />
        </IconButton>
        <IconButton
          type="button"
          variant="ghost"
          aria-label="New chat"
          disabled={!navigable}
          onClick={() => dispatch({ type: "new-chat" })}
        >
          <IconPlus />
        </IconButton>
        {variant === "sheet" ? <FullScreenLink href={navigable ? href : null} /> : null}
      </div>
      <div
        key={screen.name}
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-4"
        onScroll={(event) => {
          const node = event.currentTarget;
          stickToEnd.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        }}
      >
        {screen.name === "loading" ? <p className="text-body text-muted">Loading</p> : null}
        {screen.name === "history" ? (
          <ThreadHistory
            threads={threads}
            openId={screen.conversation.kind === "saved" ? screen.conversation.threadId : null}
            opening={screen.opening}
            onOpen={openThread}
          />
        ) : null}
        {view ? (
          <AgentTranscript
            {...view}
            confirmedCallIds={confirmedCallIds}
            onConfirmStarted={(callId) => {
              setConfirmedCallIds((current) => new Set(current).add(callId));
              onNavigate?.();
            }}
          />
        ) : null}
      </div>
      {screen.name === "chat" ? (
        <form onSubmit={send} className="flex shrink-0 items-center gap-2 bg-background px-4 py-3">
          <Input
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <IconButton type="submit" aria-label="Send" pending={screen.turn !== null} disabled={!draft.trim()}>
            <IconSend />
          </IconButton>
        </form>
      ) : null}
      {error ? <p className="shrink-0 px-4 pb-3 text-caption text-danger">{error}</p> : null}
    </div>
  );
}

function FullScreenLink({ href }: { href: string | null }) {
  const className = "inline-flex min-h-11 items-center text-body text-muted";
  if (!href) {
    return (
      <span role="link" aria-disabled="true" className={cx(className, "opacity-50")}>
        Full screen
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      Full screen
    </Link>
  );
}

function ThreadHistory({
  threads,
  openId,
  opening,
  onOpen,
}: {
  threads: ThreadSummary[];
  openId: ThreadId | null;
  opening: ThreadId | null;
  onOpen: (threadId: ThreadId) => void;
}) {
  if (threads.length === 0) return <p className="text-body text-muted">No earlier chats</p>;
  return (
    <ul className="divide-y divide-border">
      {threads.map((thread) => (
        <li key={thread.id}>
          <button
            type="button"
            aria-current={thread.id === openId ? "true" : undefined}
            aria-busy={thread.id === opening || undefined}
            onClick={() => onOpen(thread.id)}
            className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left"
          >
            <span className={cx("min-w-0 truncate text-body", thread.id === openId && "font-medium")}>
              {thread.title}
            </span>
            <span className="shrink-0 text-caption text-muted">
              {thread.id === opening ? "Opening" : shortDate(thread.updatedAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

async function fetchSnapshot(url: string): Promise<AgentChatSnapshot> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Chat request failed with ${response.status}`);
  return (await response.json()) as AgentChatSnapshot;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function runClientActions(
  messages: AgentMessage[],
  router: ReturnType<typeof useRouter>,
  onNavigate?: () => void,
) {
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const action of clientActionsFromParts(message.parts)) {
      if (action.type === "navigate") {
        router.push(action.href);
        onNavigate?.();
      }
    }
  }
}
