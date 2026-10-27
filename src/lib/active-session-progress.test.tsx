// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePrescription } from "./periodization";
import { EXERCISE_BY_ID, type ExerciseDef } from "./strength/coefficients";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/(app)/session/[id]/rest-timer", () => ({
  RestBar: () => null, useSessionRestTimer: () => ({ start: vi.fn(), stop: vi.fn(), active: false }),
}));
vi.mock("@/app/(app)/session/actions", () => ({
  swapSessionExercise: vi.fn(), logSet: vi.fn(), editSet: vi.fn(), deleteSet: vi.fn(), finishSession: vi.fn(),
  updateSessionFeedback: vi.fn(), acceptAdaptation: vi.fn(), dismissAdaptation: vi.fn(), retryRecomputeStat: vi.fn(),
}));

import { ActiveSession, type SlotView } from "@/app/(app)/session/[id]/active-session";
import { logSet } from "@/app/(app)/session/actions";

let root: Root;
let host: HTMLDivElement;
const recordsPromise = Promise.resolve([]);
const targetHistory = { progressionByExercise: {}, effortBySlot: {} };

function slot(done: number, targetSets = 3): SlotView {
  return {
    programSlotId: "slot", exerciseId: "db-bench", pattern: "horizontal_press",
    prescription: resolvePrescription({ targetSets, repMin: 6, repMax: 10, targetRir: 2 }, 1, []),
    targetContext: null, restSeconds: 120, pendingSuggestion: null, lastUsedAlternate: null,
    sets: Array.from({ length: done }, (_, i) => ({ id: `set-${i}`, exerciseId: "db-bench",
      equipmentInstanceId: null, weight: 50, reps: 8, rir: 2, setIndex: i })),
  };
}

async function render(done: number, targetSets = 3, def?: ExerciseDef) {
  const view = slot(done, targetSets);
  if (def) { view.exerciseId = def.id; view.pattern = def.pattern; }
  await act(async () => root.render(createElement(ActiveSession, {
    sessionId: "open", dayName: "Upper", week: 1, weeks: 5, phase: null, isDeload: false,
    bodyweight: 180, defaultRestSeconds: 120, alreadyFinished: false,
    initialFeedback: { readiness: 3, jointPain: null, note: null }, stats: [], recentIds: [],
    slots: [view], targetHistory, catalog: def ? { ...EXERCISE_BY_ID, [def.id]: def } : EXERCISE_BY_ID, recordsPromise, pinnedIds: [],
  })));
}

function button(label: string) {
  return Array.from(host.querySelectorAll("button")).find(b => b.textContent === label)!;
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("active workout set progress", () => {
  it("logs rep-only work with zero stored load and no weight control", async () => {
    vi.mocked(logSet).mockResolvedValue({ id: "rollout-set", exercise_id: "ab-wheel-rollout", weight: 0,
      reps: 6, rir: 2, set_index: 0, e1rm: null, tempo: null, recomputeWarning: null });
    await render(0, 3, EXERCISE_BY_ID["ab-wheel-rollout"]);
    expect(host.querySelector('input[aria-label="Weight"]')).toBeNull();
    expect(host.textContent).toContain("6 reps");
    await act(async () => button("Log set").click());
    expect(logSet).toHaveBeenCalledWith(expect.objectContaining({ exerciseId: "ab-wheel-rollout", weight: 0, reps: 6 }));
    expect(host.textContent).not.toContain("0 lb ×");
  });

  it("accepts positive assistance in the control and persists the negative convention", async () => {
    const def = { ...EXERCISE_BY_ID["assisted-pullup"], id: "assisted-station", baseExerciseId: "assisted-pullup", stationProfile: undefined };
    vi.mocked(logSet).mockResolvedValue({ id: "assist-set", exercise_id: def.id, weight: -5,
      reps: 6, rir: 2, set_index: 0, e1rm: 200, tempo: null, recomputeWarning: null });
    await render(0, 3, def);
    const increase = host.querySelector('button[aria-label="Increase Assistance (lb)"]') as HTMLButtonElement;
    expect(increase).not.toBeNull();
    await act(async () => increase.click());
    await act(async () => button("Log set").click());
    expect(logSet).toHaveBeenCalledWith(expect.objectContaining({ exerciseId: def.id, weight: -5 }));
    expect((host.querySelector('input[aria-label="Assistance (lb)"]') as HTMLInputElement).value).toBe("5");
  });

  it.each([0, 2])("shows an explicit count for %i logged sets", async done => {
    await render(done);
    const progress = host.querySelector('[role="status"]');
    expect(progress?.textContent).toBe(`Sets ${done}/3`);
    expect(progress?.getAttribute("aria-label")).toBe(`${done} of 3 sets logged`);
    expect(button("Log set").disabled).toBe(false);
  });

  it("marks completion while keeping results editable and extra sets available", async () => {
    await render(3);
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Done 3/3");
    expect(host.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe("3 of 3 sets logged, complete");
    expect(button("Edit")).toBeDefined();
    expect(button("Delete")).toBeDefined();
    expect(button("Add set").disabled).toBe(false);
    vi.mocked(logSet).mockResolvedValue({ id: "extra", exercise_id: "db-bench", weight: 50,
      reps: 8, rir: 2, set_index: 3, e1rm: null, tempo: null, recomputeWarning: null });
    await act(async () => button("Add set").click());
    expect(logSet).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "open", programSlotId: "slot", weight: 50, reps: 8, rir: 2,
    }));
  });

  it("shows the actual count beyond the target", async () => {
    await render(4);
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Done 4/3");
  });

  it("reopens progress when a deletion or phase prescription leaves sets remaining", async () => {
    await render(3);
    await render(2);
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Sets 2/3");
    expect(button("Log set")).toBeDefined();
    await render(2, 2);
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Done 2/2");
  });

  it("reverts optimistic completion when the final set fails to save", async () => {
    await render(2);
    let rejectWrite!: (error: Error) => void;
    vi.mocked(logSet).mockImplementation(() => new Promise((_, reject) => { rejectWrite = reject; }));
    await act(async () => button("Log set").click());
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Done 3/3");
    expect(button("Add set").disabled).toBe(true);
    await act(async () => rejectWrite(new Error("Save failed")));
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Sets 2/3");
    expect(button("Log set").disabled).toBe(false);
    expect(host.textContent).toContain("Couldn’t save that set.");
  });
});
