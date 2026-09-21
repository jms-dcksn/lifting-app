import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), bodyweight: vi.fn(), revalidate: vi.fn() }));
vi.mock("./supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./current-bodyweight", () => ({ getCurrentBodyweight: mocks.bodyweight }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("Unauthenticated"); } }));
vi.mock("./catalog", async () => {
  const { EXERCISE_BY_ID } = await import("./strength/coefficients");
  return { getCatalogMap: async () => EXERCISE_BY_ID };
});

import { deleteSet, editSet, finishSession, logSet } from "@/app/(app)/session/actions";
import { loadWorkoutRecords } from "./workout-records";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { computeE1rm } from "./strength/e1rm";

// In-memory query adapter exercises the actual actions → loader → record engine path.
// Query shape/pagination are asserted separately in workout-records.test.ts.
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let failWrite: boolean;
let failRead: boolean;
let sequence: number;
const startedAt = "2026-09-12T10:00:00Z";
function from(table: string) {
  let rows = [...(tables[table] ?? [])];
  let mutation: "insert" | "update" | "delete" | "upsert" | null = null;
  let payload: Row = {};
  let singular = false;
  let count = false;
  let page: [number, number] | null = null;
  const value = (row: Row, column: string): unknown => {
    if (column.startsWith("workout_session.")) {
      return tables.workout_session.find((s) => s.id === row.session_id)?.[column.split(".")[1]];
    }
    return row[column];
  };
  const query = {
    select: (_columns?: string, options?: { count?: string }) => { count = !!options?.count; return query; },
    eq: (key: string, target: unknown) => { rows = rows.filter((r) => value(r, key) === target); return query; },
    neq: (key: string, target: unknown) => { rows = rows.filter((r) => value(r, key) !== target); return query; },
    is: (key: string, target: unknown) => { rows = rows.filter((r) => value(r, key) === target); return query; },
    lt: (key: string, target: string) => { rows = rows.filter((r) => value(r, key) != null && String(value(r, key)) < target); return query; },
    lte: (key: string, target: string) => { rows = rows.filter((r) => value(r, key) != null && String(value(r, key)) <= target); return query; },
    in: (key: string, targets: unknown[]) => { rows = rows.filter((r) => targets.includes(value(r, key))); return query; },
    order: () => query,
    range: (start: number, end: number) => { page = [start, end]; return query; },
    insert: (data: Row) => { mutation = "insert"; payload = data; return query; },
    update: (data: Row) => { mutation = "update"; payload = data; return query; },
    upsert: () => { mutation = "upsert"; return query; },
    delete: () => { mutation = "delete"; return query; },
    single: () => { singular = true; return query; },
    maybeSingle: () => { singular = true; return query; },
    then: (resolve: (result: unknown) => unknown) => {
      if ((mutation && failWrite) || (!mutation && failRead)) return Promise.resolve(resolve({ data: null, error: { message: "offline" } }));
      if (mutation === "insert") {
        const inserted = { id: `saved-${++sequence}`, equipment_instance_id: null, is_warmup: false,
          created_at: `2026-09-12T10:${String(sequence).padStart(2, "0")}:00Z`, ...payload };
        tables[table].push(inserted);
        rows = [inserted];
      } else if (mutation === "update") {
        rows.forEach((r) => Object.assign(r, payload));
      } else if (mutation === "delete") {
        tables[table] = tables[table].filter((r) => !rows.includes(r));
      }
      let result = rows.map((r) => ({ ...r, ...(table === "set_log"
        ? { workout_session: tables.workout_session.find((s) => s.id === r.session_id) } : {}) }));
      if (page) result = result.slice(page[0], page[1] + 1);
      return Promise.resolve(resolve({ data: singular ? result[0] ?? null : result, error: null, count: count ? rows.length : null }));
    },
  };
  return query;
}
const db = { from, auth: { getClaims: async () => ({ data: { claims: { sub: "user" } } }) } };
const input = { sessionId: "active", programSlotId: "slot", exerciseId: "bb-row", weight: 100, reps: 10, rir: 1 };
const records = () => loadWorkoutRecords(db as unknown as Parameters<typeof loadWorkoutRecords>[0], "user", "active", startedAt, EXERCISE_BY_ID);

beforeEach(() => {
  vi.clearAllMocks();
  failWrite = false;
  failRead = false;
  sequence = 0;
  mocks.client.mockResolvedValue(db);
  mocks.bodyweight.mockResolvedValue(170);
  tables = {
    workout_session: [
      { id: "previous", user_id: "user", performed_at: "2026-09-10T10:00:00Z", finished_at: "2026-09-10T11:00:00Z" },
      { id: "active", user_id: "user", performed_at: startedAt, finished_at: null, readiness: 4, joint_pain: null, notes: null },
    ],
    set_log: [{ id: "prior", user_id: "user", session_id: "previous", program_slot_id: "old-slot", exercise_id: "bb-row",
      equipment_instance_id: null, weight: 100, reps: 8, rir: 1, e1rm: computeE1rm(100, 8, 1), is_warmup: false,
      created_at: "2026-09-10T10:01:00Z" }],
    user_exercise_stat: [],
  };
});

