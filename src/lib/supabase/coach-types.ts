import type { Json } from "./types";
type ReadTable<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
};
export type CoachTables = {
  coach_episode_thread: ReadTable<{
    episode_id: string; user_id: string; thread_id: string; seed_message_id: string; seed_revision: number;
  }>;
  coach_action_receipt: ReadTable<{
    id: string; user_id: string; request_id: string; episode_id: string;
    occurrence: number; revision: number; action: string; intent_fingerprint: string;
    confirmed_evidence: Json; result: Json; created_at: string;
  }>;
  coach_refresh_state: ReadTable<{
    user_id: string;
    source_revision: number;
    reconciled_revision: number;
    state_version: number;
    bootstrap_at: string | null;
    history_cleared_at: string | null;
    defaults_version: string;
  }>;
  coach_preferences: ReadTable<{
    user_id: string;
    settings: Json;
    version: number;
    updated_at: string;
  }>;
  coach_episode: ReadTable<{
    id: string;
    user_id: string;
    context_key: string;
    family: string;
    occurrence: number;
    revision: number;
    state: string;
    validity: string;
    data: Json;
    updated_at: string;
  }>;
  coach_notice: ReadTable<{
    id: string;
    user_id: string;
    episode_id: string;
    occurrence: number;
    attention_key: string;
    category: string;
    title: string;
    body: string;
    generation_evidence: Json | null;
    generation_revision: number;
    redacted: boolean;
    read_at: string | null;
    acknowledged_at: string | null;
    arrival_state: string;
    created_at: string;
  }>;
};
export type CoachFunctions = {
  open_coach_episode: { Args: { p_payload: string; p_mac: string }; Returns: Json };
  commit_coach_episode_action: { Args: { p_payload: string; p_mac: string }; Returns: Json };
  reconcile_coach_episodes: {
    Args: { p_payload: string; p_mac: string };
    Returns: Json;
  };
  mark_coach_notice: {
    Args: { p_id: string; p_acknowledge?: boolean };
    Returns: undefined;
  };
  save_coach_preferences: {
    Args: { p_settings: Json; p_version: number };
    Returns: undefined;
  };
  end_coach_pain_episode: {
    Args: { p_payload: string; p_mac: string };
    Returns: undefined;
  };
  clear_coach_history: { Args: Record<PropertyKey, never>; Returns: undefined };
};
