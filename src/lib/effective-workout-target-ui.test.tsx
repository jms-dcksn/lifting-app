// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePrescription } from "./periodization";
import { stallContext } from "./stall-report";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import type { WorkoutTargetHistory } from "./effective-workout-target";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/(app)/session/[id]/rest-timer", () => ({
  RestBar: () => null, useSessionRestTimer: () => ({ start: vi.fn(), stop: vi.fn(), active: false }),
}));
vi.mock("@/app/(app)/session/actions", () => ({
  swapSessionExercise: vi.fn(), logSet: vi.fn(), editSet: vi.fn(), deleteSet: vi.fn(), finishSession: vi.fn(),
  updateSessionFeedback: vi.fn(), acceptAdaptation: vi.fn(), dismissAdaptation: vi.fn(), retryRecomputeStat: vi.fn(),
}));

import { ActiveSession, type SlotView } from "@/app/(app)/session/[id]/active-session";

let root: Root;
let host: HTMLDivElement;
const slot = { id: "slot", programId: "program", programDayId: "day", exerciseId: "db-bench", targetSets: 2,
  repMin: 6, repMax: 10, targetRir: 2 };
const prescription = resolvePrescription(slot, 2, []);
const context = stallContext(slot, slot.exerciseId, null, prescription, null);
const view: SlotView = { programSlotId: "slot", exerciseId: slot.exerciseId, pattern: "horizontal_press",
  prescription, targetContext: context, restSeconds: 120, sets: [], pendingSuggestion: null, lastUsedAlternate: null };
const recordsPromise = Promise.resolve([]);

function history(weight = 100): WorkoutTargetHistory {
  const exposures = [0, 1].map(index => ({ exerciseId: slot.exerciseId, equipmentInstanceId: null, sessionId: `s${index}`,
    setId: `first-${index}`, programSlotId: "slot", performedAt: `2026-09-${15 + 7 * index}T12:00:00Z`, weight, reps: 8, rir: 0, e1rm: 130 }));
  return { progressionByExercise: { "db-bench": exposures }, effortBySlot: { slot: { context, exposures } } };
}

async function render(targetHistory = history(), slots = [view]) {
  await act(async () => root.render(createElement(ActiveSession, { sessionId: "open", dayName: "Upper", week: 2, weeks: 5,
    phase: null, isDeload: false, bodyweight: 180, defaultRestSeconds: 120, alreadyFinished: false,
    initialFeedback: { readiness: null, jointPain: null, note: null }, stats: [], recentIds: [], slots, targetHistory,
    catalog: EXERCISE_BY_ID, recordsPromise, pinnedIds: [] })));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("active workout effective target suggestions", () => {
  it("initializes set entry from the effective reduction without an acceptance step", async () => {
    await render();
    expect((host.querySelector('input[aria-label="Weight"]') as HTMLInputElement).value).toBe("95");
    expect((host.querySelector('input[aria-label="Reps"]') as HTMLInputElement).value).toBe("8");
    expect(host.textContent).toContain("Effort adjustment");
  });

  it("preserves a typed weight across a refresh that changes calculated evidence", async () => {
    await render();
    const button = host.querySelector('button[aria-label="Increase Weight"]') as HTMLButtonElement;
    await act(async () => button.click());
    expect((host.querySelector('input[aria-label="Weight"]') as HTMLInputElement).value).toBe("100");
    await render(history(130));
    expect((host.querySelector('input[aria-label="Weight"]') as HTMLInputElement).value).toBe("100");
  });

  it("carries forward a saved set rather than replacing it with the reduced suggestion", async () => {
    const logged = { ...view, sets: [{ id: "saved", exerciseId: slot.exerciseId, equipmentInstanceId: null,
      weight: 123, reps: 7, rir: 2, setIndex: 0 }] };
    await render(history(), [logged]);
    expect(host.textContent).toContain("123 lb × 7");
    expect((host.querySelector('input[aria-label="Weight"]') as HTMLInputElement).value).toBe("123");
    await render(history(130), [logged]);
    expect(host.textContent).toContain("123 lb × 7");
    expect((host.querySelector('input[aria-label="Weight"]') as HTMLInputElement).value).toBe("123");
  });
});
