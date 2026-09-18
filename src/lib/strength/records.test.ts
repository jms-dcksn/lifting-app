import { describe, expect, it } from "vitest";
import { EXERCISE_BY_ID } from "./coefficients";
import { computeE1rm } from "./e1rm";
import { historicalBodyweight, recapHeadline, recapLines, recordCounts, recordsForSlot, validSetNumbers, workoutRecords, type RecordSet } from "./records";

const start = "2026-09-12T10:00:00Z";
const catalog = { ...EXERCISE_BY_ID,
  hammer: { ...EXERCISE_BY_ID["machine-chest-press"], id: "hammer", name: "Hammer chest press", machineTemplate: false },
  hoist: { ...EXERCISE_BY_ID["machine-chest-press"], id: "hoist", name: "Hoist chest press", machineTemplate: false },
};
function set(overrides: Partial<RecordSet> = {}): RecordSet {
  return { id: "prior", user_id: "user", session_id: "previous", exercise_id: "bb-bench", equipment_instance_id: null,
    program_slot_id: "old-slot", weight: 100, reps: 8, rir: 1, e1rm: computeE1rm(100, 8, 1),
    is_warmup: false, created_at: "2026-09-10T10:05:00Z",
    workout_session: { performed_at: "2026-09-10T10:00:00Z", finished_at: "2026-09-10T11:00:00Z" }, ...overrides };
}
function current(overrides: Partial<RecordSet> = {}) {
  return set({ id: "current", session_id: "active", program_slot_id: "slot", reps: 10,
    created_at: "2026-09-12T10:05:00Z", workout_session: { performed_at: start, finished_at: null }, ...overrides });
}
const detect = (sets: RecordSet[]) => workoutRecords(sets, "user", "active", start, catalog);

