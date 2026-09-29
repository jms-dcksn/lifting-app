import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveProgram } from "@/lib/program";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type AgentScreenContext = {
  pathname: string;
  activeProgramId: string | null;
  openSessionId: string | null;
  focusedExerciseId: string | null;
};

const SESSION_PATH = /^\/session\/([^/]+)(?:\/|$)/;
const RECAP_PATH = /^\/session\/[^/]+\/recap/;
const HISTORY_PATH = /^\/history\/([^/]+)/;
const PROGRAM_PATH = /^\/program\/([^/]+)/;

export function parseScreenContextFromPath(pathname: string): AgentScreenContext {
  const sessionMatch = pathname.match(SESSION_PATH);
  const openSessionId = sessionMatch && !RECAP_PATH.test(pathname) ? decodeURIComponent(sessionMatch[1]) : null;
  const exerciseMatch = pathname.match(HISTORY_PATH);
  const focusedExerciseId = exerciseMatch ? decodeURIComponent(exerciseMatch[1]) : null;
  const programMatch = pathname.match(PROGRAM_PATH);
  const viewedProgramId = programMatch && programMatch[1] !== "new"
    ? decodeURIComponent(programMatch[1])
    : null;

  return {
    pathname,
    activeProgramId: viewedProgramId,
    openSessionId,
    focusedExerciseId,
  };
}

export function parseScreenContextInput(value: unknown): AgentScreenContext | null {
  if (!value || typeof value !== "object") return null;
  const { pathname, activeProgramId, openSessionId, focusedExerciseId } = value as Record<string, unknown>;
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return null;
  return {
    pathname,
    activeProgramId: nullableString(activeProgramId),
    openSessionId: nullableString(openSessionId),
    focusedExerciseId: nullableString(focusedExerciseId),
  };
}

export async function enrichScreenContext(
  supabase: Client,
  userId: string,
  context: AgentScreenContext,
): Promise<AgentScreenContext> {
  const program = await getActiveProgram(supabase, userId);
  return {
    ...context,
    activeProgramId: program?.id ?? context.activeProgramId,
  };
}

export function formatScreenContextForPrompt(context: AgentScreenContext) {
  const lines = [
    "Screen context for this turn:",
    `- pathname: ${context.pathname}`,
    `- activeProgramId: ${context.activeProgramId ?? "none"}`,
    `- openSessionId: ${context.openSessionId ?? "none"}`,
    `- focusedExerciseId: ${context.focusedExerciseId ?? "none"}`,
    "Use navigation tools when the user asks to open a screen. Use focusedExerciseId when they mean the exercise on screen.",
  ];
  return `\n\n${lines.join("\n")}`;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim()) return null;
  return value;
}
