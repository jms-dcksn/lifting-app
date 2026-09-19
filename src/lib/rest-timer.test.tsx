// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RestTimerProvider, useSessionRestTimer } from "@/app/(app)/session/[id]/rest-timer";
import { restTimerStorageKey, writeRestEndsAt } from "./rest-timer-state";

vi.mock("@/lib/rest-notification", () => ({
  cancelRestNotification: vi.fn(),
  ensureRestNotificationPermission: vi.fn(async () => "denied"),
  registerRestNotificationWorker: vi.fn(async () => null),
  scheduleRestNotification: vi.fn(async () => {}),
}));

function Probe() {
  const timer = useSessionRestTimer();
  return (
    <div>
      <span data-testid="remaining">{timer.remaining ?? "idle"}</span>
      <button type="button" onClick={() => timer.start(120)}>
        start
      </button>
      <button type="button" onClick={timer.skip}>
        skip
      </button>
    </div>
  );
}

function renderTimer(root: Root, host: HTMLDivElement, node: ReactNode) {
  act(() => {
    root.render(node);
  });
  return host;
}

describe("session rest timer durability", () => {
  const sessionId = "active-session";
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T15:00:00Z"));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    sessionStorage.clear();
    writeRestEndsAt(null, sessionId, null);
    vi.useRealTimers();
  });

  it("keeps the countdown when the session page remounts after a logged set", () => {
    const tree = (
      <RestTimerProvider sessionId={sessionId} toneEnabled={false}>
        <Probe />
      </RestTimerProvider>
    );
    renderTimer(root, host, tree);
    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(host.querySelector("[data-testid=remaining]")?.textContent).toBe("120");
    expect(sessionStorage.getItem(restTimerStorageKey(sessionId))).toBe(String(Date.now() + 120_000));

    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    renderTimer(root, host, tree);
    expect(host.querySelector("[data-testid=remaining]")?.textContent).toBe("120");
  });

  it("does not revive a skipped rest after remount", () => {
    const tree = (
      <RestTimerProvider sessionId={sessionId} toneEnabled={false}>
        <Probe />
      </RestTimerProvider>
    );
    renderTimer(root, host, tree);
    const [start, skip] = host.querySelectorAll("button");
    act(() => {
      start.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      skip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(host.querySelector("[data-testid=remaining]")?.textContent).toBe("idle");

    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    renderTimer(root, host, tree);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(host.querySelector("[data-testid=remaining]")?.textContent).toBe("idle");
  });
});
