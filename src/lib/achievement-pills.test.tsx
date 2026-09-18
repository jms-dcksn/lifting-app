// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AchievementPills } from "@/app/(app)/session/[id]/achievements";
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
});
