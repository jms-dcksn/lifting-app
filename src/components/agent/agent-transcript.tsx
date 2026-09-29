"use client";

import { latestConfirmCallId } from "@/lib/agent/client-tools";
import { intakeChipsFromParts } from "@/lib/agent/intake-chips";
import { splitCoachReply } from "@/lib/agent/markdown";
import { textFromParts, type AgentMessage } from "@/lib/agent/messages";
import { AgentConfirmChip } from "./agent-confirm-chip";
import { CoachMarkdown } from "./coach-markdown";

export function AgentTranscript({
  messages,
  pendingText,
  streamingText,
  pendingTool,
  confirmedCallIds = new Set<string>(),
  onConfirmStarted,
  onChipSelect,
}: {
  messages: AgentMessage[];
  pendingText?: string;
  streamingText?: string;
  pendingTool?: string | null;
  confirmedCallIds?: ReadonlySet<string>;
  onConfirmStarted?: (callId: string) => void;
  onChipSelect?: (label: string) => void;
}) {
  const confirmCallId = latestConfirmCallId(messages);
  const showConfirm = confirmCallId !== null && !confirmedCallIds.has(confirmCallId);
  const intakeChips = intakeChipsFromParts(messages.flatMap((message) => message.parts));
  if (messages.length === 0 && !pendingText && !streamingText && !pendingTool) {
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
      {pendingText ? (
        <li>
          <YouBubble text={pendingText} />
        </li>
      ) : null}
      {pendingTool ? (
        <li className="text-caption text-faint">Looking up {toolLabel(pendingTool)}</li>
      ) : null}
      {streamingText ? (
        <li>
          <CoachReply text={streamingText} />
        </li>
      ) : null}
      {showConfirm ? (
        <li>
          <AgentConfirmChip
            label="Start workout"
            onStarted={() => onConfirmStarted?.(confirmCallId!)}
          />
        </li>
      ) : null}
      {intakeChips.length > 0 && onChipSelect ? (
        <li>
          <div className="flex flex-wrap gap-2">
            {intakeChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => onChipSelect(chip)}
                className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-caption text-body hover:bg-muted"
              >
                {chip}
              </button>
            ))}
          </div>
        </li>
      ) : null}
    </ol>
  );
}

function AgentBubble({ message }: { message: AgentMessage }) {
  const text = textFromParts(message.parts);
  const tools = message.parts.flatMap((part) => (part.type === "tool-call" ? [part.name] : []));
  if (message.role === "tool") return null;
  if (message.role === "user") return text ? <YouBubble text={text} /> : null;
  if (!text) {
    if (tools.length === 0) return null;
    return <p className="text-caption text-faint">Checked {tools.map(toolLabel).join(" · ")}</p>;
  }
  return <CoachReply text={text} tools={tools} />;
}

function YouBubble({ text }: { text: string }) {
  return (
    <div className="ml-auto flex max-w-[92%] flex-col items-end gap-1.5">
      <p className="text-caption font-semibold uppercase tracking-wide text-calibrate">You</p>
      <p className="rounded-card bg-accent px-3 py-2.5 text-left text-body whitespace-pre-wrap text-accent-foreground">
        {text}
      </p>
    </div>
  );
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
  if (name === "openCoachCheckIn") return "Coach check-in";
  if (name === "openExerciseReview") return "exercise review";
  if (name === "openProgram") return "your program";
  if (name === "startNextWorkout") return "next workout";
  if (name === "draftProgramFromIntake") return "program draft";
  return name;
}
