import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  client: vi.fn(),
  catalog: vi.fn(),
  pins: vi.fn(),
  periodEligible: vi.fn(async () => false),
  periodRows: vi.fn(async () => []),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/catalog", () => ({ getCatalogMap: mocks.catalog }));
vi.mock("@/lib/pins-data", () => ({ loadUserPinRows: mocks.pins }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/app/(app)/pins/pin-button", () => ({ PinButton: () => null }));
vi.mock("@/lib/period-calendar", () => ({
  isEligibleForPeriodTracking: mocks.periodEligible,
  loadPeriodObservationsInRange: mocks.periodRows,
}));

import HistoryPage from "@/app/(app)/history/[exerciseId]/page";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  not: vi.fn(() => query),
  in: vi.fn(() => query),
  order: vi.fn(() => query),
  then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve(resolve({ data: setRows, error: null })),
};
let setRows: unknown[] = [];
let instanceRows: { id: string; label: string | null; gym: string | null }[] = [];

const instanceQuery = {
  select: vi.fn(() => instanceQuery),
  eq: vi.fn(() => instanceQuery),
  in: vi.fn(() => instanceQuery),
  then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve(resolve({ data: instanceRows, error: null })),
};

function from(table?: string) {
  return table === "equipment_instance" ? instanceQuery : query;
}

beforeEach(() => {
  vi.clearAllMocks();
  setRows = [];
  instanceRows = [];
  mocks.client.mockResolvedValue({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user" } } }) },
    from,
  });
  mocks.catalog.mockResolvedValue(EXERCISE_BY_ID);
  mocks.pins.mockResolvedValue([]);
  mocks.periodEligible.mockResolvedValue(false);
});

function render(exerciseId: string, search: { month?: string | string[]; equipment?: string }) {
  return HistoryPage({
    params: Promise.resolve({ exerciseId }),
    searchParams: Promise.resolve(search),
  });
}

describe("HistoryPage route", () => {
  it("keeps Exercise review when month is invalid instead of bouncing to Month review", async () => {
    const html = renderToStaticMarkup(await render("bb-bench", { month: "not-a-month" }));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(html).toContain("Barbell Bench Press");
    expect(html).toContain("No working sets logged yet.");
    expect(html).not.toContain("/analytics/month");
    expect(html).not.toContain("Month review could not load");
  });

  it("keeps Exercise review for a valid month query and adds the back link", async () => {
    const html = renderToStaticMarkup(await render("bb-bench", { month: "2026-09", equipment: "none" }));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(html).toContain("Barbell Bench Press");
    expect(html).toContain("No working sets logged yet.");
    expect(html).toContain('href="/analytics/month?month=2026-09"');
    expect(html).not.toContain("140.0 lb → 150.0 lb");
  });

  it("uses missing-exercise copy when the id is not in the catalog", async () => {
    mocks.catalog.mockResolvedValue({});
    const html = renderToStaticMarkup(await render("not-a-lift", { month: "2026-09" }));
    expect(html).toContain("Exercise not found");
    expect(html).toContain("This exercise is not in your catalog.");
    expect(html).toContain("Back to 2026-09 month review");
  });

  it("reads finished sessions only and renders Last without loading period data when ineligible", async () => {
    setRows = [{
      id: "r1",
      weight: 100,
      reps: 10,
      rir: 1,
      e1rm: 150,
      session_id: "s1",
      created_at: "2026-09-02T12:05:00Z",
      workout_session: { performed_at: "2026-09-02T12:00:00Z", finished_at: "2026-09-02T13:00:00Z" },
    }];
    const html = renderToStaticMarkup(await render("bb-bench", {}));
    expect(query.not).toHaveBeenCalledWith("workout_session.finished_at", "is", null);
    expect(html).toContain(">Last</h2>");
    expect(html).toContain("150.0 lb");
    expect(html).toContain("Last 8 workouts");
    expect(html).toContain("Month to month");
    expect(html).toContain("150.0 lb");
    expect(mocks.periodRows).not.toHaveBeenCalled();
  });

  it("scopes the set query to the path exercise id, not a station family", async () => {
    await render("bb-bench__flex-fitness__bench", { equipment: "none" });
    expect(query.eq).toHaveBeenCalledWith("exercise_id", "bb-bench__flex-fitness__bench");
    expect(query.eq).not.toHaveBeenCalledWith("exercise_id", "bb-bench");
  });

  it("filters to the requested equipment instance instead of blending", async () => {
    setRows = [
      {
        id: "old",
        weight: 400,
        reps: 8,
        rir: 1,
        e1rm: 500,
        session_id: "s1",
        created_at: "2026-08-01T12:05:00Z",
        exercise_id: "leg-press",
        equipment_instance_id: "hammer",
        workout_session: { performed_at: "2026-08-01T12:00:00Z", finished_at: "2026-08-01T13:00:00Z" },
      },
      {
        id: "new",
        weight: 200,
        reps: 8,
        rir: 1,
        e1rm: 250,
        session_id: "s2",
        created_at: "2026-09-16T12:05:00Z",
        exercise_id: "leg-press",
        equipment_instance_id: "cybex",
        workout_session: { performed_at: "2026-09-16T12:00:00Z", finished_at: "2026-09-16T13:00:00Z" },
      },
    ];
    instanceRows = [
      { id: "hammer", label: "Hammer", gym: null },
      { id: "cybex", label: "Cybex", gym: null },
    ];
    const selected = renderToStaticMarkup(await render("leg-press", { equipment: "hammer" }));
    expect(selected).toContain("500.0 lb");
    expect(selected).not.toContain("250.0 lb");
    expect(selected).toContain("Hammer");
    expect(selected).toContain("Cybex");
    expect(selected).toContain("equipment=cybex");

    const latest = renderToStaticMarkup(await render("leg-press", {}));
    expect(latest).toContain("250.0 lb");
    expect(latest).not.toContain("500.0 lb");
    expect(latest).toContain("Cybex");
  });
});
