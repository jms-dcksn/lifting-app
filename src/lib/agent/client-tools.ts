import { exerciseReviewHref } from "@/lib/exercise-review-href";
import { programDetailHref } from "@/lib/program-routes";
import {
  CLIENT_NAV_TOOL_NAMES,
  CONFIRM_TOOL_NAMES,
  type ClientNavToolName,
  type ConfirmToolName,
} from "./policy";
import type { AgentPart } from "./messages";

export { CLIENT_NAV_TOOL_NAMES, CONFIRM_TOOL_NAMES };
export type { ClientNavToolName, ConfirmToolName };

export type NavigatingToolName = ClientNavToolName | "draftProgramFromIntake";

export type ClientNavigateAction = {
  type: "navigate";
  href: string;
  tool: NavigatingToolName;
};

export type ClientConfirmAction = {
  type: "confirm";
  tool: ConfirmToolName;
};

export type ClientAction = ClientNavigateAction | ClientConfirmAction;

export function coachCheckInHref() {
  return "/analytics/coach";
}

export function openExerciseReviewHref(input: {
  exerciseId: string;
  equipmentInstanceId?: string | null;
}) {
  return exerciseReviewHref({
    exerciseId: input.exerciseId,
    equipmentInstanceId: input.equipmentInstanceId ?? null,
  });
}

export function openProgramHref(programId: string) {
  return programDetailHref(programId);
}

export function isClientNavTool(name: string): name is ClientNavToolName {
  return (CLIENT_NAV_TOOL_NAMES as readonly string[]).includes(name);
}

export function isConfirmTool(name: string): name is ConfirmToolName {
  return (CONFIRM_TOOL_NAMES as readonly string[]).includes(name);
}

export function parseClientAction(part: AgentPart): ClientAction | null {
  if (part.type !== "tool-result" || part.omitted) return null;
  const result = part.result;
  if (!result || typeof result !== "object") return null;
  const action = (result as { action?: unknown }).action;
  if (action === "navigate") {
    const href = (result as { href?: unknown }).href;
    if (typeof href !== "string" || !href.startsWith("/")) return null;
    if (!isClientNavTool(part.name) && part.name !== "draftProgramFromIntake") return null;
    return { type: "navigate", href, tool: part.name as NavigatingToolName };
  }
  if (action === "confirm") {
    if (!isConfirmTool(part.name)) return null;
    return { type: "confirm", tool: part.name };
  }
  return null;
}

export function clientActionsFromParts(parts: AgentPart[]): ClientAction[] {
  const actions: ClientAction[] = [];
  for (const part of parts) {
    const action = parseClientAction(part);
    if (action) actions.push(action);
  }
  return actions;
}

export function latestConfirmCallId(messages: Array<{ parts: AgentPart[] }>): string | null {
  let latest: string | null = null;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool-call" && isConfirmTool(part.name)) latest = part.id;
    }
  }
  return latest;
}
