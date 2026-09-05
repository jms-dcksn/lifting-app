import { describe, expect, it, vi } from "vitest";
import { exerciseFamilyIds, loadExerciseHistory } from "./exercise-history";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const base = EXERCISE_BY_ID["machine-chest-press"];
const catalog = {
  ...EXERCISE_BY_ID,
  hammer: { ...base, id: "hammer", baseExerciseId: base.id, brand: "Hammer Strength", machineType: "plate_loaded" as const },
  life: { ...base, id: "life", baseExerciseId: base.id, brand: "Life Fitness", machineType: "selectorized" as const },
  custom: { ...base, id: "custom", name: "Custom chest machine", machineTemplate: false },
};

describe("exercise history families", () => {
  it.each([base.id, "hammer", "life"])("includes all brands/types from %s without unrelated pressing exercises", (id) => {
    expect(exerciseFamilyIds(id, catalog).sort()).toEqual([base.id, "hammer", "life"].sort());
  });
  it("keeps free-weight and unlinked custom exercises separate", () => {
    expect(exerciseFamilyIds("bb-bench", catalog)).toEqual(["bb-bench"]);
    expect(exerciseFamilyIds("custom", catalog)).toEqual(["custom"]);
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
