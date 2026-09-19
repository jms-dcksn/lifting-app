// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AchievementRecap } from "@/app/(app)/session/[id]/achievements";
import type { ExerciseRecords } from "@/lib/strength/records";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
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

function render(node: ReactNode) {
  act(() => {
    root.render(node);
  });
}

describe("AchievementRecap", () => {
  it("uses a two-part hero when mixing rep and e1RM, with gold compact lines", () => {
    render(<AchievementRecap groups={[group]} dayName="Push" totalSets={12} titleAs="h1" empty="hero" />);
    expect(host.querySelector("h1")?.textContent).toBe("1 rep PR · 1 e1RM record");
    expect(host.textContent).toContain("225 × 8 +1");
    expect(host.textContent).toContain("275 e1RM +5");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/history/bb-bench?equipment=none");
    expect(host.querySelector(".text-record")).toBeTruthy();
    expect(host.textContent).not.toContain("Push done");
  });

  it("hides on resume when there are no records, and finishes cleanly without gold", () => {
    render(<AchievementRecap groups={[]} dayName="Push" totalSets={12} />);
    expect(host.textContent).toBe("");

    render(<AchievementRecap groups={[]} dayName="Push" totalSets={12} titleAs="h1" empty="hero" />);
    expect(host.querySelector("h1")?.textContent).toBe("Push done");
    expect(host.textContent).toContain("12 working sets");
    expect(host.querySelector(".text-record")).toBeNull();
  });

  it("passes equipment from the record group into Exercise review", () => {
    render(
      <AchievementRecap
        groups={[{ ...group, exerciseId: "leg-press", equipmentInstanceId: "cybex", name: "Leg Press", key: '["leg-press","cybex"]' }]}
        dayName="Push"
        totalSets={12}
        titleAs="h1"
        empty="hero"
      />,
    );
    expect(host.querySelector('a[href="/history/leg-press?equipment=cybex"]')?.textContent).toContain("Leg Press");
  });
});
