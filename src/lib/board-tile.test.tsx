// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardGrid } from "@/app/(app)/analytics/board-grid";
import type { BoardLift } from "@/lib/board";
import { exerciseCardLabelText } from "@/lib/exercise-card-label";

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...props }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className} {...props}>{children}</a>
  ),
}));

vi.mock("@/app/(app)/pins/pin-button", () => ({
  PinButton: () => <button type="button">Pin</button>,
}));

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

function lift(partial: Partial<BoardLift> & Pick<BoardLift, "exerciseId" | "label">): BoardLift {
  return {
    reviewExerciseId: partial.exerciseId,
    equipmentInstanceId: null,
    name: partial.label.name,
    isCompound: false,
    currentE1rm: null,
    delta: null,
    e1rmSeries: [],
    recentRecord: false,
    ...partial,
  };
}

describe("BoardTile labels", () => {
  it("shows the equipment chip, brand line, and full accessible name", () => {
    const label = {
      name: "Hack Squat",
      equipment: "Machine",
      secondary: "Cybex",
      tertiary: "Plate-loaded",
    };
    act(() => {
      root.render(
        <BoardGrid
          lifts={[lift({
            exerciseId: "hack-squat__cybex",
            name: "Hack Squat — Cybex (plate)",
            label,
            currentE1rm: 185,
            delta: -12,
            e1rmSeries: [197, 185],
          })]}
          pinnedIds={[]}
          showPin={false}
        />,
      );
    });
    const link = host.querySelector("a");
    expect(link?.textContent).toContain("Hack Squat");
    expect(link?.textContent).not.toContain("Hack Squat — Cybex");
    expect(link?.textContent).toContain("Machine");
    expect(link?.textContent).toContain("Cybex · Plate-loaded");
    expect(link?.textContent).toContain("▼ 12");
    expect(link?.getAttribute("aria-label")).toContain(exerciseCardLabelText(label));
    expect(host.querySelector("[data-board-sparkline]")?.getAttribute("data-board-sparkline")).toBe("series");
  });

  it("keeps the delta and sparkline slots when both are empty", () => {
    act(() => {
      root.render(
        <BoardGrid
          lifts={[lift({
            exerciseId: "bb-rdl",
            label: { name: "Romanian Deadlift", equipment: "Barbell", station: "Platform" },
            currentE1rm: 136,
          })]}
          pinnedIds={[]}
          showPin={false}
        />,
      );
    });
    expect(host.textContent).toContain("136");
    expect(host.textContent).not.toContain("0 e1RM");
    expect(host.querySelector("[data-board-delta]")?.textContent).toBe("—");
    expect(host.querySelector("[data-board-sparkline]")?.getAttribute("data-board-sparkline")).toBe("empty");
  });

  it("uses the record color for a positive record and a neutral decrease", () => {
    act(() => {
      root.render(
        <BoardGrid
          lifts={[
            lift({
              exerciseId: "hack",
              label: { name: "Hack Squat", equipment: "Machine" },
              currentE1rm: 185,
              delta: 5,
              recentRecord: true,
            }),
            lift({
              exerciseId: "curl",
              label: { name: "Seated Leg Curl", equipment: "Machine" },
              currentE1rm: 163,
              delta: -4,
              recentRecord: true,
            }),
          ]}
          pinnedIds={[]}
          showPin={false}
        />,
      );
    });
    const deltas = [...host.querySelectorAll("[data-board-delta]")];
    expect(deltas[0]?.textContent).toBe("▲ 5");
    expect(deltas[0]?.className).toContain("text-record");
    expect(deltas[1]?.textContent).toBe("▼ 4");
    expect(deltas[1]?.className).not.toContain("text-record");
    expect(host.querySelector("article")?.className).toContain("border-record");
  });
});
