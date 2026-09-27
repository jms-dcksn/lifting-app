import type { CoachCheckInReport } from "@/lib/coach-check-in";
import type { CoachRecommendation } from "@/lib/coach-recommendations";
import { EXERCISES } from "@/lib/strength/coefficients";
import { groupReviewSessions, withProgramNames } from "@/lib/exercise-review-sessions";
import { summarizeExerciseReview } from "@/lib/agent/tools/exercise-review";
import { hydrateSlotTargets } from "@/lib/agent/tools/next-workout";

export const USER_ID = "user-eval";

const catalog = Object.fromEntries(EXERCISES.map((def) => [def.id, def]));

export const weeklyFixture = {
  source: "weeklyCoach" as const,
  checkInText: "Adherence 3/4. Average session 61 minutes. Barbell Back Squat e1RM 315.2.",
  report: {
    version: 1,
    generatedAt: "2026-09-20T12:00:00.000Z",
    timeZone: "America/Chicago",
    windows: {
      current: { startDate: "2026-09-14", endDate: "2026-09-20" },
      prior: { startDate: "2026-09-07", endDate: "2026-09-13" },
    },
    program: { name: "Strong Foundations", plannedSessionsPerWeek: 4 },
    bodyweight: {
      latest: 142,
      currentSevenDayAverage: 142.4,
      currentObservationCount: 3,
      priorSevenDayAverage: 143.1,
      priorObservationCount: 3,
      change: -0.7,
    },
    current: {
      window: { startDate: "2026-09-14", endDate: "2026-09-20" },
      adherence: { completedSessions: 3, plannedSessions: 4 },
      duration: {
        validSessionCount: 3,
        averageMinutes: 61,
        targetMinutes: 60,
        deltaFromTargetMinutes: 1,
      },
      setExecution: {
        completedWorkingSets: 36,
        linkedWorkingSets: 36,
        prescribedWorkingSets: 40,
        completionRate: 0.9,
      },
      rirExecution: {
        averageActual: 1.4,
        loggedSets: 36,
        missingSets: 0,
        zeroRirSets: 2,
        oneRirSets: 20,
        twoPlusRirSets: 14,
        withinTargetSets: 30,
        harderThanTargetSets: 2,
        easierThanTargetSets: 4,
        unmatchedTargetSets: 0,
      },
      specializationVolume: [],
      sessions: [],
      dataQuality: {
        unfinishedSessions: 0,
        implausibleDurationSessions: 0,
        sessionsMissingPrescription: 0,
        unmatchedProgramSlotSets: 0,
        missingRirSets: 0,
      },
    },
    prior: {
      window: { startDate: "2026-09-07", endDate: "2026-09-13" },
      adherence: { completedSessions: 4, plannedSessions: 4 },
      duration: {
        validSessionCount: 4,
        averageMinutes: 58,
        targetMinutes: 60,
        deltaFromTargetMinutes: -2,
      },
      setExecution: {
        completedWorkingSets: 40,
        linkedWorkingSets: 40,
        prescribedWorkingSets: 40,
        completionRate: 1,
      },
      rirExecution: {
        averageActual: 1.6,
        loggedSets: 40,
        missingSets: 0,
        zeroRirSets: 0,
        oneRirSets: 18,
        twoPlusRirSets: 22,
        withinTargetSets: 36,
        harderThanTargetSets: 0,
        easierThanTargetSets: 4,
        unmatchedTargetSets: 0,
      },
      specializationVolume: [],
      sessions: [],
      dataQuality: {
        unfinishedSessions: 0,
        implausibleDurationSessions: 0,
        sessionsMissingPrescription: 0,
        unmatchedProgramSlotSets: 0,
        missingRirSets: 0,
      },
    },
    exerciseTrends: [
      {
        exerciseId: "bb-back-squat",
        exerciseName: "Barbell Back Squat",
        currentE1rm: 315.2,
        priorE1rm: 310,
        change: 5.2,
      },
    ],
    fixedLoadRepProgress: [],
  } as unknown as CoachCheckInReport,
  recommendations: [
    {
      key: "add_load:slot-squat",
      kind: "add_load",
      exerciseId: "bb-back-squat",
      exerciseName: "Barbell Back Squat",
      programDayName: "Lower A",
      action: { label: "Add load", targetWeight: 230, targetReps: 6 },
      rationale: "Hit the top of the range.",
      evidence: {
        windowStart: "2026-09-14",
        windowEnd: "2026-09-20",
        exposureCount: 2,
        summary: ["225 × 8 @ 1"],
      },
      confidence: "high",
      dataSufficiency: "enough",
      priority: "now",
    },
    {
      key: "pain_review:session",
      kind: "pain_review",
      exerciseId: null,
      exerciseName: null,
      programDayName: "Lower A",
      action: { label: "Review pain", targetWeight: null, targetReps: null },
      rationale: "Joint pain was logged.",
      evidence: {
        windowStart: "2026-09-14",
        windowEnd: "2026-09-20",
        exposureCount: 1,
        summary: ["knee noted"],
      },
      confidence: "medium",
      dataSufficiency: "enough",
      priority: "now",
    },
  ] as CoachRecommendation[],
  decisions: [],
};

