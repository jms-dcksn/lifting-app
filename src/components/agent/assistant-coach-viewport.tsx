"use client";

import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useMemo, type ComponentProps, type ReactNode } from "react";
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

export default function AssistantCoachViewport({
  transcript, blocked, onSend, children,
}: {
  transcript: Transcript;
  blocked: boolean;
  onSend: (text: string) => Promise<void>;
  children: (messageRows: ReactNode) => ReactNode;
}) {
  const { messages, pendingText, pending, streamingText, tools } = transcript;
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
      <ThreadPrimitive.Root className="min-h-0 flex-1">
        <ThreadPrimitive.Viewport className="h-full overflow-y-auto px-4" scrollToBottomOnRunStart={false}>
          {children(<ThreadPrimitive.Messages>{() => <AssistantCoachMessage />}</ThreadPrimitive.Messages>)}
        </ThreadPrimitive.Viewport>
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
      <li><AgentBubble role={message.role} text={text} tools={tools} activity={activity} /></li>
    </MessagePrimitive.Root>
  );
}
