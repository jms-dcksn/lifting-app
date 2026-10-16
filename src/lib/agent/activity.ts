export type ToolActivity = {
  callId: string;
  name: string;
  outcome: "running" | "complete" | "error";
};

const TOOL_LABELS: Record<string, [string, string, string]> = {
  calculateE1rm: ["Estimating your one-rep max", "Estimated your one-rep max", "Could not estimate your one-rep max"],
  weeklyCoach: ["Checking your weekly report", "Checked your weekly report", "Could not check your weekly report"],
  activeProgram: ["Checking your program", "Checked your program", "Could not check your program"],
  exerciseReview: ["Reviewing your exercise history", "Reviewed your exercise history", "Could not review your exercise history"],
  nextWorkout: ["Checking your next workout", "Checked your next workout", "Could not check your next workout"],
  draftProgramFromIntake: ["Preparing your program draft", "Prepared your program draft", "Could not prepare your program draft"],
  openCoachCheckIn: ["Finding your Coach check-in", "Found your Coach check-in", "Could not find your Coach check-in"],
  openExerciseReview: ["Finding your exercise review", "Found your exercise review", "Could not find your exercise review"],
  openProgram: ["Finding your program", "Found your program", "Could not find your program"],
  startNextWorkout: ["Preparing your workout link", "Prepared your workout link", "Could not prepare your workout link"],
};

export function toolActivityLabel(tool: ToolActivity) {
  const labels = TOOL_LABELS[tool.name] ?? ["Using a Coach tool", "Finished a Coach tool", "A Coach tool failed"];
  return labels[tool.outcome === "running" ? 0 : tool.outcome === "complete" ? 1 : 2];
}

export function coachActivityLabel(tools: ToolActivity[]) {
  const running = tools.filter((tool) => tool.outcome === "running");
  const failed = tools.filter((tool) => tool.outcome === "error");
  const labels = [...new Set([...running, ...failed].map(toolActivityLabel))];
  return labels.length > 0 ? `${labels.join(". ")}.` : "Coach is working.";
}
