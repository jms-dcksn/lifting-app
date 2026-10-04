import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn() }));
vi.mock("./supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("Unauthenticated"); } }));
vi.mock("./catalog", async () => {
  const { EXERCISE_BY_ID } = await import("./strength/coefficients");
  return { getCatalogMap: async () => EXERCISE_BY_ID };
});

import { swapProgramSlotExercise, swapSessionExercise } from "@/app/(app)/session/actions";

const rpc = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
  mocks.client.mockResolvedValue({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user" } } }) },
    rpc,
  });
});

describe("swapSessionExercise station gate", () => {
  it.each(["lat-pulldown", "bb-incline-bench", "machine-chest-press", "bb-back-squat"] as const)(
    "rejects swapping onto unresolved %s",
    async (exerciseId) => {
      await expect(swapSessionExercise({
        sessionId: "s",
        programSlotId: "slot",
        exerciseId,
        scope: "workout",
      })).rejects.toThrow("Choose a specific exercise or machine first.");
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("allows a none-profile template", async () => {
    await swapSessionExercise({
      sessionId: "s",
      programSlotId: "slot",
      exerciseId: "bb-row",
      scope: "workout",
    });
    expect(rpc).toHaveBeenCalledWith("swap_session_exercise", expect.objectContaining({
      p_exercise_id: "bb-row",
    }));
  });
});

describe("swapProgramSlotExercise station gate", () => {
  it.each(["lat-pulldown", "bb-incline-bench", "machine-chest-press", "bb-back-squat"] as const)(
    "rejects swapping onto unresolved %s",
    async (exerciseId) => {
      await expect(swapProgramSlotExercise({
        programSlotId: "slot",
        exerciseId,
      })).rejects.toThrow("Choose a specific exercise or machine first.");
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("calls swap_program_slot_exercise for a loggable exercise", async () => {
    await swapProgramSlotExercise({
      programSlotId: "slot",
      exerciseId: "bb-row",
    });
    expect(rpc).toHaveBeenCalledWith("swap_program_slot_exercise", expect.objectContaining({
      p_slot_id: "slot",
      p_exercise_id: "bb-row",
    }));
  });
});
