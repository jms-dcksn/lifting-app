import { describe, expect, it } from "vitest";
import { availableCoachIntervention, coachActionIntentSchema, coachIntentFingerprint, episodeExplanation } from "./coach-intervention";
import { coachEvidence, coachObservation } from "./testing/coach-fixtures";
import { DEFAULT_COACH_PREFERENCES, planCoachEpisodes } from "./coach-episodes";
const initial = () => planCoachEpisodes({ previous: [], observations: [coachObservation(coachEvidence("plateau"))], preferences: DEFAULT_COACH_PREFERENCES }).episodes[0];
const suggestion = { action: "rep_change" as const, ladderStep: 0, stalledExposures: 3, repBand: { repMin: 12, repMax: 15 } };
describe("confirmed Coach interventions", () => {
  it("offers only the current canonical plateau intervention", () => {
    expect(availableCoachIntervention(initial(), suggestion)).toEqual(suggestion);
    expect(availableCoachIntervention(initial(), { ...suggestion, repBand: { repMin: 5, repMax: 8 } })).toBeNull();
    expect(availableCoachIntervention(initial(), { ...suggestion, action: "swap" })).toBeNull();
  });
  it.each(["stale", "invalidated", "blocked_by_pain"] as const)("withholds %s choices", validity => {
    expect(availableCoachIntervention({ ...initial(), validity }, suggestion)).toBeNull();
  });
  it("withholds terminal/snoozed and ordinary target reviews", () => {
    expect(availableCoachIntervention({ ...initial(), state: "superseded" }, suggestion)).toBeNull();
    expect(availableCoachIntervention({ ...initial(), snoozeSourceIds: ["s1"] }, suggestion)).toBeNull();
    expect(availableCoachIntervention({ ...initial(), evidence: coachEvidence() }, suggestion)).toBeNull();
    expect(availableCoachIntervention({ ...initial(), family: "session_pain", evidence: coachEvidence("pain") }, suggestion)).toBeNull();
  });
  it("rejects client-supplied engine fields and incomplete swap intent", () => {
    const intent = { episodeId: crypto.randomUUID(), occurrence: 1, revision: 1, requestId: crypto.randomUUID(), action: "rep_change", replacementId: null, sessionId: null, scope: "program" };
    expect(coachActionIntentSchema.safeParse(intent).success).toBe(true);
    expect(coachActionIntentSchema.safeParse({ ...intent, ladderStep: 3 }).success).toBe(false);
    expect(coachActionIntentSchema.safeParse({ ...intent, action: "swap" }).success).toBe(false);
    expect(coachActionIntentSchema.safeParse({ ...intent, scope: "workout" }).success).toBe(false);
    const parsed = coachActionIntentSchema.parse(intent);
    expect(coachIntentFingerprint(parsed)).toBe(coachIntentFingerprint({ ...parsed }));
    expect(coachIntentFingerprint(parsed)).not.toBe(coachIntentFingerprint({ ...parsed, sessionId: crypto.randomUUID() }));
  });
  it("does not claim targets or acknowledgements applied a change", () => {
    expect(episodeExplanation(initial(), true)).toContain("confirmation");
    expect(episodeExplanation({ ...initial(), family: "session_pain" }, true)).toContain("No affected lift");
    expect(episodeExplanation({ ...initial(), terminalReason: "intervention_applied" }, true)).toContain("receipt");
  });
});