describe("workout records", () => {
  it("awards 100 × 10 over 100 × 8 and uses the canonical RIR e1RM", () => {
    const groups = detect([set(), current()]);
    expect(groups).toHaveLength(1);
    expect(groups[0].repRecords).toMatchObject([{ load: 100, reps: 10, improvement: 2 }]);
    const value = Math.round(computeE1rm(100, 10, 1) * 10) / 10;
    const baseline = Math.round(computeE1rm(100, 8, 1) * 10) / 10;
    expect(groups[0].e1rmRecord).toMatchObject({ value, improvement: Math.round((value - baseline) * 10) / 10 });
    expect(recordCounts(groups)).toEqual({ reps: 1, e1rm: 1, exercises: 1 });
  });

  it.each([8, 7])("ignores tied/lower performance (%i reps)", (reps) => {
    expect(detect([set(), current({ reps })])).toEqual([]);
  });

  it("has a quiet empty state and does not count first observations", () => {
    expect(detect([])).toEqual([]);
    expect(detect([current()])).toEqual([]);
    expect(detect([set(), current({ weight: 10 })])).toEqual([]);
    expect(recordCounts([])).toEqual({ reps: 0, e1rm: 0, exercises: 0 });
  });

  it("consolidates repeated gains against pre-workout history, retaining distinct loads", () => {
    const groups = detect([set(), set({ id: "other-weight", weight: 110, reps: 6 }),
      current(), current({ id: "later", reps: 12, created_at: "2026-09-12T10:10:00Z" }),
      current({ id: "heavier", weight: 110, reps: 9, created_at: "2026-09-12T10:15:00Z" })]);
    expect(groups[0].repRecords).toMatchObject([{ load: 110, reps: 9, improvement: 3 }, { load: 100, reps: 12, improvement: 4 }]);
    expect(groups[0].e1rmRecord?.setId).toBe("later");
    expect(recordCounts(groups)).toEqual({ reps: 2, e1rm: 1, exercises: 1 });
  });

  it("allows within-workout improvements after a first observation without inventing historical deltas", () => {
    const groups = detect([current({ id: "first", reps: 8 }), current({ id: "next", created_at: "2026-09-12T10:10:00Z" })]);
    expect(groups[0].repRecords[0].improvement).toBeNull();
    expect(groups[0].e1rmRecord?.improvement).toBeNull();
    expect(recordCounts(groups)).toEqual({ reps: 1, e1rm: 1, exercises: 1 });
  });

  it("uses all-time history across program slots, not just the most recent session", () => {
    expect(detect([set({ id: "all-time", reps: 12 }), set({ id: "recent", reps: 8 }), current()])).toEqual([]);
  });

  it("isolates exact exercises, machine variants, equipment instances, and users", () => {
    expect(detect([set({ exercise_id: "hammer" }), current({ exercise_id: "hoist" })])).toEqual([]);
    expect(detect([set({ exercise_id: "db-bench" }), current()])).toEqual([]);
    expect(detect([set({ equipment_instance_id: "machine-1" }), current({ equipment_instance_id: "machine-2" })])).toEqual([]);
    expect(detect([set({ user_id: "someone-else" }), current()])).toEqual([]);
    expect(detect([set(), current({ user_id: "someone-else" })])).toEqual([]);
    expect(detect([set({ exercise_id: "hammer" }), current({ exercise_id: "hammer" })])).toHaveLength(1);
  });

  it("excludes warmups both as candidates and as baselines", () => {
    expect(detect([set(), current({ is_warmup: true })])).toEqual([]);
    expect(detect([set({ is_warmup: true }), current()])).toEqual([]);
  });

  it.each([
    { weight: null }, { weight: NaN }, { weight: Infinity }, { weight: 0 }, { weight: -5 },
    { reps: null }, { reps: 0 }, { reps: 2.5 }, { reps: Infinity }, { rir: -1 }, { rir: NaN }, { rir: 6 },
    { exercise_id: "missing" }, { exercise_id: "machine-chest-press" },
  ])("ignores invalid/incomplete sets %j", (values) => {
    expect(detect([set(), current(values)])).toEqual([]);
  });

  it("retains the app's RIR=2 default for legacy null RIR", () => {
    const groups = detect([set({ rir: null }), current({ rir: null })]);
    expect(groups[0].e1rmRecord?.value).toBe(Math.round(computeE1rm(100, 10, 2) * 10) / 10);
    expect(validSetNumbers({ weight: null, reps: 10, rir: 2 })).toBe(false);
    expect(validSetNumbers({ weight: 100, reps: 10, rir: undefined })).toBe(false);
  });

  it("normalizes load noise and suppresses sub-display e1RM rounding artifacts", () => {
    expect(detect([set(), current({ weight: 100.00000001 })])[0].repRecords[0].improvement).toBe(2);
    expect(detect([set(), current({ reps: 8, weight: 100.000001 })])).toEqual([]);
    const group = detect([set(), current({ reps: 8, weight: 100.1 })])[0];
    expect(group.e1rmRecord!.improvement).toBeGreaterThanOrEqual(0.1);
  });

  it("handles bodyweight, added load, and assistance using historical total load", () => {
    for (const weight of [0, 25, -40]) {
      const previous = set({ exercise_id: "weighted-pullup", weight, e1rm: computeE1rm(150 + weight, 8, 1) });
      const next = current({ exercise_id: "weighted-pullup", weight, e1rm: computeE1rm(150 + weight, 10, 1) });
      const groups = detect([previous, next]);
      expect(groups[0].repRecords[0]).toMatchObject({ load: 150 + weight, weight, improvement: 2 });
      expect(groups[0].e1rmRecord?.value).toBe(Math.round(next.e1rm! * 10) / 10);
      expect(historicalBodyweight(previous)).toBe(150);
    }
  });

  it("does not compare equal added weights when historical total loads differ", () => {
    const previous = set({ exercise_id: "weighted-pullup", weight: 25, e1rm: computeE1rm(175, 8, 1) });
    const next = current({ exercise_id: "weighted-pullup", weight: 25, e1rm: computeE1rm(185, 10, 1) });
    expect(detect([previous, next])[0].repRecords).toEqual([]);
    expect(historicalBodyweight(previous)).toBe(150);
    expect(historicalBodyweight(next)).toBe(160);
  });

  it.each([null, 0, -10, NaN])("never fabricates historical bodyweight from a missing/invalid e1RM %s", (e1rm) => {
    expect(historicalBodyweight(set({ e1rm }))).toBeNull();
    expect(detect([set(), current({ exercise_id: "weighted-pullup", weight: 0, e1rm })])).toEqual([]);
  });

  it("excludes other unfinished workouts, overlapping finishes, and future history", () => {
    for (const workout_session of [
      { performed_at: "2026-09-10T10:00:00Z", finished_at: null },
      { performed_at: "2026-09-10T10:00:00Z", finished_at: "2026-09-12T10:30:00Z" },
      { performed_at: "2026-09-13T10:00:00Z", finished_at: "2026-09-13T11:00:00Z" },
    ]) expect(detect([set({ workout_session }), current()])).toEqual([]);
  });

  it("keeps the finished recap stable after later workouts and backdated newly added sets", () => {
    const rows = [set(), current()];
    const original = detect(rows);
    const reopened = rows.map((s) => s.session_id === "active"
      ? { ...s, workout_session: { performed_at: start, finished_at: "2026-09-12T11:00:00Z" } } : s);
    expect(detect([...reopened, set({ id: "future", reps: 30, created_at: "2026-09-13T10:05:00Z",
      workout_session: { performed_at: "2026-09-13T10:00:00Z", finished_at: "2026-09-13T11:00:00Z" } })])).toEqual(original);
    expect(detect([...rows, set({ id: "late-add", reps: 30, created_at: "2026-09-13T10:05:00Z" })])).toEqual(original);
  });

  it("recalculates after current and historical edits/deletions", () => {
    const previous = set();
    const first = current();
    const last = current({ id: "last", reps: 12, created_at: "2026-09-12T10:10:00Z" });
    expect(detect([previous, first, last])[0].repRecords[0].improvement).toBe(4);
    expect(detect([previous, first])[0].repRecords[0].improvement).toBe(2);
    expect(detect([previous, { ...first, reps: 7 }])).toEqual([]);
    expect(detect([{ ...previous, reps: 15 }, first])).toEqual([]);
    expect(detect([first])).toEqual([]);
  });

  it("is deterministic across retries, duplicate reads, reordered inputs, and resume", () => {
    const rows = [set(), current(), current({ id: "later", reps: 12, created_at: "2026-09-12T10:15:00Z" })];
    expect(detect([...rows, ...rows])).toEqual(detect(rows));
    expect(detect([...rows].reverse())).toEqual(detect(rows));
    expect(detect(JSON.parse(JSON.stringify(rows)))).toEqual(detect(rows));
  });

  it("writes a recap hero that does not mix rep and e1RM into one dishonest count", () => {
    expect(recapHeadline({ reps: 0, e1rm: 0, exercises: 0 })).toBeNull();
    expect(recapHeadline({ reps: 2, e1rm: 0, exercises: 1 })).toBe("2 PRs");
    expect(recapHeadline({ reps: 0, e1rm: 1, exercises: 1 })).toBe("1 PR");
    expect(recapHeadline({ reps: 1, e1rm: 1, exercises: 1 })).toBe("1 rep PR · 1 e1RM record");
    expect(recapHeadline({ reps: 2, e1rm: 1, exercises: 1 })).toBe("2 rep PRs · 1 e1RM record");
  });

  it("formats compact recap lines without inventing deltas", () => {
    const mixed = detect([set(), current()])[0];
    expect(recapLines(mixed)).toEqual([
      "100 × 10 +2",
      `${mixed.e1rmRecord!.value} e1RM +${mixed.e1rmRecord!.improvement}`,
    ]);
    const first = detect([current({ id: "first", reps: 8 }), current({ id: "next", created_at: "2026-09-12T10:10:00Z" })])[0];
    expect(recapLines(first)).toEqual([
      "100 × 10",
      `${first.e1rmRecord!.value} e1RM`,
    ]);
  });

  it("keeps records attached to the winning slot across swaps and duplicated exercises", () => {
    const groups = detect([set(), current(), current({ id: "later", program_slot_id: "second", reps: 12, created_at: "2026-09-12T10:15:00Z" }),
      set({ id: "machine-prior", exercise_id: "hammer" }), current({ id: "machine-now", exercise_id: "hammer" })]);
    expect(recordCounts(groups)).toEqual({ reps: 2, e1rm: 2, exercises: 2 });
    expect(recordsForSlot(groups, "slot").map((g) => g.exerciseId)).toEqual(["hammer"]);
    expect(recordsForSlot(groups, "second")[0].repRecords[0].reps).toBe(12);
    expect(recordsForSlot(groups, "empty")).toEqual([]);
  });
});
