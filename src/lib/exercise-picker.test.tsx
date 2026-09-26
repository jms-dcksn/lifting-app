// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useSheetDismiss: () => () => {},
}));
vi.mock("@/app/(app)/exercise/actions", () => ({
  resolveVariant: mocks.resolve,
  createCustomExercise: mocks.create,
}));

import { ExercisePicker } from "@/app/(app)/program/exercise-picker";

const catalog = [
  EXERCISE_BY_ID["machine-chest-press"],
  EXERCISE_BY_ID["lat-pulldown"],
  EXERCISE_BY_ID["bb-incline-bench"],
  EXERCISE_BY_ID["bb-row"],
];

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

function render(resolveStations = true, onPick = vi.fn()) {
  act(() => {
    root.render(
      <ExercisePicker
        catalog={catalog}
        resolveStations={resolveStations}
        onPick={onPick}
        onClose={() => {}}
      />,
    );
  });
  return onPick;
}

function row(name: string) {
  const button = [...host.querySelectorAll("button")].find((el) => el.textContent?.includes(name));
  if (!button) throw new Error(`missing row ${name}`);
  return button;
}

function openCustomForm() {
  act(() => row("Add custom exercise").click());
}

function equipmentSelect() {
  const select = [...host.querySelectorAll("select")].find((el) =>
    [...el.options].some((opt) => opt.textContent === "Select equipment…"),
  );
  if (!select) throw new Error("missing equipment select");
  return select;
}

function setEquipment(value: string) {
  const select = equipmentSelect();
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("ExercisePicker station forms", () => {
  it("opens brand + type for machines and keeps the plate/stack control", () => {
    render();
    act(() => row("Machine Chest Press").click());
    expect(host.textContent).toContain("Choose brand & type");
    expect(host.textContent).toContain("Selectorized");
    expect(host.textContent).toContain("Plate-loaded");
    expect(host.textContent).toContain("Use this machine");
    expect(host.textContent).toContain("Unbranded");
  });

  it("opens brand-only for cables and incline bench, with profile-specific confirm copy", () => {
    render();
    act(() => row("Lat Pulldown (Cable)").click());
    expect(host.textContent).toContain("Choose brand");
    expect(host.textContent).not.toContain("Choose brand & type");
    expect(host.textContent).not.toContain("Selectorized");
    expect(host.textContent).not.toContain("Plate-loaded");
    expect(host.textContent).toContain("Use this cable");
    expect(host.textContent).toContain("Select brand");
    expect(host.textContent).not.toContain("Unbranded");
    expect(host.textContent).not.toContain("Choose station");

    act(() => [...host.querySelectorAll("button")].find((el) => el.textContent?.includes("Back"))!.click());
    act(() => row("Barbell Incline Bench").click());
    expect(host.textContent).toContain("Use this bench");
    expect(host.textContent).not.toContain("Selectorized");
    expect(host.textContent).not.toContain("Choose station");
  });

  it("returns a none-profile template immediately, and the builder keeps station templates", () => {
    const sessionPick = render(true);
    act(() => row("Barbell Row").click());
    expect(sessionPick).toHaveBeenCalledWith(EXERCISE_BY_ID["bb-row"]);

    const builderPick = render(false);
    act(() => row("Lat Pulldown (Cable)").click());
    expect(builderPick).toHaveBeenCalledWith(EXERCISE_BY_ID["lat-pulldown"]);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("custom form requires equipment and shows brand + type for machine", () => {
    render();
    openCustomForm();
    expect(host.textContent).toContain("Select equipment…");
    expect(host.textContent).not.toContain("Selectorized");
    expect(host.textContent).not.toContain("Plate-loaded");

    setEquipment("machine");
    expect(host.textContent).toContain("Brand and type identify this machine for tracking");
    expect(host.textContent).toContain("Brand");
    expect(host.textContent).toContain("Type");
    expect(host.textContent).toContain("Selectorized");
    expect(host.textContent).toContain("Plate-loaded");
    expect(host.textContent).toContain("Unbranded");
  });

  it("custom form shows brand without type for cable", () => {
    render();
    openCustomForm();
    setEquipment("cable");
    expect(host.textContent).toContain("Brand identifies this cable station for tracking");
    expect(host.textContent).toContain("Brand");
    expect(host.textContent).toContain("Select brand");
    expect(host.textContent).not.toContain("Type");
    expect(host.textContent).not.toContain("Selectorized");
    expect(host.textContent).not.toContain("Plate-loaded");
    expect(host.textContent).not.toContain("Unbranded");
  });

  it("resolves a machine plate-loaded variant from the session picker", async () => {
    const variant = { ...EXERCISE_BY_ID["machine-chest-press"], id: "machine-chest-press__hs__plate_loaded", machineTemplate: false, stationProfile: undefined };
    mocks.resolve.mockResolvedValue(variant);
    const onPick = render(true);
    act(() => row("Machine Chest Press").click());
    const plate = [...host.querySelectorAll("button")].find((el) => el.textContent === "Plate-loaded");
    act(() => plate!.click());
    await act(async () => {
      [...host.querySelectorAll("button")].find((el) => el.textContent === "Use this machine")!.click();
      await Promise.resolve();
    });
    expect(mocks.resolve).toHaveBeenCalledWith({
      baseExerciseId: "machine-chest-press",
      brand: null,
      machineType: "plate_loaded",
    });
    expect(onPick).toHaveBeenCalledWith(variant);
  });
});
