import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  DEFAULT_COACH_PREFERENCES as prefs,
  episodeContextKey,
  planCoachEpisodes,
  quietAt,
  validateCoachPreferences,
  type EpisodeEvidence,
  type EpisodeObservation,
} from "./coach-episodes";

function evidence(
  kind: "reduction" | "plateau" | "decline" | "pain" = "reduction",
): EpisodeEvidence {
  return {
    name: "Bench",
    values: [{ id: "set", weight: 100, reps: 8, rir: 0, e1rm: 120 }],
    effectiveTarget: null,
    candidate: {
      policyVersion: "1.0",
      userId: "u",
      scope:
        kind === "pain"
          ? { kind: "session", sessionIds: ["s1"] }
          : {
              kind: "lift",
              slotId: "slot",
              context: {
                programId: "p",
                programDayId: "d",
                exerciseId: "bb-bench",
                equipmentInstanceId: null,
                phaseId: null,
                adaptationStartAt: null,
                repMin: 6,
                repMax: 10,
                targetRirMin: 2,
                targetRirMax: 2,
                targetSets: 3,
              },
            },
      evidenceStart: "2026-10-01T12:00:00Z",
      evidenceEnd: "2026-10-10T12:00:00Z",
      signals: [
        {
          status: "recommended",
          sources: [
            {
              sessionId: "s1",
              performedAt: "2026-10-10T12:00:00Z",
              setIds: ["set"],
              firstSetId: "set",
            },
          ],
          ...(kind === "pain"
            ? { reason: "significant_pain", action: "review_pain" }
            : kind === "decline"
              ? {
                  reason: "sustained_decline",
                  action: "review_trend",
                  trend: { classification: "declining" },
                }
              : kind === "plateau"
                ? {
                    reason: "confirmed_plateau",
                    action: "rep_change",
                    repBand: { repMin: 12, repMax: 15 },
                    plateau: { plateaued: true },
                  }
                : {
                    reason: "repeated_effort_miss",
                    action: "reduce_load",
                    target: { weight: 95, targetReps: 8, targetRir: 2 },
                  }),
        },
      ] as EpisodeEvidence["candidate"]["signals"],
    },
  };
}
function observation(e = evidence()): EpisodeObservation {
  return {
    contextKey: episodeContextKey(e.candidate),
    evidence: e,
    disposition: "current",
    frontier: ["s1"],
  };
}
function initial(o = observation()) {
  return planCoachEpisodes({
    previous: [],
    observations: [o],
    preferences: prefs,
  });
}

