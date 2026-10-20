import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Program } from "./program";
import type { StallHistory } from "./stall-report";
import { buildWorkoutTargetHistory } from "./effective-workout-target";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { loadNextWorkout } from "./next-workout";
import { nextWorkout } from "./agent/tools/next-workout";
import { bindReadTools } from "./agent/tools";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { runAgentTurn } from "./agent/run";
import { outputFromTurn } from "./agent/evals/live";

const mocks = vi.hoisted(() => ({ program: vi.fn(), catalog: vi.fn(), bodyweight: vi.fn(), history: vi.fn(), cookie: vi.fn() }));
vi.mock("./program", () => ({ getActiveProgram: mocks.program }));
vi.mock("./catalog", () => ({ getCatalogMap: mocks.catalog }));
vi.mock("./current-bodyweight", () => ({ getCurrentBodyweight: mocks.bodyweight }));
vi.mock("./workout-target-data", () => ({ loadWorkoutTargetHistory: mocks.history }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));

const now = new Date("2026-10-01T20:00:00Z");
type Row = Record<string, unknown>;
let program: Program;
let evidence: StallHistory;
let tables: Record<string, Row[]>;
let failure: string | null;
let pageCap: number;
const queries: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
const write = vi.fn(() => { throw new Error("Week retrieval must be read-only"); });

// Model the queried filters and server page cap; every mutation entry point fails.
function client() {
  return { rpc: write, from(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    queries.push({ table, filters });
    const order: Array<[string, boolean]> = [];
    let head = false;
    let limit = Infinity;
    const query: Record<string, unknown> = { insert: write, update: write, upsert: write, delete: write };
    query.select = (_columns: string, options?: { head?: boolean }) => { head = options?.head ?? false; return query; };
    for (const operation of ["eq", "gt", "in", "is"]) query[operation] = (key: string, value: unknown) => {
      filters.push([operation, key, value]); return query;
    };
    query.not = (key: string, _operator: string, value: unknown) => { filters.push(["not", key, value]); return query; };
    query.order = (key: string, options?: { ascending?: boolean }) => { order.push([key, options?.ascending ?? true]); return query; };
    query.limit = (value: number) => { limit = value; return query; };
    const result = () => {
      const rows = (tables[table] ?? []).filter(row => filters.every(([operation, key, value]) => {
        if (operation === "not") return row[key] !== value;
        if (operation === "in") return (value as unknown[]).includes(row[key]);
        if (operation === "gt") return String(row[key]) > String(value);
        return row[key] === value;
      }));
      rows.sort((a, b) => {
        for (const [key, ascending] of order) {
          const delta = String(a[key]).localeCompare(String(b[key]));
          if (delta) return ascending ? delta : -delta;
        }
        return 0;
      });
      return { data: head ? null : rows.slice(0, Math.min(limit, pageCap)), count: head ? rows.length : null,
        error: failure === table
          || (failure === "week_completion" && filters.some(filter => filter[1] === "week_index"))
          || (failure === "week_adaptations" && table === "movement_adaptation"
            && filters.some(filter => filter[0] === "in" && (filter[2] as string[]).includes("slot-b")))
          ? { message: "unavailable" } : null };
    };
    query.maybeSingle = async () => { const response = result(); return { ...response, data: response.data?.[0] ?? null }; };
    query.then = (resolve: (value: unknown) => void) => resolve(result());
    return query;
  } } as unknown as Parameters<typeof loadNextWorkout>[0];
}

