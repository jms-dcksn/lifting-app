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

import { ExercisePicker, StationPicker } from "@/app/(app)/program/exercise-picker";

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
        key={resolveStations ? "resolved-picker" : "builder-picker"}
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
  const button = [...host.querySelectorAll("button")].find((el) => (el.getAttribute("aria-label") ?? el.textContent)?.includes(name));
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

it("distinguishes machine and cable kickbacks in the shared picker before selecting", () => {
  const machine = { ...EXERCISE_BY_ID["machine-glute-kickback"], id: "machine-instance",
    baseExerciseId: "machine-glute-kickback", brand: "Life Fitness", machineType: "selectorized" as const };
  const cable = { ...EXERCISE_BY_ID["cable-glute-kickback"], id: "cable-instance",
    baseExerciseId: "cable-glute-kickback", brand: "Life Fitness", machineType: "selectorized" as const };
  const pick = vi.fn();
  act(() => root.render(<ExercisePicker catalog={[machine, cable]} onPick={pick} onClose={() => {}} />));
  const rows = [...host.querySelectorAll<HTMLButtonElement>("li button")];
  const machineRow = rows.find(button => button.getAttribute("aria-label")?.startsWith(machine.name))!;
  const cableRow = rows.find(button => button.getAttribute("aria-label")?.startsWith(cable.name))!;
  expect(machineRow.textContent).toContain("Machine");
  expect(machineRow.textContent).toContain("Weight stack");
  expect(cableRow.textContent).toContain("Cable");
  expect(cableRow.textContent).not.toContain("Weight stack");
  expect(host.textContent).not.toContain("Selectorized");
  act(() => machineRow.click());
  expect(pick).toHaveBeenCalledWith(machine);
});

function setInput(placeholder: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("StationPicker", () => {
  it("opens the station form directly without the exercise list", () => {
    act(() => {
      root.render(
        <StationPicker
          template={EXERCISE_BY_ID["machine-chest-press"]}
          onPick={() => {}}
          onClose={() => {}}
        />,
      );
    });
    expect(host.textContent).toContain("Choose brand & type");
    expect(host.textContent).not.toContain("Search exercises");
    expect(host.textContent).not.toContain("Add custom exercise");
  });
});

describe("ExercisePicker station forms", () => {
  it("keeps a custom cable open until a brand is selected, then creates it", async () => {
    const exercise = { ...EXERCISE_BY_ID["lat-pulldown"], id: "custom-cable" };
    mocks.create.mockResolvedValue({ exercise });
    const onPick = render(false);
    openCustomForm();
    setInput("e.g. Machine Calf Extension", "My Cable Press");
    setEquipment("cable");
    await act(async () => row("Create exercise").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Select a brand for this cable station");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();

    const brand = host.querySelector<HTMLSelectElement>('select[aria-label="Brand"]')!;
    act(() => { brand.value = "Life Fitness"; brand.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => row("Create exercise").click());
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: "My Cable Press", equipment: "cable", brand: "Life Fitness", machineType: "selectorized" }));
    expect(onPick).toHaveBeenCalledWith(exercise);
  });

  it("shows returned creation errors and allows retry with the entered values", async () => {
    mocks.create.mockResolvedValue({ error: "Could not create exercise. Please try again." });
    const onPick = render(false);
    openCustomForm();
    setInput("e.g. Machine Calf Extension", "Garage Press");
    setEquipment("machine");
    await act(async () => row("Create exercise").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Could not create exercise. Please try again.");
    expect(row("Create exercise").disabled).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
    const exercise = { ...EXERCISE_BY_ID["machine-chest-press"], id: "custom-machine" };
    mocks.create.mockResolvedValue({ exercise });
    await act(async () => row("Create exercise").click());
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Garage Press", equipment: "machine", brand: null }));
    expect(onPick).toHaveBeenCalledWith(exercise);
  });

  it("validates required brands in the station picker before submitting", async () => {
    render();
    act(() => row("Lat Pulldown (Cable)").click());
    await act(async () => row("Use this cable").click());
    expect(host.textContent).toContain("Select a brand for this station");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("shows a useful retry message if the creation request throws", async () => {
    mocks.create.mockRejectedValue(new Error("An error occurred in the Server Components render"));
    render(false);
    openCustomForm();
    setInput("e.g. Machine Calf Extension", "Garage Press");
    setEquipment("machine");
    await act(async () => row("Create exercise").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Could not create exercise. Please try again.");
    expect(row("Create exercise").disabled).toBe(false);
  });

  it("resolves a specific manufacturer model and clears it when the brand changes", async () => {
    mocks.resolve.mockResolvedValue({ id: "model-press" });
    render();
    act(() => row("Machine Chest Press").click());
    const brand = [...host.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "Life Fitness"))!;
    act(() => { brand.value = "Life Fitness"; brand.dispatchEvent(new Event("change", { bubbles: true })); });
    const model = [...host.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "lf-insignia-dual-chest"))!;
    expect(model).toBeDefined();
    act(() => { model.value = "lf-insignia-dual-chest"; model.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => row("Use this machine").click());
    expect(mocks.resolve).toHaveBeenCalledWith({ baseExerciseId: "machine-chest-press", brand: "Life Fitness", machineType: "selectorized", stationModel: "lf-insignia-dual-chest" });
    act(() => { brand.value = "Hoist"; brand.dispatchEvent(new Event("change", { bubbles: true })); });
    expect([...host.querySelectorAll("select")].some(select => select.value === "lf-insignia-dual-chest")).toBe(false);
  });

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
    act(() => row("Barbell Row").click());
    expect(sessionPick).toHaveBeenCalledOnce();

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
