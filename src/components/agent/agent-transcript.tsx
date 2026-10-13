"use client";

import { toolActivityLabel, type ToolActivity } from "@/lib/agent/activity";
import { pendingConfirmFromMessages } from "@/lib/agent/client-tools";
import { intakeChipsFromParts } from "@/lib/agent/intake-chips";
import { STARTER_PROMPTS } from "@/lib/agent/starter-prompts";
import { splitCoachReply } from "@/lib/agent/markdown";
import { textFromParts, type AgentMessage } from "@/lib/agent/messages";
import { AgentConfirmChip } from "./agent-confirm-chip";
import { CoachMarkdown } from "./coach-markdown";

export function AgentTranscript({
  messages,
  pendingText,
  streamingText,
  pending = false,
  tools = [],
  confirmedCallIds = new Set<string>(),
  onConfirm,
  onChipSelect,
}: {
  messages: AgentMessage[];
  pendingText?: string;
  streamingText?: string;
  pending?: boolean;
  tools?: ToolActivity[];
  confirmedCallIds?: ReadonlySet<string>;
  onConfirm?: (callId: string) => void | Promise<void>;
  onChipSelect?: (label: string) => void;
}) {
  const pendingConfirm = pendingConfirmFromMessages(messages);
  const showConfirm = pendingConfirm !== null && !confirmedCallIds.has(pendingConfirm.callId);
  const intakeChips = intakeChipsFromParts(messages.flatMap((message) => message.parts));
  const showStarterPrompts = messages.length === 0 && !pendingText && !streamingText && !pending;
  if (showStarterPrompts) {
    return (
      <div className="space-y-3">
        <p className="text-body text-muted">Ask Coach about your week, next workout, or a gallery program.</p>
        {onChipSelect ? (
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onChipSelect(prompt)}
                className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-caption text-body hover:bg-muted"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
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
      {pending || streamingText ? (
        <li>
          <CoachReply text={streamingText ?? ""} activity={pending ? tools : undefined} />
        </li>
      ) : null}
      {showConfirm && pendingConfirm ? (
        <li>
          <AgentConfirmChip
            label={pendingConfirm.label}
            pendingLabel={pendingConfirm.tool === "startNextWorkout" ? "Starting…" : "Opening…"}
            onConfirm={() => onConfirm?.(pendingConfirm.callId)}
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
  const text = textFromParts(message.parts).trim();
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

function CoachReply({ text, tools = [], activity }: {
  text: string;
  tools?: string[];
  activity?: ToolActivity[];
}) {
  const { body, sources } = splitCoachReply(text);
  return (
    <div className="mr-auto flex max-w-[92%] flex-col items-start gap-1.5">
      {tools.length > 0 ? (
        <p className="text-caption text-faint">Checked {tools.map(toolLabel).join(" · ")}</p>
      ) : null}
      <p className="text-caption font-semibold uppercase tracking-wide">Coach</p>
      {body || activity ? (
        <div className="relative overflow-hidden rounded-card border border-border-strong bg-surface px-3 py-2.5 text-body before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-calibrate">
          {body ? <CoachMarkdown body={body} /> : null}
          {activity ? (
            <div className={body ? "mt-3" : undefined}>
              {activity.length > 0 ? (
                <ul className="mb-2 space-y-1 text-caption text-muted" aria-hidden="true">
                  {activity.map((tool) => <li key={tool.callId}>{toolActivityLabel(tool)}</li>)}
                </ul>
              ) : null}
              <span className="flex h-5 items-center gap-1.5" aria-hidden="true">
                {[0, 1, 2].map((dot) => (
                  <span key={dot} className="coach-dot size-1.5 rounded-full bg-muted"
                    style={{ animationDelay: `${dot * 140}ms` }} />
                ))}
              </span>
            </div>
          ) : null}
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
