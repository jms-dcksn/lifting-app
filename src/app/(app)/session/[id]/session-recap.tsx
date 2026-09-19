"use client";

import { useState } from "react";
import type { ExerciseRecords } from "@/lib/strength/records";
import type { SessionFeedback } from "@/lib/session-feedback";
import { retryServerAction } from "@/lib/retry";
import { updateSessionFeedback } from "../actions";
import { AchievementRecap } from "./achievements";
import { SessionFeedbackDetails, SessionFeedbackSheet } from "./session-feedback";
import { RecapNav } from "./session-nav";

export function SessionRecap({
  sessionId,
  dayName,
  totalSets,
  achievements,
  initialFeedback,
}: {
  sessionId: string;
  dayName: string;
  totalSets: number;
  achievements: ExerciseRecords[];
  initialFeedback: SessionFeedback;
}) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [editing, setEditing] = useState(false);

  async function handleFeedbackEdit(nextFeedback: Pick<SessionFeedback, "jointPain" | "note">) {
    const saved = await retryServerAction(
      () => updateSessionFeedback({ sessionId, ...nextFeedback }),
      { onRetry: () => {} },
    );
    setFeedback((current) => ({ ...current, ...saved }));
    setEditing(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 pt-8">
      <AchievementRecap
        groups={achievements}
        dayName={dayName}
        totalSets={totalSets}
        titleAs="h1"
        empty="hero"
      />

      <SessionFeedbackDetails feedback={feedback} onEdit={() => setEditing(true)} />

      <RecapNav sessionId={sessionId} />

      {editing && (
        <SessionFeedbackSheet
          initial={feedback}
          mode="edit"
          onClose={() => setEditing(false)}
          onSubmit={handleFeedbackEdit}
        />
      )}
    </div>
  );
}
