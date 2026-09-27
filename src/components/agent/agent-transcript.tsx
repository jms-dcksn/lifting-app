"use client";

import { splitCoachReply } from "@/lib/agent/markdown";
import { textFromParts, type AgentMessage } from "@/lib/agent/messages";
import { CoachMarkdown } from "./coach-markdown";

export function AgentTranscript({
  messages,
  streamingText,
  pendingTool,
}: {
  messages: AgentMessage[];
  streamingText?: string;
  pendingTool?: string | null;
}) {
  if (messages.length === 0 && !streamingText && !pendingTool) {
    return <p className="text-body text-muted">Ask how this week went.</p>;
  }

  return (
    <ol className="flex flex-col gap-4">
      {messages.map((message) =>
        message.role === "tool" ? null : (
          <li key={message.id}>
            <AgentBubble message={message} />
          </li>
        ),
      )}
      {pendingTool ? (
        <li className="text-caption text-faint">Looking up {toolLabel(pendingTool)}</li>
      ) : null}
      {streamingText ? (
        <li>
          <CoachReply text={streamingText} />
        </li>
      ) : null}
    </ol>
  );
}

function AgentBubble({ message }: { message: AgentMessage }) {
  const text = textFromParts(message.parts);
  const tools = message.parts.flatMap((part) => (part.type === "tool-call" ? [part.name] : []));
  if (message.role === "tool") return null;
  if (message.role === "user") {
    if (!text) return null;
    return (
      <div className="ml-auto flex max-w-[92%] flex-col items-end gap-1.5">
        <p className="text-caption font-semibold uppercase tracking-wide text-calibrate">You</p>
        <p className="rounded-card bg-accent px-3 py-2.5 text-left text-body whitespace-pre-wrap text-accent-foreground">
          {text}
        </p>
      </div>
    );
  }
  if (!text) {
    if (tools.length === 0) return null;
    return <p className="text-caption text-faint">Checked {tools.map(toolLabel).join(" · ")}</p>;
  }
  return <CoachReply text={text} tools={tools} />;
}

function CoachReply({ text, tools = [] }: { text: string; tools?: string[] }) {
  const { body, sources } = splitCoachReply(text);
  return (
    <div className="mr-auto flex max-w-[92%] flex-col items-start gap-1.5">
      {tools.length > 0 ? (
        <p className="text-caption text-faint">Checked {tools.map(toolLabel).join(" · ")}</p>
      ) : null}
      <p className="text-caption font-semibold uppercase tracking-wide">Coach</p>
      {body ? (
        <div className="relative overflow-hidden rounded-card border border-border-strong bg-surface px-3 py-2.5 text-body before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-calibrate">
          <CoachMarkdown body={body} />
        </div>
      ) : null}
      {sources.length > 0 ? <p className="text-caption text-faint">{sources.join(" · ")}</p> : null}
    </div>
  );
}

function toolLabel(name: string) {
  if (name === "weeklyCoach") return "this week's Coach report";
  if (name === "activeProgram") return "your program";
  if (name === "exerciseReview") return "exercise review";
  if (name === "nextWorkout") return "next workout targets";
  return name;
}
