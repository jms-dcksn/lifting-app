import { describe, expect, it } from "vitest";
import { buildProgramSummaries } from "./program-summary";

describe("buildProgramSummaries", () => {
  it("returns an empty list without programs", () => {
    expect(buildProgramSummaries([], [], [])).toEqual([]);
  });

  it("returns zero counts for one program without days", () => {
    expect(
      buildProgramSummaries(
        [
          {
            id: "solo",
            name: "Solo",
            tags: ["strength"],
            weeks: 4,
            is_active: true,
            style: "classic",
            created_at: "2026-04-01T00:00:00Z",
          },
        ],
        [],
        [],
      ),
    ).toEqual([
      {
        id: "solo",
        name: "Solo",
        tags: ["strength"],
        weeks: 4,
        isActive: true,
        style: "classic",
        dayCount: 0,
        exerciseCount: 0,
      },
    ]);
  });

  it("pins active first, then sorts newest first and counts days and exercises", () => {
    const programs = [
      {
        id: "older",
        name: "Older",
        tags: [],
        weeks: 5,
        is_active: false,
        style: "classic",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "newer",
        name: "Newer",
        tags: ["hypertrophy"],
        weeks: 6,
        is_active: false,
        style: "fluid",
        created_at: "2026-03-01T00:00:00Z",
      },
      {
        id: "active",
        name: "Active",
        tags: ["strength", "four-day"],
        weeks: null,
        is_active: true,
        style: "classic",
        created_at: "2026-02-01T00:00:00Z",
      },
    ];
    const days = [
      { id: "a1", program_id: "active" },
      { id: "a2", program_id: "active" },
      { id: "n1", program_id: "newer" },
    ];
    const slots = [
      { program_day_id: "a1" },
      { program_day_id: "a1" },
      { program_day_id: "a2" },
      { program_day_id: "n1" },
    ];

    expect(buildProgramSummaries(programs, days, slots)).toEqual([
      {
        id: "active",
        name: "Active",
        tags: ["strength", "four-day"],
        weeks: 5,
        isActive: true,
        style: "classic",
        dayCount: 2,
        exerciseCount: 3,
      },
      {
        id: "newer",
        name: "Newer",
        tags: ["hypertrophy"],
        weeks: 6,
        isActive: false,
        style: "fluid",
        dayCount: 1,
        exerciseCount: 1,
      },
      {
        id: "older",
        name: "Older",
        tags: [],
        weeks: 5,
        isActive: false,
        style: "classic",
        dayCount: 0,
        exerciseCount: 0,
      },
    ]);
  });
});
