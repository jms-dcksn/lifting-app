import type {
  CoachExceptionCandidate,
  CoachExceptionSignal,
} from "./coach-exceptions";
import type { EffectiveWorkoutTarget } from "./effective-workout-target";

export const EPISODE_DEFAULTS_VERSION = "episodes-v1";
export const EVIDENCE_DAYS = 90;
export const FRESHNESS_DAYS = 21;
export type CoachCategory = "pain" | "reduction" | "plateau" | "decline";
export type EpisodeValidity =
  | "current"
  | "stale"
  | "invalidated"
  | "blocked_by_pain";
export interface CoachPreferences {
  pain: boolean;
  reduction: boolean;
  plateau: boolean;
  decline: boolean;
  quietEnabled: boolean;
  quietStart: number;
  quietEnd: number;
  timeZone: string;
}
export const DEFAULT_COACH_PREFERENCES: CoachPreferences = {
  pain: true,
  reduction: true,
  plateau: true,
  decline: true,
  quietEnabled: false,
  quietStart: 1320,
  quietEnd: 420,
  timeZone: "America/Chicago",
};
export interface EpisodeEvidence {
  candidate: CoachExceptionCandidate;
  name: string;
  values: Array<{
    id: string;
    weight: number;
    reps: number;
    rir: number | null;
    e1rm: number | null;
  }>;
  effectiveTarget: EffectiveWorkoutTarget | null;
}
export interface CoachEpisode {
  contextKey: string;
  family: "session_pain" | "lift_performance";
  occurrence: number;
  revision: number;
  state: "open" | "resolved" | "superseded";
  validity: EpisodeValidity;
  evidence: EpisodeEvidence | null;
  fingerprint: string;
  attentionHistory: string[];
  frontier: string[];
  terminalReason: string | null;
  snoozeSourceIds: string[] | null;
}
export interface EpisodeObservation {
  contextKey: string;
  evidence: EpisodeEvidence | null;
  // Absence is never recovery. The source adapter supplies an explicit assessment.
  disposition:
    | "current"
    | "stale"
    | "recovered"
    | "invalidated"
    | "superseded"
    | "snoozed";
  frontier: string[];
  snoozeSourceIds?: string[];
}
export interface PlannedNotice {
  contextKey: string;
  occurrence: number;
  attentionKey: string;
  category: CoachCategory;
  title: string;
  body: string;
  evidence: EpisodeEvidence;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function episodeContextKey(candidate: CoachExceptionCandidate): string {
  return candidate.scope.kind === "session"
    ? "session_pain:v1"
    : `lift:v1:${canonicalJson({ slotId: candidate.scope.slotId, ...candidate.scope.context })}`;
}
export function signalCategory(signal: CoachExceptionSignal): CoachCategory {
  return signal.reason === "significant_pain"
    ? "pain"
    : signal.reason === "confirmed_plateau"
      ? "plateau"
      : signal.reason === "sustained_decline"
        ? "decline"
        : "reduction";
}
const rank: Record<CoachCategory, number> = {
  pain: 0,
  reduction: 1,
  plateau: 2,
  decline: 3,
};
function attentionKey(signal: CoachExceptionSignal): string {
  if (signal.reason === "confirmed_plateau")
    return `plateau:${signal.action}:${"repBand" in signal ? canonicalJson(signal.repBand) : ""}`;
  return signalCategory(signal);
}
export function quietAt(preferences: CoachPreferences, now: Date): boolean {
  if (!preferences.quietEnabled) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: preferences.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const minute =
    Number(parts.find((p) => p.type === "hour")!.value) * 60 +
    Number(parts.find((p) => p.type === "minute")!.value);
  return preferences.quietStart < preferences.quietEnd
    ? minute >= preferences.quietStart && minute < preferences.quietEnd
    : minute >= preferences.quietStart || minute < preferences.quietEnd;
}
export function validateCoachPreferences(
  input: CoachPreferences,
): CoachPreferences {
  for (const key of [
    "pain",
    "reduction",
    "plateau",
    "decline",
    "quietEnabled",
  ] as const) {
    if (typeof input[key] !== "boolean")
      throw new Error("Choose valid notification preferences.");
  }
  if (
    ![input.quietStart, input.quietEnd].every(
      (v) => Number.isInteger(v) && v >= 0 && v < 1440,
    ) ||
    input.quietStart === input.quietEnd
  )
    throw new Error("Choose different quiet-hour start and end times.");
  if (typeof input.timeZone !== "string" || input.timeZone.length > 100)
    throw new Error("Choose a valid timezone.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format();
  } catch {
    throw new Error("Choose a valid timezone.");
  }
  return {
    pain: input.pain,
    reduction: input.reduction,
    plateau: input.plateau,
    decline: input.decline,
    quietEnabled: input.quietEnabled,
    quietStart: input.quietStart,
    quietEnd: input.quietEnd,
    timeZone: input.timeZone,
  };
}
export function exceptionCopy(
  evidence: EpisodeEvidence,
  category: CoachCategory,
) {
  switch (category) {
    case "pain":
      return {
        title: "Pain review",
        body: "Significant pain was reported. Review the session context; no pain-specific load change has been calculated.",
      };
    case "reduction":
      return {
        title: `${evidence.name}: effort review`,
        body: "Repeated comparable sets support a lower calculated target. Review the evidence and current workout suggestion.",
      };
    case "plateau":
      return {
        title: `${evidence.name}: plateau review`,
        body: "Comparable exposures support a plateau review. A rep-range change or replacement still needs your confirmation.",
      };
    case "decline":
      return {
        title: `${evidence.name}: trend review`,
        body: "Recent comparable exposures show a sustained decline. Review the evidence before choosing a change.",
      };
  }
}

/** Pure transitions. Persistence supplies a CAS revision and preserves notice read/ack state. */
export function planCoachEpisodes(input: {
  previous: CoachEpisode[];
  observations: EpisodeObservation[];
  preferences: CoachPreferences;
}) {
  const episodes: CoachEpisode[] = [];
  const notices: PlannedNotice[] = [];
  const byKey = new Map(input.observations.map((o) => [o.contextKey, o]));
  const keys = new Set([
    ...input.previous.map((e) => e.contextKey),
    ...byKey.keys(),
  ]);
  for (const contextKey of [...keys].sort()) {
    const old = input.previous.find((e) => e.contextKey === contextKey);
    const observation = byKey.get(contextKey);
    if (!observation && !old) continue;
    const evidence = observation?.evidence ?? null;
    const disposition = observation?.disposition ?? "stale";
    const sourceIds = observation?.frontier ?? old?.frontier ?? [];
    const genuinelyNew =
      old != null && sourceIds.some((id) => !old.frontier.includes(id));
    const recurrence =
      old != null &&
      old.state !== "open" &&
      genuinelyNew &&
      disposition === "current";
    // An explicit pain-end covers its source frontier, including replay/corrections.
    if (old?.terminalReason === "user_reported_ended" && !genuinelyNew) {
      episodes.push(structuredClone(old));
      continue;
    }
    if (old && old.state !== "open" && disposition === "stale") {
      episodes.push(structuredClone(old));
      continue;
    }
    const next: CoachEpisode = old
      ? structuredClone(old)
      : {
          contextKey,
          family:
            contextKey === "session_pain:v1"
              ? "session_pain"
              : "lift_performance",
          occurrence: 1,
          revision: 0,
          state: "open",
          validity: "current",
          evidence: null,
          fingerprint: "",
          attentionHistory: [],
          frontier: [],
          terminalReason: null,
          snoozeSourceIds: null,
        };
    if (recurrence) {
      next.occurrence++;
      next.attentionHistory = [];
    }
    if (disposition === "current" && evidence) {
      next.state = "open";
      next.validity = "current";
      next.terminalReason = null;
      next.evidence = evidence;
      next.snoozeSourceIds = null;
      const signals = [...evidence.candidate.signals].sort(
        (a, b) => rank[signalCategory(a)] - rank[signalCategory(b)],
      );
      const attention: Array<{ key: string; category: CoachCategory }> = [];
      for (const signal of signals) {
        const category = signalCategory(signal);
        const keys =
          category === "pain"
            ? signal.sources.map((s) => `pain:${s.sessionId}`)
            : [attentionKey(signal)];
        const oldRanks = next.attentionHistory.map(
          (k) => rank[k.split(":")[0] as CoachCategory] ?? 4,
        );
        const eligible =
          category === "pain" ||
          !oldRanks.length ||
          rank[category] < Math.min(...oldRanks) ||
          (category === "plateau" &&
            next.attentionHistory.some((k) => k.startsWith("plateau:")));
        for (const key of keys) {
          if (!next.attentionHistory.includes(key) && eligible)
            attention.push({ key, category });
          // Suppressed categories/corrections are considered, never replayed on enable.
          if (!next.attentionHistory.includes(key))
            next.attentionHistory.push(key);
        }
      }
      const deliver = attention.filter((a) => input.preferences[a.category]);
      if (deliver.length && (!old || old.state === "open" || recurrence)) {
        const category = deliver[0].category;
        notices.push({
          contextKey,
          occurrence: next.occurrence,
          attentionKey: deliver
            .map((a) => a.key)
            .sort()
            .join("|"),
          category,
          ...exceptionCopy(evidence, category),
          evidence,
        });
      }
    } else if (disposition === "recovered") {
      next.state = "resolved";
      next.validity = "current";
      next.terminalReason = "fresh_comparable_recovery";
    } else if (disposition === "superseded" || disposition === "invalidated") {
      next.state = "superseded";
      next.validity = disposition === "invalidated" ? "invalidated" : "stale";
      next.terminalReason =
        disposition === "invalidated"
          ? "source_corrected_or_deleted"
          : "context_changed";
      // Privacy redaction applies to generation snapshots at persistence too.
      next.evidence = null;
    } else {
      next.validity = "stale";
      if (evidence) next.evidence = evidence;
      if (disposition === "snoozed")
        next.snoozeSourceIds = observation?.snoozeSourceIds ?? sourceIds;
    }
    next.frontier = [...new Set([...next.frontier, ...sourceIds])].sort();
    next.attentionHistory.sort();
    episodes.push(next);
  }
  const pain = episodes.some(
    (e) => e.family === "session_pain" && e.state === "open",
  );
  for (const episode of episodes) {
    if (
      pain &&
      episode.family === "lift_performance" &&
      episode.state === "open"
    )
      episode.validity = "blocked_by_pain";
    const old = input.previous.find((e) => e.contextKey === episode.contextKey);
    episode.fingerprint = canonicalJson({
      evidence: episode.evidence,
      state: episode.state,
      validity: episode.validity,
      terminalReason: episode.terminalReason,
      snoozeSourceIds: episode.snoozeSourceIds,
      frontier: episode.frontier,
      attentionHistory: episode.attentionHistory,
      occurrence: episode.occurrence,
    });
    episode.revision =
      (old?.revision ?? 0) + (episode.fingerprint !== old?.fingerprint ? 1 : 0);
  }
  return { episodes, notices };
}
