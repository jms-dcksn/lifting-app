// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock("@/lib/copy-text", () => ({
  copyTextToClipboard: mocks.copyTextToClipboard,
}));

import { CoachCheckIn } from "@/app/(app)/analytics/coach-check-in";

const REPORT = "Coach check-in\nSessions 4/4";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.copyTextToClipboard.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.useRealTimers();
});

function render() {
  act(() => {
    root.render(<CoachCheckIn text={REPORT} />);
  });
}

function button() {
  const node = host.querySelector("button");
  if (!node) throw new Error("Missing Copy report button");
  return node;
}

describe("CoachCheckIn copy report", () => {
  it("copies the report text and shows Copied", async () => {
    mocks.copyTextToClipboard.mockResolvedValue(true);
    render();
    await act(async () => {
      button().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mocks.copyTextToClipboard).toHaveBeenCalledWith(REPORT);
    expect(button().textContent).toBe("Copied");
  });

  it("shows Copy failed when the clipboard write does not succeed", async () => {
    mocks.copyTextToClipboard.mockResolvedValue(false);
    render();
    await act(async () => {
      button().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(button().textContent).toBe("Copy failed");
  });
});
