// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionRecap } from "@/app/(app)/session/[id]/session-recap";
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

describe("SessionRecap", () => {
  it("offers Home and the workout details from the recap", () => {
    act(() => {
      root.render(
        <SessionRecap
          sessionId="s1"
          dayName="Push"
          totalSets={12}
          achievements={[group]}
          initialFeedback={{ readiness: 4, jointPain: null, note: null }}
        />,
      );
    });

    const home = [...host.querySelectorAll("a")].find((el) => el.getAttribute("href") === "/");
    const workout = host.querySelector('a[href="/session/s1"]');
    expect(home?.textContent).toBe("Home");
    expect(workout?.textContent).toBe("View workout");
    expect(host.textContent).toContain("1 rep PR · 1 e1RM record");
    expect(host.querySelector('a[href="/session/s1/recap"]')).toBeNull();
  });
});
