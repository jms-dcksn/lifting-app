import { tool } from "langchain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/types";
import { activeProgram } from "./active-program";
import { exerciseReview } from "./exercise-review";
import { nextWorkout } from "./next-workout";
import {
  openCoachCheckIn,
  openExerciseReview,
  openProgram,
  startNextWorkoutRequest,
} from "./navigation";
import { draftProgramFromIntake } from "./draft-program";
import { weeklyCoach } from "./weekly-coach";
import { calculateE1rm, calculateE1rmSchema } from "./calculate-e1rm";

type Client = SupabaseClient<Database>;

function asJson(value: unknown) {
  return JSON.stringify(value);
}

/** LangChain adapters. Domain functions above are the public interface. */
export function bindAgentTools(supabase: Client, userId: string) {
  return [
    ...bindReadTools(supabase, userId),
    ...bindClientTools(),
    ...bindWriteTools(supabase, userId),
  ];
}

export function bindReadTools(supabase: Client, userId: string) {
  return [
    tool(async (input) => asJson(calculateE1rm(input)), {
      name: "calculateE1rm",
      description:
        "Calculate a hypothetical estimated 1RM from user-supplied load, reps, optional RIR (defaults to 2), explicit kg/lb and load convention, using computeE1rm. Works for any lift without an active program or logged history. Ask for missing/ambiguous units, total vs per-hand load, or bodyweight/assistance; never guess. Machine estimates stay station-specific. Returns inputs, estimate basis and assumptions; never logs a set or creates records/targets. For actual logged e1RM/history use exerciseReview instead.",
      schema: calculateE1rmSchema,
    }),
    tool(async () => asJson(await weeklyCoach(supabase, userId)), {
      name: "weeklyCoach",
      description:
        "Load this week's Track Coach check-in: adherence, trends, proposals, and formatted text. Use for “how was this week?”, proposals, RIR, or bodyweight in the Coach report. If checkInText says not available, a change is null, or a trend is insufficient_data, say that comparison is missing.",
      schema: z.object({}),
    }),
    tool(async () => asJson(await activeProgram(supabase, userId)), {
      name: "activeProgram",
      description:
        "Load the user's active program: name, style, days, and slot prescriptions. Use for “what's my program?”. If program is null, say there is no active program.",
      schema: z.object({}),
    }),
    tool(
      async ({ exerciseId, name, equipmentInstanceId, all, offset, matchOffset, matchKeys }) =>
        asJson(await exerciseReview(supabase, userId, {
          exerciseId: exerciseId || undefined,
          name: name || undefined,
          all, offset, matchOffset, matchKeys,
          equipmentInstanceId: equipmentInstanceId === undefined ? undefined : equipmentInstanceId,
        })),
      {
        name: "exerciseReview",
        description:
          "Return all relevant exercise/movement/station matches with finished non-warmup logged-set counts and eligible e1RM availability. Names accept aliases, plurals and typos; use an id only from focused context or a user-chosen prior match. preferred_history requires disclosure of alternatives, the only-logged-match reason, an evidence-based answer and confirmation. clarification_needed requires choices and an offer of separate summaries. Explicit lifts never substitute. Large match lists have nextMatchOffset and totalMatches; disclose remaining choices and continue or ask to narrow. all: true returns up to three separately labeled reviews per call; nextOffset transparently continues them. Machines/cables/instances stay separate. recentComparison and historicalTrend are independent; a 21-day gap can still have a dated older trend. Deload sets are logged but excluded from comparisons.",
        schema: z.object({
          exerciseId: z.string().optional()
            .describe("Known catalog exercise id from focusedExerciseId or a prior tool result only. Omit if unsure."),
          name: z.string().optional()
            .describe("Exercise name in natural language. Word order, plurals, and nicknames are ok (e.g. incline bench press, rdl, db bench)."),
          matchOffset: z.number().int().min(0).optional().describe("Use nextMatchOffset to inspect the next page of candidate metadata. Do not hide remaining choices."),
          matchKeys: z.array(z.string()).optional().describe("For all: true, the original prior matches' keys; revalidate and restrict summaries to those choices."),
          all: z.boolean().optional().describe("User requested separate summaries of all matches for the original name."),
          offset: z.number().int().min(0).optional().describe("Use nextOffset from an all-review result to continue."),
          equipmentInstanceId: z.string().nullable().optional()
            .describe("Equipment instance id, or null for no instance"),
        }),
      },
    ),
    tool(async () => asJson(await nextWorkout(supabase, userId)), {
      name: "nextWorkout",
      description:
        "Load the current effective next-workout target suggestions, reasons and evidence, shared with Home, planner and the session screen. Repeated effort reductions are already included; never apply another reduction or infer a program change. If workout is null, say there is no next workout. If a slot target is null, say that target is not set.",
      schema: z.object({}),
    }),
  ];
}

