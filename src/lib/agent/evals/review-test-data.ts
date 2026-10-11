import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const REVIEW_NOW = "2026-10-11T18:00:00.000Z";
export const REVIEW_USER = "test-owner";
export function ledgerSet(overrides: Record<string, unknown> = {}) {
  return { id: "set-1", user_id: REVIEW_USER, exercise_id: "bb-back-squat", weight: 200, reps: 5,
    rir: 1, e1rm: 228, session_id: "session-1", created_at: "2026-09-09T18:00:00.000Z",
    equipment_instance_id: null, is_warmup: false, is_deload: false,
    workout_session: { performed_at: "2026-09-09T18:00:00.000Z", finished_at: "2026-09-09T19:00:00.000Z", program_id: null }, ...overrides };
}
export function dbExercise(id: string, name: string, base: string | null, equipment = "machine", pattern = "squat") {
  return { id, name, user_id: REVIEW_USER, pattern, equipment, base_exercise_id: base, brand: null,
    machine_type: null, coefficient: 1, increment: 5, is_reference: false, needs_calibration: false };
}

/** Real PostgREST client against a small owner-filtering transport, without network or credentials. */
export function reviewTestDb(tables: Record<string, Record<string, unknown>[]> = {}) {
  const requests: URL[] = [];
  const client = createClient<Database>("https://fixture.supabase.co", "fixture-publishable", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      const table = url.pathname.split("/").at(-1)!;
      let rows = [...(tables[table] ?? [])];
      for (const [key, value] of url.searchParams) {
        if (value.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === value.slice(3));
        if (value.startsWith("in.(")) {
          const ids = value.slice(4, -1).split(",");
          rows = rows.filter((row) => ids.includes(String(row[key])));
        }
        if (key === "workout_session.finished_at") rows = rows.filter((row) =>
          (row.workout_session as { finished_at: unknown })?.finished_at != null);
      }
      rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { status: 200,
        headers: { "Content-Type": "application/json" } });
    } },
  });
  return { client, requests, tables };
}
