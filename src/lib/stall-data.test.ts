import { describe, expect, it, vi } from "vitest";
import { loadStallAssessments } from "./stall-data";
import { loadMonthlyReport } from "./monthly-progress-data";
import { EXERCISE_BY_ID } from "./strength/coefficients";

type DB = Parameters<typeof loadStallAssessments>[0];
function client(tables: Record<string, unknown[][]>, failure?: string) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const indices: Record<string, number> = {};
  const db = { from: vi.fn((table: string) => {
    const query: Record<string, unknown> = {};
    for (const op of ["select", "eq", "not", "lte", "lt", "order", "limit", "gt"]) query[op] = (...args: unknown[]) => {
      calls.push({ table, op, args }); return query;
    };
    query.then = (resolve: (r: unknown) => void) => {
      const i = indices[table] ?? 0; indices[table] = i + 1;
      return resolve({ data: tables[table]?.[i] ?? [], error: table === failure ? { message: "private database detail" } : null });
    };
    return query;
  }) } as unknown as DB;
  return { db, calls };
}
const now = new Date("2026-09-30T18:00:00Z");
function tables() {
  const sessions = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, user_id: "u", program_id: "p", program_day_id: "d", week_index: 1,
    performed_at: `2026-08-${String(1 + i * 5).padStart(2, "0")}T12:00:00Z`, finished_at: `2026-08-${String(1 + i * 5).padStart(2, "0")}T13:00:00Z` }));
  return {
    workout_session: [sessions], set_log: [sessions.map((s, i) => ({ id: `r${i}`, user_id: "u", session_id: s.id,
      program_slot_id: "slot", exercise_id: "bb-bench", equipment_instance_id: null, weight: 100, reps: 8, rir: 1, e1rm: 130,
      is_warmup: false, created_at: s.performed_at, workout_session: s }))],
    program_slot: [[{ id: "slot", user_id: "u", program_day_id: "d", exercise_id: "bb-bench", target_sets: 2, rep_min: 6, rep_max: 10, target_rir: 1, plateau_patience: null }]],
    program_day: [[{ id: "d", user_id: "u", program_id: "p" }]], program_phase: [],
    movement_adaptation: [[{ id: "a", user_id: "u", program_slot_id: "slot", exercise_id: "bb-bench", action: "manual_swap",
      new_exercise_id: "bb-bench", new_rep_min: null, new_rep_max: null, created_at: "2026-09-01T12:00:00Z" }]],
  };
}
describe("shared stall data boundary", () => {
  it("paginates every table with owner predicates, including short adaptation pages", async () => {
    const t = tables(); t.movement_adaptation.push([{ ...t.movement_adaptation[0][0], id: "b", created_at: "2026-10-01T12:00:00Z" }]);
    const { db, calls } = client(t);
    expect((await loadStallAssessments(db, "u", EXERCISE_BY_ID, now))[0].points).toEqual([]);
    for (const table of Object.keys(t)) {
      const pages = calls.filter(c => c.table === table && c.op === "select").length;
      expect(pages).toBe(t[table as keyof typeof t].length + 1);
      expect(calls.filter(c => c.table === table && c.op === "eq" && c.args[0] === "user_id")).toHaveLength(pages);
    }
    expect(calls).toContainEqual({ table: "movement_adaptation", op: "gt", args: ["id", "b"] });
  });
  it("historical months ignore later adaptations and match shared assessments", async () => {
    const { db } = client(tables());
    const report = await loadMonthlyReport(db, "u", "2026-08", EXERCISE_BY_ID, now);
    expect(report.stalls[0]).toMatchObject({ state: "plateau", stalledExposures: 4 });
    expect(report.current.workouts).toBe(5);
    expect(report.current.repPrs).toBe(0);
  });
  it.each(["program_slot", "program_day", "program_phase", "movement_adaptation"])("fails closed on %s read errors", async table => {
    const { db } = client(tables(), table);
    await expect(loadStallAssessments(db, "u", EXERCISE_BY_ID, now)).rejects.toThrow("Unable to load training context");
  });
  it("an empty monthly history does not request context", async () => {
    const { db, calls } = client({});
    expect((await loadMonthlyReport(db, "u", "2026-09", EXERCISE_BY_ID, now)).stalls).toEqual([]);
    expect(calls.filter(c => c.op === "select").map(c => c.table)).toEqual(["workout_session"]);
  });
});