describe("Coach episode identity and lifecycle", () => {
  it("keeps identity stable when evidence, target, reasons or policy changes", () => {
    const a = evidence();
    const key = episodeContextKey(a.candidate);
    a.candidate.evidenceEnd = "2026-10-14T12:00:00Z";
    a.candidate.signals[0].sources[0].setIds.push("new");
    expect(episodeContextKey(a.candidate)).toBe(key);
    expect(episodeContextKey(evidence("plateau").candidate)).toBe(key);
  });
  it.each([
    "exerciseId",
    "equipmentInstanceId",
    "programId",
    "programDayId",
    "phaseId",
    "adaptationStartAt",
    "repMin",
    "repMax",
    "targetRirMin",
    "targetRirMax",
    "targetSets",
  ])("splits identity on %s", (key) => {
    const a = evidence();
    const b = structuredClone(a);
    if (b.candidate.scope.kind !== "lift") throw Error();
    Object.assign(b.candidate.scope.context, {
      [key]:
        typeof b.candidate.scope.context[
          key as keyof typeof b.candidate.scope.context
        ] === "number"
          ? 99
          : "changed",
    });
    expect(episodeContextKey(a.candidate)).not.toBe(
      episodeContextKey(b.candidate),
    );
  });
  it("has one stable owner-level pain identity", () => {
    const a = evidence("pain");
    const key = episodeContextKey(a.candidate);
    a.candidate.scope = { kind: "session", sessionIds: ["other"] };
    expect(episodeContextKey(a.candidate)).toBe(key);
  });
  it("creates a single notice and is immutable/replay-stable", () => {
    const first = initial();
    const before = structuredClone(first);
    const again = planCoachEpisodes({
      previous: first.episodes,
      observations: [observation()],
      preferences: prefs,
    });
    expect(again.notices).toEqual([]);
    expect(again.episodes).toEqual(first.episodes);
    expect(first).toEqual(before);
  });
  it("updates evidence quietly across new exposures and numerical targets", () => {
    const first = initial();
    const o = observation();
    o.frontier.push("s2");
    o.evidence!.values[0].weight = 105;
    const next = planCoachEpisodes({
      previous: first.episodes,
      observations: [o],
      preferences: prefs,
    });
    expect(next.notices).toHaveLength(0);
    expect(next.episodes[0].revision).toBe(2);
    expect(next.episodes[0].occurrence).toBe(1);
  });
  it("notifies a higher-priority cause once", () => {
    const first = initial(observation(evidence("decline")));
    const next = planCoachEpisodes({
      previous: first.episodes,
      observations: [observation()],
      preferences: prefs,
    });
    expect(next.notices).toHaveLength(1);
    expect(
      planCoachEpisodes({
        previous: next.episodes,
        observations: [observation()],
        preferences: prefs,
      }).notices,
    ).toHaveLength(0);
  });
  it("notifies changed meaningful plateau intervention, never a periodic reminder", () => {
    const o = observation(evidence("plateau"));
    const first = initial(o);
    const again = planCoachEpisodes({
      previous: first.episodes,
      observations: [o],
      preferences: prefs,
    });
    expect(again.notices).toHaveLength(0);
    const signal = o.evidence!.candidate.signals[0];
    if (signal.reason !== "confirmed_plateau" || signal.action !== "rep_change")
      throw Error();
    signal.repBand = { repMin: 6, repMax: 10 };
    expect(
      planCoachEpisodes({
        previous: first.episodes,
        observations: [o],
        preferences: prefs,
      }).notices,
    ).toHaveLength(1);
  });
  it("does not replay disabled categories after enabling", () => {
    const o = observation();
    const first = planCoachEpisodes({
      previous: [],
      observations: [o],
      preferences: { ...prefs, reduction: false },
    });
    expect(first.notices).toHaveLength(0);
    expect(
      planCoachEpisodes({
        previous: first.episodes,
        observations: [o],
        preferences: prefs,
      }).notices,
    ).toHaveLength(0);
  });
  it("never resolves from empty or incomplete results", () => {
    const first = initial();
    const next = planCoachEpisodes({
      previous: first.episodes,
      observations: [],
      preferences: prefs,
    });
    expect(next.episodes[0]).toMatchObject({
      state: "open",
      validity: "stale",
    });
    expect(next.notices).toEqual([]);
  });
  it.each(["invalidated", "superseded"] as const)(
    "uses honest %s state instead of recovery",
    (disposition) => {
      const first = initial();
      const next = planCoachEpisodes({
        previous: first.episodes,
        observations: [{ ...observation(), evidence: null, disposition }],
        preferences: prefs,
      });
      expect(next.episodes[0].state).toBe("superseded");
      expect(next.episodes[0].evidence).toBeNull();
    },
  );
  it("new exposure after true recovery creates one new occurrence", () => {
    const first = initial();
    const recovered = planCoachEpisodes({
      previous: first.episodes,
      observations: [
        {
          ...observation(),
          disposition: "recovered",
          frontier: ["s1", "recovery"],
        },
      ],
      preferences: prefs,
    });
    const o = observation();
    o.frontier = ["s1", "recovery", "s3"];
    const next = planCoachEpisodes({
      previous: recovered.episodes,
      observations: [o],
      preferences: prefs,
    });
    expect(next.episodes[0].occurrence).toBe(2);
    expect(next.notices).toHaveLength(1);
  });
  it("corrected same exposure reopens quietly, without a new occurrence", () => {
    const first = initial();
    const terminal = planCoachEpisodes({
      previous: first.episodes,
      observations: [{ ...observation(), disposition: "invalidated" }],
      preferences: prefs,
    });
    const next = planCoachEpisodes({
      previous: terminal.episodes,
      observations: [observation()],
      preferences: prefs,
    });
    expect(next.episodes[0].occurrence).toBe(1);
    expect(next.notices).toHaveLength(0);
  });
  it("pain blocks performance arrival/action validity without rewriting targets", () => {
    const next = planCoachEpisodes({
      previous: [],
      observations: [observation(), observation(evidence("pain"))],
      preferences: prefs,
    });
    expect(
      next.episodes.find((e) => e.family === "lift_performance")?.validity,
    ).toBe("blocked_by_pain");
    const again = planCoachEpisodes({
      previous: next.episodes,
      observations: [observation(), observation(evidence("pain"))],
      preferences: prefs,
    });
    expect(again.episodes).toEqual(next.episodes);
  });
  it("pain remains open when its report window rolls away", () => {
    const first = initial(observation(evidence("pain")));
    const next = planCoachEpisodes({
      previous: first.episodes,
      observations: [],
      preferences: prefs,
    });
    expect(next.episodes[0].state).toBe("open");
  });
  it("explicit pain end covers old feedback; a new painful session recurs", () => {
    const first = initial(observation(evidence("pain")));
    first.episodes[0].state = "resolved";
    first.episodes[0].terminalReason = "user_reported_ended";
    expect(
      planCoachEpisodes({
        previous: first.episodes,
        observations: [observation(evidence("pain"))],
        preferences: prefs,
      }).episodes[0].state,
    ).toBe("resolved");
    const o = observation(evidence("pain"));
    o.frontier.push("s2");
    o.evidence!.candidate.signals[0].sources.push({
      ...o.evidence!.candidate.signals[0].sources[0],
      sessionId: "s2",
    });
    expect(
      planCoachEpisodes({
        previous: first.episodes,
        observations: [o],
        preferences: prefs,
      }).episodes[0].occurrence,
    ).toBe(2);
  });
  it("snooze expiration alone cannot send another notice", () => {
    const o = observation(evidence("plateau"));
    const first = initial(o);
    const snoozed = planCoachEpisodes({
      previous: first.episodes,
      observations: [{ ...o, disposition: "snoozed", snoozeSourceIds: ["s1"] }],
      preferences: prefs,
    });
    expect(
      planCoachEpisodes({
        previous: snoozed.episodes,
        observations: [{ ...o, frontier: ["s1", "s2", "s3"] }],
        preferences: prefs,
      }).notices,
    ).toHaveLength(0);
  });
  it("canonical serialization ignores object insertion order", () => {
    expect(canonicalJson({ b: 2, a: { y: 1, x: 0 } })).toBe(
      canonicalJson({ a: { x: 0, y: 1 }, b: 2 }),
    );
  });
});
describe("Coach preferences", () => {
  it.each(["2026-10-15T03:00:00Z", "2026-10-15T11:59:00Z"])(
    "handles overnight Chicago quiet hours at %s",
    (iso) => {
      expect(quietAt({ ...prefs, quietEnabled: true }, new Date(iso))).toBe(
        true,
      );
    },
  );
  it("uses an exclusive end", () => {
    expect(
      quietAt(
        { ...prefs, quietEnabled: true },
        new Date("2026-10-15T12:00:00Z"),
      ),
    ).toBe(false);
  });
  it.each(["2026-11-01T06:30:00Z", "2026-11-01T07:30:00Z"])(
    "honors both repeated DST hours: %s",
    (iso) => {
      expect(
        quietAt(
          { ...prefs, quietEnabled: true, quietStart: 60, quietEnd: 120 },
          new Date(iso),
        ),
      ).toBe(true);
    },
  );
  it("quiet hours off by default", () => {
    expect(quietAt(prefs, new Date())).toBe(false);
  });
  it.each([
    { quietStart: 1.5 },
    { quietEnd: 1440 },
    { quietStart: 420 },
    { timeZone: "not/a/zone" },
    { pain: "yes" },
  ])("rejects invalid preferences %j", (invalid) => {
    expect(() =>
      validateCoachPreferences({ ...prefs, ...invalid } as typeof prefs),
    ).toThrow();
  });
});
