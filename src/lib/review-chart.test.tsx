// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { groupReviewSessions } from "./exercise-review-sessions";

vi.mock("@/app/(app)/history/[exerciseId]/e1rm-chart", () => ({
  E1rmChart: ({ periodDates }: { periodDates?: string[] }) =>
    createElement("div", { "data-period": (periodDates ?? []).join(",") }, "chart"),
}));

import { ReviewChart } from "@/app/(app)/history/[exerciseId]/review-chart";

const now = new Date("2026-09-19T18:00:00Z");
const sessions = groupReviewSessions(
  [
    {
      id: "a",
      sessionId: "s1",
      weight: 100,
      reps: 8,
      rir: 1,
      e1rm: 140,
      performedAt: "2026-09-02T12:00:00Z",
      finishedAt: "2026-09-02T13:00:00Z",
    },
    {
      id: "b",
      sessionId: "s2",
      weight: 110,
      reps: 8,
      rir: 1,
      e1rm: 155,
      performedAt: "2026-09-16T12:00:00Z",
      finishedAt: "2026-09-16T13:00:00Z",
    },
  ],
  now,
);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

describe("ReviewChart", () => {
  it("overlays period days only after switching to All history", () => {
    act(() => {
      root.render(
        createElement(ReviewChart, {
          sessions,
          periodEligible: true,
          periodDates: ["2026-09-02", "2026-09-20"],
        }),
      );
    });
    expect(host.querySelector("[data-chart-range='last8']")).not.toBeNull();
    expect(host.querySelector("[data-period]")?.getAttribute("data-period")).toBe("");
    expect(host.querySelector("[aria-label='e1RM over time']")).not.toBeNull();

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-pressed='false']")?.click();
    });

    expect(host.querySelector("[data-chart-range='all']")).not.toBeNull();
    expect(host.querySelector("[data-period]")?.getAttribute("data-period")).toBe("2026-09-02");
    expect(host.querySelector("[aria-label='e1RM over time with period days']")).not.toBeNull();
  });
});