function finished(week: number, day: string, userId = "owner", programId = "program") {
  return { id: `${userId}-${programId}-${week}-${day}`, user_id: userId, program_id: programId,
    program_day_id: day, week_index: week, performed_at: `2026-09-${week === 1 ? "15" : "22"}T12:00:00Z`,
    finished_at: `2026-09-${week === 1 ? "15" : "22"}T13:00:00Z`, exercise_swaps: {}, is_deload: false };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.clearAllMocks(); queries.length = 0; failure = null; pageCap = Infinity;
  program = { id: "program", name: "Training", description: null, tags: [], weeks: 4, isActive: true,
    style: "classic", phases: [], days: ["a", "b", "c"].map((day, index) => ({ id: day, name: day.toUpperCase(),
      slots: [{ id: `slot-${day}`, exerciseId: "bb-bench", pattern: "horizontal_press", targetSets: 3,
        repMin: index === 2 ? 12 : 6, repMax: index === 2 ? 15 : 10, targetRir: 2,
        restSeconds: index === 2 ? 75 : null, plateauPatience: null }] })) };
  const sessions = [1, 2].flatMap(week => program.days.map(day => finished(week, day.id)));
  tables = { workout_session: sessions, set_log: [], movement_adaptation: [],
    profile: [{ id: "owner", default_rest_seconds: 150 }], user_exercise_stat: [] };
  evidence = { userId: "owner", sessions: sessions.map(session => ({ id: session.id, programId: "program",
    programDayId: session.program_day_id, weekIndex: session.week_index, performedAt: session.performed_at,
    finishedAt: session.finished_at, isDeload: false })),
    sets: sessions.map(session => ({ id: `set-${session.id}`, user_id: "owner", session_id: session.id,
      program_slot_id: `slot-${session.program_day_id}`, exercise_id: "bb-bench", equipment_instance_id: null,
      weight: 100, reps: 8, rir: 2, e1rm: 135, set_index: 0, is_warmup: false, is_deload: false,
      created_at: session.performed_at.replace("12:00", "12:05"),
      workout_session: { performed_at: session.performed_at, finished_at: session.finished_at } })),
    slots: program.days.flatMap(day => day.slots.map(slot => ({ ...slot, programId: program.id, programDayId: day.id }))),
    phases: [], adaptations: [] };
  mocks.program.mockImplementation(async () => program);
  mocks.catalog.mockResolvedValue(EXERCISE_BY_ID);
  mocks.bodyweight.mockResolvedValue(180);
  mocks.cookie.mockReturnValue(undefined);
  mocks.history.mockImplementation(async (_client, _user, catalog, asOf: Date, slotIds: string[]) =>
    buildWorkoutTargetHistory(evidence, catalog, asOf, slotIds));
});
afterEach(() => { vi.useRealTimers(); expect(write).not.toHaveBeenCalled(); });

