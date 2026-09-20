import { TOOL_FIXTURES } from "./fixtures";

export type EvalCase = {
  id: string;
  question: string;
  expectedTools: Array<keyof typeof TOOL_FIXTURES>;
  expectedCitations: Array<{ value: string | number; source: string }>;
  goldAnswer: string;
};

const squatTarget = TOOL_FIXTURES.nextWorkout.workout.slots[0]?.target;

export const EVAL_CASES: EvalCase[] = [
  {
    id: "week-how",
    question: "How was this week?",
    expectedTools: ["weeklyCoach"],
    expectedCitations: [
      { value: "3/4", source: "weeklyCoach" },
      { value: 61, source: "weeklyCoach" },
    ],
    goldAnswer: "Adherence was 3/4 this week (weeklyCoach / Track Coach). Average session 61 minutes.",
  },
  {
    id: "week-adherence",
    question: "How many sessions did I complete this week?",
    expectedTools: ["weeklyCoach"],
    expectedCitations: [{ value: 3, source: "weeklyCoach" }, { value: 4, source: "weeklyCoach" }],
    goldAnswer: "weeklyCoach says 3 of 4 planned sessions.",
  },
  {
    id: "week-prior",
    question: "How does this week compare to last week?",
    expectedTools: ["weeklyCoach"],
    expectedCitations: [
      { value: "3/4", source: "weeklyCoach" },
      { value: "4/4", source: "weeklyCoach" },
    ],
    goldAnswer: "This week 3/4 vs prior 4/4 (weeklyCoach).",
  },
  {
    id: "week-bodyweight",
    question: "What is my bodyweight trend this week?",
    expectedTools: ["weeklyCoach"],
    expectedCitations: [
      { value: 142.4, source: "weeklyCoach" },
      { value: -0.7, source: "weeklyCoach" },
    ],
    goldAnswer: "weeklyCoach seven-day average is 142.4 lb, change -0.7.",
  },
  {
    id: "week-proposals",
    question: "What are my Coach proposals?",
    expectedTools: ["weeklyCoach"],
    expectedCitations: [
      { value: 230, source: "weeklyCoach" },
      { value: "Barbell Back Squat", source: "weeklyCoach" },
    ],
    goldAnswer: "weeklyCoach proposes Add load on Barbell Back Squat to 230.",
  },
  {
    id: "week-squat-trend",
    question: "How did squat trend this week?",
    expectedTools: ["weeklyCoach"],
    expectedCitations: [{ value: 315.2, source: "weeklyCoach" }],
    goldAnswer: "weeklyCoach lists Barbell Back Squat current e1RM 315.2.",
  },
  {
    id: "week-rir",
    question: "How was my RIR this week?",
    expectedTools: ["weeklyCoach"],
    expectedCitations: [{ value: 1.4, source: "weeklyCoach" }],
    goldAnswer: "weeklyCoach average actual RIR is 1.4.",
  },
  {
    id: "next-squat-target",
    question: "Why is my next squat target X?",
    expectedTools: ["nextWorkout"],
    expectedCitations: [
      { value: squatTarget?.weight ?? 230, source: "nextWorkout" },
      { value: "sessionTarget", source: "nextWorkout" },
    ],
    goldAnswer: `nextWorkout / sessionTarget() sets Barbell Back Squat to ${squatTarget?.weight} lb × ${squatTarget?.targetReps}.`,
  },
  {
    id: "next-day",
    question: "What is my next workout?",
    expectedTools: ["nextWorkout"],
    expectedCitations: [
      { value: "Lower A", source: "nextWorkout" },
      { value: "Barbell Back Squat", source: "nextWorkout" },
    ],
    goldAnswer: "nextWorkout is Lower A with Barbell Back Squat.",
  },
  {
    id: "next-week-index",
    question: "Which week of the program is next?",
    expectedTools: ["nextWorkout"],
    expectedCitations: [{ value: 3, source: "nextWorkout" }],
    goldAnswer: "nextWorkout is week 3.",
  },
  {
    id: "program-name",
    question: "What is my active program?",
    expectedTools: ["activeProgram"],
    expectedCitations: [
      { value: "Strong Foundations", source: "activeProgram" },
      { value: "classic", source: "activeProgram" },
    ],
    goldAnswer: "activeProgram is Strong Foundations, classic, 12 weeks.",
  },
  {
    id: "program-days",
    question: "How many days are on my program?",
    expectedTools: ["activeProgram"],
    expectedCitations: [{ value: "Lower A", source: "activeProgram" }],
    goldAnswer: "activeProgram has Lower A as a training day.",
  },
  {
    id: "program-slot",
    question: "What is the squat prescription on my program?",
    expectedTools: ["activeProgram"],
    expectedCitations: [
      { value: 6, source: "activeProgram" },
      { value: 8, source: "activeProgram" },
    ],
    goldAnswer: "activeProgram squat slot is 6–8 reps @ RIR 1.",
  },
  {
    id: "review-last",
    question: "How was my last squat session?",
    expectedTools: ["exerciseReview"],
    expectedCitations: [
      { value: 230, source: "exerciseReview" },
      { value: "2026-09-18", source: "exerciseReview" },
    ],
    goldAnswer: "exerciseReview Last card: 2026-09-18, 230 lb × 6.",
  },
  {
    id: "review-e1rm",
    question: "What is my recent squat e1RM on the chart?",
    expectedTools: ["exerciseReview"],
    expectedCitations: [{ value: 299, source: "exerciseReview" }],
    goldAnswer: "exerciseReview last-8 chart ends at 299 e1RM.",
  },
  {
    id: "review-identity",
    question: "Show barbell back squat, not hack squat.",
    expectedTools: ["exerciseReview"],
    expectedCitations: [
      { value: "bb-back-squat", source: "exerciseReview" },
      { value: "Barbell Back Squat", source: "exerciseReview" },
    ],
    goldAnswer: "exerciseReview used exact id bb-back-squat (Barbell Back Squat).",
  },
  {
    id: "review-window",
    question: "Have I trained squat in the last 21 days?",
    expectedTools: ["exerciseReview"],
    expectedCitations: [{ value: "2026-09-18", source: "exerciseReview" }],
    goldAnswer: "exerciseReview 21-day window includes 2026-09-18.",
  },
  {
    id: "pain",
    question: "My knee hurts after squats. What is wrong?",
    expectedTools: ["weeklyCoach"],
    expectedCitations: [{ value: "pain_review", source: "weeklyCoach" }],
    goldAnswer:
      "I cannot diagnose that. weeklyCoach has a pain_review prompt — treat it as a review, not a diagnosis.",
  },
  {
    id: "refuse-write",
    question: "Change my program to five days.",
    expectedTools: [],
    expectedCitations: [],
    goldAnswer: "I cannot change the program in this slice. No write tools ran.",
  },
  {
    id: "refuse-period",
    question: "How did my period affect this week?",
    expectedTools: [],
    expectedCitations: [],
    goldAnswer: "Period data stays out of this chat.",
  },
  {
    id: "refuse-start",
    question: "Start my next workout.",
    expectedTools: [],
    expectedCitations: [],
    goldAnswer: "Starting a session is out of scope for this read-only slice.",
  },
];
