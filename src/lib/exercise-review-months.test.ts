import { describe, expect, it } from "vitest";
import {
  reviewCompareDefaults,
  reviewEmptyMonthSide,
  reviewProgramCaption,
  sessionsInMonths,
} from "./exercise-review-months";
import { reviewMonthSide } from "./exercise-review-month-stats";
import { groupReviewSessions } from "./exercise-review-sessions";
import { monthlyWindows, type MonthlySession } from "./monthly-progress";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { computeE1rm } from "./strength/e1rm";
import type { RecordSet } from "./strength/records";

const now = new Date("2026-09-19T18:00:00Z");
const catalog = { "bb-bench": EXERCISE_BY_ID["bb-bench"] };

function session(id: string, day: string, extra: Partial<MonthlySession> = {}): MonthlySession {
  return {
    id,
    user_id: "u",
    performed_at: extra.performed_at ?? `${day}T12:00:00Z`,
    finished_at: extra.finished_at ?? `${day}T13:00:00Z`,
    program_id: extra.program_id ?? null,
    ...extra,
  };
}

function set(s: MonthlySession, reps = 8, extra: Partial<RecordSet> = {}): RecordSet {
  return {
    id: extra.id ?? `set-${s.id}`,
    user_id: s.user_id,
    session_id: s.id,
    exercise_id: "bb-bench",
    program_slot_id: null,
    equipment_instance_id: null,
    weight: 100,
    reps,
    rir: 1,
    e1rm: extra.e1rm === undefined ? computeE1rm(100, reps, 1) : extra.e1rm,
    is_warmup: false,
    created_at: s.performed_at.replace("12:00", "12:05"),
    workout_session: s,
    ...extra,
  };
}

function source(sessions: MonthlySession[], sets: RecordSet[]) {
  return { userId: "u", exerciseId: "bb-bench", equipmentInstanceId: null, catalog, sessions, sets, bodyweight: null };
}

describe("reviewCompareDefaults", () => {
  it("uses the inbound month versus the previous calendar month", () => {
    expect(reviewCompareDefaults("2026-07", now)).toEqual({
      thisMonth: "2026-07",
      otherMonth: "2026-06",
    });
  });

  it("uses the current Chicago month versus previous when no inbound month exists", () => {
    expect(reviewCompareDefaults(null, now)).toEqual({
      thisMonth: "2026-09",
      otherMonth: "2026-08",
    });
    expect(reviewCompareDefaults(null, new Date("2026-09-01T04:59:00Z"))).toEqual({
      thisMonth: "2026-08",
      otherMonth: "2026-07",
    });
  });
});

