"use client";

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useReducer, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "@/components/ui/cx";
import { IconHistory, IconPlus, IconSend } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { clientActionsFromParts, pendingConfirmFromMessages } from "@/lib/agent/client-tools";
import { startNextSession } from "@/app/(app)/session/actions";
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
import { coachActivityLabel } from "@/lib/agent/activity";
import { readSseEvents } from "@/lib/agent/stream";
import { AgentTranscript } from "./agent-transcript";
import { CoachThreadReview } from "@/components/coach/coach-thread-review";
import { COACH_DISCUSSION_PROMPT, isCoachReviewSeed, presentCoachReviewSeed } from "@/lib/coach-discussion";
import { Button } from "@/components/ui/button";

export function AgentChat({
  initial,
  variant,
  onNavigate,
  discuss = false,
}: {
  initial?: AgentChatSnapshot;
  variant: "sheet" | "page";
  onNavigate?: () => void;
  discuss?: boolean;
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
  const discussionStarted = useRef(false);
  const unansweredReview = screen.name === "chat" && screen.conversation.kind === "saved"
    && screen.conversation.messages.length === 1 && isCoachReviewSeed(screen.conversation.messages[0]);

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

  const sendTurn = useCallback(async (text: string, review = false) => {
    if ((!text && !review) || screen.name !== "chat" || screen.turn) return;
    const { conversation } = screen;
    if (!review) setDraft("");
    dispatch({ type: "send", optimisticId: review && conversation.kind === "saved" ? conversation.messages[0].id : `local-${Date.now()}`, text: review ? COACH_DISCUSSION_PROMPT : text });
    let userTextStored = false;
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(review ? { discuss: true } : { text }),
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
      if (!review && !userTextStored) setDraft((current) => current || text);
    }
  }, [screen, pathname, router, onNavigate]);

  const beginDiscussion = useEffectEvent(() => { void sendTurn("", true); });

  useEffect(() => {
    if (!discuss || discussionStarted.current || screen.name !== "chat") return;
    discussionStarted.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("discuss");
    window.history.replaceState(null, "", url.pathname + url.search);
    // Consume the explicit navigation intent once, after this mount commits.
    if (unansweredReview) queueMicrotask(beginDiscussion);
  }, [discuss, screen.name, unansweredReview]);

  async function send(event: FormEvent) {
    event.preventDefault();
    await sendTurn(draft.trim());
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
        {screen.name === "chat" && screen.conversation.kind === "saved" ? <CoachThreadReview key={screen.conversation.threadId} threadId={screen.conversation.threadId} /> : null}
        {view ? (
          <AgentTranscript
            {...view}
            messages={view.messages.map(presentCoachReviewSeed)}
            confirmedCallIds={confirmedCallIds}
            onConfirm={async (callId) => {
              const pending = pendingConfirmFromMessages(view.messages);
              if (!pending || pending.callId !== callId) return;
              if (pending.tool === "startNextWorkout") {
                await startNextSession();
              } else if (pending.href) {
                router.push(pending.href);
              }
              setConfirmedCallIds((current) => new Set(current).add(callId));
              onNavigate?.();
            }}
            onChipSelect={(label) => setDraft((current) => (current ? `${current} ${label}` : label))}
          />
        ) : null}
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {view?.pending ? coachActivityLabel(view.tools) : ""}
      </p>
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
      {error && unansweredReview ? <Button variant="secondary" className="mx-4 mb-3" onClick={() => void sendTurn("", true)}>Retry discussion</Button> : null}
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
