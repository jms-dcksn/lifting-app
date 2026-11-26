"use client";

import { PageHeader } from "@/components/ui/page-header";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "@/components/ui/cx";
import { IconHistory, IconPlus } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
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
import { AssistantCoachConversation } from "./assistant-coach-viewport";
import { coachFocusParams, coachDetailsHref, type CoachFocus } from "@/lib/coach-entry";
import { CoachThreadReview } from "@/components/coach/coach-thread-review";
import { COACH_DISCUSSION_PROMPT, isCoachReviewSeed } from "@/lib/coach-discussion";
import { Button } from "@/components/ui/button";
import type { EpisodeReview } from "@/lib/coach-conversation-data";
import { preparePendingSend } from "@/lib/agent/pending-send";
import { useVisualKeyboardInset } from "@/components/ui/use-visual-keyboard-inset";

export function AgentChat({
  initial,
  initialReview,
  variant,
  onNavigate,
  focus,
  focusLabel,
  discuss = false,
}: {
  initial?: AgentChatSnapshot;
  initialReview?: EpisodeReview | null;
  focus?: CoachFocus;
  focusLabel?: string;
  variant: "sheet" | "page";
  onNavigate?: () => void;
  discuss?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [{ threads, screen, error }, dispatch] = useReducer(chatReducer, initial, initialChatState);
  const [draft, setDraft] = useState("");
  const [confirmedCallIds, setConfirmedCallIds] = useState<Set<string>>(() => new Set());
  const composer = useRef<HTMLTextAreaElement>(null);
  const keyboardInset = useVisualKeyboardInset(variant === "page");
  const navigable = canNavigate(screen);
  const baseHref = screen.name === "loading" ? null : fullScreenHref(screen.conversation);
  const focusQuery = focus ? coachFocusParams(focus).toString() : "";
  const href = baseHref && focusQuery ? `${baseHref}${baseHref.includes("?") ? "&" : "?"}${focusQuery}` : baseHref;
  const shownHref = useRef(href);
  const view = screen.name === "chat" ? transcriptView(screen.conversation, screen.turn) : null;
  const discussionStarted = useRef(false);
  const sendAbort = useRef<AbortController | null>(null);
  const refreshAbort = useRef<AbortController | null>(null);
  useEffect(() => () => {
    sendAbort.current?.abort();
    refreshAbort.current?.abort();
  }, []);
  const runtime = screen.name === "chat" && screen.conversation.kind === "saved" ? screen.conversation.runtime : undefined;
  const blocked = runtime && (runtime.readOnly || runtime.status !== "completed");
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

  const sendTurn = useCallback(async (text: string, review = false, resume = false) => {
    if ((!text && !review && !resume) || screen.name !== "chat" || screen.turn || sendAbort.current) return;
    const { conversation } = screen;
    const status = conversation.kind === "saved" ? conversation.runtime : undefined;
    if (resume ? (!status || status.readOnly || status.status !== "interrupted") : blocked) return;
    const controller = new AbortController();
    sendAbort.current = controller;
    refreshAbort.current?.abort();
    if (!review && !resume) setDraft("");
    const existingInput = conversation.kind === "saved" ? conversation.messages.findLast(message => message.role === "user") : undefined;
    dispatch({ type: "send", optimisticId: (review || resume) && existingInput ? existingInput.id : `local-${Date.now()}`, text: review ? COACH_DISCUSSION_PROMPT : text });
    let userTextStored = false;
    try {
      const payload = {
        ...(review ? { discuss: true } : { text }),
        threadId: conversation.kind === "saved" ? conversation.threadId : null,
        context: { ...parseScreenContextFromPath(pathname), ...(focus ? { focusedExerciseId: focus.exerciseId, focusedEquipmentInstanceId: focus.equipmentInstanceId, reviewMonth: focus.month } : {}) },
      };
      const pending = await preparePendingSend(payload, sessionStorage.getItem("coach.pendingSend.v1"));
      if (controller.signal.aborted) return;
      if (!resume) sessionStorage.setItem("coach.pendingSend.v1", pending.stored);
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: resume && conversation.kind === "saved" && conversation.runtime
          ? JSON.stringify({ ...payload, resume: true, requestId: conversation.runtime.requestId }) : pending.body,
      });
      if (!response.ok || !response.body) {
        throw new Error(response.status === 401 ? "Sign in again to send a message."
          : response.status === 503 ? "Coach is temporarily unavailable. Try again."
          : "Could not send your message. Try again.");
      }
      for await (const streamEvent of readSseEvents(response.body)) {
        if (controller.signal.aborted) return;
        if (streamEvent.type === "thread") userTextStored = true;
        dispatch({ type: "event", event: streamEvent });
        if (streamEvent.type === "done") {
          sessionStorage.removeItem("coach.pendingSend.v1");
          if (!streamEvent.replayed) runClientActions(streamEvent.messages, router, onNavigate);
          return;
        }
        if (streamEvent.type === "pending" || streamEvent.type === "error") return;
      }
      dispatch({ type: "closed", error: "Connection lost." });
    } catch (caught) {
      if (!controller.signal.aborted) {
        dispatch({ type: "closed", error: caught instanceof TypeError ? "Connection lost. Try again." : caught instanceof Error ? caught.message : "Could not send." });
      }
    } finally {
      if (sendAbort.current === controller) sendAbort.current = null;
      if (!review && !resume && !userTextStored && !controller.signal.aborted) setDraft((current) => current || text);
    }
  }, [screen, pathname, router, onNavigate, focus, blocked]);

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

  async function refreshResponse() {
    if (screen.name !== "chat" || screen.conversation.kind !== "saved" || sendAbort.current) return;
    refreshAbort.current?.abort();
    const controller = new AbortController();
    refreshAbort.current = controller;
    try {
      const snapshot = await fetchSnapshot(`/api/agent/chat?thread=${screen.conversation.threadId}`, controller.signal);
      if (!controller.signal.aborted) dispatch({ type: "refreshed", snapshot });
    } catch {
      if (!controller.signal.aborted) dispatch({ type: "refresh-failed", error: "Could not refresh. Please retry." });
    } finally {
      if (refreshAbort.current === controller) refreshAbort.current = null;
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

  const headerActions = (<>
        <IconButton
          type="button"
          variant="ghost"
          aria-label="Chat history"
          aria-pressed={screen.name === "history"}
          disabled={!navigable}
          onClick={() => {
            refreshAbort.current?.abort();
            dispatch({ type: "toggle-history" });
          }}
        >
          <IconHistory />
        </IconButton>
        <IconButton
          type="button"
          variant="ghost"
          aria-label="New chat"
          disabled={!navigable}
          onClick={() => {
            refreshAbort.current?.abort();
            dispatch({ type: "new-chat" });
          }}
        >
          <IconPlus />
        </IconButton>
  </>);

  const renderViewportContent = (messageRows?: ReactNode) => (
    <>
      {variant === "page" && navigable && <Link className="mb-3 inline-flex min-h-11 items-center text-caption underline" href={coachDetailsHref(focus ?? { exerciseId: null, equipmentInstanceId: null, month: null })}>Report details</Link>}
      {focus && (focus.exerciseId || focus.month) && <aside className="mb-3 rounded-card border border-border p-3 text-sm"><p>{focusLabel ?? "Training review"}{focus.month ? ` · ${focus.month}` : ""}</p><p className="mt-2 text-muted">Current exceptions use the latest training evidence. Historical reports keep their own date windows.</p><Link className="inline-flex min-h-11 items-center underline" href={coachDetailsHref(focus)}>See report details</Link></aside>}
      {screen.name === "loading" ? <p className="text-body text-muted">Loading</p> : null}
      {screen.name === "history" ? (
        <ThreadHistory
          threads={threads}
          openId={screen.conversation.kind === "saved" ? screen.conversation.threadId : null}
          opening={screen.opening}
          onOpen={openThread}
        />
      ) : null}
      {screen.name === "chat" && screen.conversation.kind === "saved" ? <CoachThreadReview key={screen.conversation.threadId} threadId={screen.conversation.threadId} initialReview={initial?.open.kind === "saved" && initial.open.threadId === screen.conversation.threadId ? initialReview : undefined} /> : null}
      {view ? (
        <AgentTranscript
          {...view}
          messageRows={messageRows}
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
          onChipSelect={blocked ? undefined : (label) => {
            setDraft((current) => current ? `${current} ${label}` : label);
            composer.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={keyboardInset ? { maxHeight: `calc(100dvh - ${keyboardInset}px)` } : undefined}>
      {variant === "page" ? (
        <div className="shrink-0 px-4 pb-3">
          <PageHeader title="Coach" actions={headerActions} />
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1 px-4 pb-3">
          <h2 className="mr-auto text-heading">Coach</h2>
          {headerActions}
          <FullScreenLink href={navigable ? href : null} />
        </div>
      )}
      {view ? (
        <AssistantCoachConversation
          transcript={view}
          blocked={Boolean(blocked)}
          draft={draft}
          onDraftChange={setDraft}
          inputRef={composer}
          onSend={sendTurn}
        >
          {renderViewportContent}
        </AssistantCoachConversation>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4">{renderViewportContent()}</div>
      )}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {view?.pending ? coachActivityLabel(view.tools) : ""}
      </p>
      {error ? <p role="alert" className="shrink-0 px-4 pb-3 text-caption text-danger">{error}</p> : null}
      {runtime && blocked && screen.name === "chat" && screen.turn === null ? <div className="mx-4 mb-3 space-y-2">
        <p role="status" className="text-caption text-muted">{runtime.readOnly ? "This conversation is temporarily read-only." : runtime.status === "running" ? "Your response is still running. Refresh to check its progress." : "Your saved response was interrupted. Resume to continue."}</p>
        <Button variant="secondary" onClick={() => void refreshResponse()}>Refresh response</Button>
        {!runtime.readOnly && runtime.status === "interrupted" ? <Button variant="secondary" onClick={() => void sendTurn("", false, true)}>Resume response</Button> : null}
      </div> : null}
      {error && unansweredReview && !runtime ? <Button variant="secondary" className="mx-4 mb-3" onClick={() => void sendTurn("", true)}>Retry discussion</Button> : null}
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

async function fetchSnapshot(url: string, signal?: AbortSignal): Promise<AgentChatSnapshot> {
  const response = await (signal ? fetch(url, { signal }) : fetch(url));
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
