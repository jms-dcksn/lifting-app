import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(), client: vi.fn(), program: vi.fn(), set: vi.fn(), del: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set, delete: mocks.del }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("./supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./program", () => ({ getActiveProgram: mocks.program }));
vi.mock("./next-workout", () => ({ loadNextWorkout: mocks.load }));

import { saveWorkoutChoice } from "@/app/(app)/workout/next/actions";
import { startNextSession, startPlannedSession } from "@/app/(app)/session/actions";

const insert = vi.fn();
const from = vi.fn();
const next = () => ({ key: "current", choices: { first: "a" }, open: null, week: 2,
  day: { id: "day", slots: [{ id: "first" }, { id: "second" }] },
  catalog: { a: { id: "a" }, b: { id: "b" }, template: { id: "template", machineTemplate: true } },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ auth: { getClaims: async () => ({ data: { claims: { sub: "user" } } }) }, from });
  mocks.program.mockResolvedValue({ id: "program", days: [{ id: "day" }] });
  mocks.load.mockResolvedValue(next());
  from.mockReturnValue({ insert });
  insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "session" }, error: null }) }) });
});

describe("planning and starting boundary", () => {
  it("saves a choice without creating a session and preserves other slots", async () => {
    await saveWorkoutChoice("current", "second", "b");
    expect(from).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.set.mock.calls[0][1])).toEqual({ key: "current", choices: { first: "a", second: "b" } });
    expect(mocks.set.mock.calls[0][2]).toMatchObject({ httpOnly: true, sameSite: "lax" });
  });
  it("resets only the selected slot", async () => {
    await saveWorkoutChoice("current", "first", null);
    expect(JSON.parse(mocks.set.mock.calls[0][1]).choices).toEqual({});
  });
  it.each([["stale", "first", "b"], ["current", "foreign", "b"], ["current", "first", "missing"], ["current", "first", "template"]])(
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
  it("starts with all choices in the session insert, then clears the draft", async () => {
    await expect(startNextSession()).rejects.toThrow("REDIRECT:/session/session");
    expect(insert).toHaveBeenCalledWith({ user_id: "user", program_id: "program", program_day_id: "day", week_index: 2, exercise_swaps: { first: "a" } });
    expect(mocks.del).toHaveBeenCalledOnce();
  });
  it("preserves the draft after a failed start", async () => {
    insert.mockReturnValue({ select: () => ({ single: async () => ({ data: null, error: { message: "offline" } }) }) });
    await expect(startNextSession()).rejects.toThrow("offline");
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
