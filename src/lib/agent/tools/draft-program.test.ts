import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recentExerciseIds: vi.fn(),
}));

vi.mock("@/lib/program", () => ({
  recentExerciseIds: mocks.recentExerciseIds,
}));

import { draftProgramFromIntake } from "./draft-program";

describe("draftProgramFromIntake", () => {
  const rpc = vi.fn();
  const from = vi.fn();
  const supabase = { from, rpc };

  function mockProgramCount(count: number) {
    from.mockReturnValue({
      select: vi.fn(async () => ({ count })),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recentExerciseIds.mockResolvedValue(["bb-back-squat"]);
    mockProgramCount(1);
    rpc.mockResolvedValue({ error: null });
  });

  it("returns follow-up chips instead of guessing a split", async () => {
    const result = await draftProgramFromIntake(supabase as never, "user-1", {
      goal: "hypertrophy",
    });
    expect(result.status).toBe("needs_intake");
    expect(result.followUp).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("persists an inactive draft and returns a builder confirm chip", async () => {
    mockProgramCount(2);

    const result = await draftProgramFromIntake(supabase as never, "user-1", {
      days: 4,
      goal: "hypertrophy",
      style: "classic",
      equipment: "full_gym",
    });

    expect(result.status).toBe("draft");
    if (result.status !== "draft") return;
    expect(result.isActive).toBe(false);
    expect(result.href).toMatch(/\/program\/.*mode=edit$/);
    expect(result.action).toBe("confirm");
    expect(result.galleryTemplate).toBe(true);
    expect(result.matchTraits.length).toBeGreaterThan(0);
    expect(rpc).toHaveBeenCalledWith("save_program", {
      p_tree: expect.objectContaining({
        isActive: false,
        style: "classic",
      }),
    });
  });

  it("activates only on an empty account", async () => {
    mockProgramCount(0);

    const result = await draftProgramFromIntake(supabase as never, "user-1", {
      days: 3,
      goal: "hypertrophy",
      style: "fluid",
      equipment: "full_gym",
    });

    expect(result.status).toBe("draft");
    if (result.status !== "draft") return;
    expect(result.isActive).toBe(true);
    expect(rpc).toHaveBeenCalledWith("save_program", {
      p_tree: expect.objectContaining({ isActive: true }),
    });
  });
});
