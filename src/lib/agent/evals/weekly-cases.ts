import { buildCoachCheckInReport, formatCoachCheckIn, type CoachSessionInput, type CoachSetInput } from "@/lib/coach-check-in";
import type { CoachRecommendation } from "@/lib/coach-recommendations";
import { computeE1rm } from "@/lib/strength/e1rm";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { resolveEffectiveWorkoutTarget, effectiveTargetExplanation } from "@/lib/effective-workout-target";
import type { weeklyCoach } from "../tools/weekly-coach";
import type { AgentMessage } from "../messages";

export const WEEKLY_DATASET = "lifting-app-weekly-coach-v1";
export const WEEKLY_POLICY_VERSION = "weekly-v1";
export type WeeklyEvidence = Awaited<ReturnType<typeof weeklyCoach>>;
export type WeeklyReference = {
  expectedTools: string[];
  allowedTools: string[];
  maxToolCalls: number;
  requiredFacts: string[];
  qualifications: string[];
  prohibitedClaims: string[];
};
export type WeeklyInputs = {
  id: string;
  question: string;
  asOf: string;
  history: AgentMessage[];
  evidence: { weeklyCoach: WeeklyEvidence };
};
export type WeeklyExample = {
  inputs: WeeklyInputs;
  outputs: WeeklyReference;
  metadata: { source: string; policyVersion: string; synthetic: true };
};

// Entirely synthetic ledger; canonical builders own the report figures.
function evidence(options: { partial?: boolean; count?: number; priorCount?: number; recovery?: boolean; pain?: boolean } = {}): WeeklyEvidence {
  const { partial = false, count = 3, priorCount = 4, recovery = false, pain = false } = options;
  const asOf = partial ? "2026-10-21T20:00:00.000Z" : "2026-10-19T04:59:00.000Z";
  const currentDates = partial ? ["19", "20", "21"] : ["12", "14", "16"];
  const priorDates = partial ? ["12", "14", "16", "18"] : ["05", "07", "09", "11"];
  const sessions: CoachSessionInput[] = [], sets: CoachSetInput[] = [];
  for (const [period, dates] of [["prior", priorDates.slice(0, priorCount)], ["current", currentDates.slice(0, count)]] as const) {
    for (const [index, date] of dates.entries()) {
      const id = `synthetic-${period}-${index}`;
      const isRecovery = recovery && period === "current";
      sessions.push({ id, performedAt: `2026-10-${date}T15:00:00.000Z`, finishedAt: `2026-10-${date}T15:45:00.000Z`,
        programId: "synthetic-program", programDayId: "synthetic-day", programDayName: "Lower A", weekIndex: isRecovery ? 4 : 3,
        isDeload: isRecovery, readiness: 4, jointPain: pain && period === "current" && index === 0 ? "significant" : "none", note: null });
      for (let setIndex = 0; setIndex < (isRecovery ? 1 : 2); setIndex++) {
        sets.push({ sessionId: id, programSlotId: "synthetic-slot", exerciseId: "bb-back-squat", setIndex,
          weight: 185, reps: period === "current" ? 8 : 6, rir: isRecovery ? 4 : 1,
          e1rm: isRecovery || (period === "current" && index === 2) ? null : computeE1rm(185, period === "current" ? 8 : 6, 1), isWarmup: false, isDeload: isRecovery, createdAt: `2026-10-${date}T15:05:00.000Z` });
      }
    }
  }
  const report = buildCoachCheckInReport({ generatedAt: new Date(asOf), programName: "Synthetic Foundations", plannedSessions: 4,
    sessions, sets, slots: [{ id: "synthetic-slot", programId: "synthetic-program", programDayId: "synthetic-day",
      exerciseId: "bb-back-squat", targetSets: 2, repMin: 6, repMax: 8, targetRir: 1 }],
    phases: recovery ? [{ id: "synthetic-recovery", programId: "synthetic-program", position: 0, name: "Recovery", description: null,
      weekStart: 4, weekEnd: 4, targetRirMin: 4, targetRirMax: 4, setMultiplier: 0.5, isDeload: true }] : [],
    definitions: EXERCISE_BY_ID, currentBodyweight: null });
  return { source: "weeklyCoach", checkInText: formatCoachCheckIn(report), report, recommendations: [], decisions: [], currentWorkout: null };
}

