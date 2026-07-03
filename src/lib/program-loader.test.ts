import { describe, expect, it } from "vitest";
import { listProgramSummaries } from "./program";

describe("listProgramSummaries", () => {
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
