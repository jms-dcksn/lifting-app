import { describe, expect, it } from "vitest";
import {
  programDetailHref,
  programEditHref,
  programIndexHref,
  programNewHref,
} from "./program-routes";

describe("program routes", () => {
  it("builds index and create routes", () => {
    expect(programIndexHref()).toBe("/program");
    expect(programNewHref()).toBe("/program/new");
  });

  it("encodes ids in detail and edit routes", () => {
    expect(programDetailHref("abc/123")).toBe("/program/abc%2F123");
    expect(programEditHref("abc/123")).toBe("/program/abc%2F123?mode=edit");
  });
});
