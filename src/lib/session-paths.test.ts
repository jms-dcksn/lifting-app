import { describe, expect, it } from "vitest";
import { sessionPath, sessionRecapPath } from "./session-paths";

describe("session paths", () => {
  it("keeps workout details and recap as distinct routes", () => {
    expect(sessionPath("abc")).toBe("/session/abc");
    expect(sessionRecapPath("abc")).toBe("/session/abc/recap");
  });
});
