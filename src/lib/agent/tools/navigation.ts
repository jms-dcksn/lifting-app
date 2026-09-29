import {
  coachCheckInHref,
  openExerciseReviewHref,
  openProgramHref,
} from "../client-tools";

export function openCoachCheckIn() {
  const href = coachCheckInHref();
  return {
    source: "openCoachCheckIn" as const,
    action: "navigate" as const,
    href,
  };
}

export function openExerciseReview(input: {
  exerciseId: string;
  equipmentInstanceId?: string | null;
}) {
  const href = openExerciseReviewHref(input);
  return {
    source: "openExerciseReview" as const,
    action: "navigate" as const,
    href,
    exerciseId: input.exerciseId,
    equipmentInstanceId: input.equipmentInstanceId ?? null,
  };
}

export function openProgram(programId: string) {
  const href = openProgramHref(programId);
  return {
    source: "openProgram" as const,
    action: "navigate" as const,
    href,
    programId,
  };
}

export function startNextWorkoutRequest() {
  return {
    source: "startNextWorkout" as const,
    action: "confirm" as const,
    message: "Tap Start workout in the chat to begin. The session does not start until you confirm.",
  };
}