export const programFixture = {
  source: "activeProgram" as const,
  program: {
    id: "prog-1",
    name: "Strong Foundations",
    description: "Three lower-body days",
    tags: ["glute", "lower"],
    weeks: 12,
    style: "classic" as const,
    days: [
      {
        id: "day-lower-a",
        name: "Lower A",
        slots: [
          {
            id: "slot-squat",
            exerciseId: "bb-back-squat",
            pattern: "squat",
            targetSets: 3,
            repMin: 6,
            repMax: 8,
            targetRir: 1,
          },
        ],
      },
    ],
  },
};

const reviewSessions = withProgramNames(
  groupReviewSessions([
    {
      id: "set-1",
      sessionId: "s1",
      weight: 225,
      reps: 8,
      rir: 1,
      e1rm: 292.5,
      performedAt: "2026-09-04T12:00:00.000Z",
      finishedAt: "2026-09-04T13:00:00.000Z",
      programId: "prog-1",
    },
    {
      id: "set-2",
      sessionId: "s2",
      weight: 230,
      reps: 6,
      rir: 1,
      e1rm: 299,
      performedAt: "2026-09-18T12:00:00.000Z",
      finishedAt: "2026-09-18T13:00:00.000Z",
      programId: "prog-1",
    },
  ], new Date("2026-09-20T12:00:00.000Z")),
  new Map([["prog-1", "Strong Foundations"]]),
);

export const reviewFixture = summarizeExerciseReview({
  exerciseId: "bb-back-squat",
  exerciseName: "Barbell Back Squat",
  equipmentInstanceId: null,
  equipmentLabel: null,
  identities: [null],
  sessions: reviewSessions,
});

export const nextWorkoutFixture = {
  source: "nextWorkout" as const,
  workout: {
    programName: "Strong Foundations",
    dayName: "Lower A",
    week: 3,
    completedSessions: 8,
    openSessionId: null,
    slots: hydrateSlotTargets({
      slots: [
        {
          id: "slot-squat",
          exerciseId: "bb-back-squat",
          targetSets: 3,
          prescription: { repMin: 6, repMax: 8, targetRir: 1 },
        },
      ],
      catalog,
      stats: [],
      bodyweight: 142,
      progressionByExercise: {
        "bb-back-squat": [
          {
            programSlotId: "slot-squat",
            performedAt: "2026-09-18T12:00:00.000Z",
            weight: 225,
            reps: 8,
            rir: 1,
            e1rm: 292.5,
          },
        ],
      },
    }),
  },
};

export const TOOL_FIXTURES = {
  weeklyCoach: weeklyFixture,
  activeProgram: programFixture,
  exerciseReview: reviewFixture,
  nextWorkout: nextWorkoutFixture,
} as const;
