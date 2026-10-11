// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useSheetDismiss: () => () => {},
}));
vi.mock("@/app/(app)/exercise/actions", () => ({
  resolveVariant: mocks.resolve,
}));

import { SwapStationButton } from "@/app/(app)/program/swap-station-button";

const variant = {
  ...EXERCISE_BY_ID["machine-chest-press"],
  id: "machine-chest-press__hs__plate_loaded",
  name: "Machine Chest Press — Hammer Strength (plate)",
  baseExerciseId: "machine-chest-press",
  brand: "Hammer Strength",
  machineType: "plate_loaded" as const,
  stationProfile: undefined,
  machineTemplate: false,
};

const catalog = [EXERCISE_BY_ID["machine-chest-press"], variant, EXERCISE_BY_ID["bb-row"]];

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("SwapStationButton", () => {
  it("renders Swap machine for a resolved variant and opens the station form", async () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        <SwapStationButton exerciseId={variant.id} catalog={catalog} onPick={onPick} />,
      );
    });
    const button = [...host.querySelectorAll("button")].find((el) => el.textContent === "Swap machine");
    expect(button).toBeTruthy();
    act(() => button!.click());
    expect(host.textContent).toContain("Choose brand & type");

    const resolved = { ...variant, id: "machine-chest-press____stack" };
    mocks.resolve.mockResolvedValue(resolved);
    await act(async () => {
      [...host.querySelectorAll("button")].find((el) => el.textContent === "Use this machine")!.click();
      await Promise.resolve();
    });
    expect(onPick).toHaveBeenCalledWith(resolved);
  });

  it("renders Choose machine for an unresolved template", () => {
    act(() => {
      root.render(
        <SwapStationButton
          exerciseId="machine-chest-press"
          catalog={catalog}
          onPick={() => {}}
        />,
      );
    });
    expect(host.textContent).toContain("Choose machine");
  });

  it("renders nothing for exercises without a station profile", () => {
    act(() => {
      root.render(
        <SwapStationButton exerciseId="bb-row" catalog={catalog} onPick={() => {}} />,
      );
    });
    expect(host.textContent).toBe("");
  });
});
