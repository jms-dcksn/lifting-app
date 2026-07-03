export interface ProgramSummary {
  id: string;
  name: string;
  tags: string[];
  weeks: number;
  isActive: boolean;
  style: "classic" | "fluid";
  dayCount: number;
  exerciseCount: number;
}

export interface ProgramSummaryRow {
  id: string;
  name: string;
  tags: string[] | null;
  weeks: number | null;
  is_active: boolean;
  style: string;
  created_at: string;
}

export interface ProgramDaySummaryRow {
  id: string;
  program_id: string;
}

export interface ProgramSlotSummaryRow {
  program_day_id: string;
}

export function buildProgramSummaries(
  programs: ProgramSummaryRow[],
  days: ProgramDaySummaryRow[],
  slots: ProgramSlotSummaryRow[],
): ProgramSummary[] {
  const programIdByDayId = new Map(days.map((day) => [day.id, day.program_id]));
  const dayCounts = new Map<string, number>();
  const exerciseCounts = new Map<string, number>();

  for (const day of days) {
    dayCounts.set(day.program_id, (dayCounts.get(day.program_id) ?? 0) + 1);
  }

  for (const slot of slots) {
    const programId = programIdByDayId.get(slot.program_day_id);
    if (!programId) continue;
    exerciseCounts.set(programId, (exerciseCounts.get(programId) ?? 0) + 1);
  }

  return [...programs]
    .sort(
      (a, b) =>
        Number(b.is_active) - Number(a.is_active) ||
        b.created_at.localeCompare(a.created_at),
    )
    .map((program) => ({
      id: program.id,
      name: program.name,
      tags: program.tags ?? [],
      weeks: program.weeks ?? 5,
      isActive: program.is_active,
      style: program.style === "fluid" ? "fluid" : "classic",
      dayCount: dayCounts.get(program.id) ?? 0,
      exerciseCount: exerciseCounts.get(program.id) ?? 0,
    }));
}