describe("persisted workout achievement flow", () => {
  it("saves, revalidates live cards, and returns the identical achievements on finish/reopen", async () => {
    await logSet(input);
    const live = (await records()).achievements;
    expect(live[0].repRecords[0].improvement).toBe(2);
    expect(mocks.revalidate).toHaveBeenCalledWith("/session/active");
    expect(mocks.revalidate).toHaveBeenCalledWith("/session/active/recap");
    expect(mocks.revalidate).toHaveBeenCalledWith("/history/[exerciseId]", "page");
    const summary = await finishSession("active", { jointPain: "none", note: "Felt strong" });
    expect(summary.achievements).toEqual(live);
    expect(summary.totalSets).toBe(1);
    expect(summary.feedback).toEqual({ readiness: 4, jointPain: "none", note: "Felt strong" });
    const finishedAt = tables.workout_session[1].finished_at;
    expect((await finishSession("active")).achievements).toEqual(live);
    expect(tables.workout_session[1].finished_at).toBe(finishedAt);
  });

  it("does not duplicate record counts when a successful save is retried", async () => {
    await logSet(input);
    const initial = (await records()).achievements;
    await logSet(input);
    expect((await records()).achievements).toEqual(initial);
  });

  it("never produces a record for a failed write and permits a later successful retry", async () => {
    failWrite = true;
    await expect(logSet(input)).rejects.toThrow("offline");
    expect((await records()).achievements).toEqual([]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    failWrite = false;
    await logSet(input);
    expect((await records()).achievements).toHaveLength(1);
  });

  it("recalculates the recap when a finished workout's sets are edited or deleted", async () => {
    const saved = await logSet(input);
    await finishSession("active");
    await editSet({ setId: saved.id, weight: 100, reps: 7, rir: 1 });
    expect((await finishSession("active")).achievements).toEqual([]);
    await editSet({ setId: saved.id, weight: 100, reps: 12, rir: 1 });
    expect((await finishSession("active")).achievements[0].repRecords[0].improvement).toBe(4);
    await deleteSet(saved.id);
    const summary = await finishSession("active");
    expect(summary.achievements).toEqual([]);
    expect(summary.totalSets).toBe(0);
  });

  it("preserves valid records when an edit or deletion fails", async () => {
    const saved = await logSet(input);
    const before = (await records()).achievements;
    failWrite = true;
    await expect(editSet({ setId: saved.id, weight: 100, reps: 1, rir: 1 })).rejects.toThrow("offline");
    await expect(deleteSet(saved.id)).rejects.toThrow("offline");
    expect((await records()).achievements).toEqual(before);
  });

  it("preserves historical bodyweight when editing an assisted set", async () => {
    tables.set_log.push({ ...tables.set_log[0], id: "assisted", exercise_id: "weighted-pullup", session_id: "active",
      weight: -40, e1rm: computeE1rm(110, 8, 1) });
    await editSet({ setId: "assisted", weight: -30, reps: 10, rir: 1 });
    expect(tables.set_log.find((s) => s.id === "assisted")?.e1rm).toBeCloseTo(computeE1rm(120, 10, 1));
  });

  it("keeps missing historical bodyweight unknown instead of using today's weight", async () => {
    tables.set_log.push({ ...tables.set_log[0], id: "unknown-bw", exercise_id: "weighted-pullup", weight: 0, e1rm: null });
    await editSet({ setId: "unknown-bw", weight: 0, reps: 10, rir: 1 });
    expect(tables.set_log.find((s) => s.id === "unknown-bw")?.e1rm).toBeNull();
  });

  it("does not finish a session or return a recap when reads fail", async () => {
    failRead = true;
    await expect(finishSession("active")).rejects.toThrow();
    expect(tables.workout_session[1].finished_at).toBeNull();
  });

  it("does not return a success recap when finishing fails", async () => {
    await logSet(input);
    failWrite = true;
    await expect(finishSession("active")).rejects.toThrow("offline");
    expect(tables.workout_session[1].finished_at).toBeNull();
  });

  it.each(["lat-pulldown", "bb-incline-bench", "machine-chest-press", "bb-bench"] as const)(
    "rejects logging unresolved station template %s",
    async (exerciseId) => {
      await expect(logSet({ ...input, exerciseId })).rejects.toThrow("Choose a specific exercise or machine first.");
      expect(tables.set_log).toHaveLength(1);
    },
  );

  it.each([NaN, Infinity, null, undefined])("rejects missing/invalid weight %s before saving", async (weight) => {
    await expect(logSet({ ...input, weight: weight as number })).rejects.toThrow("valid weight");
    expect(tables.set_log).toHaveLength(1);
  });

  it("rejects a session belonging to another user", async () => {
    tables.workout_session[1].user_id = "someone-else";
    await expect(logSet(input)).rejects.toThrow("Session not found");
    await expect(finishSession("active")).rejects.toThrow("Session not found");
  });

  it("rejects missing RIR on new writes instead of silently computing at zero RIR", async () => {
    await expect(logSet({ ...input, rir: null as unknown as number })).rejects.toThrow("RIR");
    await expect(editSet({ setId: "prior", weight: 100, reps: 10, rir: null as unknown as number })).rejects.toThrow("RIR");
    expect(tables.set_log).toHaveLength(1);
    expect(tables.set_log[0].reps).toBe(8);
  });
});
