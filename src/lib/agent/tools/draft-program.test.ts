import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recentExerciseIds: vi.fn(),
}));

vi.mock("@/lib/program", () => ({
  recentExerciseIds: mocks.recentExerciseIds,
}));

import { draftProgramFromIntake } from "./draft-program";
import { bindAgentTools } from "./index";

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

  it("recovers an owned stable draft without repeating a write, and refuses an uncertain missing write", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "stable-draft", name: "Existing draft" }, error: null });
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle };
    from.mockReturnValue(query);
    const options = { programId: "stable-draft", recoveryOnly: true };
    const input = { days: 3, goal: "strength", equipment: "full_gym" };
    const recovered = await draftProgramFromIntake(supabase as never, "user-1", input, options);
    expect(recovered).toMatchObject({ status: "draft", programId: "stable-draft" });
    expect(rpc).not.toHaveBeenCalled();
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const unknown = await draftProgramFromIntake(supabase as never, "user-1", input, options);
    expect(unknown).toMatchObject({ status: "unavailable" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("serializes concurrent registered draft calls around one stable program identity", async () => {
    let existing: { id: string; name: string } | null = null;
    const lookup = { eq: vi.fn(() => lookup), maybeSingle: vi.fn(async () => ({ data: existing, error: null })) };
    from.mockReturnValue({ select: (_columns: string, options?: { count?: string }) => options?.count
      ? Promise.resolve({ count: 1 }) : lookup });
    rpc.mockImplementation(async (_name, args) => { existing = { id: args.p_tree.id, name: args.p_tree.name }; return { error: null }; });
    const programId = "60000000-0000-4000-8000-000000000001";
    const registered = bindAgentTools(supabase as never, "user-1", { programId, recoveryOnly: false })
      .find(tool => tool.name === "draftProgramFromIntake");
    if (!registered) throw Error("Draft tool required");
    const input = { days: 4, goal: "hypertrophy", style: "classic", equipment: "full_gym" } satisfies Parameters<typeof registered.invoke>[0];
    const outputs = await Promise.all([registered.invoke(input), registered.invoke(input)]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_program", { p_tree: expect.objectContaining({ id: programId, isActive: false }) });
    expect(outputs.map(output => JSON.parse(String(output)).programId)).toEqual([programId, programId]);
    expect(lookup.eq).toHaveBeenCalledWith("user_id", "user-1");
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
