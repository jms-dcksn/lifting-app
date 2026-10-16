import { describe, expect, it } from "vitest";
import { parseCoachEpisode, parseCoachPreferences, parseEpisodeEvidence, parseRefreshResult } from "./coach-storage";
import { DEFAULT_COACH_PREFERENCES, planCoachEpisodes } from "./coach-episodes";
import { resolveExactWorkoutTarget } from "./effective-workout-target";
import { exactExerciseIdentity } from "./strength/identity";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { coachEvidence, coachObservation } from "./testing/coach-fixtures";

describe("Coach persisted-data compatibility", () => {
  it.each(["pain", "reduction", "plateau", "decline"] as const)("reads existing v1 %s evidence and episodes", kind => {
    const evidence = coachEvidence(kind);
    expect(parseEpisodeEvidence(evidence)).toEqual(evidence);
    const episode = planCoachEpisodes({ previous: [], observations: [coachObservation(evidence)], preferences: DEFAULT_COACH_PREFERENCES }).episodes[0];
    expect(parseCoachEpisode(episode)).toEqual(episode);
  });
  it("round-trips full effective targets without changing persisted reference metadata", () => {
    const evidence = coachEvidence();
    if (evidence.candidate.scope.kind !== "lift") throw Error("Expected lift fixture");
    const context = evidence.candidate.scope.context;
    const exposures = [1, 2].map(n => ({ exerciseId: "bb-bench", equipmentInstanceId: null, sessionId: `s${n}`, setId: `set${n}`,
      programSlotId: "slot", performedAt: `2026-10-0${n}T12:00:00Z`, e1rm: 130, weight: 100, reps: 8, rir: 0 }));
    evidence.effectiveTarget = resolveExactWorkoutTarget({ identity: exactExerciseIdentity("bb-bench", null), slotId: "slot", context,
      prescription: { repMin: 6, repMax: 10, targetRir: 2 }, history: { progressionByExercise: { "bb-bench": exposures }, effortBySlot: { slot: { context, exposures } } },
      catalog: EXERCISE_BY_ID, stats: [], bodyweight: 180 });
    expect(parseEpisodeEvidence(JSON.parse(JSON.stringify(evidence)))).toEqual(evidence);
  });
  it("validates preferences and treats unknown versions explicitly", () => {
    expect(parseCoachPreferences(DEFAULT_COACH_PREFERENCES)).toEqual(DEFAULT_COACH_PREFERENCES);
    expect(() => parseCoachPreferences({ ...DEFAULT_COACH_PREFERENCES, pain: "yes" })).toThrow("unavailable");
    expect(() => parseCoachPreferences({ ...DEFAULT_COACH_PREFERENCES, timeZone: "no/such-zone" })).toThrow("unavailable");
    expect(() => parseCoachPreferences(DEFAULT_COACH_PREFERENCES, "episodes-v2")).toThrow("supported app version");
    expect(() => parseEpisodeEvidence({ ...coachEvidence(), candidate: { ...coachEvidence().candidate, policyVersion: "future" } })).toThrow("supported app version");
  });
  it("rejects malformed nested evidence and invalid RPC results", () => {
    const evidence = coachEvidence();
    expect(() => parseEpisodeEvidence({ ...evidence, candidate: { ...evidence.candidate, signals: [] } })).toThrow("unavailable");
    expect(() => parseEpisodeEvidence({ ...evidence, values: [{ id: "x", weight: "100" }] })).toThrow();
    expect(() => parseRefreshResult({ status: "anything" })).toThrow();
    expect(() => parseRefreshResult({ status: "ready", arrival: { id: "bad", title: "x" } })).toThrow();
    expect(parseRefreshResult({ status: "refresh_required" })).toEqual({ status: "refresh_required" });
  });
});
