"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import {
  JOINT_PAIN_VALUES,
  SESSION_NOTE_MAX_LENGTH,
  type JointPain,
  type SessionFeedback,
} from "@/lib/session-feedback";
import { saveSessionReadiness } from "../actions";

export function ReadinessPrompt({ sessionId }: { sessionId: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (dismissed || saved != null) return null;

  return (
    <Card tone="active">
      <CardLabel className="mb-1">Pre-workout readiness</CardLabel>
      <p className="text-body text-muted">How ready do you feel to train right now?</p>
      <div className="mt-3 grid grid-cols-5 gap-2" role="group" aria-label="Readiness from 1 to 5">
        {[1, 2, 3, 4, 5].map((value) => (
          <Button
            key={value}
            type="button"
            variant="secondary"
            size="lg"
            className="min-w-0 px-0 tabular-nums"
            pending={pending && saving === value}
            disabled={pending}
            aria-label={`${value} out of 5 readiness`}
            onClick={() => {
              setError(null);
              setSaving(value);
              startTransition(async () => {
                try {
                  setSaved(await saveSessionReadiness({ sessionId, readiness: value }));
                } catch {
                  setError("Couldn’t save readiness. You can keep training and try again later.");
                } finally {
                  setSaving(null);
                }
              });
            }}
          >
            {value}
          </Button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-caption text-muted">
        <span>1 = depleted</span>
        <span>5 = ready</span>
      </div>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setDismissed(true)}>
        Skip
      </Button>
      {error && <p className="mt-2 text-caption text-danger">{error}</p>}
    </Card>
  );
}

export function SessionFeedbackCard({
  feedback,
  onEdit,
}: {
  feedback: SessionFeedback;
  onEdit?: () => void;
}) {
  const painLabel = feedback.jointPain
    ? `${feedback.jointPain[0].toUpperCase()}${feedback.jointPain.slice(1)}`
    : "Not logged";

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardLabel className="mb-2">Session feedback</CardLabel>
          <p className="text-body">
            Readiness: {feedback.readiness == null ? "not logged" : `${feedback.readiness}/5`}
          </p>
          <p className={feedback.jointPain === "significant" ? "text-body text-danger" : "text-body"}>
            Joint pain: {painLabel}
          </p>
        </div>
        {onEdit && (
          <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
      {feedback.note && <p className="mt-3 whitespace-pre-wrap text-body text-muted">{feedback.note}</p>}
      {feedback.jointPain === "significant" && (
        <p className="mt-3 text-caption text-danger">
          Pause progression advice and review this before loading the affected area again.
        </p>
      )}
    </Card>
  );
}

export function SessionFeedbackSheet({
  initial,
  mode,
  onClose,
  onSubmit,
}: {
  initial: Pick<SessionFeedback, "jointPain" | "note">;
  mode: "finish" | "edit";
  onClose: () => void;
  onSubmit: (feedback: { jointPain: JointPain | null; note: string | null }) => Promise<void>;
}) {
  const [jointPain, setJointPain] = useState<JointPain | null>(initial.jointPain);
  const [note, setNote] = useState(initial.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(next = { jointPain, note: note || null }) {
    setError(null);
    startTransition(async () => {
      try {
        await onSubmit(next);
      } catch {
        setError("Couldn’t save feedback. Check your connection and try again.");
      }
    });
  }

  const label = mode === "finish" ? "Finish workout" : "Save feedback";

  return (
    <Sheet onClose={onClose}>
      <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h2 className="text-heading">{mode === "finish" ? "How did that session feel?" : "Edit session feedback"}</h2>
        <p className="mt-1 text-body text-muted">Optional. Two quick signals help explain your performance.</p>

        <fieldset className="mt-5">
          <legend className="text-caption font-semibold uppercase tracking-wide text-muted">Joint pain</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[...JOINT_PAIN_VALUES, null].map((value) => (
              <Button
                key={value ?? "not-logged"}
                type="button"
                variant={jointPain === value ? "primary" : "secondary"}
                size="lg"
                className="min-w-0 capitalize"
                aria-pressed={jointPain === value}
                onClick={() => setJointPain(value)}
              >
                {value ?? "Not logged"}
              </Button>
            ))}
          </div>
        </fieldset>

        <label className="mt-5 block">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted">Session note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={SESSION_NOTE_MAX_LENGTH}
            rows={3}
            placeholder="Anything the numbers won’t explain?"
            className="mt-2 w-full resize-none rounded-control border border-border bg-surface px-3 py-3 text-body text-foreground outline-none placeholder:text-faint focus:border-border-strong"
          />
          <span className="mt-1 block text-right text-caption tabular-nums text-muted">
            {note.length}/{SESSION_NOTE_MAX_LENGTH}
          </span>
        </label>

        {error && <p className="mt-3 text-caption text-danger">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <Button type="button" size="lg" className="w-full" pending={pending} onClick={() => submit()}>
            {label}
          </Button>
          {mode === "finish" ? (
            <Button
              type="button"
              variant="ghost"
              size="md"
              className="w-full"
              disabled={pending}
              onClick={() => submit({ jointPain: null, note: null })}
            >
              Skip and finish
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="md" className="w-full" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
