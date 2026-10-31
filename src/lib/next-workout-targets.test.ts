vi.mock("./workout-editor-data", () => ({ loadPlannedPerformances: async () => [] }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { buildWorkoutTargetHistory, resolveEffectiveWorkoutTarget } from "./effective-workout-target";
import type { StallHistory } from "./stall-report";
import type { Program } from "./program";

const mocks = vi.hoisted(() => ({ program: vi.fn(), catalog: vi.fn(), bodyweight: vi.fn(), history: vi.fn(), cookie: vi.fn(), coach: vi.fn() }));
vi.mock("./program", () => ({ getActiveProgram: mocks.program }));
vi.mock("./catalog", () => ({ getCatalogMap: mocks.catalog }));
vi.mock("./current-bodyweight", () => ({ getCurrentBodyweight: mocks.bodyweight }));
vi.mock("./workout-target-data", () => ({ loadWorkoutTargetHistory: mocks.history }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("./coach-ui-data", () => ({ loadCoachUi: mocks.coach }));

import { loadNextWorkout } from "./next-workout";
import { nextWorkout } from "./agent/tools/next-workout";
import { weeklyCoach } from "./agent/tools/weekly-coach";

const now = new Date("2026-09-30T20:00:00Z");
let program: Program;
let history: StallHistory;
let open: Record<string, unknown> | null;
let statError: boolean;
let savedPlan: unknown;
let logged: unknown[];
let adaptations: unknown[];
const calls: Array<{ table: string; operation: string; args: unknown[] }> = [];

function client() {
  return { from(table: string) {
    const query: Record<string, unknown> = {};
    let head = false;
    for (const operation of ["select", "eq", "not", "is", "order", "limit", "in"]) query[operation] = (...args: unknown[]) => {
      calls.push({ table, operation, args });
      if (operation === "select" && (args[1] as { head?: boolean } | undefined)?.head) head = true;
      return query;
    };
    const result = () => ({ data: table === "workout_session" ? open : table === "profile" ? { default_rest_seconds: 120 }
      : table === "workout_plan" ? savedPlan : table === "movement_adaptation" ? adaptations : table === "set_log" ? logged : [],
      count: head ? 2 : undefined, error: table === "user_exercise_stat" && statError ? { message: "stats unavailable" } : null });
    query.maybeSingle = async () => result();
    query.then = (resolve: (result: unknown) => void) => resolve(result());
    return query;
  } } as unknown as Parameters<typeof loadNextWorkout>[0];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  calls.length = 0; savedPlan = null; open = null; statError = false; logged = []; adaptations = [];
  program = { id: "program", name: "Training", description: null, tags: [], weeks: 5, isActive: true,
    style: "classic", phases: [], days: [{ id: "day", name: "Upper", slots: [{ id: "slot", exerciseId: "bb-bench",
      pattern: "horizontal_press", targetSets: 2, repMin: 6, repMax: 10, targetRir: 2, restSeconds: null, plateauPatience: null }] }] };
  history = { userId: "user", sessions: [15, 22].map((day, index) => ({ id: `s${index}`, programId: "program", programDayId: "day",
    weekIndex: index + 1, performedAt: `2026-09-${day}T12:00:00Z`, finishedAt: `2026-09-${day}T13:00:00Z`, isDeload: false })),
    sets: [15, 22].map((day, index) => ({ id: `set-${index}`, user_id: "user", session_id: `s${index}`, program_slot_id: "slot",
      exercise_id: "bb-bench", equipment_instance_id: null, weight: 100, reps: 8, rir: 0, e1rm: 130, set_index: 0,
      is_warmup: false, is_deload: false, created_at: `2026-09-${day}T12:05:00Z`,
      workout_session: { performed_at: `2026-09-${day}T12:00:00Z`, finished_at: `2026-09-${day}T13:00:00Z` } })),
    slots: [{ ...program.days[0].slots[0], programId: "program", programDayId: "day" }], phases: [], adaptations: [] };
  mocks.program.mockImplementation(async () => program);
  mocks.catalog.mockResolvedValue(EXERCISE_BY_ID); mocks.bodyweight.mockResolvedValue(180);
  mocks.cookie.mockReturnValue(undefined);
  mocks.history.mockImplementation(async (_client, _user, _catalog, asOf: Date) => buildWorkoutTargetHistory(history, EXERCISE_BY_ID, asOf));
  mocks.coach.mockResolvedValue({ coachReport: { generatedAt: now.toISOString() }, coachRecommendations: [{ kind: "reduce_load", action: { targetWeight: 500 } }],
    coachCheckIn: "Historical report", decisions: [{ status: "accepted" }] });
});
afterEach(() => vi.useRealTimers());

describe("shared next-workout consumers", () => {
  it("Home/planner, active-session resolution, nextWorkout and weekly Coach agree on effective targets", async () => {
    const db = client();
    const next = await loadNextWorkout(db, "user", program);
    const slot = next.slots[0];
    const active = resolveEffectiveWorkoutTarget({ slotId: slot.id, exerciseId: slot.exerciseId,
      prescription: slot.prescription, context: slot.targetContext,
      history: next.targetHistory, catalog: next.catalog, stats: next.stats, bodyweight: next.bodyweight });
    const agent = await nextWorkout(db, "user");
    const coach = await weeklyCoach(db, "user");
    expect(slot.effectiveTarget).toMatchObject({ status: "current_target", reason: "repeated_effort_miss", target: { weight: 95, targetReps: 8 } });
    expect(active).toEqual(slot.effectiveTarget);
    expect(agent.workout?.slots[0].effectiveTarget).toEqual(active);
    expect(coach.currentWorkout?.slots[0].effectiveTarget).toEqual(active);
    expect(coach.recommendations[0].action.targetWeight).toBe(500);
    expect(coach.currentWorkout?.slots[0].target?.weight).toBe(95);
    expect(coach.currentWorkout?.slots[0].targetExplanation).toContain("not a program change");
    expect(mocks.history).toHaveBeenCalledWith(db, "user", EXERCISE_BY_ID, now, ["slot"]);
    for (const table of ["workout_session", "user_exercise_stat"]) expect(calls).toContainEqual({ table, operation: "eq", args: ["user_id", "user"] });
  });

  it("uses the upcoming phase and effective set count rather than the report's old proposal", async () => {
    program.phases = [{ id: "recovery", name: "Recovery", description: null, position: 0, weekStart: 3, weekEnd: 3,
      targetRirMin: 4, targetRirMax: 4, setMultiplier: 0.5, isDeload: true }];
    const result = await nextWorkout(client(), "user");
    expect(result.workout?.week).toBe(3);
    expect(result.workout?.slots[0]).toMatchObject({ targetSets: 1, effectiveTarget: { reason: "recovery" }, target: { targetRir: 4 } });
    expect(result.workout?.slots[0].target?.weight).not.toBe(95);
  });

  it("preserves the explicit planner swap and never carries a reduction across exercise identity", async () => {
    mocks.cookie.mockReturnValue({ value: JSON.stringify({ key: "user:program:day:2", choices: { slot: "db-bench" } }) });
    const next = await loadNextWorkout(client(), "user", program);
    expect(next.choices).toEqual({ slot: "db-bench" });
    expect(next.slots[0]).toMatchObject({ exerciseId: "db-bench", effectiveTarget: { reason: "unavailable", target: null } });
  });

  it("resolves an open workout's stored week, choices and start-time evidence without changing logged sets", async () => {
    program.phases = [{ id: "later", name: "Recovery", description: null, position: 0, weekStart: 3, weekEnd: 3,
      targetRirMin: 4, targetRirMax: 4, setMultiplier: 0.5, isDeload: true }];
    open = { id: "open", performed_at: "2026-09-20T12:00:00Z", program_day_id: "day", week_index: 1,
      exercise_swaps: { slot: "db-bench" }, is_deload: false };
    logged = [{ program_slot_id: "slot", exercise_id: "bb-bench", equipment_instance_id: null, set_index: 0, weight: 123, reps: 7 }];
    const before = structuredClone(logged);
    const result = await nextWorkout(client(), "user");
    expect(result.workout).toMatchObject({ openSessionId: "open", week: 1, slots: [{ exerciseId: "db-bench", target: null }] });
    expect(mocks.history).toHaveBeenCalledWith(expect.anything(), "user", EXERCISE_BY_ID, new Date("2026-09-20T12:00:00Z"), ["slot"]);
    expect(logged).toEqual(before);
    expect(calls).toContainEqual({ table: "set_log", operation: "eq", args: ["session_id", "open"] });
    expect(calls).toContainEqual({ table: "set_log", operation: "eq", args: ["user_id", "user"] });
  });

  it("uses an open legacy workout's last logged exercise when no explicit choice exists", async () => {
    open = { id: "open", performed_at: now.toISOString(), program_day_id: "day", week_index: 2, exercise_swaps: {}, is_deload: false };
    logged = [{ program_slot_id: "slot", exercise_id: "db-bench", equipment_instance_id: null, set_index: 1 }];
    expect((await nextWorkout(client(), "user")).workout?.slots[0].exerciseId).toBe("db-bench");
  });

  it("retains an unavailable stored choice and the session screen's legacy week fallback", async () => {
    open = { id: "open", performed_at: now.toISOString(), program_day_id: "day", week_index: null,
      exercise_swaps: { slot: "deleted-custom" }, is_deload: false };
    const result = await nextWorkout(client(), "user");
    expect(result.workout).toMatchObject({ week: 1, slots: [{ exerciseId: "deleted-custom", target: null }] });
  });

  it("folds Fluid adaptations into current target context instead of applying an old reduction", async () => {
    program.style = "fluid";
    adaptations = [{ program_slot_id: "slot", action: "rep_change", new_exercise_id: null,
      new_rep_min: 12, new_rep_max: 15, created_at: "2026-09-29T12:00:00Z" }];
    const next = await loadNextWorkout(client(), "user", program);
    expect(next.slots[0].prescription).toMatchObject({ repMin: 12, repMax: 15 });
    expect(next.slots[0].effectiveTarget.reason).toBe("below_rep_floor");
    expect(next.slots[0].effectiveTarget.reason).not.toBe("repeated_effort_miss");
    expect(calls).toContainEqual({ table: "movement_adaptation", operation: "eq", args: ["user_id", "user"] });
  });

  it("fails on target-data read errors rather than inventing fallback targets", async () => {
    mocks.history.mockRejectedValueOnce(new Error("Unable to load training context"));
    await expect(nextWorkout(client(), "user")).rejects.toThrow("Unable to load training context");
    statError = true;
    await expect(nextWorkout(client(), "user")).rejects.toThrow("stats unavailable");
  });

  it("returns an honest no-workout result for no active program", async () => {
    mocks.program.mockResolvedValueOnce(null);
    expect(await nextWorkout(client(), "user")).toEqual({ source: "nextWorkout", workout: null });
  });
});


it("overlays an explicit active-session swap without carrying the captured exercise's manual load",async()=>{
  const id="123e4567-e89b-42d3-a456-426614174000";
  program.days[0].slots[0].id=id;
  open={id:"open",performed_at:"2026-09-20T12:00:00Z",program_day_id:"day",week_index:1,is_deload:false,
    exercise_swaps:{[id]:"db-incline-bench"},plan_snapshot:{version:1,slots:[{id,programSlotId:id,exerciseId:"db-bench",pattern:"horizontal_press",restSeconds:90,supersetGroup:null,
      sets:[{id:"123e4567-e89b-42d3-a456-426614174001",repMin:6,repMax:10,rirMin:2,rirMax:2,repsEdited:true,rirEdited:true,weight:100,suggestedWeight:95,targetReps:6,seedAt:null}]}]}};
  const next=await loadNextWorkout(client(),"user",program);
  expect(next.slots[0].exerciseId).toBe("db-incline-bench");
  expect(next.slots[0].plannedSets?.[0].weight).toBeNull();
  expect((open.plan_snapshot as {slots:{exerciseId:string;sets:{weight:number}[]}[]}).slots[0]).toMatchObject({exerciseId:"db-bench",sets:[{weight:100}]});
});

it("refreshes stale saved automatic targets before preview and capture, preserving manual targets", async () => {
  program.days[0].slots[0].id = "123e4567-e89b-42d3-a456-426614174000";
  // Use the same slot in the historic evidence so repeated-effort resolution applies.
  history.slots[0].id = program.days[0].slots[0].id;
  history.sets.forEach(set => set.program_slot_id = history.slots[0].id);
  const fresh = await loadNextWorkout(client(), "user", program);
  const plan = structuredClone(fresh.editorPlan);
  plan.slots[0].sets[0].suggestedWeight = 500;
  plan.slots[0].sets[0].targetReps = 10;
  plan.slots[0].sets[1].weight = 120;
  savedPlan = { plan, revision: 1, updated_at: now.toISOString() };
  const refreshed = await loadNextWorkout(client(), "user", program);
  expect(refreshed.editorPlan.slots[0].sets[0]).toMatchObject({ weight: null,
    suggestedWeight: fresh.editorPlan.slots[0].sets[0].suggestedWeight,
    targetReps: fresh.editorPlan.slots[0].sets[0].targetReps });
  expect(refreshed.editorPlan.slots[0].sets[1].weight).toBe(120);
  expect(plan.slots[0].sets[0].suggestedWeight).toBe(500);
});
