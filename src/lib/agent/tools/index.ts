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
    tool(async () => asJson(await weeklyCoach(supabase, userId)), {
      name: "weeklyCoach",
      description:
        "Load this week's Track Coach check-in: adherence, trends, proposals, and formatted text. Use for “how was this week?”, proposals, RIR, or bodyweight in the Coach report.",
      schema: z.object({}),
    }),
    tool(async () => asJson(await activeProgram(supabase, userId)), {
      name: "activeProgram",
      description:
        "Load the user's active program: name, style, days, and slot prescriptions. Use for “what's my program?”.",
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
          "Load Exercise review for one exact exercise plus equipment instance: Last session, 21-day window, and last-8 e1RM chart. Prefer name when unsure; omit exerciseId unless it came from focusedExerciseId or a prior tool result. Do not invent ids. Word order may differ from catalog names. Do not blend machines.",
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
        "Load the next workout and sessionTarget() weights so “why is my next squat target X?” matches Home and the session screen.",
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
  draftProgramFromIntake,
  exerciseReview,
  nextWorkout,
  openCoachCheckIn,
  openExerciseReview,
  openProgram,
  startNextWorkoutRequest,
  weeklyCoach,
};
