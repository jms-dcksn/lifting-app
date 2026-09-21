// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeekPrList } from "@/app/(app)/analytics/week-pr-list";
import type { ExerciseRecords } from "@/lib/strength/records";

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...props }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className} {...props}>{children}</a>
  ),
}));

const group: ExerciseRecords = {
  key: '["bb-bench",null]',
  exerciseId: "bb-bench",
  equipmentInstanceId: null,
  name: "Barbell Bench Press",
  isBodyweight: false,
  repRecords: [{ setId: "s1", slotId: "slot", load: 225, weight: 225, reps: 8, improvement: 1 }],
  e1rmRecord: { setId: "s1", slotId: "slot", value: 275, improvement: 5 },
  topWeightRecord: null,
};

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

describe("WeekPrList", () => {
  it("lists every recap line from this week's sessions", () => {
    act(() => {
      root.render(
        <WeekPrList
          sessions={[
            {
              sessionId: "s1",
              performedAt: "2026-09-16T12:00:00Z",
              groups: [group],
            },
          ]}
        />,
      );
    });

    expect(host.querySelector('a[href="/session/s1/recap"]')?.textContent).toContain("1 rep PR · 1 e1RM record");
    expect(host.querySelector('a[href="/history/bb-bench?equipment=none"]')?.textContent).toContain("Barbell Bench Press");
    expect(host.textContent).toContain("225 × 8 +1");
    expect(host.textContent).toContain("275 e1RM +5");
  });

  it("shows an empty state when the week has no records", () => {
    act(() => {
      root.render(<WeekPrList sessions={[]} />);
    });

    expect(host.textContent).toContain("No records this week.");
    expect(host.querySelector("a")).toBeNull();
  });

  it("passes equipment from the record group into Exercise review", () => {
    act(() => {
      root.render(
        <WeekPrList
          sessions={[
            {
              sessionId: "s1",
              performedAt: "2026-09-16T12:00:00Z",
              groups: [{ ...group, exerciseId: "leg-press", equipmentInstanceId: "cybex", name: "Leg Press", key: '["leg-press","cybex"]' }],
            },
          ]}
        />,
      );
    });
    expect(host.querySelector('a[href="/history/leg-press?equipment=cybex"]')?.textContent).toContain("Leg Press");
  });
});
