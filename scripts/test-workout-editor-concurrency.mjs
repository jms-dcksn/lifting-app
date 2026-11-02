import pg from "pg";
import { randomUUID } from "node:crypto";
const url=process.env.COACH_TEST_DATABASE_URL;
if(!url || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw Error('Set COACH_TEST_DATABASE_URL to the disposable local database.');
const admin=new pg.Client({connectionString:url});await admin.connect();
const owner=randomUUID(),program=randomUUID(),day=randomUUID(),slot=randomUUID();
const plan={version:1,slots:[{id:slot,programSlotId:slot,exerciseId:'db-bench',pattern:'horizontal_press',restSeconds:90,supersetGroup:null,
  sets:[{id:randomUUID(),repMin:5,repMax:8,rirMin:1,rirMax:1,repsEdited:true,rirEdited:true,weight:100,suggestedWeight:95,targetReps:5,seedAt:null}]}]};
async function owned(sql,values){
 const c=new pg.Client({connectionString:url});await c.connect();
 try {await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
  const r=await c.query(sql,values);await c.query('commit');return r;
 }catch(e){await c.query('rollback');throw e;}finally{await c.end();}
}
const source=async()=>Number((await admin.query('select source_revision from public.coach_refresh_state where user_id=$1',[owner])).rows[0].source_revision);
const save=(src,request,p=plan)=>owned('select public.save_workout_plan($1,$2,0,$3,0,\'workout\',$4,$5) result',[program,day,src,p,request]);
try{
 await admin.query('insert into auth.users(id,email) values($1,$2)',[owner,`concurrency-${owner}@example.test`]);
 await admin.query("insert into public.program(id,user_id,name,weeks,is_active) values($1,$2,'Editor race',5,true)",[program,owner]);
 await admin.query("insert into public.program_day(id,user_id,program_id,name,position) values($1,$2,$3,'Upper',0)",[day,owner,program]);
 await admin.query("insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values($1,$2,$3,0,'db-bench','horizontal_press',3,5,8,2)",[slot,owner,day]);
 const src=await source();
 const races=await Promise.allSettled([save(src,randomUUID()),save(src,randomUUID(),{...plan,slots:[{...plan.slots[0],restSeconds:180}]})]);
 if(races.filter(r=>r.status==='fulfilled').length!==1) throw Error('Concurrent saves did not produce exactly one winner.');
 if(races.find(r=>r.status==='rejected')?.reason.code!=='PT409') throw Error('Concurrent loser did not receive an actionable conflict.');
 console.log('PASS concurrent saves preserve one winner and reject stale edits');
 const nextSrc=await source();
 const start=()=>owned('select public.start_workout_plan($1,$2,0,$3,1,$4) id',[program,day,nextSrc,plan]);
 const starts=await Promise.all([start(),start()]);
 if(starts[0].rows[0].id!==starts[1].rows[0].id) throw Error('Concurrent starts created distinct sessions.');
 const stored=await admin.query('select count(*)::int n from public.workout_plan where user_id=$1',[owner]);
 if(stored.rows[0].n!==0) throw Error('Successful start did not consume the saved plan.');
 console.log('PASS concurrent starts and lost-response resume return one captured session');
 const snapshot=(await admin.query('select plan_snapshot from public.workout_session where id=$1',[starts[0].rows[0].id])).rows[0].plan_snapshot;
 await admin.query('update public.program_slot set target_sets=6 where id=$1',[slot]);
 const after=(await admin.query('select plan_snapshot from public.workout_session where id=$1',[starts[0].rows[0].id])).rows[0].plan_snapshot;
 if(JSON.stringify(snapshot)!==JSON.stringify(after)) throw Error('Program edit changed an existing snapshot.');
 console.log('PASS later program changes preserve the captured session');
}finally{await admin.query('delete from auth.users where id=$1',[owner]);await admin.end();}
