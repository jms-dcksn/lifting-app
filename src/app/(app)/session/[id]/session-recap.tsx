"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button-styles";
import { sessionPath } from "@/lib/session-paths";
import type { ExerciseRecords } from "@/lib/strength/records";
import type { SessionFeedback } from "@/lib/session-feedback";
import { retryServerAction } from "@/lib/retry";
import { updateSessionFeedback } from "../actions";
import { AchievementRecap } from "./achievements";
import { SessionFeedbackDetails, SessionFeedbackSheet } from "./session-feedback";

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

      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
        <Link href="/" className={buttonClasses("primary", "lg", "w-full animate-rise")}>
          Home
        </Link>
        <Link href={sessionPath(sessionId)} className={buttonClasses("secondary", "lg", "w-full")}>
          View workout
        </Link>
      </div>

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
