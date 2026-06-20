import { describe, expect, it } from "vitest";
import { formatRestRemaining } from "./rest";

describe("formatRestRemaining", () => {
  it("formats whole minutes", () => {
    expect(formatRestRemaining(120)).toBe("2:00");
  });
  it("zero-pads seconds under a minute", () => {
    expect(formatRestRemaining(47)).toBe("0:47");
  });
  it("formats minutes + seconds", () => {
    expect(formatRestRemaining(107)).toBe("1:47");
  });
  it("rounds fractional seconds", () => {
    expect(formatRestRemaining(59.6)).toBe("1:00");
  });
  it("clamps negatives to 0:00", () => {
    expect(formatRestRemaining(-5)).toBe("0:00");
  });
});
