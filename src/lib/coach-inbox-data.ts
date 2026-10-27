import "server-only";
import { parseCoachEpisode, parseCoachPreferences, parseRefreshResult, parseEpisodeEvidence, requireCoachVersion } from "./coach-storage";
import { collectIdPages } from "./pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import { mergeCatalog } from "./catalog";
import {
  currentCoachSlots,
  observeCoachEpisodes,
} from "./coach-episode-evidence";
import {
  DEFAULT_COACH_PREFERENCES,
  planCoachEpisodes,
  type CoachEpisode,
  type CoachPreferences,
} from "./coach-episodes";
import { signCoachCommand } from "./coach-episode-command";
import type { CoachExceptionInput } from "./coach-exceptions";
import type { StallAdaptation } from "./stall-report";
import { z } from "zod";

type Client = SupabaseClient<Database>;
type SourceTable =
  | "program"
  | "program_day"
  | "program_slot"
  | "program_phase"
  | "movement_adaptation"
  | "workout_session"
  | "set_log"
  | "exercise"
  | "coach_episode";
type SourceRow<T extends SourceTable> = T extends "workout_session"
  ? Pick<Database["public"]["Tables"][T]["Row"], "id" | "user_id" | "program_id" | "program_day_id" | "performed_at" | "finished_at" | "week_index" | "is_deload" | "joint_pain" | "exercise_swaps">
  : Database["public"]["Tables"][T]["Row"];
export type CoachNoticeRow = Omit<Database["public"]["Tables"]["coach_notice"]["Row"], "generation_evidence"> & {
  generation_evidence: import("./coach-episodes").EpisodeEvidence | null;
};
export function parseCoachNotice(row: Database["public"]["Tables"]["coach_notice"]["Row"]): CoachNoticeRow {
  return { ...row, generation_evidence: row.redacted || row.generation_evidence === null ? null : parseEpisodeEvidence(row.generation_evidence) };
}
export interface InboxPage {
  notices: CoachNoticeRow[];
  nextCursor: string | null;
  unread: number;
  preferences: CoachPreferences;
  preferencesVersion: number;
  stale: boolean;
}
export type RefreshResult = {
  status: "ready" | "refresh_required" | "unavailable" | "disabled";
  arrival?: { id: string; title: string } | null;
};
export function coachInboxEnabled() {
  return process.env.COACH_INBOX_ENABLED === "true";
}

