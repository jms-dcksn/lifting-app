// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BodyMeasurement } from "./body-measurements";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/(app)/measurements/actions", () => ({
  writeMeasurements: vi.fn(),
}));

import { MeasurementTrendCard } from "@/app/(app)/analytics/body/measurement-trend-card";

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

function render(node: ReactNode) {
  act(() => {
    root.render(node);
  });
}

function button(name: string) {
  return [...host.querySelectorAll("button")].find((item) => item.textContent === name);
}

const waist: BodyMeasurement = {
  id: "w1",
  userId: "owner",
  loggedOn: "2026-09-19",
  site: "waist",
  inches: 28.5,
};

describe("MeasurementTrendCard", () => {
  it("shows the tape empty line when Body has no measurements", () => {
    render(<MeasurementTrendCard entries={[]} today="2026-09-19" />);
    expect(host.textContent).toContain("Tape");
    expect(host.textContent).toContain("Tape logs appear after the first save.");
    expect(button("Waist")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("turns on chips for sites that have points and hides a series when toggled off", () => {
    render(<MeasurementTrendCard entries={[waist]} today="2026-09-19" />);
    expect(button("Waist")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Arm")?.getAttribute("aria-pressed")).toBe("false");
    act(() => {
      button("Waist")?.click();
    });
    expect(button("Waist")?.getAttribute("aria-pressed")).toBe("false");
    expect(host.textContent).toContain("No readings in this range");
  });
});