describe("program-week target reads", () => {
  it("preserves the default response and next-workout parity", async () => {
    const db = client();
    const planner = await loadNextWorkout(db, "owner", program);
    const implicit = await nextWorkout(db, "owner");
    const explicit = await nextWorkout(db, "owner", "next_workout");
    expect(implicit).toEqual(explicit);
    expect(Object.keys(implicit)).toEqual(["source", "workout"]);
    expect(implicit.workout?.slots[0].effectiveTarget).toEqual(planner.slots[0].effectiveTarget);
  });

  it("lists all ordered days in a partial program week, with no new targets for completed days", async () => {
    tables.workout_session.push(finished(3, "a"));
    const before = structuredClone(tables);
    const result = await nextWorkout(client(), "owner", "current_week");
    expect(result).toMatchObject({ scope: "current_week", boundary: "program_week", status: "available",
      week: 3, currentWeek: 3, totalWeeks: 4, historyAsOf: now.toISOString(), programId: "program" });
    expect(result.workouts.map(day => [day.dayId, day.status])).toEqual([["a", "completed"], ["b", "upcoming"], ["c", "upcoming"]]);
    expect(result.workouts[0]).toMatchObject({ completedSessionIds: ["owner-program-3-a"], targetBasis: "not_applicable",
      slots: [{ targetSets: 3, target: null, effectiveTarget: null, targetAvailability: "completed" }] });
    expect(result.workouts[1]).toMatchObject({ targetBasis: "current_history_estimate", slots: [{ restSeconds: 150, targetAvailability: "available" }] });
    expect(result.workouts[2].slots[0].restSeconds).toBe(75);
    expect(result).not.toHaveProperty("catalog");
    expect(tables).toEqual(before);
    expect(mocks.history).toHaveBeenCalledTimes(2); // One next/open snapshot and one batched remainder.
    expect(mocks.history.mock.calls[1][4]).toEqual(["slot-a", "slot-c"]);
  });

  it("keeps repeated exercises separate by slot prescription and does not compound future gains", async () => {
    const current = await nextWorkout(client(), "owner", "current_week");
    const upcoming = await nextWorkout(client(), "owner", "upcoming_week");
    expect(current.workouts.map(day => day.slots[0].prescription.repMin)).toEqual([6, 6, 12]);
    expect(current.workouts[0].slots[0].target?.targetReps).toBe(9);
    expect(current.workouts[2].slots[0].target?.targetReps).toBe(12);
    expect(upcoming.week).toBe(4);
    expect(upcoming.workouts.every(day => day.status === "upcoming" && day.targetBasis === "current_history_estimate")).toBe(true);
    expect(upcoming.workouts.map(day => day.slots[0].target)).toEqual(current.workouts.map(day => day.slots[0].target));
  });

  it("uses next week's recovery phase, effective sets and RIR", async () => {
    program.phases = [{ id: "recovery", name: "Recovery", description: "Easy week", position: 0, weekStart: 4, weekEnd: 4,
      targetRirMin: 4, targetRirMax: 4, setMultiplier: 0.5, isDeload: true }];
    const result = await nextWorkout(client(), "owner", "upcoming_week");
    for (const day of result.workouts) expect(day.slots[0]).toMatchObject({ targetSets: 2,
      prescription: { targetRir: 4, phase: { name: "Recovery" } }, effectiveTarget: { reason: "recovery" } });
  });

  it("moves to the next program week at a finished-cycle boundary, irrespective of calendar week", async () => {
    tables.workout_session.push(...["a", "b", "c"].map(day => finished(3, day)));
    const result = await nextWorkout(client(), "owner", "current_week");
    expect(result.week).toBe(4);
    expect(result.workouts.every(day => day.status === "upcoming")).toBe(true);
    expect(result.workouts.map(day => day.dayId)).toEqual(["a", "b", "c"]);
  });

  it("reuses open-workout day/week, exact station and pre-start evidence", async () => {
    tables.workout_session.push({ id: "open", user_id: "owner", program_id: "program", program_day_id: "b",
      week_index: 2, performed_at: "2026-09-20T12:00:00Z", finished_at: null,
      exercise_swaps: { "slot-b": "db-bench" }, is_deload: false });
    tables.set_log.push({ user_id: "owner", session_id: "open", program_slot_id: "slot-b",
      exercise_id: "db-bench", equipment_instance_id: "station-7", set_index: 0, weight: 60, reps: 7 });
    const db = client();
    const planner = await nextWorkout(db, "owner");
    const result = await nextWorkout(db, "owner", "current_week");
    expect(result.week).toBe(2);
    expect(result.workouts[1]).toMatchObject({ dayId: "b", status: "open", openSessionId: "open",
      targetBasis: "open_workout_pre_start_history", slots: [{ exerciseId: "db-bench", equipmentInstanceId: "station-7", target: null }] });
    expect(result.workouts[1].slots[0].effectiveTarget).toEqual(planner.workout?.slots[0].effectiveTarget);
    expect(mocks.history).toHaveBeenCalledWith(db, "owner", EXERCISE_BY_ID, new Date("2026-09-20T12:00:00Z"), ["slot-b"]);
    const future = await nextWorkout(db, "owner", "upcoming_week");
    expect(future.workouts[1].slots[0].exerciseId).toBe("bb-bench");
    expect(future.workouts[1].openSessionId).toBeNull();
  });

  it("applies a planner swap only to the actual next occurrence", async () => {
    mocks.cookie.mockReturnValue({ value: JSON.stringify({ key: "owner:program:a:6", choices: { "slot-a": "db-bench" } }) });
    const current = await nextWorkout(client(), "owner", "current_week");
    expect(current.workouts.map(day => day.slots[0].exerciseId)).toEqual(["db-bench", "bb-bench", "bb-bench"]);
    const upcoming = await nextWorkout(client(), "owner", "upcoming_week");
    expect(upcoming.workouts.every(day => day.slots[0].exerciseId === "bb-bench")).toBe(true);
  });

  it("folds Fluid adaptations for every day in chronological order through capped pages", async () => {
    program.style = "fluid"; pageCap = 1;
    tables.movement_adaptation = [
      { id: "z-earlier", user_id: "owner", program_slot_id: "slot-c", action: "rep_change", new_exercise_id: null,
        new_rep_min: 16, new_rep_max: 20, created_at: "2026-09-25T12:00:00Z" },
      { id: "a-later", user_id: "owner", program_slot_id: "slot-c", action: "rep_change", new_exercise_id: null,
        new_rep_min: 10, new_rep_max: 12, created_at: "2026-09-26T12:00:00Z" },
      { id: "b-swap", user_id: "owner", program_slot_id: "slot-b", action: "manual_swap", new_exercise_id: "db-bench",
        new_rep_min: null, new_rep_max: null, created_at: "2026-09-27T12:00:00Z" },
    ];
    const result = await nextWorkout(client(), "owner", "current_week");
    expect(result.workouts[1].slots[0].exerciseId).toBe("db-bench");
    expect(result.workouts[2].slots[0].prescription).toMatchObject({ repMin: 10, repMax: 12 });
    expect(queries.filter(query => query.table === "movement_adaptation").every(query => query.filters.some(filter => filter[1] === "user_id" && filter[2] === "owner"))).toBe(true);
  });

  it("includes the shared repeated-effort reduction on a later day without applying it twice", async () => {
    for (const set of evidence.sets) if (set.program_slot_id === "slot-b") set.rir = 0;
    const result = await nextWorkout(client(), "owner", "current_week");
    expect(result.workouts[1].slots[0]).toMatchObject({ target: { weight: 95 }, effectiveTarget: { reason: "repeated_effort_miss" } });
  });

  it("preserves unavailable/unknown exercise targets without guessing weights", async () => {
    program.days[2].slots[0].exerciseId = "deleted-custom";
    const result = await nextWorkout(client(), "owner", "current_week");
    expect(result.workouts[2].slots[0]).toMatchObject({ exerciseId: "deleted-custom", target: null,
      targetAvailability: "unavailable", effectiveTarget: { reason: "unavailable" } });
  });

  it("makes missing legacy week/day completion explicit instead of inventing a past target", async () => {
    tables.workout_session.push({ ...finished(3, "a"), week_index: null });
    const result = await nextWorkout(client(), "owner", "current_week");
    expect(result.workouts[0]).toMatchObject({ status: "unknown", completedSessionIds: [],
      slots: [{ targetAvailability: "unknown_completion", target: null, effectiveTarget: null }] });
    expect(result.workouts[0].slots[0].targetExplanation).toContain("no completed workout with matching saved week/day");
  });

  it.each(["classic", "fluid"] as const)("does not extend or wrap a finished %s program; the old next-workout scope is unchanged", async style => {
    program.style = style;
    program.weeks = 3;
    const upcoming = await nextWorkout(client(), "owner", "upcoming_week");
    expect(upcoming).toMatchObject({ week: 4, totalWeeks: 3, status: "beyond_program", workouts: [] });
    tables.workout_session.push(...["a", "b", "c"].map(day => finished(3, day)));
    expect(await nextWorkout(client(), "owner", "current_week")).toMatchObject({ week: 4, status: "beyond_program", workouts: [] });
    expect((await nextWorkout(client(), "owner")).workout?.week).toBe(4);
  });

  it("returns explicit no-program/no-day results and handles an empty training history", async () => {
    mocks.program.mockResolvedValueOnce(null);
    expect(await nextWorkout(client(), "owner", "current_week")).toEqual({ source: "nextWorkout", scope: "current_week",
      boundary: "program_week", status: "no_active_program", week: null, workouts: [] });
    mocks.program.mockResolvedValueOnce({ ...program, days: [] });
    expect((await nextWorkout(client(), "owner", "upcoming_week")).status).toBe("no_active_program");
    evidence.sets = []; evidence.sessions = []; tables.workout_session = [];
    const result = await nextWorkout(client(), "owner", "current_week");
    expect(result.week).toBe(1);
    expect(result.workouts.every(day => day.slots[0].target === null && day.slots[0].targetAvailability === "unavailable")).toBe(true);
  });

  it("filters completion by owner, program and saved week and continues after short pages", async () => {
    pageCap = 1;
    tables.workout_session.push(finished(3, "a"), finished(3, "c"), finished(3, "b", "other"), finished(3, "b", "owner", "other-program"));
    const result = await nextWorkout(client(), "owner", "current_week");
    expect(result.workouts.map(day => day.status)).toEqual(["completed", "unknown", "completed"]);
    const completionQueries = queries.filter(query => query.filters.some(filter => filter[1] === "week_index"));
    expect(completionQueries.length).toBe(3);
    for (const query of completionQueries) expect(query.filters).toEqual(expect.arrayContaining([
      ["eq", "user_id", "owner"], ["eq", "program_id", "program"], ["eq", "week_index", 3],
    ]));
  });

  it("surfaces completion and adaptation read failures rather than returning invented empty data", async () => {
    failure = "week_completion";
    await expect(nextWorkout(client(), "owner", "current_week")).rejects.toThrow("program-week completion");
    failure = "week_adaptations"; program.style = "fluid";
    await expect(nextWorkout(client(), "owner", "current_week")).rejects.toThrow("program-week adaptations");
  });
});

