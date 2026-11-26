"use client";

import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useMemo, useRef, type ComponentProps, type ReactNode, type Ref } from "react";
import { IconButton, iconButtonClasses } from "@/components/ui/icon-button";
import { IconCopy, IconSend } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import type { transcriptView } from "@/lib/agent/chat-state";
import { AgentBubble, savedAgentBubble } from "./agent-transcript";

type Bubble = ComponentProps<typeof AgentBubble>;
type Transcript = ReturnType<typeof transcriptView>;

function toRuntimeMessage(id: string, { role, text, tools, activity }: Bubble): ThreadMessageLike {
  return {
    id,
    role,
    content: text,
    metadata: { custom: { tools, activity } },
  };
}

function convertMessage(message: ThreadMessageLike) {
  return message;
}

export function AssistantCoachConversation({
  transcript, blocked, draft, onDraftChange, inputRef, onSend, children,
}: {
  transcript: Transcript;
  blocked: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
  inputRef: Ref<HTMLTextAreaElement>;
  onSend: (text: string) => Promise<void>;
  children: (messageRows: ReactNode) => ReactNode;
}) {
  const { messages, pendingText, pending, streamingText, tools } = transcript;
  const viewport = useRef<HTMLDivElement>(null);
  const saved = useMemo(() => messages.flatMap((message) => {
    const bubble = savedAgentBubble(message);
    return bubble ? [toRuntimeMessage(message.id, bubble)] : [];
  }), [messages]);
  const visible = useMemo(() => {
    if (!pending && !pendingText && !streamingText) return saved;
    const rows = [...saved];
    if (pendingText) rows.push(toRuntimeMessage("coach-local-input", { role: "user", text: pendingText }));
    rows.push(toRuntimeMessage("coach-local-reply", {
      role: "assistant",
      text: streamingText ?? "",
      activity: pending ? tools : undefined,
    }));
    return rows;
  }, [pending, pendingText, saved, streamingText, tools]);

  const runtime = useExternalStoreRuntime({
    messages: visible,
    convertMessage,
    isRunning: pending,
    isDisabled: blocked,
    onNew: async ({ content }) => {
      const text = content.flatMap((part) => part.type === "text" ? [part.text] : []).join("").trim();
      if (text && !blocked && !pending) await onSend(text);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport
          ref={viewport}
          tabIndex={0}
          role="region"
          aria-label="Chat messages"
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
          scrollToBottomOnRunStart={false}
        >
          {children(<ThreadPrimitive.Messages>{() => <AssistantCoachMessage />}</ThreadPrimitive.Messages>)}
          <div className="pointer-events-none sticky bottom-2 z-10 flex h-0 justify-center">
            <ThreadPrimitive.ScrollToBottom
              asChild
              aria-label="Jump to latest"
              behavior="instant"
              onClick={() => viewport.current?.focus({ preventScroll: true })}
              className="pointer-events-auto absolute bottom-0 shadow-sm disabled:hidden"
            >
              <Button type="button" variant="secondary">Jump to latest</Button>
            </ThreadPrimitive.ScrollToBottom>
          </div>
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim() && !blocked && !pending) void onSend(draft.trim());
          }}
          className="flex shrink-0 items-end gap-2 border-t border-border bg-background px-4 py-3"
        >
          <ComposerPrimitive.Input
            ref={inputRef}
            aria-label="Message"
            placeholder="Message Coach"
            value={draft}
            minRows={1}
            maxRows={5}
            submitMode="enter"
            cancelOnEscape={false}
            addAttachmentOnPaste={false}
            onChange={(event) => {
              onDraftChange(event.currentTarget.value);
              // The app draft also receives suggestions and restores failed sends.
              event.preventDefault();
            }}
            className="min-h-11 w-full min-w-0 resize-none rounded-control border border-border-strong bg-surface px-3 py-2.5 text-base leading-6 text-foreground placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground disabled:opacity-60"
          />
          <IconButton type="submit" aria-label="Send" pending={pending} disabled={!draft.trim() || blocked}>
            <IconSend />
          </IconButton>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function AssistantCoachMessage() {
  const message = useAuiState((state) => state.message);
  if (message.role === "system") return null;
  const text = message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("");
  // Only toRuntimeMessage populates this metadata, using Coach's display fields.
  const { tools, activity } = message.metadata.custom as Pick<Bubble, "tools" | "activity">;
  return (
    <MessagePrimitive.Root asChild>
      <li>
        <AgentBubble role={message.role} text={text} tools={tools} activity={activity} />
        {text && !message.id.startsWith("coach-local-") ? (
          <div className={message.role === "user" ? "flex justify-end" : "flex"}>
            <ActionBarPrimitive.Copy
              aria-label={message.role === "user" ? "Copy your message" : "Copy Coach message"}
              className={iconButtonClasses("ghost")}
            >
              {message.isCopied ? <span className="text-caption" aria-hidden>Copied</span> : <IconCopy size={18} />}
              <span className="sr-only" aria-live="polite">{message.isCopied ? "Message copied" : ""}</span>
            </ActionBarPrimitive.Copy>
          </div>
        ) : null}
      </li>
    </MessagePrimitive.Root>
  );
}
