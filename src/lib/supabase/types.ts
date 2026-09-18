export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      coach_recommendation_decision: {
        Row: {
          deferred_until: string | null
          recommendation_key: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          deferred_until?: string | null
          recommendation_key: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          deferred_until?: string | null
          recommendation_key?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bodyweight_log: {
        Row: {
          created_at: string
          id: string
          logged_on: string
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          logged_on: string
          updated_at?: string
          user_id: string
          weight: number
        }
        Update: {
          created_at?: string
          id?: string
          logged_on?: string
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      equipment_instance: {
        Row: {
          created_at: string
          exercise_id: string
          gym: string | null
          id: string
          label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          gym?: string | null
          id?: string
          label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          gym?: string | null
          id?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      exercise: {
        Row: {
          base_exercise_id: string | null
          brand: string | null
          coefficient: number
          created_at: string
          equipment: string
          id: string
          increment: number
          is_reference: boolean
          machine_type: string | null
          name: string
          needs_calibration: boolean
          pattern: string
          user_id: string
        }
        Insert: {
          base_exercise_id?: string | null
          brand?: string | null
          coefficient?: number
          created_at?: string
          equipment: string
          id: string
          increment?: number
          is_reference?: boolean
          machine_type?: string | null
          name: string
          needs_calibration?: boolean
          pattern: string
          user_id: string
        }
        Update: {
          base_exercise_id?: string | null
          brand?: string | null
          coefficient?: number
          created_at?: string
          equipment?: string
          id?: string
          increment?: number
          is_reference?: boolean
          machine_type?: string | null
          name?: string
          needs_calibration?: boolean
          pattern?: string
          user_id?: string
        }
        Relationships: []
      }
      period_observation: {
        Row: {
          created_at: string
          id: string
          observed_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          observed_on: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          observed_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          bodyweight: number | null
          created_at: string
          default_rest_seconds: number
          display_name: string | null
          goal_weight: number | null
          id: string
          period_consent_granted_at: string | null
          period_consent_version: string | null
          period_tracking_enabled: boolean
          rest_tone_enabled: boolean
          sex: string
        }
        Insert: {
          bodyweight?: number | null
          created_at?: string
          default_rest_seconds?: number
          display_name?: string | null
          goal_weight?: number | null
          id: string
          period_consent_granted_at?: string | null
          period_consent_version?: string | null
          period_tracking_enabled?: boolean
          rest_tone_enabled?: boolean
          sex?: string
        }
        Update: {
          bodyweight?: number | null
          created_at?: string
          default_rest_seconds?: number
          display_name?: string | null
          goal_weight?: number | null
          id?: string
          period_consent_granted_at?: string | null
          period_consent_version?: string | null
          period_tracking_enabled?: boolean
          rest_tone_enabled?: boolean
          sex?: string
        }
        Relationships: []
      }
      movement_adaptation: {
        Row: {
          action: string
          created_at: string
          exercise_id: string
          id: string
          ladder_step: number
          new_exercise_id: string | null
          new_rep_max: number | null
          new_rep_min: number | null
          program_slot_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          exercise_id: string
          id?: string
          ladder_step?: number
          new_exercise_id?: string | null
          new_rep_max?: number | null
          new_rep_min?: number | null
          program_slot_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          exercise_id?: string
          id?: string
          ladder_step?: number
          new_exercise_id?: string | null
          new_rep_max?: number | null
          new_rep_min?: number | null
          program_slot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_adaptation_program_slot_id_fkey"
            columns: ["program_slot_id"]
            isOneToOne: false
            referencedRelation: "program_slot"
            referencedColumns: ["id"]
          },
        ]
      }
      program: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          style: string
          tags: string[]
          user_id: string
          weeks: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          style?: string
          tags?: string[]
          user_id: string
          weeks?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          style?: string
          tags?: string[]
          user_id?: string
          weeks?: number | null
        }
        Relationships: []
      }
      program_day: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          program_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position: number
          program_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          program_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_day_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "program"
            referencedColumns: ["id"]
          },
        ]
      }
      program_phase: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          program_id: string
          set_multiplier: number | null
          target_rir_max: number | null
          target_rir_min: number | null
          user_id: string
          week_end: number
          week_start: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position: number
          program_id: string
          set_multiplier?: number | null
          target_rir_max?: number | null
          target_rir_min?: number | null
          user_id: string
          week_end: number
          week_start: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          program_id?: string
          set_multiplier?: number | null
          target_rir_max?: number | null
          target_rir_min?: number | null
          user_id?: string
          week_end?: number
          week_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_phase_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "program"
            referencedColumns: ["id"]
          },
        ]
      }
      program_slot: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          pattern: string
          plateau_patience: number | null
          position: number
          program_day_id: string
          rep_max: number
          rep_min: number
          rest_seconds: number | null
          target_rir: number
          target_sets: number
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          pattern: string
          plateau_patience?: number | null
          position: number
          program_day_id: string
          rep_max: number
          rep_min: number
          rest_seconds?: number | null
          target_rir: number
          target_sets: number
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          pattern?: string
          plateau_patience?: number | null
          position?: number
          program_day_id?: string
          rep_max?: number
          rep_min?: number
          rest_seconds?: number | null
          target_rir?: number
          target_sets?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_slot_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_day"
            referencedColumns: ["id"]
          },
        ]
      }
      set_log: {
        Row: {
          created_at: string
          e1rm: number | null
          equipment_instance_id: string | null
          exercise_id: string
          id: string
          idempotency_key: string | null
          is_calibration: boolean
          is_warmup: boolean
          program_slot_id: string | null
          reps: number
          rir: number | null
          session_id: string
          set_index: number
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          e1rm?: number | null
          equipment_instance_id?: string | null
          exercise_id: string
          id?: string
          idempotency_key?: string | null
          is_calibration?: boolean
          is_warmup?: boolean
          program_slot_id?: string | null
          reps: number
          rir?: number | null
          session_id: string
          set_index: number
          user_id: string
          weight: number
        }
        Update: {
          created_at?: string
          e1rm?: number | null
          equipment_instance_id?: string | null
          exercise_id?: string
          id?: string
          idempotency_key?: string | null
          is_calibration?: boolean
          is_warmup?: boolean
          program_slot_id?: string | null
          reps?: number
          rir?: number | null
          session_id?: string
          set_index?: number
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "set_log_equipment_instance_id_fkey"
            columns: ["equipment_instance_id"]
            isOneToOne: false
            referencedRelation: "equipment_instance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_log_program_slot_id_fkey"
            columns: ["program_slot_id"]
            isOneToOne: false
            referencedRelation: "program_slot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_session"
            referencedColumns: ["id"]
          },
        ]
      }
      user_exercise_pin: {
        Row: {
          created_at: string
          exercise_id: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_exercise_stat: {
        Row: {
          coeff_confidence_n: number
          current_e1rm: number | null
          exercise_id: string
          last_updated: string
          personal_coefficient: number | null
          user_id: string
        }
        Insert: {
          coeff_confidence_n?: number
          current_e1rm?: number | null
          exercise_id: string
          last_updated?: string
          personal_coefficient?: number | null
          user_id: string
        }
        Update: {
          coeff_confidence_n?: number
          current_e1rm?: number | null
          exercise_id?: string
          last_updated?: string
          personal_coefficient?: number | null
          user_id?: string
        }
        Relationships: []
      }
      workout_session: {
        Row: {
          exercise_swaps: Json
          finished_at: string | null
          id: string
          joint_pain: string | null
          notes: string | null
          performed_at: string
          program_day_id: string | null
          program_id: string | null
          readiness: number | null
          user_id: string
          week_index: number | null
        }
        Insert: {
          exercise_swaps?: Json
          finished_at?: string | null
          id?: string
          joint_pain?: string | null
          notes?: string | null
          performed_at?: string
          program_day_id?: string | null
          program_id?: string | null
          readiness?: number | null
          user_id: string
          week_index?: number | null
        }
        Update: {
          exercise_swaps?: Json
          finished_at?: string | null
          id?: string
          joint_pain?: string | null
          notes?: string | null
          performed_at?: string
          program_day_id?: string | null
          program_id?: string | null
          readiness?: number | null
          user_id?: string
          week_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_session_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_day"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_session_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "program"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_bodyweight_entry: {
        Args: { p_entry_id: string | null; p_logged_on: string; p_weight: number; p_replace_entry_id?: string | null }
        Returns: string
      }
      save_program: {
        Args: { p_tree: Json }
        Returns: string
      }
      set_active_program: {
        Args: { p_program_id: string }
        Returns: undefined
      }
      swap_session_exercise: {
        Args: { p_session_id: string; p_slot_id: string; p_exercise_id: string; p_pattern: string; p_scope: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
