import { describe, expect, it } from "vitest";
import { addDateKey, hideAppChrome, inLocalDays } from "./app-chrome";

describe("hideAppChrome", () => {
  it("hides session, recap, planner, and builder surfaces", () => {
    expect(hideAppChrome("/session/abc")).toBe(true);
    expect(hideAppChrome("/session/abc/recap")).toBe(true);
    expect(hideAppChrome("/workout/next")).toBe(true);
    expect(hideAppChrome("/program/new")).toBe(true);
    expect(hideAppChrome("/program/abc", "mode=edit")).toBe(true);
    expect(hideAppChrome("/session/abc", "")).toBe(true);
  });

  it("keeps tabs on Train, Track, Program, You, and history", () => {
    expect(hideAppChrome("/")).toBe(false);
    expect(hideAppChrome("/analytics")).toBe(false);
    expect(hideAppChrome("/analytics/month")).toBe(false);
    expect(hideAppChrome("/program")).toBe(false);
    expect(hideAppChrome("/program/abc")).toBe(false);
    expect(hideAppChrome("/settings")).toBe(false);
    expect(hideAppChrome("/history/bb-bench")).toBe(false);
  });
});

describe("inLocalDays", () => {
  it("includes today and the previous six local dates", () => {
    expect(inLocalDays("2026-09-18T12:00:00Z", "2026-09-18", 7)).toBe(true);
    expect(inLocalDays("2026-09-12T12:00:00Z", "2026-09-18", 7)).toBe(true);
    expect(inLocalDays("2026-09-11T12:00:00Z", "2026-09-18", 7)).toBe(false);
    expect(addDateKey("2026-09-18", -6)).toBe("2026-09-12");
  });
});