// UUID pagination does not assume the API honors our requested page size.
export async function coachSourceRows<T extends SourceTable>(
  db: Client,
  userId: string,
  table: T,
) {
  return collectIdPages(async after => {
    // Explicit projection excludes notes and period observations from Coach evidence.
    const selection = table === "workout_session"
      ? "id,user_id,program_id,program_day_id,performed_at,finished_at,week_index,is_deload,joint_pain,exercise_swaps" : "*";
    let query = db.from(table as SourceTable).select(selection).eq("user_id", userId).order("id").limit(500);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw new Error("Unable to refresh Coach. Please try again.");
    return (data ?? []) as unknown as SourceRow<T>[];
  });
}
export async function coachStateSnapshot(db: Client, userId: string) {
  const [state, prefs, episodes] = await Promise.all([
    db
      .from("coach_refresh_state")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("coach_preferences")
      .select("settings,version")
      .eq("user_id", userId)
      .maybeSingle(),
    coachSourceRows(db, userId, "coach_episode"),
  ]);
  if (state.error || prefs.error)
    throw new Error("Unable to load Coach. Please try again.");
  requireCoachVersion(state.data?.defaults_version);
  return {
    sourceRevision: state.data?.source_revision ?? 0,
    reconciledRevision: state.data?.reconciled_revision ?? -1,
    stateVersion: state.data?.state_version ?? 0,
    bootstrap: state.data?.bootstrap_at == null,
    preferencesVersion: prefs.data?.version ?? 0,
    preferences: prefs.data
      ? parseCoachPreferences(prefs.data.settings, state.data?.defaults_version)
      : DEFAULT_COACH_PREFERENCES,
    previous: episodes.map((e) => parseCoachEpisode(e.data, state.data?.defaults_version)),
    episodes,
  };
}
export async function loadCoachEvidence(
  db: Client,
  userId: string,
  now: Date,
  previous: CoachEpisode[],
  bootstrap = true,
) {
  const [
    sessions,
    sets,
    programs,
    days,
    slots,
    phases,
    adaptations,
    catalog,
    stats,
    weights,
    profile,
  ] = await Promise.all([
    coachSourceRows(db, userId, "workout_session"),
    coachSourceRows(db, userId, "set_log"),
    coachSourceRows(db, userId, "program"),
    coachSourceRows(db, userId, "program_day"),
    coachSourceRows(db, userId, "program_slot"),
    coachSourceRows(db, userId, "program_phase"),
    coachSourceRows(db, userId, "movement_adaptation"),
    // A revision retry must not reuse React's request-cached catalog snapshot.
    coachSourceRows(db, userId, "exercise").then(mergeCatalog),
    db
      .from("user_exercise_stat")
      .select(
        "exercise_id,current_e1rm,personal_coefficient,coeff_confidence_n",
      )
      .eq("user_id", userId),
    db
      .from("bodyweight_log")
      .select("weight")
      .eq("user_id", userId)
      .order("logged_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("profile").select("bodyweight").eq("id", userId).maybeSingle(),
  ]);
  if (stats.error || weights.error || profile.error)
    throw new Error("Unable to load Coach evidence.");
  const program = programs.find((p) => p.is_active);
  const dayById = new Map(days.map((d) => [d.id, d]));
  const history: CoachExceptionInput["history"] = {
    userId,
    sessions: sessions.map((s) => ({
      id: s.id,
      performedAt: s.performed_at,
      finishedAt: s.finished_at,
      programId: s.program_id,
      programDayId: s.program_day_id,
      weekIndex: s.week_index,
      isDeload: s.is_deload,
    })),
    sets: sets.flatMap((s) => {
      const session = sessions.find((session) => session.id === s.session_id);
      return session
        ? [
            {
              ...s,
              workout_session: {
                performed_at: session.performed_at,
                finished_at: session.finished_at,
              },
            },
          ]
        : [];
    }),
    slots: slots.filter(s=>!s.retired_at).flatMap((s) => {
      const day = dayById.get(s.program_day_id);
      return day
        ? [
            {
              id: s.id,
              programId: day.program_id,
              programDayId: day.id,
              exerciseId: s.exercise_id,
              targetSets: s.target_sets,
              repMin: s.rep_min,
              repMax: s.rep_max,
              targetRir: s.target_rir,
              plateauPatience: s.plateau_patience,
            },
          ]
        : [];
    }),
    phases: phases.map((p) => ({
      id: p.id,
      programId: p.program_id,
      position: p.position,
      name: p.name,
      description: p.description,
      weekStart: p.week_start,
      weekEnd: p.week_end,
      targetRirMin: p.target_rir_min,
      targetRirMax: p.target_rir_max,
      setMultiplier: p.set_multiplier,
      isDeload: p.is_deload,
    })),
    adaptations: adaptations.map((a) => ({
      id: a.id,
      slotId: a.program_slot_id,
      exerciseId: a.exercise_id,
      action: a.action as StallAdaptation["action"],
      newExerciseId: a.new_exercise_id,
      newRepMin: a.new_rep_min,
      newRepMax: a.new_rep_max,
      createdAt: a.created_at,
    })),
  };
  const open = sessions
    .filter((s) => s.program_id === program?.id && s.finished_at == null)
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at))[0];
  const choices =
    open?.exercise_swaps &&
    typeof open.exercise_swaps === "object" &&
    !Array.isArray(open.exercise_swaps)
      ? Object.fromEntries(
          Object.entries(open.exercise_swaps).filter(
            (e): e is [string, string] => typeof e[1] === "string",
          ),
        )
      : {};
  const currentSlots = currentCoachSlots({
    history,
    activeProgramId: program?.id ?? null,
    style: program?.style === "fluid" ? "fluid" : "classic",
    days: days.filter((d) => d.program_id === program?.id),
    open: open
      ? { dayId: open.program_day_id, week: open.week_index, choices }
      : null,
    asOf: now,
    definitions: catalog,
  });
  return observeCoachEpisodes({
    history,
    definitions: catalog,
    currentSlots,
    activeProgramId: program?.id ?? null,
    feedback: sessions.map((s) => ({
      sessionId: s.id,
      jointPain: s.joint_pain as "none" | "mild" | "significant" | null,
    })),
    asOf: now,
    evidenceSince: new Date(0),
    previous,
    bootstrap,
    names: Object.fromEntries(
      Object.values(catalog).map((d) => [d.id, d.name]),
    ),
    stats: (stats.data ?? []).map((s) => ({
      exerciseId: s.exercise_id,
      currentE1rm: s.current_e1rm ?? 0,
      personalCoefficient: s.personal_coefficient,
      confidenceN: s.coeff_confidence_n,
    })),
    bodyweight: weights.data?.weight ?? profile.data?.bodyweight ?? null,
  });
}
export async function refreshCoachInbox(
  db: Client,
  userId: string,
  allowArrival = false,
): Promise<RefreshResult> {
  if (!coachInboxEnabled()) return { status: "disabled" };
  // Notification processing is best effort after training; never throw into a saved write.
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const now = new Date();
      const snapshot = await coachStateSnapshot(db, userId);
      const observations = await loadCoachEvidence(
        db,
        userId,
        now,
        snapshot.previous,
        snapshot.bootstrap,
      );
      const plan = planCoachEpisodes({
        previous: snapshot.previous,
        observations,
        preferences: snapshot.preferences,
      });
      const command = signCoachCommand(
        {
          owner: userId,
          operation: "refresh",
          sourceRevision: snapshot.sourceRevision,
          stateVersion: snapshot.stateVersion,
          preferencesVersion: snapshot.preferencesVersion,
          ...plan,
          allowArrival,
        },
        now,
      );
      const { data, error } = await db.rpc("reconcile_coach_episodes", command);
      if (error) return { status: "unavailable" };
      const result = parseRefreshResult(data);
      if (result.status !== "refresh_required") return result;
    }
    return { status: "refresh_required" };
  } catch {
    return { status: "unavailable" };
  }
}
const cursorSchema = z.object({
  at: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});
