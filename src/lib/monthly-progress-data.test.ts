import { describe, expect, it, vi } from "vitest";
import { loadMonthlyHistory } from "./strength-history-data";
import { buildMonthlyReport } from "./monthly-progress";
async function loadMonthlyReport(db: Parameters<typeof loadMonthlyHistory>[0], userId: string, month: string, catalog: typeof EXERCISE_BY_ID, now: Date) {
  return buildMonthlyReport({ userId, month, catalog, now, ...await loadMonthlyHistory(db, userId, month, now) });
}
import { EXERCISE_BY_ID } from "./strength/coefficients";
function client(results: Array<{ data: unknown[] | null; error: unknown }>) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(), then: vi.fn() };
  let i = 0;
  query.then.mockImplementation((resolve: (r: unknown) => void) => resolve(results[i++]));
  return { query, db: { from: vi.fn(() => query) } as unknown as Parameters<typeof loadMonthlyReport>[0] };
}
const now = new Date("2026-09-13T18:00:00Z");
const s = { id: "s", user_id: "u", performed_at: "2026-09-02T12:00:00Z", finished_at: "2026-09-02T13:00:00Z" };
const row = { id: "a", user_id: "u", session_id: "s", exercise_id: "bb-bench", equipment_instance_id: null,
  program_slot_id: null, weight: 100, reps: 8, rir: 1, e1rm: 130, is_warmup: false,
  created_at: "2026-09-02T12:05:00Z", workout_session: s };
const ok = (data: unknown[]) => ({ data, error: null });
describe("monthly history reads", () => {
  it("continues across short pages and scopes every page to the owner", async () => {
    const { db, query } = client([ok([s]), ok([]), ok([row]), ok([{ ...row, id: "b" }]), ok([])]);
    const r = await loadMonthlyReport(db, "u", "2026-09", EXERCISE_BY_ID, now);
    expect(r.current.workouts).toBe(1);
    expect(query.gt.mock.calls).toEqual([["id", "s"], ["id", "a"], ["id", "b"]]);
    expect(query.eq.mock.calls.filter(([key]) => key === "user_id")).toEqual(Array(5).fill(["user_id", "u"]));
    expect(query.not).toHaveBeenCalledWith("workout_session.finished_at", "is", null);
    expect(query.lt).toHaveBeenCalledWith("workout_session.performed_at", "2026-09-15T00:00:00Z");
  });
  it("reaches an all-time baseline beyond 1000 rows", async () => {
    const prior = { ...s, id: "p", performed_at: "2026-01-01T12:00:00Z", finished_at: "2026-01-01T13:00:00Z" };
    const page = Array.from({ length: 500 }, (_, i) => ({ ...row, id: `a-${i}` }));
    const last = { ...row, id: "z", session_id: "p", reps: 20, created_at: "2026-01-01T12:05:00Z", workout_session: prior };
    const { db, query } = client([ok([s, prior]), ok([]), ok(page), ok(page.map(r => ({ ...r, id: `b-${r.id}` }))), ok([last]), ok([])]);
    const r = await loadMonthlyReport(db, "u", "2026-09", EXERCISE_BY_ID, now);
    expect(r.current.repPrs).toBe(0);
    expect(query.gt).toHaveBeenCalledWith("id", "z");
  });
  it("skips sets for an empty history", async () => {
    const { db } = client([ok([])]);
    expect((await loadMonthlyReport(db, "u", "2026-09", EXERCISE_BY_ID, now)).current.workouts).toBe(0);
    expect(db.from).toHaveBeenCalledTimes(1);
  });
  it.each([0, 2])("surfaces failures instead of returning partial reports (%i)", async index => {
    const results = [ok([s]), ok([]), ok([row])];
    const { db } = client(results.map((r, i) => i === index ? { data: null, error: {} } : r));
    await expect(loadMonthlyReport(db, "u", "2026-09", EXERCISE_BY_ID, now)).rejects.toThrow("Unable to load monthly");
  });
});
