import { describe, expect, it } from "vitest";
import {
  observeCoachEpisodes,
  currentCoachSlots,
} from "./coach-episode-evidence";
import { DEFAULT_COACH_PREFERENCES, planCoachEpisodes } from "./coach-episodes";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { computeE1rm } from "./strength/e1rm";
import type { CoachExceptionInput } from "./coach-exceptions";
function fixture(count = 2) {
  const sessions = Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    performedAt: `2026-10-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
    finishedAt: `2026-10-${String(i + 1).padStart(2, "0")}T13:00:00Z`,
    programId: "p",
    programDayId: "d",
    weekIndex: 1,
    isDeload: false,
  }));
  const input: CoachExceptionInput = {
    history: {
      userId: "u",
      sessions,
      sets: sessions.map((s) => ({
        id: `set-${s.id}`,
        user_id: "u",
        session_id: s.id,
        program_slot_id: "slot",
        exercise_id: "bb-bench",
        equipment_instance_id: null,
        weight: 100,
        reps: 8,
        rir: 0,
        e1rm: computeE1rm(100, 8, 0),
        set_index: 0,
        is_warmup: false,
        is_deload: false,
        created_at: s.performedAt,
        workout_session: {
          performed_at: s.performedAt,
          finished_at: s.finishedAt,
        },
      })),
      slots: [
        {
          id: "slot",
          programId: "p",
          programDayId: "d",
          exerciseId: "bb-bench",
          targetSets: 3,
          repMin: 6,
          repMax: 10,
          targetRir: 2,
        },
      ],
      phases: [],
      adaptations: [],
    },
    definitions: EXERCISE_BY_ID,
    activeProgramId: "p",
    currentSlots: [
      {
        slotId: "slot",
        exerciseId: "bb-bench",
        equipmentInstanceId: null,
        weekIndex: 1,
        mode: "classic",
      },
    ],
    feedback: [],
    asOf: new Date("2026-10-15T00:00:00Z"),
    evidenceSince: new Date(0),
  };
  return {
    ...input,
    previous: [] as Parameters<typeof observeCoachEpisodes>[0]["previous"],
    names: { "bb-bench": "Bench" },
    stats: [],
    bodyweight: null,
  };
}
function persisted(input = fixture()) {
  return planCoachEpisodes({
    previous: [],
    observations: observeCoachEpisodes(input),
    preferences: DEFAULT_COACH_PREFERENCES,
  }).episodes;
}
describe("canonical evidence to episodes", () => {
  it("includes real source values and the shared effective target", () => {
    const o = observeCoachEpisodes(fixture());
    expect(o[0].evidence?.values).toHaveLength(2);
    expect(o[0].evidence?.effectiveTarget).toMatchObject({
      status: "current_target",
      reason: "repeated_effort_miss",
      target: { weight: 95 },
    });
  });
  it("uses explicit 21-day performance freshness", () => {
    const f = fixture();
    f.asOf = new Date("2026-11-01T00:00:00Z");
    expect(observeCoachEpisodes(f)[0].disposition).toBe("stale");
  });
  it("does not bootstrap old pain", () => {
    const f = fixture();
    f.feedback = [{ sessionId: "s0", jointPain: "significant" }];
    f.asOf = new Date("2026-12-01T00:00:00Z");
    expect(
      observeCoachEpisodes(f).some((o) => o.contextKey === "session_pain:v1"),
    ).toBe(false);
  });
  it("normal refresh can detect newly reported pain inside the 90-day support window", () => {
    const f = fixture();
    f.feedback = [{ sessionId: "s0", jointPain: "significant" }];
    f.asOf = new Date("2026-11-01T00:00:00Z");
    expect(
      observeCoachEpisodes({ ...f, bootstrap: false }).some(
        (o) => o.contextKey === "session_pain:v1",
      ),
    ).toBe(true);
  });
  it("refetches persisted pain beyond its bootstrap window", () => {
    const f = fixture();
    f.feedback = [{ sessionId: "s0", jointPain: "significant" }];
    f.previous = persisted(f);
    f.asOf = new Date("2027-01-01T00:00:00Z");
    expect(
      observeCoachEpisodes(f).find((o) => o.contextKey === "session_pain:v1")
        ?.disposition,
    ).toBe("current");
  });
  it("reopening a painful workout retains the pain review", () => {
    const f = fixture();
    f.feedback = [{ sessionId: "s0", jointPain: "significant" }];
    f.previous = persisted(f);
    f.history.sessions[0].finishedAt = null as unknown as string;
    expect(
      observeCoachEpisodes(f).find((o) => o.contextKey === "session_pain:v1")
        ?.disposition,
    ).toBe("stale");
  });
  it("correcting significant-pain feedback invalidates rather than claiming recovery", () => {
    const f = fixture();
    f.feedback = [{ sessionId: "s0", jointPain: "significant" }];
    f.previous = persisted(f);
    f.feedback = [];
    expect(
      observeCoachEpisodes(f).find((o) => o.contextKey === "session_pain:v1")
        ?.disposition,
    ).toBe("invalidated");
  });
  it.each(["delete_set", "change_value", "warmup", "reopen"])(
    "handles %s without invented recovery",
    (kind) => {
      const f = fixture();
      f.previous = persisted(f);
      if (kind === "delete_set") f.history.sets.pop();
      if (kind === "change_value") f.history.sets[1].rir = 2;
      if (kind === "warmup") f.history.sets[1].is_warmup = true;
      if (kind === "reopen")
        f.history.sessions[1].finishedAt = null as unknown as string;
      expect(
        observeCoachEpisodes(f).find(
          (o) => o.contextKey === f.previous[0].contextKey,
        )?.disposition,
      ).toBe("invalidated");
    },
  );
  it("resolves only with a new comparable exposure that breaks the effort pair", () => {
    const f = fixture();
    f.previous = persisted(f);
    const next = structuredClone(f.history.sessions[1]);
    next.id = "new";
    next.performedAt = "2026-10-14T12:00:00Z";
    next.finishedAt = "2026-10-14T13:00:00Z";
    f.history.sessions.push(next);
    f.history.sets.push({
      ...f.history.sets[1],
      id: "new-set",
      session_id: "new",
      rir: 2,
      created_at: next.performedAt,
      workout_session: {
        performed_at: next.performedAt,
        finished_at: next.finishedAt,
      },
    });
    expect(observeCoachEpisodes(f)[0].disposition).toBe("recovered");
  });
  it("does not resolve from unchanged, missing or stale evidence", () => {
    const f = fixture();
    f.previous = persisted(f);
    f.history.sets[1].rir = 2;
    expect(observeCoachEpisodes(f)[0].disposition).toBe("invalidated");
  });
  it("supersedes changed program context", () => {
    const f = fixture();
    f.previous = persisted(f);
    f.activeProgramId = "other";
    expect(observeCoachEpisodes(f)[0].disposition).toBe("superseded");
  });
  it("does not hide performance evidence merely because pain takes precedence", () => {
    const f = fixture();
    f.feedback = [{ sessionId: "s0", jointPain: "significant" }];
    expect(observeCoachEpisodes(f)).toHaveLength(2);
  });
  it("calculates next occurrence weeks independently for each day", () => {
    const f = fixture();
    f.history.sessions = f.history.sessions.slice(0, 1);
    f.history.slots.push({
      ...f.history.slots[0],
      id: "second",
      programDayId: "d2",
    });
    const slots = currentCoachSlots({
      history: f.history,
      activeProgramId: "p",
      style: "classic",
      days: [
        { id: "d", position: 0 },
        { id: "d2", position: 1 },
      ],
      open: null,
      asOf: f.asOf,
      definitions: f.definitions,
    });
    expect(slots.map((s) => s.weekIndex)).toEqual([2, 1]);
  });
  it("uses the stored open-workout week and choices", () => {
    const f = fixture();
    const slots = currentCoachSlots({
      history: f.history,
      activeProgramId: "p",
      style: "fluid",
      days: [{ id: "d", position: 0 }],
      open: { dayId: "d", week: 7, choices: { slot: "db-bench" } },
      asOf: f.asOf,
      definitions: f.definitions,
    });
    expect(slots[0]).toMatchObject({ weekIndex: 7, exerciseId: "db-bench" });
  });
  it("does not guess an unresolved open-workout choice", () => {
    const f = fixture();
    expect(
      currentCoachSlots({
        history: f.history,
        activeProgramId: "p",
        style: "classic",
        days: [{ id: "d", position: 0 }],
        open: { dayId: "d", week: 1, choices: {} },
        asOf: f.asOf,
        definitions: f.definitions,
      }),
    ).toEqual([]);
  });
});