export async function loadCoachInbox(
  db: Client,
  userId: string,
  cursor?: string,
): Promise<InboxPage> {
  let query = db
    .from("coach_notice")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (cursor) {
    const c = cursorSchema.parse(JSON.parse(cursor));
    query = query.or(
      `created_at.lt.${c.at},and(created_at.eq.${c.at},id.lt.${c.id})`,
    );
  }
  const [page, unread, state, prefs] = await Promise.all([
    query,
    db
      .from("coach_notice")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
    db
      .from("coach_refresh_state")
      .select("source_revision,reconciled_revision,defaults_version")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("coach_preferences")
      .select("settings,version")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (page.error || unread.error || state.error || prefs.error)
    throw new Error("Unable to load the inbox. Please retry.");
  requireCoachVersion(state.data?.defaults_version);
  const notices = (page.data ?? []).slice(0, 50).map(parseCoachNotice);
  const last = notices.at(-1);
  return {
    notices,
    nextCursor:
      (page.data?.length ?? 0) > 50 && last
        ? JSON.stringify({ at: last.created_at, id: last.id })
        : null,
    unread: unread.count ?? 0,
    preferences: prefs.data
      ? parseCoachPreferences(prefs.data.settings, state.data?.defaults_version)
      : DEFAULT_COACH_PREFERENCES,
    preferencesVersion: prefs.data?.version ?? 0,
    stale: state.data
      ? state.data.source_revision !== state.data.reconciled_revision
      : false,
  };
}
export async function reportPainEnded(
  db: Client,
  userId: string,
  episodeId: string,
  expectedRevision: number,
) {
  z.uuid().parse(episodeId);
  const refreshed = await refreshCoachInbox(db, userId);
  if (refreshed.status !== "ready")
    throw new Error("Refresh Coach before ending this review.");
  const snapshot = await coachStateSnapshot(db, userId);
  const episode = snapshot.episodes.find((e) => e.id === episodeId);
  if (
    !episode ||
    episode.family !== "session_pain" ||
    episode.revision !== expectedRevision
  )
    throw new Error("This review changed. Reload before confirming.");
  const { error } = await db.rpc(
    "end_coach_pain_episode",
    signCoachCommand({
      owner: userId,
      operation: "pain_end",
      episodeId,
      episodeRevision: expectedRevision,
      sourceRevision: snapshot.sourceRevision,
      stateVersion: snapshot.stateVersion,
    }),
  );
  if (error) throw new Error("This review changed. Reload before confirming.");
}
export function coachJson(value: unknown): Json {
  return value as Json;
}