function withTarget(value: WeeklyEvidence, recovery = false): WeeklyEvidence {
  const prescription = { repMin: 6, repMax: 8, targetRir: recovery ? 4 : 1 };
  const effectiveTarget = resolveEffectiveWorkoutTarget({ slotId: "synthetic-slot", exerciseId: "bb-back-squat", prescription,
    context: null, isDeload: recovery, catalog: EXERCISE_BY_ID, stats: [], bodyweight: null,
    history: { effortBySlot: {}, progressionByExercise: { "bb-back-squat": [{ exerciseId: "bb-back-squat", equipmentInstanceId: null,
      sessionId: "synthetic-reference", setId: "synthetic-first", programSlotId: "synthetic-slot", performedAt: "2026-10-16T15:00:00.000Z",
      weight: 185, reps: 8, rir: 1, e1rm: null }] } } });
  return { ...value, currentWorkout: { programName: "Synthetic Foundations", dayName: "Lower A", week: recovery ? 4 : 3,
    completedSessions: recovery ? 12 : 8, openSessionId: null, slots: [{ slotId: "synthetic-slot", exerciseId: "bb-back-squat",
      exerciseName: "Barbell Back Squat", targetSets: recovery ? 1 : 2, prescription, target: effectiveTarget.target ? {
        weight: effectiveTarget.target.weight, targetReps: effectiveTarget.target.targetReps, targetRir: effectiveTarget.target.targetRir,
        source: effectiveTarget.target.source, confidence: effectiveTarget.target.confidence ?? null,
      } : null, effectiveTarget, targetExplanation: effectiveTargetExplanation(effectiveTarget), targetEngine: "resolveEffectiveWorkoutTarget" }] } };
}

function recommendation(kind: "add_load" | "pain_review"): CoachRecommendation {
  return { key: `synthetic-${kind}`, kind, loadReductionReason: null, exerciseId: kind === "pain_review" ? null : "bb-back-squat",
    exerciseName: kind === "pain_review" ? null : "Barbell Back Squat", programDayName: "Lower A",
    action: { label: kind === "pain_review" ? "Review pain" : "Add load", targetWeight: kind === "pain_review" ? null : 200,
      targetReps: kind === "pain_review" ? null : 6 }, rationale: kind === "pain_review" ? "Significant session pain requires review." : "Earlier report recommendation.",
    evidence: { windowStart: "2026-10-12", windowEnd: "2026-10-18", exposureCount: 1, summary: [] },
    confidence: "medium", dataSufficiency: "enough", priority: "now" };
}

function example(id: string, question: string, value: WeeklyEvidence, requiredFacts: string[], qualifications: string[], prohibitedClaims: string[], history: AgentMessage[] = []): WeeklyExample {
  return { inputs: { id, question, asOf: value.report.generatedAt, history, evidence: { weeklyCoach: value } },
    outputs: { expectedTools: ["weeklyCoach"], allowedTools: ["weeklyCoach", ...(value.currentWorkout ? ["nextWorkout"] : [])], maxToolCalls: 3,
      requiredFacts, qualifications, prohibitedClaims },
    metadata: { source: "lifting-app/weekly-cases", policyVersion: WEEKLY_POLICY_VERSION, synthetic: true } };
}

const normal = evidence();
const partial = withTarget(evidence({ partial: true }));
const recovery = withTarget(evidence({ recovery: true }), true);
const divergent = withTarget(evidence());
divergent.recommendations = [recommendation("add_load")];
divergent.decisions = [{ recommendationKey: "synthetic-add_load", status: "accepted", deferredUntil: null }];
const pain = withTarget(evidence({ pain: true }));
pain.recommendations = [recommendation("pain_review")];
const beforeEdit = evidence({ partial: true });
const staleHistory: AgentMessage[] = [
  { id: "old-question", role: "user", createdAt: beforeEdit.report.generatedAt, parts: [{ type: "text", text: "How many sessions this week?" }] },
  { id: "old-call", role: "assistant", createdAt: beforeEdit.report.generatedAt, parts: [{ type: "tool-call", id: "old-weekly", name: "weeklyCoach", args: {} }] },
  { id: "old-result", role: "tool", createdAt: beforeEdit.report.generatedAt, parts: [{ type: "tool-result", id: "old-weekly", name: "weeklyCoach", result: beforeEdit }] },
  { id: "old-answer", role: "assistant", createdAt: beforeEdit.report.generatedAt, parts: [{ type: "text", text: "3 of 4 completed sessions so far. Source: Track Coach" }] },
];

