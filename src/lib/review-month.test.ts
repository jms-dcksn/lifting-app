import { describe, expect, it } from "vitest";
import { reviewMonthParam } from "./review-month";

const now = new Date("2026-09-14T18:00:00Z");

describe("reviewMonthParam", () => {
  it("keeps a valid month up to the current local month", () => {
    expect(reviewMonthParam("2026-09", now)).toBe("2026-09");
    expect(reviewMonthParam("2026-08", now)).toBe("2026-08");
  });

  it("ignores missing, malformed, future, and non-string months", () => {
    expect(reviewMonthParam(undefined, now)).toBeNull();
    expect(reviewMonthParam(["2026-09"], now)).toBeNull();
    expect(reviewMonthParam("2026-13", now)).toBeNull();
    expect(reviewMonthParam("not-a-month", now)).toBeNull();
    expect(reviewMonthParam("2026-10", now)).toBeNull();
  });
});
