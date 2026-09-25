// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachRecommendation } from "./coach-recommendations";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  acceptAll: vi.fn(),
}));

vi.mock("@/app/(app)/analytics/actions", () => ({
  saveCoachRecommendationDecision: mocks.save,
  acceptAllCoachRecommendations: mocks.acceptAll,
}));

import { CoachRecommendationList } from "@/app/(app)/analytics/coach-recommendation-list";

const first: CoachRecommendation = {
  key: "rec_aaaaaaaaaaaaaaaa",
  kind: "add_load",
  exerciseId: "bb-bench",
  exerciseName: "Bench press",
  programDayName: "Upper A",
  action: { label: "Add 5 lb", targetWeight: 190, targetReps: 8 },
  rationale: "You hit the top of the range.",
  evidence: {
    windowStart: "2026-09-01",
    windowEnd: "2026-09-25",
    exposureCount: 4,
    summary: ["185 × 8"],
  },
  confidence: "high",
  dataSufficiency: "4 exposures",
  priority: "now",
};

const second: CoachRecommendation = {
  ...first,
  key: "rec_bbbbbbbbbbbbbbbb",
  exerciseName: "Row",
  programDayName: "Upper B",
  action: { label: "Add 2.5 lb", targetWeight: 80, targetReps: 10 },
  priority: "next",
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.save.mockReset();
  mocks.acceptAll.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function renderList(recommendations: CoachRecommendation[] = [first, second]) {
  act(() => {
    root.render(
      <CoachRecommendationList
        recommendations={recommendations}
        decisions={[]}
        currentTime="2026-09-25T12:00:00.000Z"
      />,
    );
  });
}

function click(label: string) {
  const button = [...host.querySelectorAll("button")].find((node) => node.textContent === label);
  if (!button) throw new Error(`Missing button ${label}`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("CoachRecommendationList decisions", () => {
  it("hides an accepted proposal before the save settles and does not stay busy", async () => {
    let finish: (value: { ok: true; deferredUntil: null }) => void = () => undefined;
    mocks.save.mockImplementation(() => new Promise((resolve) => {
      finish = resolve;
    }));
    renderList();
    click("Accept");
    expect(host.textContent).not.toContain("Bench press");
    expect(host.textContent).toContain("Row");
    expect(host.querySelector("[aria-busy]")).toBeNull();
    await act(async () => {
      finish({ ok: true, deferredUntil: null });
    });
    expect(host.textContent).not.toContain("Bench press");
    expect(host.querySelector("[role='alert']")).toBeNull();
  });

  it("restores the proposal and shows an error when the save fails", async () => {
    mocks.save.mockResolvedValue({ ok: false, error: "Unable to save that decision. Try again." });
    renderList([first]);
    await act(async () => {
      click("Dismiss");
    });
    expect(host.textContent).toContain("Bench press");
    expect(host.querySelector("[role='alert']")?.textContent).toBe("Unable to save that decision. Try again.");
    expect(host.querySelector("[aria-busy]")).toBeNull();
  });

  it("clears the list on Accept all without waiting for a page refresh", async () => {
    let finish: (value: { ok: true }) => void = () => undefined;
    mocks.acceptAll.mockImplementation(() => new Promise((resolve) => {
      finish = resolve;
    }));
    renderList();
    click("Accept all (2)");
    expect(host.textContent).toContain("No recommendations need review right now.");
    expect(host.querySelector("[aria-busy]")).toBeNull();
    await act(async () => {
      finish({ ok: true });
    });
    expect(host.textContent).toContain("No recommendations need review right now.");
  });
});
