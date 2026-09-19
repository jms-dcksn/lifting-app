// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveVolumeExerciseId } from "./analytics";
import {
  VolumeExercisePicker,
  volumePageHref,
} from "@/app/(app)/analytics/volume/volume-exercise-picker";
import type { ExerciseListItem } from "@/app/(app)/analytics/exercise-list";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  client: vi.fn(),
  catalog: vi.fn(),
  bodyweight: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...props }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/catalog", () => ({ getCatalogMap: mocks.catalog }));
vi.mock("@/lib/current-bodyweight", () => ({ getCurrentBodyweight: mocks.bodyweight }));
vi.mock("@/app/(app)/analytics/volume-chart", () => ({
  VolumeChart: ({ data }: { data: { tonnage: number }[] }) => (
    <div data-testid="volume-chart">{data.map((point) => point.tonnage).join(",")}</div>
  ),
}));

const goblet: ExerciseListItem = {
  exerciseId: "db-goblet-squat",
  equipmentInstanceId: null,
  name: "Goblet squat",
  pattern: "squat",
  currentE1rm: 120,
  bestE1rm: 120,
  lastPerformedAt: "2026-09-16T12:00:00Z",
  sessionCount: 12,
  delta: 5,
};

const hipThrust: ExerciseListItem = {
  exerciseId: "hip-thrust",
  equipmentInstanceId: "cybex",
  name: "Hip thrust",
  pattern: "hip_thrust",
  currentE1rm: 250,
  bestE1rm: 250,
  lastPerformedAt: "2026-09-14T12:00:00Z",
  sessionCount: 11,
  delta: null,
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

describe("resolveVolumeExerciseId", () => {
  const known = new Set(["bb-bench", "db-goblet-squat"]);

  it("keeps a logged exercise id", () => {
    expect(resolveVolumeExerciseId("db-goblet-squat", known)).toBe("db-goblet-squat");
  });

  it("falls back to all training for an unknown id", () => {
    expect(resolveVolumeExerciseId("not-a-lift", known)).toBeNull();
  });

  it("falls back to all training for a missing or repeated query", () => {
    expect(resolveVolumeExerciseId(undefined, known)).toBeNull();
    expect(resolveVolumeExerciseId("", known)).toBeNull();
    expect(resolveVolumeExerciseId(["bb-bench", "db-goblet-squat"], known)).toBeNull();
  });
});

describe("volumePageHref", () => {
  it("drops the query for all training and encodes an exercise id", () => {
    expect(volumePageHref(null)).toBe("/analytics/volume");
    expect(volumePageHref("bb-bench")).toBe("/analytics/volume?exercise=bb-bench");
    expect(volumePageHref("hack-squat__foo__bar")).toBe(
      "/analytics/volume?exercise=hack-squat__foo__bar",
    );
  });
});

describe("VolumeExercisePicker", () => {
  it("stays on Volume and does not link to Exercise review", () => {
    act(() => {
      root.render(<VolumeExercisePicker items={[goblet, hipThrust]} selectedId={null} />);
    });

    expect(host.querySelector('a[href="/analytics/volume"][aria-pressed="true"]')?.textContent).toBe(
      "All training",
    );
    expect(host.querySelector('a[href="/analytics/volume?exercise=db-goblet-squat"]')?.textContent)
      .toContain("Goblet squat");
    expect(host.querySelector('a[href^="/history/"]')).toBeNull();
    expect(host.querySelectorAll('a[aria-pressed]')).toHaveLength(1);
  });

  it("shows the selected name chip and keeps All training as the clear target", () => {
    act(() => {
      root.render(<VolumeExercisePicker items={[goblet, hipThrust]} selectedId="db-goblet-squat" />);
    });

    const chips = [...host.querySelectorAll("a[aria-pressed]")];
    expect(chips.map((chip) => [chip.getAttribute("href"), chip.getAttribute("aria-pressed"), chip.textContent])).toEqual([
      ["/analytics/volume", "false", "All training"],
      ["/analytics/volume?exercise=db-goblet-squat", "true", "Goblet squat"],
    ]);
    expect(
      host.querySelector('a[href="/analytics/volume?exercise=db-goblet-squat"][aria-current="page"]')
        ?.textContent,
    ).toContain("Goblet squat");
  });

  it("filters the search list the same way All lifts does", () => {
    act(() => {
      root.render(<VolumeExercisePicker items={[goblet, hipThrust]} selectedId={null} />);
    });
    const input = host.querySelector("input");
    expect(input).toBeTruthy();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setValue?.call(input, "hip");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("Hip thrust");
    expect(host.textContent).not.toContain("Goblet squat");
  });
});

describe("VolumePage query", () => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve({ data: setRows, error: null })),
  };
  let setRows: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    setRows = [
      {
        id: "bench",
        session_id: "s1",
        exercise_id: "bb-bench",
        equipment_instance_id: null,
        weight: 100,
        reps: 8,
        rir: 1,
        e1rm: 140,
        created_at: "2026-09-02T12:05:00Z",
        is_warmup: false,
        program_slot_id: null,
        set_index: 1,
        workout_session: {
          performed_at: "2026-09-02T12:00:00Z",
          finished_at: "2026-09-02T13:00:00Z",
          program_id: null,
        },
      },
      {
        id: "squat",
        session_id: "s1",
        exercise_id: "bb-back-squat",
        equipment_instance_id: null,
        weight: 200,
        reps: 5,
        rir: 1,
        e1rm: 230,
        created_at: "2026-09-02T12:10:00Z",
        is_warmup: false,
        program_slot_id: null,
        set_index: 2,
        workout_session: {
          performed_at: "2026-09-02T12:00:00Z",
          finished_at: "2026-09-02T13:00:00Z",
          program_id: null,
        },
      },
    ];
    mocks.client.mockResolvedValue({
      auth: { getClaims: async () => ({ data: { claims: { sub: "user" } } }) },
      from: () => query,
    });
    mocks.catalog.mockResolvedValue(EXERCISE_BY_ID);
    mocks.bodyweight.mockResolvedValue(null);
  });

  async function renderPage(exercise?: string) {
    const { default: VolumePage } = await import("@/app/(app)/analytics/volume/page");
    const page = await VolumePage({
      searchParams: Promise.resolve(exercise ? { exercise } : {}),
    });
    act(() => {
      root.render(page);
    });
  }

  it("keeps all training when the exercise query is unknown", async () => {
    await renderPage("not-a-lift");
    expect(host.textContent).toContain("Total volume");
    expect(host.textContent).toContain("1,800 lb");
    expect(host.querySelector('a[href="/analytics/volume"][aria-pressed="true"]')?.textContent).toBe(
      "All training",
    );
  });

  it("redraws weekly tonnage for a known exercise", async () => {
    await renderPage("bb-bench");
    expect(host.textContent).toContain("Barbell Bench Press");
    expect(host.textContent).toContain("800 lb");
    expect(host.textContent).not.toContain("Total volume");
    expect(
      host.querySelector('a[href="/analytics/volume?exercise=bb-bench"][aria-pressed="true"]')
        ?.textContent,
    ).toContain("Barbell Bench Press");
  });
});
