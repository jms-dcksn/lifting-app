// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolvePrescription } from "./periodization";
import { stallContext } from "./stall-report";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const load = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/(app)/session/[id]/rest-timer", () => ({
  RestBar: () => null, useSessionRestTimer: () => ({ start: vi.fn(), skip: vi.fn(), remaining: null }),
}));
vi.mock("@/app/(app)/session/actions", () => ({ getExerciseHistory: load }));
import { ExerciseHistory } from "@/app/(app)/session/[id]/exercise-history";
import { ActiveSession } from "@/app/(app)/session/[id]/active-session";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  load.mockReset();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });

it("keeps one history dialog as workout records finish streaming", async () => {
  let finishHistory!: (rows: []) => void;
  let finishRecords!: (rows: []) => void;
  load.mockImplementation(() => new Promise<[]>(resolve => { finishHistory = resolve; }));
  const recordsPromise = new Promise<[]>(resolve => { finishRecords = resolve; });
  const slot = { id: "slot", programId: "program", programDayId: "day", exerciseId: "db-bench", targetSets: 2,
    repMin: 6, repMax: 10, targetRir: 2 };
  const prescription = resolvePrescription(slot, 2, []);
  const context = stallContext(slot, slot.exerciseId, null, prescription, null);
  await act(async () => root.render(createElement(ActiveSession, { sessionId: "open", dayName: "Upper", week: 2, weeks: 5,
    phase: null, bodyweight: 180, defaultRestSeconds: 120, alreadyFinished: false,
    initialFeedback: { readiness: null, jointPain: null, note: null }, stats: [], recentIds: [],
    slots: [{ programSlotId: "slot", exerciseId: slot.exerciseId, pattern: "horizontal_press", prescription,
      targetContext: context, restSeconds: 120, sets: [], pendingSuggestion: null, lastUsedAlternate: null }],
    targetHistory: { progressionByExercise: {}, effortBySlot: {} }, catalog: EXERCISE_BY_ID, recordsPromise, pinnedIds: [] })));
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="View history for"]')!.click());
  expect(host.querySelectorAll("dialog[open]")).toHaveLength(1);
  await act(async () => finishRecords([]));
  expect(host.querySelectorAll("dialog[open]")).toHaveLength(1);
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => finishHistory([]));
  expect(host.querySelectorAll("dialog[open]")).toHaveLength(1);
  expect(host.textContent).toContain("No previous sets.");
  expect(host.textContent).not.toContain("Loading history…");

  vi.useFakeTimers();
  await act(async () => [...host.querySelectorAll("dialog button")].find(button => button.textContent === "Close")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await act(async () => vi.runAllTimers());
  expect(host.querySelectorAll("dialog")).toHaveLength(0);

  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="View history for"]')!.click());
  expect(host.querySelectorAll("dialog[open]")).toHaveLength(1);
  await act(async () => finishHistory([]));
  expect(host.querySelectorAll("dialog[open]")).toHaveLength(1);
  expect(host.textContent).not.toContain("Loading history…");
});

it("loads plan history without a session and retries a failed read", async () => {
  load.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
  await act(async () => root.render(createElement(ExerciseHistory, {exerciseId: "db-bench", name: "Bench Press",
    def: EXERCISE_BY_ID["db-bench"], catalog: EXERCISE_BY_ID, isBodyweight: false, onClose: vi.fn()})));
  expect(load).toHaveBeenCalledWith("db-bench", undefined);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("load history");
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Try again")!.click());
  expect(load).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("No previous sets.");
  expect(host.querySelectorAll("dialog[open]")).toHaveLength(1);
});
