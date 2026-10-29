import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import type { Database } from "../src/lib/supabase/types";
import { loadPreviousNotes } from "../src/lib/previous-notes";

test("previous notes uses real owner RLS, exact identity and workout pagination",async()=>{
  const db=new pg.Client({connectionString:process.env.E2E_DATABASE_URL});await db.connect();
  const clients=[0,1].map(()=>createClient<Database>(process.env.E2E_SUPABASE_URL!,process.env.E2E_SUPABASE_KEY!,{auth:{persistSession:false}}));
  const owners:string[]=[];
  const exerciseId=`notes-reader-${randomUUID()}`;
  try {
    for(const client of clients){
      const email=`reader-${randomUUID()}@example.test`,password=randomUUID()+"aA1!";
      const signup=await client.auth.signUp({email,password});if(signup.error || !signup.data.user) throw signup.error??Error("signup failed");
      owners.push(signup.data.user.id);
      await db.query('update auth.users set email_confirmed_at=now() where id=$1',[signup.data.user.id]);
      const login=await client.auth.signInWithPassword({email,password});if(login.error) throw login.error;
    }
    await db.query("insert into public.exercise(id,user_id,name,pattern,equipment,coefficient,increment) values($1,$2,'Reader machine','horizontal_press','machine',1,5)",[exerciseId,owners[0]]);
    const station=randomUUID();
    await db.query("insert into public.equipment_instance(id,user_id,exercise_id,label) values($1,$2,$3,'Station two')",[station,owners[0],exerciseId]);
    const ids=Array.from({length:12},()=>randomUUID()).sort().reverse();
    for(const [index,id] of ids.entries()){
      await db.query("insert into public.workout_session(id,user_id,finished_at) values($1,$2,'2026-10-28T12:00:00Z')",[id,owners[0]]);
      await db.query("insert into public.workout_exercise_detail(user_id,session_id,occurrence_id,exercise_id,setup,note) values($1,$2,$3,$4,$5,$6)",[owners[0],id,randomUUID(),exerciseId,index===11?'Never remembered':null,`Observation ${index}`]);
    }
    // Distinct occurrences survive grouping; an equipment-specific record stays separate.
    await db.query("insert into public.workout_exercise_detail(user_id,session_id,occurrence_id,exercise_id,note) values($1,$2,$3,$4,'Duplicate occurrence')",[owners[0],ids[0],randomUUID(),exerciseId]);
    await db.query("insert into public.workout_exercise_detail(user_id,session_id,occurrence_id,exercise_id,equipment_instance_id,note) values($1,$2,$3,$4,$5,'Station-specific observation')",[owners[0],ids[0],randomUUID(),exerciseId,station]);
    // More than ten actual sets cannot displace the older zero-set observation.
    for(let i=0;i<15;i++) await db.query("insert into public.set_log(user_id,session_id,exercise_id,set_index,weight,reps,rir) values($1,$2,$3,$4,50,8,2)",[owners[0],ids[0],exerciseId,i]);
    const selection={exerciseId,equipmentInstanceId:null};
    const first=await loadPreviousNotes(clients[0],owners[0],selection);
    expect(first.workouts.map(w=>w.id)).toEqual(ids.slice(0,10));
    expect(first.workouts[0].occurrences).toHaveLength(2);
    const older=await loadPreviousNotes(clients[0],owners[0],{...selection,cursor:first.nextCursor});
    expect(older.workouts.map(w=>w.id)).toEqual(ids.slice(10));
    expect(older.workouts[1].occurrences[0]).toMatchObject({note:'Observation 11',setup:'Never remembered',setContexts:[]});
    expect((await loadPreviousNotes(clients[0],owners[0],{...selection,cursor:older.nextCursor})).workouts).toEqual([]);
    const exact=await loadPreviousNotes(clients[0],owners[0],{exerciseId,equipmentInstanceId:station});
    expect(exact.workouts).toHaveLength(1);expect(exact.workouts[0].occurrences).toHaveLength(1);
    expect(exact.equipmentLabel).toBe('Station two');
    expect((await loadPreviousNotes(clients[0],owners[0],{...selection,excludeSessionId:ids[0]})).workouts.map(w=>w.id)).not.toContain(ids[0]);
    // Even supplying the other owner's ID cannot defeat the signed-in client's RLS.
    expect((await loadPreviousNotes(clients[1],owners[0],selection)).workouts).toEqual([]);
    expect((await loadPreviousNotes(clients[1],owners[1],selection)).workouts).toEqual([]);
  } finally {for(const owner of owners) await db.query('delete from auth.users where id=$1',[owner]);await db.end();}
});
