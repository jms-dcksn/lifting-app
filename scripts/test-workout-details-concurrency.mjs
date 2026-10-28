import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const url=process.env.COACH_TEST_DATABASE_URL;
if(!url || !["localhost","127.0.0.1","[::1]"].includes(new URL(url).hostname)) throw Error("Use a disposable local COACH_TEST_DATABASE_URL.");
const admin=new pg.Client({connectionString:url});await admin.connect();
const owner=randomUUID(),program=randomUUID(),day=randomUUID(),slot=randomUUID(),session=randomUUID(),exercise=`details-race-${owner}`;
async function connect(){const c=new pg.Client({connectionString:url});await c.connect();await c.query("begin");await c.query("set local role authenticated");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);return c;}
async function owned(sql,values){const c=await connect();try{const result=await c.query(sql,values);await c.query("commit");return result;}catch(error){await c.query("rollback");throw error;}finally{await c.end();}}
const save=(text,expected=null,kind="note")=>owned("select public.save_workout_exercise_detail($1,$2,$3,null,$4,$5,$6,false,null)",[session,slot,exercise,kind,text,expected]);
try{
  await admin.query("insert into auth.users(id,email) values($1,$2)",[owner,`details-race-${owner}@example.test`]);
  await admin.query("insert into public.exercise(id,user_id,name,pattern,equipment,coefficient,increment) values($1,$2,'Details machine','horizontal_press','machine',1,5)",[exercise,owner]);
  await admin.query("insert into public.program(id,user_id,name,weeks,is_active) values($1,$2,'Details race',5,true)",[program,owner]);
  await admin.query("insert into public.program_day(id,user_id,program_id,name,position) values($1,$2,$3,'Upper',0)",[day,owner,program]);
  await admin.query("insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values($1,$2,$3,0,$4,'horizontal_press',3,8,12,2)",[slot,owner,day,exercise]);
  await admin.query("insert into public.workout_session(id,user_id,program_id,program_day_id) values($1,$2,$3,$4)",[session,owner,program,day]);
  const race=await Promise.allSettled([save("First writer"),save("Second writer")]);
  assert.equal(race.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(race.find(r=>r.status==="rejected").reason.code,"40001");
  console.log("PASS competing observation saves preserve one winner and reject stale text");
  const note=(await admin.query("select note from public.workout_exercise_detail where session_id=$1",[session])).rows[0].note;
  await save(note); // Idempotent response retry despite the original expected null.
  await save("Seat 4",null,"setup");
  const writer=await connect();
  await writer.query("select public.save_workout_exercise_detail($1,$2,$3,null,'setup','Seat 5','Seat 4',false,null)",[session,slot,exercise]);
  // The set insert must wait behind the same owner lock and capture the committed setup.
  const log=owned("insert into public.set_log(user_id,session_id,program_slot_id,exercise_id,set_index,weight,reps,rir) values($1,$2,$3,$4,0,50,8,2) returning id,setup_snapshot",[owner,session,slot,exercise]);
  await writer.query("commit");await writer.end();
  const saved=(await log).rows[0];assert.equal(saved.setup_snapshot,"Seat 5");
  console.log("PASS concurrent setup/save and set log capture one transactional setup snapshot");
  const edits=await Promise.all([
    owned("update public.set_log set reps=9 where id=$1 and edit_revision=0 returning id",[saved.id]),
    owned("update public.set_log set note='Set observation' where id=$1 and edit_revision=0 returning id",[saved.id]),
  ]);
  assert.equal(edits.reduce((count,r)=>count+r.rowCount,0),1);
  assert.equal((await admin.query("select setup_snapshot from public.set_log where id=$1",[saved.id])).rows[0].setup_snapshot,"Seat 5");
  console.log("PASS concurrent numeric/detail edits require review instead of erasing unrelated fields");
}finally{await admin.query("delete from auth.users where id=$1",[owner]);await admin.end();}
