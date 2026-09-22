// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseList } from "@/app/(app)/analytics/exercise-list";
import { BoardGrid } from "@/app/(app)/analytics/board-grid";
import type { BoardLift } from "@/lib/board";

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...props }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className} {...props}>{children}</a>
  ),
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

describe("Track exercise review links", () => {
  it("sends All lifts through the latest-instance equipment query", () => {
    act(() => {
      root.render(
        <ExerciseList
          items={[{
            exerciseId: "leg-press",
            equipmentInstanceId: "cybex",
            name: "Leg Press",
            pattern: "squat",
            currentE1rm: 250,
            bestE1rm: 250,
            lastPerformedAt: "2026-09-16T12:00:00Z",
            sessionCount: 1,
            delta: null,
          }]}
        />,
      );
    });
    expect(host.querySelector('a[href="/history/leg-press?equipment=cybex"]')?.textContent).toContain("Leg Press");
  });

  it("sends tiles through the latest-instance equipment query", () => {
    const lift: BoardLift = {
      exerciseId: "leg-press",
      reviewExerciseId: "leg-press",
      equipmentInstanceId: "cybex",
      name: "Leg Press",
      shortName: "Leg Press",
      isCompound: false,
      currentE1rm: 250,
      delta: null,
      e1rmSeries: [250],
      recentRecord: false,
    };
    act(() => {
      root.render(<BoardGrid lifts={[lift]} pinnedIds={[]} showPin={false} />);
    });
    expect(host.querySelector('a[href="/history/leg-press?equipment=cybex"]')?.textContent).toContain("Leg Press");
  });

  it("uses equipment=none when the latest identity has no instance", () => {
    act(() => {
      root.render(
        <ExerciseList
          items={[{
            exerciseId: "bb-bench",
            equipmentInstanceId: null,
            name: "Barbell Bench Press",
            pattern: "horizontal_press",
            currentE1rm: 150,
            bestE1rm: 150,
            lastPerformedAt: "2026-09-16T12:00:00Z",
            sessionCount: 2,
            delta: 5,
          }]}
        />,
      );
    });
    expect(host.querySelector('a[href="/history/bb-bench?equipment=none"]')?.textContent).toContain("Barbell Bench Press");
  });

  it("sends default-compound tiles to the family-latest review identity", () => {
    const lift: BoardLift = {
      exerciseId: "bb-bench",
      reviewExerciseId: "bb-bench__flex-fitness__bench",
      equipmentInstanceId: null,
      name: "Barbell Bench Press",
      shortName: "Bench",
      isCompound: true,
      currentE1rm: 185,
      delta: -8,
      e1rmSeries: [193, 185],
      recentRecord: false,
    };
    act(() => {
      root.render(<BoardGrid lifts={[lift]} pinnedIds={["bb-bench"]} showPin={false} />);
    });
    expect(host.querySelector('a[href="/history/bb-bench__flex-fitness__bench?equipment=none"]')?.textContent)
      .toContain("Bench");
  });
});
