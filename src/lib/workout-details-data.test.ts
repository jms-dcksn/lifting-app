import { expect, it, vi } from "vitest";
import { loadWorkoutDetails } from "./workout-details-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

it("uses the latest finished session for each exact setup, including a cleared setup", async()=>{
  const row=(id:string,setup:string|null,finished:string,equipment:string|null=null)=>({id,exercise_id:"machine",equipment_instance_id:equipment,setup,note:equipment?"Previous observation":null,workout_session:{id,finished_at:finished}});
  const history=[row("old","Seat 2","2026-01-01"),row("new","Seat 4","2026-02-01"),row("other",null,"2026-03-01","other")];
  const from=vi.fn((table:string)=>{
    let historical=false;
    let after=false;
    const query:Record<string,unknown>={};
    for(const method of ["eq","neq","not","order","limit","gt"]) query[method]=vi.fn(()=>query);
    query.gt=vi.fn(()=>{after=true;return query;});
    query.select=vi.fn((columns:string)=>{historical=columns.includes("workout_session!");return query;});
    query.then=(resolve:(value:unknown)=>void)=>resolve({data:after?[]:table==="exercise_setup"?[{id:"ref",exercise_id:"machine",equipment_instance_id:null,setup:"Stale reference"}]:historical?history:[],error:null});
    return query;
  });
  const result=await loadWorkoutDetails({from} as unknown as SupabaseClient<Database>,"owner","current");
  expect(result.remembered).toEqual(expect.arrayContaining([
    expect.objectContaining({exercise_id:"machine",equipment_instance_id:null,setup:"Stale reference",latestSetup:"Seat 4",hasPreviousNotes:true}),
    expect.objectContaining({exercise_id:"machine",equipment_instance_id:"other",latestSetup:null,hasPreviousNotes:true}),
  ]));
});
