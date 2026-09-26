// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./copy-text";

const REPORT = "Coach check-in\nSessions 4/4";

describe("copyTextToClipboard", () => {
  const execCommand = vi.fn();

  beforeEach(() => {
    execCommand.mockReset();
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: execCommand,
    });
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn() },
    });
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("copies via execCommand on the tap and skips writeText when that works", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    let selected = "";
    execCommand.mockImplementation(() => {
      selected = document.querySelector("textarea")?.value ?? "";
      return true;
    });

    await expect(copyTextToClipboard(REPORT)).resolves.toBe(true);

    expect(selected).toBe(REPORT);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(writeText).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to writeText when execCommand is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    execCommand.mockReturnValue(false);

    await expect(copyTextToClipboard(REPORT)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(REPORT);
  });

  it("returns false when both clipboard paths fail", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    execCommand.mockReturnValue(false);

    await expect(copyTextToClipboard(REPORT)).resolves.toBe(false);
  });

  it("returns false when Clipboard API is missing and execCommand fails", async () => {
    vi.stubGlobal("navigator", {});
    execCommand.mockReturnValue(false);

    await expect(copyTextToClipboard(REPORT)).resolves.toBe(false);
  });
});