function bindWriteTools(supabase: Client, userId: string) {
  return [
    tool(async (input) => asJson(await draftProgramFromIntake(supabase, userId, input)), {
      name: "draftProgramFromIntake",
      description:
        "Recommend an existing PROGRAM_TEMPLATES gallery program from intake (days, goal, style, equipment, emphasis, omissions), patch exercises lightly, and persist an inactive draft. Low confidence returns follow-up chips instead of guessing a split. Does not invent custom programs. Returns an Open in builder confirm chip — the app does not navigate until the user taps it. Never activates an existing active program.",
      schema: z.object({
        days: z.union([z.number().int().min(3).max(6), z.enum(["3", "4", "5", "6"])]).optional()
          .describe("Training days per week (3–6)"),
        goal: z.enum(["strength", "hypertrophy", "general"]).optional()
          .describe("Primary goal"),
        style: z.enum(["classic", "fluid"]).optional()
          .describe("Classic phased blocks or fluid adaptation"),
        equipment: z.enum(["full_gym", "home_dumbbells", "machines_only"]).optional()
          .describe("Available equipment"),
        emphasis: z.enum(["balanced", "glutes", "upper", "lower", "arms", "back"]).optional()
          .describe("Optional emphasis"),
        omissions: z.array(z.string()).optional()
          .describe("Exercises or movement patterns to avoid, e.g. bb-rdl or deadlifts"),
      }),
    }),
  ];
}

function bindClientTools() {
  return [
    tool(async ({ exerciseId, equipmentInstanceId }) =>
      asJson(openExerciseReview({ exerciseId, equipmentInstanceId })), {
      name: "openExerciseReview",
      description:
        "Open Exercise review for one exact exercise plus equipment instance. Use when the user asks to see review, history, Last card, or e1RM chart for an exercise.",
      schema: z.object({
        exerciseId: z.string().describe("Catalog exercise id, e.g. bb-back-squat"),
        equipmentInstanceId: z.string().nullable().optional()
          .describe("Equipment instance id, or null for no instance"),
      }),
    }),
    tool(async () => asJson(openCoachCheckIn()), {
      name: "openCoachCheckIn",
      description:
        "Open Track Coach check-in at /analytics/coach. Use when the user asks to open coach check-in, weekly check-in, or proposals screen.",
      schema: z.object({}),
    }),
    tool(async ({ programId }) => asJson(openProgram(programId)), {
      name: "openProgram",
      description:
        "Open a program detail screen. Pass the active program id unless the user names another program.",
      schema: z.object({
        programId: z.string().describe("Program id to open"),
      }),
    }),
    tool(async () => asJson(startNextWorkoutRequest()), {
      name: "startNextWorkout",
      description:
        "Request starting the next workout. The session does not start until the user taps the in-chat confirm chip.",
      schema: z.object({}),
    }),
  ];
}

export {
  activeProgram,
  calculateE1rm,
  draftProgramFromIntake,
  exerciseReview,
  nextWorkout,
  openCoachCheckIn,
  openExerciseReview,
  openProgram,
  startNextWorkoutRequest,
  weeklyCoach,
};
