import { describe, expect, it, vi } from "vitest";
import type { createClient } from "./supabase/server";
import { loadPreviousNotes } from "./previous-notes";

function fixture(results: Record<string, unknown[]>) {
  const queries: Record<string, ReturnType<typeof query>> = {};
  function query(table: string) {
    const q = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({data:null,error:null}),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({data:results[table]?.shift() ?? [],error:null}).then(resolve),
    };
    return q;
  }
  const db = {from:vi.fn((table:string)=> queries[table] ??= query(table))};
  return {db:db as unknown as Awaited<ReturnType<typeof createClient>>,queries};
}
const detail = {id:"detail",occurrence_id:"old-occurrence",exercise_id:"custom",equipment_instance_id:null,setup:"Seat 5",note:"Slow lowering"};
const session = {id:"workout",finished_at:"2026-10-28T12:00:00Z",workout_exercise_detail:[detail]};
describe("previous notes",()=>{
  it("reads finished occurrences independently of sets, with exact null identity and owner scope",async()=>{
    const {db,queries}=fixture({workout_session:[[session]],set_log:[[]]});
    const page=await loadPreviousNotes(db,"owner",{exerciseId:"custom",equipmentInstanceId:null,excludeSessionId:"active"});
    expect(page.workouts[0].occurrences).toEqual([{...detail,setContexts:[]}]);
    expect(queries.workout_session.eq).toHaveBeenCalledWith("user_id","owner");
    expect(queries.workout_session.eq).toHaveBeenCalledWith("workout_exercise_detail.exercise_id","custom");
    expect(queries.workout_session.is).toHaveBeenCalledWith("workout_exercise_detail.equipment_instance_id",null);
    expect(queries.workout_session.neq).toHaveBeenCalledWith("id","active");
    expect(queries.workout_session.not).toHaveBeenCalledWith("finished_at","is",null);
  });
  it("keeps duplicate occurrences separate and includes only their different set snapshots",async()=>{
    const duplicate={...detail,id:"duplicate",occurrence_id:"second",note:"Other observation"};
    const sets=[{id:"s1",session_id:"workout",planned_slot_id:"old-occurrence",program_slot_id:null,setup_snapshot:"Seat 4",created_at:"2026-10-28T10:00:00Z"},
      {id:"s2",session_id:"workout",planned_slot_id:"second",program_slot_id:null,setup_snapshot:"Seat 5",created_at:"2026-10-28T10:01:00Z"}];
    const {db}=fixture({workout_session:[[{...session,workout_exercise_detail:[detail,duplicate]}]],set_log:[sets,[]]});
    const page=await loadPreviousNotes(db,"owner",{exerciseId:"custom",equipmentInstanceId:null});
    expect(page.workouts[0].occurrences).toEqual([{...detail,setContexts:[sets[0]]},{...duplicate,setContexts:[]}]);
  });
  it("advances a bounded workout cursor even when notes have no sets",async()=>{
    const sessions=Array.from({length:10},(_,i)=>({...session,id:`workout-${i}`}));
    const {db,queries}=fixture({workout_session:[sessions,[]],set_log:[[]]});
    const first=await loadPreviousNotes(db,"owner",{exerciseId:"custom",equipmentInstanceId:"station"});
    expect(first.nextCursor).toEqual({finishedAt:session.finished_at,id:"workout-9"});
    expect(queries.workout_session.eq).toHaveBeenCalledWith("workout_exercise_detail.equipment_instance_id","station");
    const older=await loadPreviousNotes(db,"owner",{exerciseId:"custom",equipmentInstanceId:"station",cursor:first.nextCursor});
    expect(older.workouts).toEqual([]);
    expect(queries.workout_session.or).toHaveBeenCalledWith(`finished_at.lt.${session.finished_at},and(finished_at.eq.${session.finished_at},id.lt.workout-9)`);
  });
});