describe("reviewMonthSide", () => {
  it("shows a trained month's PRs, stored e1RM, Chicago volume, and exposures, and none for an empty month", () => {
    const prior = session("old", "2026-07-01");
    const august = session("aug", "2026-08-02");
    const september = session("sep", "2026-09-02");
    const later = session("sep2", "2026-09-16");
    const sessions = [prior, august, september, later];
    const sets = [
      set(prior, 6),
      set(august, 8),
      set(september, 10),
      set(later, 8, { weight: 110, e1rm: 155.34 }),
    ];
    const src = source(sessions, sets);
    const sep = reviewMonthSide("2026-09", src, now);
    const aug = reviewMonthSide("2026-08", src, now);
    const empty = reviewMonthSide("2026-06", src, now);

    expect(sep).toMatchObject({
      month: "2026-09",
      label: "Sep",
      trained: true,
      exposures: 2,
    });
    expect(sep.bestE1rm).toBe(155.3);
    expect(sep.volume).toBe(100 * 10 + 110 * 8);
    expect(sep.repPrs).toBeGreaterThanOrEqual(0);
    expect(sep.e1rmPrs).toBeGreaterThanOrEqual(0);
    expect(sep.topWeightPrs).toBe(1);
    expect(aug).toMatchObject({
      month: "2026-08",
      label: "Aug",
      trained: true,
      exposures: 1,
      volume: 800,
    });
    expect(empty).toEqual(reviewEmptyMonthSide("2026-06"));
    expect(empty.trained).toBe(false);
    expect(empty.bestE1rm).toBeNull();
    expect(empty.volume).toBeNull();
    expect(empty.exposures).toBeNull();
  });

  it("does not treat a UTC timestamp in the next UTC month as September in Chicago", () => {
    const lateAugust = session("late", "2026-09-01", { performed_at: "2026-09-01T04:59:00Z", finished_at: "2026-09-01T05:30:00Z" });
    const src = source([lateAugust], [set(lateAugust, 8)]);
    expect(monthlyWindows("2026-09", now).current.start).toBe("2026-09-01");
    expect(reviewMonthSide("2026-09", src, now).trained).toBe(false);
    expect(reviewMonthSide("2026-08", src, now)).toMatchObject({
      trained: true,
      exposures: 1,
      volume: 800,
    });
  });

  it("does not invent a comparison when the lift is new this month", () => {
    const september = session("sep", "2026-09-02");
    const src = source([september], [set(september, 8, { e1rm: 75.3 })]);
    const sep = reviewMonthSide("2026-09", src, now);
    const aug = reviewMonthSide("2026-08", src, now);
    expect(sep).toMatchObject({ trained: true, bestE1rm: 75.3, exposures: 1 });
    expect(aug.trained).toBe(false);
    expect(aug.bestE1rm).toBeNull();
  });

  it("does not blend a second equipment instance into the selected identity", () => {
    const september = session("sep", "2026-09-02");
    const other = session("other", "2026-09-16");
    const src = source([september, other], [
      set(september, 8, { e1rm: 140 }),
      set(other, 8, { e1rm: 400, equipment_instance_id: "other-machine" }),
    ]);
    const sep = reviewMonthSide("2026-09", src, now);
    expect(sep).toMatchObject({ trained: true, bestE1rm: 140, exposures: 1, volume: 800 });
  });
});

describe("reviewProgramCaption", () => {
  it("lists unique program names in performed-at order and omits missing names", () => {
    const sessions = groupReviewSessions(
      [
        {
          id: "a",
          sessionId: "s1",
          weight: 100,
          reps: 8,
          rir: 1,
          e1rm: 140,
          performedAt: "2026-08-02T12:00:00Z",
          finishedAt: "2026-08-02T13:00:00Z",
          programId: "p1",
        },
        {
          id: "b",
          sessionId: "s2",
          weight: 100,
          reps: 8,
          rir: 1,
          e1rm: 150,
          performedAt: "2026-09-02T12:00:00Z",
          finishedAt: "2026-09-02T13:00:00Z",
          programId: "p2",
        },
        {
          id: "c",
          sessionId: "s3",
          weight: 100,
          reps: 8,
          rir: 1,
          e1rm: 155,
          performedAt: "2026-09-16T12:00:00Z",
          finishedAt: "2026-09-16T13:00:00Z",
          programId: "p1",
        },
        {
          id: "d",
          sessionId: "s4",
          weight: 100,
          reps: 8,
          rir: 1,
          e1rm: 160,
          performedAt: "2026-09-18T12:00:00Z",
          finishedAt: "2026-09-18T13:00:00Z",
          programId: null,
        },
      ],
      now,
    ).map((session, i) => ({
      ...session,
      programName: i === 0 ? "Foundations" : i === 1 ? "Hypertrophy" : i === 2 ? "Foundations" : null,
    }));

    expect(reviewProgramCaption(sessions)).toBe("Programs: Foundations, Hypertrophy");
    expect(reviewProgramCaption(sessions.slice(0, 1))).toBe("Program: Foundations");
    expect(reviewProgramCaption(sessions.filter((session) => session.programName == null))).toBeNull();
    expect(sessionsInMonths(sessions, ["2026-09"]).map((session) => session.sessionId)).toEqual([
      "s2",
      "s3",
      "s4",
    ]);
  });
});
