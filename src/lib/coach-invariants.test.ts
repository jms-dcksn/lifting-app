import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_COACH_PREFERENCES, planCoachEpisodes, quietAt, type CoachEpisode } from "./coach-episodes";
import { coachObservation, coachEvidence } from "./testing/coach-fixtures";
import { registerFixedClock } from "./testing/clock";
import { resolveExactWorkoutTarget } from "./effective-workout-target";
import { exactExerciseIdentity } from "./strength/identity";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const event = fc.constantFrom("refresh", "correct", "delete", "missing", "ack", "preferences", "snooze", "recover" as const);
registerFixedClock();

function assertNoReplay(notices: Array<{ contextKey: string; occurrence: number; attentionKey: string }>, delivered: Set<string>) {
  for (const notice of notices) {
    const key = JSON.stringify([notice.contextKey, notice.occurrence, notice.attentionKey]);
    expect(delivered.has(key), "consumed attention was replayed").toBe(false);
    delivered.add(key);
  }
}

describe("generated Coach lifecycle invariants", () => {
  it("preserves attention and explicit recovery through retries, corrections, preferences, and snooze", () => {
    fc.assert(fc.property(fc.array(event, { minLength: 1, maxLength: 35 }), events => {
      let previous: CoachEpisode[] = [];
      let preferences = { ...DEFAULT_COACH_PREFERENCES };
      const delivered = new Set<string>();
      for (const action of events) {
        const observation = coachObservation();
        if (action === "correct") observation.evidence = { ...coachEvidence(), values: [{ id: "set", weight: 105, reps: 8, rir: 0, e1rm: 125 }] };
        if (action === "delete") { observation.disposition = "invalidated"; observation.evidence = null; }
        if (action === "snooze") observation.disposition = "snoozed";
        if (action === "recover") { observation.disposition = "recovered"; observation.evidence = null; }
        if (action === "preferences") preferences = { ...preferences, reduction: !preferences.reduction };
        const before = structuredClone(previous);
        // Ack/read is persistence metadata, deliberately not a lifecycle transition.
        const plan = planCoachEpisodes({ previous, observations: action === "missing" ? [] : [observation], preferences });
        expect(previous).toEqual(before);
        assertNoReplay(plan.notices, delivered);
        if (action === "missing" || action === "ack") {
          for (const old of previous.filter(e => e.state === "open")) expect(plan.episodes.find(e => e.contextKey === old.contextKey)?.state).toBe("open");
        }
        const replay = planCoachEpisodes({ previous: plan.episodes, observations: action === "missing" ? [] : [observation], preferences });
        expect(replay.notices).toEqual([]);
        expect(replay.episodes).toEqual(plan.episodes);
        previous = plan.episodes;
      }
    }), { seed: 222228, numRuns: 150 });
  });
  it("pauses performance evidence while an unresolved pain episode exists", () => {
    fc.assert(fc.property(fc.boolean(), enabled => {
      const plan = planCoachEpisodes({ previous: [], observations: [coachObservation(), coachObservation(coachEvidence("pain"))],
        preferences: { ...DEFAULT_COACH_PREFERENCES, pain: enabled } });
      expect(plan.episodes.find(e => e.family === "lift_performance")?.validity).toBe("blocked_by_pain");
    }), { seed: 226, numRuns: 10 });
  });
  it("catches a deliberately broken replay implementation", () => {
    const input = { previous: [], observations: [coachObservation()], preferences: DEFAULT_COACH_PREFERENCES };
    const first = planCoachEpisodes(input);
    const delivered = new Set<string>();
    assertNoReplay(first.notices, delivered);
    // Representative mutation: a refresh accidentally discards persisted episode history.
    const brokenReplay = planCoachEpisodes({ ...input, previous: [] });
    expect(() => assertNoReplay(brokenReplay.notices, delivered)).toThrow("consumed attention was replayed");
  });
  it("does not compound effort reductions across repeated reads", () => {
    fc.assert(fc.property(fc.integer({ min: 20, max: 100 }).map(n => n * 5), fc.integer({ min: 1, max: 20 }), (weight, reads) => {
      const context = { programId: "p", programDayId: "d", exerciseId: "db-bench", equipmentInstanceId: null, phaseId: null,
        adaptationStartAt: null, repMin: 6, repMax: 10, targetRirMin: 2, targetRirMax: 2, targetSets: 3 };
      const exposures = [1, 2].map(n => ({ exerciseId: "db-bench", equipmentInstanceId: null, sessionId: `s${n}`, setId: `set${n}`,
        programSlotId: "slot", performedAt: `2026-10-0${n}T12:00:00Z`, e1rm: weight * 1.25, weight, reps: 8, rir: 0 }));
      const input = { identity: exactExerciseIdentity("db-bench", null), slotId: "slot", context,
        prescription: { repMin: 6, repMax: 10, targetRir: 2 }, history: { progressionByExercise: { "db-bench": exposures }, effortBySlot: { slot: { context, exposures } } },
        catalog: EXERCISE_BY_ID, stats: [], bodyweight: 180 };
      const original = structuredClone(input.history);
      for (let n = 0; n < reads; n++) expect(resolveExactWorkoutTarget(input).target?.weight).toBe(weight - 5);
      expect(input.history).toEqual(original);
    }), { seed: 211226, numRuns: 100 });
  });
  it("uses a fixed clock for overnight quiet hours regardless of runner timezone", () => {
    expect(new Date().toISOString()).toBe("2026-10-15T12:00:00.000Z");
    expect(quietAt({ ...DEFAULT_COACH_PREFERENCES, quietEnabled: true, timeZone: "Pacific/Honolulu" }, new Date())).toBe(true);
    expect(quietAt({ ...DEFAULT_COACH_PREFERENCES, quietEnabled: true, timeZone: "UTC" }, new Date())).toBe(false);
  });
});
