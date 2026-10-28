import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXERCISE_BY_ID } from "./strength/coefficients";
const mocks=vi.hoisted(()=>({client:vi.fn(),catalog:vi.fn(),bodyweight:vi.fn(),coach:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
vi.mock("@/lib/catalog",()=>({getCatalogMap:mocks.catalog}));
vi.mock("@/lib/current-bodyweight",()=>({getCurrentBodyweight:mocks.bodyweight}));
vi.mock("@/lib/coach-inbox-data",()=>({refreshCoachInbox:mocks.coach}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("next/navigation",()=>({redirect:vi.fn()}));
import { editSet,logSet } from "@/app/(app)/session/actions";

let existing:Record<string,unknown>;
const writes:Array<{table:string;patch:Record<string,unknown>;filters:Record<string,unknown>}>=[];
function from(table:string) {
  let patch:Record<string,unknown>|null=null;const filters:Record<string,unknown>={};let insert=false;
  const result=()=>{
    if(patch) { writes.push({table,patch,filters}); if(table==="set_log") existing={...existing,...patch,edit_revision:Number(existing.edit_revision)+1}; return {data:table==="set_log"?existing:null,error:null}; }
    if(table==="workout_session") return {data:{id:"session",is_deload:false,plan_snapshot:null},error:null};
    return {data:existing,error:null};
  };
  const query={select:()=>query,eq:(key:string,value:unknown)=>{filters[key]=value;return query;},
    update:(value:Record<string,unknown>)=>{patch=value;return query;},insert:(value:Record<string,unknown>)=>{patch=value;insert=true;return query;},upsert:(value:Record<string,unknown>)=>{patch=value;return query;},
    single:async()=>result(),maybeSingle:async()=>insert?result():table==="set_log" && filters.idempotency_key && existing.idempotency_key!==filters.idempotency_key?{data:null,error:null}:result(),
    then:(resolve:(value:unknown)=>void)=>resolve(patch?result():{data:[],count:0,error:null}),
  };return query;
}
beforeEach(()=>{
  vi.clearAllMocks();writes.length=0;
  existing={id:"set",exercise_id:"db-bench",session_id:"session",weight:50,reps:8,rir:2,e1rm:70,tempo:[2,1,1,0],note:"Original",setup_snapshot:"Seat 4",edit_revision:3};
  mocks.client.mockResolvedValue({auth:{getClaims:async()=>({data:{claims:{sub:"owner"}}})},from});
  mocks.catalog.mockResolvedValue(EXERCISE_BY_ID);mocks.bodyweight.mockResolvedValue(180);
});
describe("set detail persistence",()=>{
  it("saves a note without rewriting numbers, setup, tempo, bodyweight or training statistics",async()=>{
    await editSet({setId:"set",weight:50,reps:8,rir:2,note:"Shoulder discomfort",expectedRevision:3});
    expect(writes[0]).toMatchObject({table:"set_log",patch:{note:"Shoulder discomfort"},filters:{user_id:"owner",edit_revision:3}});
    expect(Object.keys(writes[0].patch)).toEqual(["note"]);
    expect(mocks.bodyweight).not.toHaveBeenCalled();expect(mocks.coach).not.toHaveBeenCalled();
    expect(existing).toMatchObject({tempo:[2,1,1,0],setup_snapshot:"Seat 4",e1rm:70});
  });
  it("preserves historical null RIR, numbers and e1RM during a details-only edit",async()=>{
    existing.rir=null;
    await editSet({setId:"set",weight:50,reps:8,rir:2,note:"Observation",detailsOnly:true,expectedRevision:3});
    expect(Object.keys(writes[0].patch)).toEqual(["note"]);expect(existing.rir).toBeNull();expect(existing.e1rm).toBe(70);
    expect(mocks.bodyweight).not.toHaveBeenCalled();
  });
  it("preserves details during numeric edits and retries an applied edit without writing again",async()=>{
    const input={setId:"set",weight:55,reps:8,rir:2,expectedRevision:3};
    await editSet(input);const count=writes.length;
    expect(writes[0].patch).not.toHaveProperty("note");expect(writes[0].patch).not.toHaveProperty("tempo");
    await editSet(input);expect(writes).toHaveLength(count);
  });
  it("rejects stale saves rather than replacing a newer observation",async()=>{
    await expect(editSet({setId:"set",weight:50,reps:8,rir:2,note:"stale",expectedRevision:2})).rejects.toThrow("changed elsewhere");expect(writes).toHaveLength(0);
  });
  it("returns saved set details on a log retry without replacing later edits",async()=>{
    existing.idempotency_key="retry-key";
    const saved=await logSet({sessionId:"session",programSlotId:null,exerciseId:"old-removed-exercise",weight:40,reps:5,rir:3,note:"stale draft",idempotencyKey:"retry-key"});
    expect(saved.note).toBe("Original");expect(saved.tempo).toEqual([2,1,1,0]);expect(writes).toHaveLength(0);expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/session/session");
  });
  it("stores a new set note with the resolved default tempo",async()=>{
    existing.idempotency_key=null;
    await logSet({sessionId:"session",programSlotId:null,exerciseId:"db-bench",weight:50,reps:8,rir:2,note:"  Controlled  ",idempotencyKey:"new-key"});
    expect(writes[0].patch).toMatchObject({note:"Controlled",tempo:[3,0,1,0],weight:50,reps:8,rir:2,idempotency_key:"new-key"});
  });
  it("keeps explicitly unspecified performed tempo separate from a missing override",async()=>{
    await logSet({sessionId:"session",programSlotId:null,exerciseId:"db-bench",weight:50,reps:8,rir:2,tempo:null,idempotencyKey:"unspecified"});
    expect(writes[0].patch).toMatchObject({tempo:null,note:null});
  });

});
