import { describe, expect, it, vi } from "vitest";
import { exerciseFamilyIds, latestFamilyMember, loadExerciseHistory } from "./exercise-history";
import { EXERCISE_BY_ID, type ExerciseDef } from "./strength/coefficients";

const base = EXERCISE_BY_ID["machine-chest-press"];

function linked(baseDef: ExerciseDef, id: string, extra: Partial<ExerciseDef> = {}): ExerciseDef {
  return { ...baseDef, id, baseExerciseId: baseDef.id, isReference: false, ...extra };
}

const catalog = {
  ...EXERCISE_BY_ID,
  hammer: linked(base, "hammer", { brand: "Hammer Strength", machineType: "plate_loaded" }),
  life: linked(base, "life", { brand: "Life Fitness", machineType: "selectorized" }),
  custom: { ...base, id: "custom", name: "Custom chest machine", machineTemplate: false },
  "lat-pulldown__nautilus__selectorized": linked(EXERCISE_BY_ID["lat-pulldown"], "lat-pulldown__nautilus__selectorized", {
    brand: "Nautilus", machineType: "selectorized",
  }),
  "lat-pulldown__hoist__selectorized": linked(EXERCISE_BY_ID["lat-pulldown"], "lat-pulldown__hoist__selectorized", {
    brand: "Hoist", machineType: "selectorized",
  }),
  "bb-bench__flex-fitness__bench": linked(EXERCISE_BY_ID["bb-bench"], "bb-bench__flex-fitness__bench", {
    brand: "Flex Fitness", machineType: "bench",
  }),
  "bb-bench__nautilus__bench": linked(EXERCISE_BY_ID["bb-bench"], "bb-bench__nautilus__bench", {
    brand: "Nautilus", machineType: "bench",
  }),
  "bb-incline-bench__flex-fitness__bench": linked(EXERCISE_BY_ID["bb-incline-bench"], "bb-incline-bench__flex-fitness__bench", {
    brand: "Flex Fitness", machineType: "bench",
  }),
  "bb-back-squat__rogue__rack": linked(EXERCISE_BY_ID["bb-back-squat"], "bb-back-squat__rogue__rack", {
    brand: "Rogue", machineType: "rack",
  }),
  "bb-deadlift__eleiko__platform": linked(EXERCISE_BY_ID["bb-deadlift"], "bb-deadlift__eleiko__platform", {
    brand: "Eleiko", machineType: "platform",
  }),
};

describe("exercise history families", () => {
  it.each([base.id, "hammer", "life"])("includes all brands/types from %s without unrelated pressing exercises", (id) => {
    expect(exerciseFamilyIds(id, catalog).sort()).toEqual([base.id, "hammer", "life"].sort());
  });
  it("keeps free-weight and unlinked custom exercises separate", () => {
    expect(exerciseFamilyIds("bb-row", catalog)).toEqual(["bb-row"]);
    expect(exerciseFamilyIds("custom", catalog)).toEqual(["custom"]);
  });
  it.each([
    ["lat-pulldown", "lat-pulldown__nautilus__selectorized", "lat-pulldown__hoist__selectorized"],
    ["bb-bench", "bb-bench__flex-fitness__bench", "bb-bench__nautilus__bench"],
    ["bb-back-squat", "bb-back-squat__rogue__rack"],
    ["bb-deadlift", "bb-deadlift__eleiko__platform"],
  ] as const)("groups leftover %s with its station variants", (template, ...variants) => {
    const family = [template, ...variants].sort();
    expect(exerciseFamilyIds(template, catalog).sort()).toEqual(family);
    for (const id of variants) {
      expect(exerciseFamilyIds(id, catalog).sort()).toEqual(family);
    }
  });
  it("does not merge different movements that share a station profile", () => {
    expect(exerciseFamilyIds("bb-bench", catalog)).not.toContain("bb-incline-bench");
    expect(exerciseFamilyIds("bb-bench", catalog)).not.toContain("bb-incline-bench__flex-fitness__bench");
    expect(exerciseFamilyIds("bb-incline-bench", catalog).sort()).toEqual([
      "bb-incline-bench",
      "bb-incline-bench__flex-fitness__bench",
    ].sort());
  });
});

describe("latestFamilyMember", () => {
  it("picks the latest finished family identity without merging numbers", () => {
    const leftover = { exerciseId: "bb-bench", lastPerformedAt: "2026-08-01T12:00:00Z", currentE1rm: 300 };
    const flex = { exerciseId: "bb-bench__flex-fitness__bench", lastPerformedAt: "2026-09-10T12:00:00Z", currentE1rm: 185 };
    const nautilus = { exerciseId: "bb-bench__nautilus__bench", lastPerformedAt: "2026-09-02T12:00:00Z", currentE1rm: 210 };
    const incline = { exerciseId: "bb-incline-bench__flex-fitness__bench", lastPerformedAt: "2026-09-20T12:00:00Z", currentE1rm: 160 };
    expect(latestFamilyMember("bb-bench", catalog, [leftover, flex, nautilus, incline])).toEqual(flex);
    expect(latestFamilyMember("bb-bench__nautilus__bench", catalog, [leftover, flex, nautilus])).toEqual(flex);
  });
  it("falls back to a leftover flat row when no variant has finished yet", () => {
    const leftover = { exerciseId: "lat-pulldown", lastPerformedAt: "2026-07-01T12:00:00Z", currentE1rm: 140 };
    expect(latestFamilyMember("lat-pulldown", catalog, [leftover])).toEqual(leftover);
  });
});

function client(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(result),
  };
  return { query, db: { from: vi.fn(() => query) } as unknown as Parameters<typeof loadExerciseHistory>[0] };
}

describe("history query", () => {
  it("scopes to the user and exercise family, excludes this workout, and limits to ten newest sets", async () => {
    const rows = [{ id: "set", weight: 0, reps: 12, rir: null }];
    const { db, query } = client({ data: rows, error: null });
    expect(await loadExerciseHistory(db, "user", [base.id, "hammer", "life"], "active")).toEqual(rows);
    expect(query.eq).toHaveBeenCalledWith("user_id", "user");
    expect(query.in).toHaveBeenCalledWith("exercise_id", [base.id, "hammer", "life"]);
    expect(query.neq).toHaveBeenCalledWith("session_id", "active");
    expect(query.order.mock.calls).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(query.limit).toHaveBeenCalledWith(10);
  });
  it("distinguishes failed reads from empty history", async () => {
    const failure = client({ data: null, error: { message: "offline" } });
    await expect(loadExerciseHistory(failure.db, "user", [base.id], "active")).rejects.toThrow("Unable to load");
    const empty = client({ data: [], error: null });
    expect(await loadExerciseHistory(empty.db, "user", [base.id], "active")).toEqual([]);
  });
});
