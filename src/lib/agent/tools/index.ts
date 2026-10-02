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
import { weeklyCoach } from "./weekly-coach";

type Client = SupabaseClient<Database>;

function asJson(value: unknown) {
  return JSON.stringify(value);
}

/** LangChain adapters. Domain functions above are the public interface. */
export function bindAgentTools(supabase: Client, userId: string) {
  return [
    ...bindReadTools(supabase, userId),
    ...bindClientTools(),
  ];
}

export function bindReadTools(supabase: Client, userId: string) {
  return [
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
      async ({ exerciseId, name, equipmentInstanceId }) =>
        asJson(await exerciseReview(supabase, userId, {
          exerciseId: exerciseId || undefined,
          name: name || undefined,
          equipmentInstanceId: equipmentInstanceId === undefined ? undefined : equipmentInstanceId,
        })),
      {
        name: "exerciseReview",
        description:
          "Load Exercise review for one exact exercise plus equipment instance: Last session, 21-day window, and last-8 e1RM chart. Prefer name when unsure; omit exerciseId unless it came from focusedExerciseId or a prior tool result. Do not invent ids. Word order may differ from catalog names. Do not blend machines. A trend needs at least two e1RM points. If recent21Days is null or kind is gap, delta is null, or chartLast8 has fewer than two points, say there is no trend and still report last when it is present.",
        schema: z.object({
          exerciseId: z.string().optional()
            .describe("Known catalog exercise id from focusedExerciseId or a prior tool result only. Omit if unsure."),
          name: z.string().optional()
            .describe("Exercise name in natural language; word order may differ from the catalog (e.g. incline barbell bench)."),
          equipmentInstanceId: z.string().nullable().optional()
            .describe("Equipment instance id, or null for no instance"),
        }),
      },
    ),
    tool(async () => asJson(await nextWorkout(supabase, userId)), {
      name: "nextWorkout",
      description:
        "Load the next workout and sessionTarget() weights so “why is my next squat target X?” matches Home and the session screen. If workout is null, say there is no next workout. If a slot target is null, say that target is not set.",
      schema: z.object({}),
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
  exerciseReview,
  nextWorkout,
  openCoachCheckIn,
  openExerciseReview,
  openProgram,
  startNextWorkoutRequest,
  weeklyCoach,
};
