import { describe, expect, it } from "vitest";
import { normalizeTags, uniqueTags, filterByTag } from "./program-tags";

describe("normalizeTags", () => {
  it("trims, drops empties, and dedupes case-insensitively keeping first form", () => {
    expect(normalizeTags(["  Push ", "push", "", "  ", "Pull"])).toEqual(["Push", "Pull"]);
  });
  it("returns an empty array for no input", () => {
    expect(normalizeTags([])).toEqual([]);
  });
});

describe("uniqueTags", () => {
  it("returns the sorted union across programs, case-insensitively deduped", () => {
    const programs = [
      { tags: ["hypertrophy", "ppl"] },
      { tags: ["PPL", "strength"] },
      { tags: [] },
    ];
    expect(uniqueTags(programs)).toEqual(["hypertrophy", "ppl", "strength"]);
  });
});

describe("filterByTag", () => {
  const programs = [
    { id: "a", tags: ["ppl"] },
    { id: "b", tags: ["strength"] },
    { id: "c", tags: ["PPL", "strength"] },
  ];
  it("returns all programs when tag is null", () => {
    expect(filterByTag(programs, null).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("matches case-insensitively", () => {
    expect(filterByTag(programs, "ppl").map((p) => p.id)).toEqual(["a", "c"]);
  });
});
