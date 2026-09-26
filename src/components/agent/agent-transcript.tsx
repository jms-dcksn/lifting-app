"use client";

import { textFromParts, type AgentMessage } from "@/lib/agent/messages";

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
      {messages.map((message) => (
        <li key={message.id}>
          <AgentBubble message={message} />
        </li>
      ))}
      {pendingTool ? (
        <li className="text-caption text-muted">Looking up {toolLabel(pendingTool)}</li>
      ) : null}
      {streamingText ? (
        <li>
          <p className="text-caption text-muted">Coach</p>
          <p className="text-body whitespace-pre-wrap">{streamingText}</p>
        </li>
      ) : null}
    </ol>
  );
}

function AgentBubble({ message }: { message: AgentMessage }) {
  const text = textFromParts(message.parts);
  const tools = message.parts.flatMap((part) => {
    if (part.type === "tool-call") return [part.name];
    return [];
  });
  if (message.role === "tool") return null;
  return (
    <div>
      <p className="text-caption text-muted">{message.role === "user" ? "You" : "Coach"}</p>
      {tools.length > 0 ? (
        <p className="text-caption text-muted">{tools.map(toolLabel).join(" · ")}</p>
      ) : null}
      {text ? <p className="text-body whitespace-pre-wrap">{text}</p> : null}
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
