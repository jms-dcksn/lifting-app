import { describe, expect, it, vi } from "vitest";
import { loadWorkoutRecords } from "./workout-records";
import { EXERCISE_BY_ID } from "./strength/coefficients";

function client(results: Array<{ data: unknown[] | null; error: unknown }>) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: vi.fn(),
  };
  results.forEach((result) => query.range.mockResolvedValueOnce(result));
  return { query, db: { from: vi.fn(() => query) } as unknown as Parameters<typeof loadWorkoutRecords>[0] };
}
const row = { id: "one", user_id: "u", session_id: "s", exercise_id: "bb-bench", equipment_instance_id: null,
  program_slot_id: "slot", weight: 100, reps: 10, rir: 1, e1rm: 141.44, is_warmup: false,
  created_at: "2026-09-12T10:01:00Z", workout_session: { performed_at: "2026-09-12T10:00:00Z", finished_at: null } };
const load = (db: Parameters<typeof loadWorkoutRecords>[0]) => loadWorkoutRecords(db, "u", "s", "2026-09-12T10:00:00Z", EXERCISE_BY_ID);

describe("workout record reads", () => {
  it("scopes every read to the user and only reads prior finished history for logged exercises", async () => {
    const { db, query } = client([{ data: [row], error: null }, { data: [], error: null }]);
    expect((await load(db)).achievements).toEqual([]);
    expect(query.eq.mock.calls.filter(([field]) => field === "user_id")).toEqual([["user_id", "u"], ["user_id", "u"]]);
    expect(query.eq).toHaveBeenCalledWith("session_id", "s");
    expect(query.eq).toHaveBeenCalledWith("is_warmup", false);
    expect(query.neq).toHaveBeenCalledWith("session_id", "s");
    expect(query.in).toHaveBeenCalledWith("exercise_id", ["bb-bench"]);
    expect(query.lt).toHaveBeenCalledWith("workout_session.performed_at", "2026-09-12T10:00:00Z");
    expect(query.lt).toHaveBeenCalledWith("created_at", "2026-09-12T10:00:00Z");
    expect(query.lte).toHaveBeenCalledWith("workout_session.finished_at", "2026-09-12T10:00:00Z");
  });
  it("paginates both current sets and history, including a record beyond the default 1,000-row cap", async () => {
    const current = Array.from({ length: 500 }, (_, i) => ({ ...row, id: `current-${i}` }));
    const history = Array.from({ length: 500 }, (_, i) => ({ ...row, id: `prior-${i}`, session_id: "prior", reps: 5,
      created_at: "2026-09-10T10:01:00Z", workout_session: { performed_at: "2026-09-10T10:00:00Z", finished_at: "2026-09-10T11:00:00Z" } }));
    const { db, query } = client([
      { data: current, error: null }, { data: [], error: null },
      { data: history, error: null }, { data: history.map((r) => ({ ...r, id: `second-${r.id}` })), error: null },
      { data: [{ ...history[0], id: "all-time", reps: 20 }], error: null },
    ]);
    const result = await load(db);
    expect(result.achievements).toEqual([]);
    expect(result.history).toHaveLength(1001);
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999], [0, 499], [500, 999], [1000, 1499]]);
    expect(query.order).toHaveBeenCalledWith("id");
  });
  it("does not query all history for an empty workout", async () => {
    const { db, query } = client([{ data: [], error: null }]);
    expect((await load(db)).achievements).toEqual([]);
    expect(query.range).toHaveBeenCalledOnce();
  });
  it.each([0, 1])("surfaces read failure %i instead of inventing a baseline", async (index) => {
    const results = [{ data: [row], error: null }, { data: [], error: null }];
    const { db } = client(results.map((r, i) => i === index ? { data: null, error: { message: "offline" } } : r));
    await expect(load(db)).rejects.toThrow("Unable to load");
  });
});
