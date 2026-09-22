import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import { deleteProgram } from "@/app/(app)/program/actions";

const owner = "a0000000-0000-0000-0000-000000000001";
const programId = "a0000000-0000-0000-0000-000000000011";

const writes: { table: string; type: string; filters: Record<string, unknown> }[] = [];
const rpc = vi.fn();
const claims = vi.fn();

function from(table: string) {
  const filters: Record<string, unknown> = {};
  let mutation: "delete" | null = null;
  const query: Record<string, unknown> = {
    delete: () => {
      mutation = "delete";
      return query;
    },
    eq: (key: string, value: unknown) => {
      filters[key] = value;
      return query;
    },
    select: () => query,
    maybeSingle: async () => {
      writes.push({ table, type: mutation ?? "read", filters: { ...filters } });
      if (mutation === "delete" && table === "program" && filters.id === programId && filters.user_id === owner) {
        return { data: { id: programId }, error: null };
      }
      if (mutation === "delete") {
        return { data: null, error: null };
      }
      return { data: null, error: { message: "unexpected read" } };
    },
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
  claims.mockResolvedValue({ data: { claims: { sub: owner } } });
  mocks.client.mockResolvedValue({
    auth: { getClaims: claims },
    from,
    rpc,
  });
});

describe("deleteProgram", () => {
  it("deletes only the owned program row and refreshes program routes", async () => {
    await deleteProgram(programId);

    expect(writes).toEqual([
      {
        table: "program",
        type: "delete",
        filters: { id: programId, user_id: owner },
      },
    ]);
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/");
    expect(mocks.revalidate).toHaveBeenCalledWith("/program");
    expect(mocks.revalidate).toHaveBeenCalledWith("/workout/next");
    expect(mocks.revalidate).toHaveBeenCalledWith(`/program/${programId}`);
  });

  it("does not delete set_log or related session rows", async () => {
    await deleteProgram(programId);

    expect(writes.some((write) => write.table === "set_log")).toBe(false);
    expect(writes.some((write) => write.table === "workout_session")).toBe(false);
    expect(writes.some((write) => write.table === "program_day")).toBe(false);
    expect(writes.some((write) => write.table === "program_slot")).toBe(false);
  });

  it("allows deleting the active program without activating another", async () => {
    await deleteProgram(programId);

    expect(rpc).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.table).toBe("program");
  });

  it("rejects missing or unowned programs before revalidation", async () => {
    await expect(deleteProgram("b0000000-0000-0000-0000-000000000099")).rejects.toThrow(
      "Program not found",
    );
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("sends anonymous callers to login", async () => {
    claims.mockResolvedValue({ data: { claims: {} } });
    await expect(deleteProgram(programId)).rejects.toThrow("redirect:/login");
    expect(writes).toEqual([]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
