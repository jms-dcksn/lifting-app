import {
  classifyCoachExceptions,
  type CoachExceptionInput,
  type CurrentCoachExceptionSlot,
} from "./coach-exceptions";
import {
  canonicalJson,
  episodeContextKey,
  EVIDENCE_DAYS,
  FRESHNESS_DAYS,
  type CoachEpisode,
  type EpisodeEvidence,
  type EpisodeObservation,
} from "./coach-episodes";
import { buildStallAssessments, stallContext } from "./stall-report";
import {
  buildWorkoutTargetHistory,
  resolveEffectiveWorkoutTarget,
} from "./effective-workout-target";
import { foldPrescription, SNOOZE_EXPOSURES } from "./strength/plateau";
import { resolvePrescription } from "./periodization";
import type { ExerciseStat } from "./strength/recommend";

const DAY = 86_400_000;
/** Complete owner snapshot only: query errors must abort, never masquerade as recovery. */
export function observeCoachEpisodes(
  input: CoachExceptionInput & {
    previous: CoachEpisode[];
    bootstrap?: boolean;
    names: Record<string, string>;
    stats: ExerciseStat[];
    bodyweight: number | null;
  },
) {
  const since = new Date(input.asOf.getTime() - EVIDENCE_DAYS * DAY);
  const fresh = input.asOf.getTime() - FRESHNESS_DAYS * DAY;
  const history = input.history;
  const assessments = buildStallAssessments(
    history,
    input.definitions,
    input.asOf,
  );
  // Pain may suppress the classifier's performance output, but persisted lift evidence
  // must still be assessed. Delivery precedence is applied by the episode layer.
  const performance = classifyCoachExceptions({
    ...input,
    evidenceSince: since,
    feedback: [],
  });
  const painIds = new Set(
    input.previous
      .filter((e) => e.family === "session_pain" && e.state === "open")
      .flatMap(
        (e) =>
          e.evidence?.candidate.signals.flatMap((s) =>
            s.sources.map((source) => source.sessionId),
          ) ?? [],
      ),
  );
  const painful = history.sessions.filter(
    (s) =>
      input.feedback.some(
        (f) => f.sessionId === s.id && f.jointPain === "significant",
      ) &&
      (Date.parse(s.performedAt) >=
        (input.bootstrap === false ? since.getTime() : fresh) ||
        painIds.has(s.id)),
  );
  const pain = painful.length
    ? classifyCoachExceptions({
        ...input,
        evidenceSince: new Date(0),
        feedback: input.feedback.filter((f) =>
          painful.some((s) => s.id === f.sessionId),
        ),
      }).filter((c) => c.scope.kind === "session")
    : [];
  const candidates = [...pain, ...performance];
  const targets = buildWorkoutTargetHistory(
    history,
    input.definitions,
    input.asOf,
  );
  const observations: EpisodeObservation[] = [];
  for (const candidate of candidates) {
    const contextKey = episodeContextKey(candidate);
    const scope = candidate.scope;
    const slot =
      scope.kind === "lift"
        ? history.slots.find((s) => s.id === scope.slotId)
        : null;
    const current =
      scope.kind === "lift"
        ? input.currentSlots.find((s) => s.slotId === scope.slotId)
        : null;
    const folded = slot
      ? foldPrescription(
          slot,
          history.adaptations.filter((a) => a.slotId === slot.id),
        )
      : null;
    const prescription =
      slot && folded && current
        ? resolvePrescription(
            { ...slot, repMin: folded.repMin, repMax: folded.repMax },
            current.weekIndex,
            history.phases.filter((p) => p.programId === slot.programId),
          )
        : null;
    const sourceSetIds = new Set(
      candidate.signals.flatMap((s) => s.sources.flatMap((s) => s.setIds)),
    );
    const evidence: EpisodeEvidence = {
      candidate,
      name:
        scope.kind === "session"
          ? "Pain review"
          : (input.names[scope.context.exerciseId] ?? scope.context.exerciseId),
      values: history.sets
        .filter((s) => sourceSetIds.has(s.id))
        .map((s) => ({
          id: s.id,
          weight: s.weight!,
          reps: s.reps!,
          rir: s.rir,
          e1rm: s.e1rm,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      effectiveTarget:
        prescription && scope.kind === "lift"
          ? resolveEffectiveWorkoutTarget({
              slotId: scope.slotId,
              exerciseId: scope.context.exerciseId,
              equipmentInstanceId: scope.context.equipmentInstanceId,
              prescription,
              context: scope.context,
              history: targets,
              catalog: input.definitions,
              stats: input.stats,
              bodyweight: input.bodyweight,
            })
          : null,
    };
    // Store all comparable IDs, not just the signal's last two/four, for correction replay.
    const frontier =
      scope.kind === "session"
        ? scope.sessionIds
        : (assessments
            .find((a) => a.slotId === scope.slotId)
            ?.points.map((p) => p.sessionId) ?? []);
    observations.push({
      contextKey,
      evidence,
      frontier,
      disposition:
        scope.kind === "lift" && Date.parse(candidate.evidenceEnd) < fresh
          ? "stale"
          : "current",
    });
  }
  for (const old of input.previous) {
    if (observations.some((o) => o.contextKey === old.contextKey)) continue;
    const scope = old.evidence?.candidate.scope;
    if (!scope) {
      observations.push({
        contextKey: old.contextKey,
        evidence: null,
        frontier: old.frontier,
        disposition: "stale",
      });
      continue;
    }
    if (scope.kind === "session") {
      const sources = old.evidence!.candidate.signals.flatMap((s) => s.sources);
      const surviving = sources.filter((source) =>
        input.feedback.some(
          (f) =>
            f.sessionId === source.sessionId && f.jointPain === "significant",
        ),
      );
      // Reopening preserves the review. Deleting/correcting feedback supersedes it.
      observations.push({
        contextKey: old.contextKey,
        evidence: old.evidence,
        frontier: old.frontier,
        disposition: surviving.length ? "stale" : "invalidated",
      });
      continue;
    }
    const current = input.currentSlots.find((s) => s.slotId === scope.slotId);
    const slot = history.slots.find(
      (s) => s.id === scope.slotId && s.programId === input.activeProgramId,
    );
    const folded = slot
      ? foldPrescription(
          slot,
          history.adaptations.filter((a) => a.slotId === slot.id),
        )
      : null;
    const prescription =
      slot && current && folded
        ? resolvePrescription(
            { ...slot, repMin: folded.repMin, repMax: folded.repMax },
            current.weekIndex,
            history.phases.filter((p) => p.programId === slot.programId),
          )
        : null;
    const matches =
      slot &&
      current &&
      folded &&
      prescription &&
      canonicalJson(
        stallContext(
          slot,
          current.exerciseId,
          current.equipmentInstanceId,
          prescription,
          folded.phaseStartAt,
        ),
      ) === canonicalJson(scope.context);
    const assessment = assessments.find((a) => a.slotId === scope.slotId);
    const frontier = assessment?.points.map((p) => p.sessionId) ?? [];
    const hasNew = frontier.some((id) => !old.frontier.includes(id));
    const sourceExists = old.evidence!.candidate.signals.every((signal) =>
      signal.sources.every(
        (source) =>
          history.sessions.some(
            (s) => s.id === source.sessionId && s.finishedAt != null,
          ) &&
          source.setIds.every((id) => history.sets.some((s) => s.id === id)),
      ),
    );
    const sourceCorrected = old.evidence!.values.some((value) => {
      const current = history.sets.find((s) => s.id === value.id);
      return (
        !current ||
        current.is_warmup ||
        current.is_deload ||
        current.weight !== value.weight ||
        current.reps !== value.reps ||
        current.rir !== value.rir ||
        current.e1rm !== value.e1rm
      );
    });
    const recent = assessment?.points.at(-1);
    const required = Math.max(
      ...old.evidence!.candidate.signals.map((s) =>
        s.reason === "confirmed_plateau"
          ? (assessment?.patience ?? 3) + 1
          : s.reason === "sustained_decline"
            ? 4
            : 2,
      ),
    );
    const sufficient =
      (assessment?.points.filter(
        (p) => Date.parse(p.sessionAt) >= since.getTime(),
      ).length ?? 0) >= required;
    const snoozed =
      folded?.lastDismissAt &&
      (assessment?.points.filter(
        (p) => Date.parse(p.sessionAt) > Date.parse(folded.lastDismissAt!),
      ).length ?? 0) < SNOOZE_EXPOSURES;
    observations.push({
      contextKey: old.contextKey,
      evidence: old.evidence,
      frontier,
      disposition:
        !sourceExists || sourceCorrected
          ? "invalidated"
          : slot && !current
            ? "stale"
            : !matches
              ? "superseded"
              : snoozed
                ? "snoozed"
                : recent &&
                    Date.parse(recent.sessionAt) >= fresh &&
                    hasNew &&
                    sufficient
                  ? "recovered"
                  : "stale",
      ...(snoozed ? { snoozeSourceIds: frontier } : {}),
    });
  }
  return observations;
}

/** Next occurrence for every day; raw week changes only identity through prescriptions. */
export function currentCoachSlots(input: {
  history: CoachExceptionInput["history"];
  activeProgramId: string | null;
  style: "classic" | "fluid";
  days: Array<{ id: string; position: number }>;
  open: {
    dayId: string | null;
    week: number | null;
    choices: Record<string, string>;
  } | null;
  asOf: Date;
  definitions: CoachExceptionInput["definitions"];
}): CurrentCoachExceptionSlot[] {
  const completed = input.history.sessions.filter(
    (s) => s.programId === input.activeProgramId && s.finishedAt != null,
  ).length;
  const days = [...input.days].sort((a, b) => a.position - b.position);
  const assessments = buildStallAssessments(
    input.history,
    input.definitions,
    input.asOf,
  );
  return input.history.slots
    .filter((s) => s.programId === input.activeProgramId)
    .flatMap((slot) => {
      const dayIndex = days.findIndex((d) => d.id === slot.programDayId);
      if (dayIndex < 0 || !days.length) return [];
      const open = input.open?.dayId === slot.programDayId ? input.open : null;
      if (open && !open.choices[slot.id]) return [];
      const folded = foldPrescription(
        slot,
        input.history.adaptations.filter((a) => a.slotId === slot.id),
      );
      const exerciseId = open?.choices[slot.id] ?? folded.exerciseId;
      const assessment = assessments.find((a) => a.slotId === slot.id);
      const weekIndex = open
        ? (open.week ?? 1)
        : Math.floor(completed / days.length) +
          1 +
          (dayIndex < completed % days.length ? 1 : 0);
      return [
        {
          slotId: slot.id,
          exerciseId,
          equipmentInstanceId:
            assessment?.exerciseId === exerciseId
              ? assessment.equipmentInstanceId
              : null,
          weekIndex,
          mode: input.style,
        },
      ];
    });
}
