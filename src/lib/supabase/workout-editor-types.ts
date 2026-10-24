import type { Json } from "./types";
type ReadTable<T> = { Row: T; Insert: never; Update: never; Relationships: [] };
export type WorkoutEditorTables = {
  workout_plan: ReadTable<{ user_id: string; program_id: string; program_day_id: string; completed_count: number;
    revision: number; source_revision: number; plan: Json; updated_at: string }>;
};
export type WorkoutEditorFunctions = {
  save_workout_plan: { Args: { p_program: string; p_day: string; p_completed: number; p_source: number;
    p_revision: number; p_scope: string; p_plan: Json; p_request: string }; Returns: Json };
  start_workout_plan: { Args: { p_program: string; p_day: string; p_completed: number; p_source: number;
    p_revision: number; p_plan: Json }; Returns: string };
};