export const WEEKLY_EXAMPLES: WeeklyExample[] = [
  example("normal-summary", "Summarize my weekly adherence, average session duration, squat rep progress at the same load, and the e1RM trend.", normal,
    ["3 of 4 sessions completed; average duration 45 minutes.", "At 185 lb, best squat reps increased from 6 to 8 (+2).", "Squat e1RM trend is gaining: recent pair average about 242.8 lb versus 228.1 lb, about +6.4%."],
    ["e1RM is an estimate over comparable exposures, not a tested max or exclusively a calendar-week change."], ["Invented adherence, progress figures or a measured max."]),
  example("partial-calendar-comparison", "Compare this week with last week. Give Monday–Sunday Chicago dates and tell me whether this week is complete.", partial,
    ["Current window October 19–25, 2026; prior October 12–18, 2026; America/Chicago.", "3/4 so far versus 4/4 prior."],
    ["Generated Wednesday October 21; current week is partial, not a completed-week decline."], ["A final weekly adherence decline or a completed current week."]),
  example("calendar-vs-program", "Is this report my program week 3? Explain the reporting dates versus my next workout week.", partial,
    ["Calendar report October 19–25, 2026 in Chicago; next workout is program week 3."],
    ["Program week follows completed sessions, not calendar dates; current calendar week is partial."], ["Program week 3 equals calendar week 3, or program week advances every Monday."]),
  example("sparse-data", "I only logged one workout. Am I gaining or losing strength this week?", evidence({ count: 1, priorCount: 0 }),
    ["1/4 completed sessions; insufficient evidence for an e1RM trend."], ["One workout cannot establish strength gain or decline."], ["Invented strength change, plateau, or decline."]),
  example("no-workouts", "How was my training progress this week?", evidence({ count: 0, priorCount: 0 }),
    ["0/4 completed sessions; no usable workout progress comparison."], ["No data is not demonstrated regression; session duration and e1RM comparison are unavailable."], ["Zero minutes as a measured average, zero e1RM, or invented progress/decline."]),
  example("recovery-week", "My workload is lower this week. Is that a setback, and what does the next workout follow?", recovery,
    ["Current completed working sets 3 versus prior 8; current sessions use the Recovery prescription.", "Next workout follows recovery, target RIR 4 and 1 set."],
    ["Planned reduced workload is not automatically a setback; recovery sets do not establish strength decline."], ["Automatically diagnosing regression or prescribing extra overload to compensate."]),
  example("recommendation-vs-target", "The report recommends 200 lb and that old decision says accepted. What is my current squat target, and has my program changed?", divergent,
    ["Report recommends 200 lb; current calculated target is 190 lb for 6 reps at RIR 1."],
    ["Accepted legacy decision is review state; no applied program change or action receipt is supplied."], ["200 lb is the current target, reading applied a change, or accepted proves a program write."]),
  example("pain-session-scope", "The report flagged pain. Which lift caused it, what's the diagnosis, and how much did Coach reduce my squat target?", pain,
    ["Significant pain is session-scoped; affected lift, cause, and diagnosis are not identified.", "The current calculated squat target is 190 lb; no pain-specific reduction is established."],
    ["Pain is a review prompt; no diagnosis or automatic pain-specific load change. Suggest review with someone who can assess it."], ["Assigning pain to squat because it appears in the session, inventing an injury, or another load reduction."]),
  example("edited-history-freshness", "I removed a duplicate completed workout from history. Refresh my weekly count and correct your previous answer.", evidence({ partial: true, count: 2 }),
    ["Fresh evidence shows 2/4 completed sessions; the earlier 3/4 is stale."], ["Read weeklyCoach again on this turn; current week remains partial."], ["Repeating the old 3/4 as current or claiming Coach deleted data."], staleHistory),
  example("normal-progress-no-notification", "There was no Coach notification. Can you still tell me my weekly adherence and squat rep progress?", normal,
    ["3/4 completed sessions; squat best reps at 185 lb rose from 6 to 8."],
    ["Normal progress can be answered on demand; this read does not create a notification or confirm a program change."], ["Claiming a notification was generated, scheduling a recap, or requiring Accept/navigation to answer."]),
];
