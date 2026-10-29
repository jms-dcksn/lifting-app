import type { Json } from "./types";
type ReadTable<T, R extends {foreignKeyName:string;columns:string[];isOneToOne:boolean;referencedRelation:string;referencedColumns:string[]}[] = []> = { Row: T; Insert: never; Update: never; Relationships: R };
export type WorkoutEditorTables = {
  workout_exercise_detail: ReadTable<{id:string;user_id:string;session_id:string;occurrence_id:string;exercise_id:string;equipment_instance_id:string|null;setup:string|null;note:string|null}, [{foreignKeyName:"workout_exercise_detail_session_id_fkey";columns:["session_id"];isOneToOne:false;referencedRelation:"workout_session";referencedColumns:["id"]}]>;
  exercise_setup: ReadTable<{id:string;user_id:string;exercise_id:string;equipment_instance_id:string|null;setup:string|null}>;
  workout_plan: ReadTable<{ user_id: string; program_id: string; program_day_id: string; completed_count: number;
    revision: number; source_revision: number; plan: Json; updated_at: string }>;
};
export type WorkoutEditorFunctions = {
  save_workout_exercise_detail: {Args:{p_session:string;p_slot:string;p_exercise:string;p_equipment:string|null;p_kind:string;p_text:string|null;p_expected:string|null;p_remember:boolean;p_reference_expected:string|null};Returns:Json};
  save_workout_plan: { Args: { p_program: string; p_day: string; p_completed: number; p_source: number;
    p_revision: number; p_scope: string; p_plan: Json; p_request: string }; Returns: Json };
  start_workout_plan: { Args: { p_program: string; p_day: string; p_completed: number; p_source: number;
    p_revision: number; p_plan: Json }; Returns: string };
};
