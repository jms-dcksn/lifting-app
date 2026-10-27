import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { collectIdPages } from "./pagination";

export async function loadWorkoutDetails(db:SupabaseClient<Database>,userId:string,sessionId:string) {
  const [details,remembered,equipment]=await Promise.all([
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
  ]);
  return {details,remembered,equipmentLabels:Object.fromEntries(equipment.map(e=>[e.id,[e.label,e.gym].filter(Boolean).join(" · ")||e.id]))};
}