// Scripted tool selection proves wiring/grounding, not live-model adherence to the prompt.
class WeekScript extends BaseChatModel {
  readonly seen: BaseMessage[][] = [];
  constructor(private scope: "current_week" | "upcoming_week") { super({}); }
  _llmType() { return "week-script"; }
  bindTools() { return this; }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.seen.push(messages);
    const result = messages.findLast(message => message.type === "tool");
    const message = result ? new AIMessage((() => {
      const data = JSON.parse(String(result.content));
      const day = data.workouts[0];
      return `Program week ${data.week}: ${day.dayName}, ${day.slots[0].target.weight} lb × ${day.slots[0].target.targetReps}. Current-history estimate, not a scheduled date or promised gain.\nSource: effective workout targets`;
    })()) : new AIMessage({ content: "", tool_calls: [{ id: "week", name: "nextWorkout", args: { scope: this.scope }, type: "tool_call" }] });
    return { generations: [{ text: "", message }] };
  }
}

describe("weekly targets through registered agent tools", () => {
  it.each(["current_week", "upcoming_week"] as const)("round-trips %s evidence through the real agent loop", async scope => {
    const model = new WeekScript(scope);
    const turn = await runAgentTurn({ threadId: "week-test", tools: bindReadTools(client(), "owner"), model,
      persisted: [{ id: "q", role: "user", createdAt: now.toISOString(), parts: [{ type: "text",
        text: scope === "current_week" ? "What are my targets across this week's workouts?" : "What should I aim for next week?" }] }] });
    const output = outputFromTurn(turn);
    expect(output.toolCalls.map(call => [call.name, call.args])).toEqual([["nextWorkout", { scope }]]);
    const data = output.toolResults[0].result as { week: number };
    expect(data.week).toBe(scope === "current_week" ? 3 : 4);
    expect(output.answer).toContain(`Program week ${data.week}`);
    expect(output.answer).toContain("100 lb × 9");
    expect(JSON.stringify(model.seen[0][0].content)).toContain("not Monday–Sunday calendar weeks");
    expect(String(model.seen[1].find(message => message.type === "tool")?.content)).toContain('"targetBasis":"current_history_estimate"');
  });

  it("validates scope at the registered boundary and keeps omitted calls compatible", async () => {
    const db = client();
    const tool = bindReadTools(db, "owner").find(item => item.name === "nextWorkout")!;
    await expect(tool.invoke({ scope: "calendar_week" } as never)).rejects.toThrow();
    expect(JSON.parse(await tool.invoke({}))).toEqual(await nextWorkout(db, "owner"));
  });
});
