import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import type { RememberedSetup } from "./workout-details";
import { collectIdPages } from "./pagination";

export async function loadWorkoutDetails(db:SupabaseClient<Database>,userId:string,sessionId:string) {
  const [details,remembered,equipment,history]=await Promise.all([
    collectIdPages(async after=>{
      let query=db.from("workout_exercise_detail").select("id,occurrence_id,exercise_id,equipment_instance_id,setup,note").eq("user_id",userId).eq("session_id",sessionId).order("id").limit(500);
      if(after) query=query.gt("id",after);
      const {data,error}=await query;if(error) throw new Error("Could not load workout notes. Please reload.");return data??[];
    }),
    collectIdPages(async after=>{
      let query=db.from("exercise_setup").select("id,exercise_id,equipment_instance_id,setup").eq("user_id",userId).order("id").limit(500);
      if(after) query=query.gt("id",after);
      const {data,error}=await query;if(error) throw new Error("Could not load remembered setup. Please reload.");return data??[];
    }),
    collectIdPages(async after=>{
      let query=db.from("equipment_instance").select("id,label,gym").eq("user_id",userId).order("id").limit(500);
      if(after) query=query.gt("id",after);
      const {data,error}=await query;if(error) throw new Error("Could not load equipment labels. Please reload.");return data??[];
    }),
    collectIdPages(async after=>{
      let query=db.from("workout_exercise_detail").select("id,exercise_id,equipment_instance_id,setup,note,workout_session!inner(id,finished_at)").eq("user_id",userId).eq("workout_session.user_id",userId).neq("session_id",sessionId).not("workout_session.finished_at","is",null).order("id").limit(500);
      if(after) query=query.gt("id",after);
      const {data,error}=await query;if(error) throw new Error("Could not load last workout setup. Please reload.");return data??[];
    }),
  ]);
  const setups = new Map<string, RememberedSetup>();
  const identity = (row: {exercise_id:string;equipment_instance_id:string|null}) => JSON.stringify([row.exercise_id,row.equipment_instance_id]);
  for (const row of remembered) setups.set(identity(row), {...row,latestSetup:null,hasPreviousNotes:!!row.setup});
  history.sort((a,b)=>(b.workout_session.finished_at??"").localeCompare(a.workout_session.finished_at??"") || b.workout_session.id.localeCompare(a.workout_session.id) || b.id.localeCompare(a.id));
  const seen = new Set<string>();
  for (const row of history) {
    const key=identity(row);
    const existing:RememberedSetup=setups.get(key)??{id:row.id,exercise_id:row.exercise_id,equipment_instance_id:row.equipment_instance_id,setup:null};
    setups.set(key,{...existing,latestSetup:seen.has(key)?existing.latestSetup:row.setup,
      hasPreviousNotes:!!(existing.hasPreviousNotes || row.setup || row.note)});
    seen.add(key);
  }
  return {details,remembered:[...setups.values()],equipmentLabels:Object.fromEntries(equipment.map(e=>[e.id,[e.label,e.gym].filter(Boolean).join(" · ")||e.id]))};
}
