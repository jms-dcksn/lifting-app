import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(), client: vi.fn(), program: vi.fn(), set: vi.fn(), del: vi.fn(), revalidate: vi.fn(),
  swapProgram: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set, delete: mocks.del }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("./supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./program", () => ({ getActiveProgram: mocks.program }));
vi.mock("./next-workout", () => ({ loadNextWorkout: mocks.load }));
vi.mock("@/app/(app)/session/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/(app)/session/actions")>();
  return { ...actual, swapProgramSlotExercise: mocks.swapProgram };
});

import { saveWorkoutChoice } from "@/app/(app)/workout/next/actions";
import { startNextSession, startPlannedSession, preparePlannedWorkout } from "@/app/(app)/session/actions";

const rpc = vi.fn();
const insert = vi.fn();
const from = vi.fn();
const next = () => ({ key: "current", choices: { first: "a" }, open: null, week: 2, completed: 1, sourceRevision: 9, planRevision: 2, editorPlan: {version:1,slots:[]},
  slots: [{ id: "first", exerciseId: "a" }, { id: "second", exerciseId: "template" }],
  day: { id: "day", slots: [{ id: "first" }, { id: "second" }] },
  catalog: {
    a: { id: "a" },
    b: { id: "b" },
    template: { id: "template", stationProfile: "machine" },
    "lat-pulldown": { id: "lat-pulldown", stationProfile: "cable" },
    "bb-incline-bench": { id: "bb-incline-bench", stationProfile: "bench" },
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ auth: { getClaims: async () => ({ data: { claims: { sub: "user" } } }) }, from, rpc });
  mocks.program.mockResolvedValue({ id: "program", days: [{ id: "day" }] });
  mocks.load.mockResolvedValue(next());
  rpc.mockResolvedValue({ data: "session", error: null });
  from.mockReturnValue({ insert });
  insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "session" }, error: null }) }) });
});

describe("planning and starting boundary", () => {
  it("saves a choice without creating a session and preserves other slots", async () => {
    await saveWorkoutChoice("current", "second", "b");
    expect(from).not.toHaveBeenCalled();
    expect(mocks.swapProgram).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.set.mock.calls[0][1])).toEqual({ key: "current", choices: { first: "a", second: "b" } });
    expect(mocks.set.mock.calls[0][2]).toMatchObject({ httpOnly: true, sameSite: "lax" });
  });
  it("saves program scope through swapProgramSlotExercise and clears the slot cookie override", async () => {
    mocks.load.mockResolvedValue({ ...next(), choices: { first: "a", second: "c" } });
    await saveWorkoutChoice("current", "second", "b", "program");
    expect(mocks.swapProgram).toHaveBeenCalledWith({ programSlotId: "second", exerciseId: "b" });
    expect(JSON.parse(mocks.set.mock.calls[0][1])).toEqual({ key: "current", choices: { first: "a" } });
    expect(from).not.toHaveBeenCalled();
  });
  it("resets only the selected slot", async () => {
    await saveWorkoutChoice("current", "first", null);
    expect(JSON.parse(mocks.set.mock.calls[0][1]).choices).toEqual({});
  });
  it.each([
    ["stale", "first", "b"],
    ["current", "foreign", "b"],
    ["current", "first", "missing"],
    ["current", "first", "template"],
    ["current", "first", "lat-pulldown"],
    ["current", "first", "bb-incline-bench"],
  ])(
    "rejects stale or invalid choices %s/%s/%s", async (key, slot, exercise) => {
      await expect(saveWorkoutChoice(key, slot, exercise)).rejects.toThrow();
      expect(mocks.set).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    });
  it("refuses planning once a session is open", async () => {
    mocks.load.mockResolvedValue({ ...next(), open: { id: "existing" } });
    await expect(saveWorkoutChoice("current", "first", "b")).rejects.toThrow("changed");
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("starts through the atomic snapshot RPC, then clears the legacy cookie", async () => {
    await expect(startNextSession()).rejects.toThrow("REDIRECT:/session/session");
    expect(rpc).toHaveBeenCalledWith("start_workout_plan", { p_program:"program",p_day:"day",p_completed:1,p_source:9,p_revision:2,p_plan:next().editorPlan });
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.del).toHaveBeenCalledOnce();
  });
  it.each([startNextSession, () => startPlannedSession("current")])("passes pending equipment through either start entry without guessing a variant", async (start) => {
    const plan = { version: 1, slots: [{ id: "first", exerciseId: "bb-bench" }, { id: "second", exerciseId: "lat-pulldown" }] };
    const catalog = { ...next().catalog, "bb-bench": { id: "bb-bench", stationProfile: "bench" } };
    mocks.load.mockResolvedValue({ ...next(), choices: {}, editorPlan: plan, catalog });
    await expect(start()).rejects.toThrow("REDIRECT:/session/session");
    expect(rpc.mock.calls[0][1].p_plan).toEqual({
      ...plan,
      slots: [
        { id: "first", exerciseId: "bb-bench", resolvedTempo: [3, 0, 1, 0] },
        { id: "second", exerciseId: "lat-pulldown", resolvedTempo: [3, 0, 1, 0] },
      ],
    });
  });
  it("preserves the draft after a failed start", async () => {
    rpc.mockResolvedValue({ data:null,error:{message:"offline"} });
    await expect(startNextSession()).rejects.toThrow("REDIRECT:/workout/next?startError=1");
    expect(mocks.del).not.toHaveBeenCalled();
  });
  it("keeps planner start failures inline and retains its saved plan", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Please retry" } });
    await expect(preparePlannedWorkout("current")).resolves.toEqual({ error: "Please retry" });
    expect(mocks.del).not.toHaveBeenCalled();
  });
  it("reopens planning instead of starting a different workout from a stale page", async () => {
    await expect(startPlannedSession("old")).rejects.toThrow("REDIRECT:/workout/next");
    expect(insert).not.toHaveBeenCalled();
  });
  it("resumes an existing session without overwriting its choices", async () => {
    mocks.load.mockResolvedValue({ ...next(), open: { id: "existing" } });
    await expect(startNextSession()).rejects.toThrow("REDIRECT:/session/existing");
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
