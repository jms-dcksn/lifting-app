import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { assessVerification, selectRun } from "./pr-verification.mjs";

const sha="a".repeat(40);
const run={id:10,head_sha:sha,event:"pull_request",pull_requests:[{number:257}],status:"completed",conclusion:"success",html_url:"https://github.com/owner/repo/actions/runs/10"};
const jobs=[{name:"Lint, typecheck, test, build",status:"completed",conclusion:"success"},
  {name:"Database RLS tests",status:"completed",conclusion:"success",steps:[{name:"Verify authenticated phone journeys",status:"completed",conclusion:"success"}]}];

test("only the requested PR's current commit supplies evidence; newest run wins",()=>{
  assert.equal(selectRun([run],258,sha),undefined);
  assert.equal(selectRun([run],257,"b".repeat(40)),undefined);
  assert.equal(selectRun([{...run,event:"push"}],257,sha),undefined);
  assert.equal(selectRun([run,{...run,id:11,status:"queued",conclusion:null}],257,sha).id,11);
});
test("passes only completed base, database and actual browser execution",()=>{
  assert.equal(assessVerification(run,jobs).status,"PASS");
  assert.equal(assessVerification(run,[jobs[0]]).status,"BLOCKED");
  assert.equal(assessVerification(run,[jobs[0],{...jobs[1],steps:[]}]).status,"BLOCKED");
  assert.equal(assessVerification(run,[jobs[0],{...jobs[1],steps:[{...jobs[1].steps[0],conclusion:"skipped"}]}]).status,"FAIL");
});
test("queued and running checks stay pending; failures, cancellation and skipped jobs never pass",()=>{
  assert.equal(assessVerification(undefined,[]).status,"PENDING");
  assert.equal(assessVerification({...run,status:"in_progress",conclusion:null},[]).status,"PENDING");
  for(const conclusion of ["failure","cancelled","timed_out","skipped","action_required","neutral"]){
    assert.equal(assessVerification({...run,conclusion},jobs).status,"FAIL");
    assert.equal(assessVerification(run,[jobs[0],{...jobs[1],conclusion}]).status,"FAIL");
  }
});

// Exercise the public command with a fake GitHub executable at its actual process boundary.
const runner=fileURLToPath(new URL("./pr-verification.mjs",import.meta.url));
function cli(t,scenario) {
  const dir=mkdtempSync(join(tmpdir(),"pr-verification-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const env={...process.env,PATH:`${dir}:${process.env.PATH}`};
  for(const key of Object.keys(env)) if(key.startsWith("GIT_")) delete env[key];
  const git=(...args)=>execFileSync("git",args,{cwd:dir,env,encoding:"utf8"}).trim();
  git("init","--quiet");
  git("-c","core.hooksPath=/dev/null","-c","user.name=Verification Test","-c","user.email=verification@example.test","commit","--quiet","--allow-empty","-m","fixture");
  const current=git("rev-parse","HEAD");
  const gh=join(dir,"gh");
  writeFileSync(gh,`#!/usr/bin/env node
const fs=require("node:fs");
const args=process.argv.slice(2),path=args.at(-1);
const run=${JSON.stringify({...run,head_sha:current})};
const jobs=${JSON.stringify(jobs)};
if (${JSON.stringify(scenario)}==='offline') {console.error('API unavailable');process.exit(1);}
if(args[0]==='repo') console.log(JSON.stringify({nameWithOwner:'owner/repo'}));
else if(path.includes('/pulls/')) {
  const changed=${JSON.stringify(scenario)}==='moves' && fs.existsSync(${JSON.stringify(join(dir,'read-pr'))});
  fs.writeFileSync(${JSON.stringify(join(dir,'read-pr'))},'read');
  console.log(JSON.stringify({head:{sha:changed?'b'.repeat(40):${JSON.stringify(scenario==='stale'?'b'.repeat(40):current)}}}));
}
else if(path.includes('/jobs?')) console.log(JSON.stringify([{jobs}]));
else console.log(JSON.stringify({workflow_runs:${scenario==='missing'?'[]':'[run]'}}));
`);
  chmodSync(gh,0o755);
  return spawnSync(process.execPath,[runner,"257","--once"],{encoding:"utf8",cwd:dir,env});
}
test("public command reports passed evidence and rejects unavailable, missing or stale evidence",t=>{
  const passed=cli(t,"success");assert.equal(passed.status,0,passed.stdout+passed.stderr);assert.match(passed.stdout,/"status":"PASS"/);
  for(const scenario of ["offline","missing","stale","moves"]){
    const result=cli(t,scenario);assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,/BLOCKED/);
  }
});
