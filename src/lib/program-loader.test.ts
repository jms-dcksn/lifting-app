import { describe, expect, it } from "vitest";
import { getActiveProgram, getProgram, listProgramSummaries } from "./program";

const programRow = {
  id: "p1", name: "Program", description: null, tags: [], weeks: 5,
  is_active: true, style: "classic", created_at: "2026-07-03T00:00:00Z",
};

function programClient(failedTable?: string) {
  const failure = { code: "42703", message: "column program_slot.tempo does not exist" };
  const rows: Record<string, unknown[]> = {
    program: [programRow],
    program_day: [{ id: "d1", program_id: "p1", name: "Upper", position: 0 }],
    program_phase: [],
    program_slot: [],
  };
  const supabase = {
    from(table: string) {
      const result = table === failedTable
        ? { data: null, error: failure }
        : { data: rows[table], error: null };
      const response = Promise.resolve(result);
      const query = {
        select() { return query; },
        eq() { return query; },
        in() { return query; },
        order() { return query; },
        maybeSingle: async () => ({ ...result, data: result.data?.[0] ?? null }),
        then: response.then.bind(response),
      };
      return query;
    },
  } as unknown as Parameters<typeof getProgram>[0];
  return { supabase, failure };
}

describe.each([
  ["getProgram", (client: Parameters<typeof getProgram>[0]) => getProgram(client, "user-1", "p1")],
  ["getActiveProgram", (client: Parameters<typeof getProgram>[0]) => getActiveProgram(client, "user-1")],
] as const)("%s", (_name, load) => {
  it.each(["program", "program_day", "program_phase", "program_slot"])(
    "surfaces a %s query failure instead of returning missing program data",
    async (table) => {
      const { supabase, failure } = programClient(table);
      await expect(load(supabase)).rejects.toEqual(failure);
    },
  );

  it("preserves a genuinely empty day", async () => {
    const { supabase } = programClient();
    await expect(load(supabase)).resolves.toMatchObject({
      id: "p1", days: [{ id: "d1", slots: [] }],
    });
  });
});

describe("listProgramSummaries", () => {
  it.each(["program", "program_day", "program_slot"])(
    "surfaces a %s query failure instead of reporting empty counts",
    async (table) => {
      const { supabase, failure } = programClient(table);
      await expect(listProgramSummaries(supabase, "user-1")).rejects.toEqual(failure);
    },
  );

  it("loads programs, their days, and their slots in three batched queries", async () => {
    const queries: string[] = [];
    const supabase = {
      from(table: string) {
        queries.push(table);
        if (table === "program") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  {
                    id: "p1",
                    name: "Program",
                    tags: ["strength"],
                    weeks: 5,
                    is_active: true,
                    style: "classic",
                    created_at: "2026-07-03T00:00:00Z",
                  },
                ],
              }),
            }),
          };
        }
        if (table === "program_day") {
          return {
            select: () => ({
              in: async (_column: string, ids: string[]) => {
                expect(ids).toEqual(["p1"]);
                return { data: [{ id: "d1", program_id: "p1" }] };
              },
            }),
          };
        }
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => {
              expect(ids).toEqual(["d1"]);
              return { data: [{ program_day_id: "d1" }] };
            },
          }),
        };
      },
    } as unknown as Parameters<typeof listProgramSummaries>[0];

    await expect(listProgramSummaries(supabase, "user-1")).resolves.toEqual([
      {
        id: "p1",
        name: "Program",
        tags: ["strength"],
        weeks: 5,
        isActive: true,
        style: "classic",
        dayCount: 1,
        exerciseCount: 1,
      },
    ]);
    expect(queries).toEqual(["program", "program_day", "program_slot"]);
  });
});
