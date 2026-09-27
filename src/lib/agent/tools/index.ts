import { tool } from "langchain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/types";
import { activeProgram } from "./active-program";
import { exerciseReview } from "./exercise-review";
import { nextWorkout } from "./next-workout";
import { weeklyCoach } from "./weekly-coach";

type Client = SupabaseClient<Database>;

function asJson(value: unknown) {
  return JSON.stringify(value);
}

/** LangChain adapters. Domain functions above are the public interface. */
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
          "Load Exercise review for one exact exercise plus equipment instance: Last session, 21-day window, and last-8 e1RM chart. Pass exerciseId when known; otherwise a name. Do not blend machines.",
        schema: z.object({
          exerciseId: z.string().optional().describe("Catalog exercise id, e.g. bb-back-squat"),
          name: z.string().optional().describe("Exercise name if the id is unknown"),
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

export { activeProgram, exerciseReview, nextWorkout, weeklyCoach };
