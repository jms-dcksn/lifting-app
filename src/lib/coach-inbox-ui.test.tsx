// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoachInboxEntry } from "@/components/coach/coach-inbox-entry";
import { CoachInbox } from "@/components/coach/coach-inbox";
import { CoachNoticeDetail } from "@/components/coach/coach-notice-detail";
import { DEFAULT_COACH_PREFERENCES } from "./coach-episodes";
const actions = vi.hoisted(() => ({
  refreshInbox: vi.fn(),
  moreNotices: vi.fn(),
  markNotice: vi.fn(),
  savePreferences: vi.fn(),
  endPainReview: vi.fn(),
  clearInboxHistory: vi.fn(),
  openNotice: vi.fn(),
}));
vi.mock("@/app/(app)/coach/inbox/actions", () => actions);
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));
let root: Root, host: HTMLDivElement;
const page = {
  notices: [],
  nextCursor: null,
  unread: 2,
  preferences: DEFAULT_COACH_PREFERENCES,
  preferencesVersion: 0,
  stale: false,
};
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  actions.refreshInbox.mockResolvedValue({
    refresh: { status: "ready", arrival: null },
    page,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("Coach inbox chrome", () => {
  it("shows an accessible persistent unread count outside workouts", async () => {
    await act(async () =>
      root.render(
        createElement(CoachInboxEntry, { pathname: "/", hide: false }),
      ),
    );
    expect(
      host.querySelector('a[aria-label="Coach inbox, 2 unread"]'),
    ).not.toBeNull();
  });
  it("refreshes but never displays chrome or arrivals in a workout", async () => {
    actions.refreshInbox.mockResolvedValue({
      refresh: {
        status: "ready",
        arrival: { id: "notice", title: "Pain review" },
      },
      page,
    });
    await act(async () =>
      root.render(
        createElement(CoachInboxEntry, { pathname: "/session/s", hide: true }),
      ),
    );
    expect(host.textContent).toBe("");
    expect(actions.refreshInbox).toHaveBeenCalledWith(false);
  });
  it("hides the redundant floating entry on Coach pages", async () => {
    await act(async () =>
      root.render(
        createElement(CoachInboxEntry, {
          pathname: "/coach/inbox/notice",
          hide: false,
        }),
      ),
    );
    expect(host.textContent).toBe("");
    expect(actions.refreshInbox).toHaveBeenCalledWith(false);
  });
  it("coalesces multiple foreground events during an in-flight refresh", async () => {
    let finish!: (v: unknown) => void;
    actions.refreshInbox.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () =>
      root.render(
        createElement(CoachInboxEntry, { pathname: "/", hide: false }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("coach:refresh"));
    });
    expect(actions.refreshInbox).toHaveBeenCalledTimes(1);
    await act(async () => finish({ refresh: { status: "ready" }, page }));
    expect(actions.refreshInbox).toHaveBeenCalledTimes(2);
  });
  it("recovers a failed refresh on foreground entry", async () => {
    actions.refreshInbox.mockResolvedValueOnce({
      refresh: { status: "unavailable" },
      page: null,
    });
    await act(async () =>
      root.render(
        createElement(CoachInboxEntry, { pathname: "/", hide: false }),
      ),
    );
    expect(host.textContent).toContain("!");
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(
      host.querySelector('a[aria-label="Coach inbox, 2 unread"]'),
    ).not.toBeNull();
  });
  it("keeps disabled rollout quiet", async () => {
    actions.refreshInbox.mockResolvedValue({
      refresh: { status: "disabled" },
      page: null,
    });
    await act(async () =>
      root.render(
        createElement(CoachInboxEntry, { pathname: "/", hide: false }),
      ),
    );
    expect(host.textContent).toBe("");
  });
});
describe("Coach inbox content", () => {
  it("has a quiet empty state and no routine acceptance controls", async () => {
    await act(async () => root.render(createElement(CoachInbox)));
    expect(host.textContent).toContain("No Coach notices.");
    expect(host.textContent).not.toContain("Accept all");
  });
  it("shows honest retry status with persisted notices still visible", async () => {
    actions.refreshInbox.mockResolvedValue({
      refresh: { status: "unavailable" },
      page: {
        ...page,
        notices: [
          {
            id: "n",
            title: "Pain review",
            body: "Review pain",
            created_at: "2026-10-15T00:00:00Z",
            read_at: null,
          },
        ],
      },
    });
    await act(async () => root.render(createElement(CoachInbox)));
    expect(host.textContent).toContain("Coach refresh needed.");
    expect(host.textContent).toContain("Pain review");
    expect(host.querySelector('a[href="/coach/inbox/n"]')).not.toBeNull();
  });
  it("uses the same unavailable UI for missing/foreign destinations", async () => {
    actions.openNotice.mockResolvedValue(null);
    await act(async () =>
      root.render(createElement(CoachNoticeDetail, { noticeId: "missing" })),
    );
    expect(host.textContent).toContain("This notice is unavailable.");
    expect(actions.endPainReview).not.toHaveBeenCalled();
  });
});
