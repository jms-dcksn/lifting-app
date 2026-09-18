// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AchievementPills, AchievementRecap } from "@/app/(app)/session/[id]/achievements";
import type { ExerciseRecords } from "@/lib/strength/records";

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

describe("AchievementPills", () => {
  it("uses compact record-gold lines instead of overload green sentences", () => {
    render(<AchievementPills groups={[group]} />);
    expect(host.textContent).toContain("225 × 8 +1");
    expect(host.textContent).toContain("275 e1RM +5");
    expect(host.textContent).not.toContain("Rep PR");
    expect(host.querySelector(".text-record")).toBeTruthy();
    expect(host.querySelector(".text-overload-up")).toBeNull();
  });

  it("uses a 44px history IconButton control on recap rows", () => {
    render(
      <AchievementRecap groups={[group]} dayName="Push" totalSets={4} empty="hero" />,
    );
    const history = host.querySelector('a[aria-label="View history for Barbell Bench Press"]');
    expect(history).toBeTruthy();
    expect(history?.className).toContain("size-11");
    expect(history?.querySelector("svg")).toBeTruthy();
    expect(host.textContent).toContain("1 rep PR · 1 e1RM record");
  });
});
