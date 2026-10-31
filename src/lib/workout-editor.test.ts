import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { normalizeGroups, newPlannedSet, parseStoredPlan, recoverySets, validateEditorPlan, type WorkoutEditorPlan } from "./workout-editor";
import { resolvePrescription } from "./periodization";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { plannedSetTarget, plannedSetSessionTarget, refreshWorkoutPlanTargets } from "./workout-editor-targets";
import { draftStation } from "./workout-editor-station";
const p = resolvePrescription({ targetSets: 3,repMin:5,repMax:8,targetRir:2 },1,[]);
const row = () => newPlannedSet(randomUUID(),p,{ weight:100,targetReps:5 });
function plan(): WorkoutEditorPlan { return { version:1,slots:[{ id:randomUUID(),programSlotId:null,exerciseId:"db-bench",pattern:"horizontal_press",restSeconds:120,supersetGroup:null,sets:[row(),{...row(),repMin:10,repMax:12,targetReps:10,weight:60,repsEdited:true}] }] }; }

describe("full workout editor contract",()=>{
  it("round trips distinct rows and zero-load rep-only work",()=>{
    const draft=plan();draft.slots[0].sets[0].weight=100;
    expect(parseStoredPlan(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(validateEditorPlan(draft,EXERCISE_BY_ID)).toEqual([]);
    draft.slots[0].exerciseId="ab-wheel-rollout";draft.slots[0].pattern="core";
    draft.slots[0].sets.forEach(s=>s.weight=0);
    expect(validateEditorPlan(draft,EXERCISE_BY_ID)).toEqual([]);
  });
  it("rejects missing sets, duplicate IDs, inverted ranges, nonfinite values and unresolved machines",()=>{
    const draft=plan();draft.slots[0].sets=[];
    expect(validateEditorPlan(draft,EXERCISE_BY_ID).length).toBeGreaterThan(0);
    const bad=plan();bad.slots[0].sets[1].id=bad.slots[0].sets[0].id;
    expect(validateEditorPlan(bad,EXERCISE_BY_ID)[0].message).toContain("unique");
    bad.slots[0].sets[0].repMax=1;
    expect(validateEditorPlan(bad,EXERCISE_BY_ID)[0].path).toContain("repMax");
    bad.slots[0].sets[0].weight=Infinity;
    expect(validateEditorPlan(bad,EXERCISE_BY_ID).length).toBeGreaterThan(0);
    const machine=plan();machine.slots[0].exerciseId="machine-chest-press";
    expect(validateEditorPlan(machine,EXERCISE_BY_ID).length).toBeGreaterThan(0);
  });
  it("retains the first two of four distinct rows during recovery once, with recovery effort winning",()=>{
    const rows=[row(),row(),row(),row()].map((s,i)=>({...s,weight:100-i*10,rirMin:1,rirMax:1,rirEdited:true}));
    const recovery=resolvePrescription({...p,targetSets:4},2,[{ id:"phase",position:0,name:"Recovery",description:null,weekStart:2,weekEnd:2,targetRirMin:3,targetRirMax:4,setMultiplier:0.5,isDeload:true }]);
    const result=recoverySets(rows,recovery);
    expect(result.map(r=>r.id)).toEqual(rows.slice(0,2).map(r=>r.id));
    expect(result.map(r=>[r.weight,r.rirMin,r.rirMax])).toEqual([[100,3,4],[90,3,4]]);
    expect(recoverySets(rows,p)).toHaveLength(4);
    expect(recoverySets(rows,p)[0].rirMax).toBe(1);
    expect(rows[0].rirMax).toBe(1);
  });
  it("dissolves singleton and split groups after removal/reorder",()=>{
    expect(normalizeGroups([{supersetGroup:"A"},{supersetGroup:null},{supersetGroup:"A"}]).map(s=>s.supersetGroup)).toEqual([null,null,null]);
    expect(normalizeGroups([{supersetGroup:"A"}])[0].supersetGroup).toBeNull();
  });
  it("uses a manual weight as a seed without inventing a completed set or compounding on refresh",()=>{
    const set={...row(),weight:100,seedAt:"2026-10-20T00:00:00.000Z"};
    const input={slotId:"slot",exerciseId:"db-bench",set,history:[],catalog:EXERCISE_BY_ID,stats:[],bodyweight:180,isDeload:false};
    expect(plannedSetTarget(input).weight).toBe(100);
    expect(plannedSetTarget(input)).toEqual(plannedSetTarget(input));
    const evidence={exerciseId:"db-bench",equipmentInstanceId:null,sessionId:"done",setId:"logged",programSlotId:"slot",performedAt:"2026-10-21T00:00:00.000Z",weight:100,reps:8,rir:2,e1rm:130,plannedSetId:set.id,repMin:5,repMax:8,rirMin:2,rirMax:2};
    const next=plannedSetTarget({...input,history:[evidence]});
    expect(next.weight).toBeNull();expect(next.suggestedWeight).toBe(105);
    expect(plannedSetTarget({...input,history:[{...evidence,plannedSetId:randomUUID()}]}).weight).toBe(100);
    expect(plannedSetTarget({...input,history:[{...evidence,repMin:10,repMax:12}]}).weight).toBe(100);
  });
  it("resolves station drafts without writing and preserves exact loading identity",()=>{
    const template=Object.values(EXERCISE_BY_ID).find(d=>d.stationProfile==="machine")!;
    const def=draftStation({baseExerciseId:template.id,brand:"Test",machineType:"selectorized"},"draft-id");
    expect(def.baseExerciseId).toBe(template.id);expect(def.machineType).toBe("selectorized");
    expect(def.stationProfile).toBe("none");
  });
});

it("refreshes changed row contexts and manual resets using per-set targets without mutating source rows", () => {
  const source = plan();
  const set = source.slots[0].sets[0];
  set.suggestedWeight = 999;
  const draft = structuredClone(source);
  draft.slots[0].sets[0] = {...set, weight: null, repMin: 10, repMax: 12, contextAt: "2026-10-31T00:00:00.000Z"};
  const stats = [{exerciseId: "db-bench", currentE1rm: 100, personalCoefficient: null, confidenceN: 4}];
  const input = {sources: source.slots, history: [], catalog: EXERCISE_BY_ID, stats, bodyweight: 180, isDeload: false};
  const refreshed = refreshWorkoutPlanTargets(draft, input);
  const expected = plannedSetTarget({slotId: draft.slots[0].id, exerciseId: "db-bench",
    set: draft.slots[0].sets[0], history: [], catalog: EXERCISE_BY_ID, stats, bodyweight: 180, isDeload: false});
  expect(refreshed.slots[0].sets[0]).toMatchObject({suggestedWeight: expected.suggestedWeight, targetReps: expected.targetReps});
  expect(refreshed.slots[0].sets[0].suggestedWeight).not.toBe(999);
  expect(refreshed.slots[0].sets[1].weight).toBe(60);
  expect(source.slots[0].sets[0].suggestedWeight).toBe(999);
  expect(refreshWorkoutPlanTargets(refreshed, input)).toEqual(refreshed);
  expect(plannedSetSessionTarget(refreshed.slots[0].sets[0])).toMatchObject({weight: expected.suggestedWeight, targetReps: expected.targetReps});
});

it("keeps captured unavailable targets unavailable instead of borrowing another row's progression", () => {
  const set = {...row(), weight: null, suggestedWeight: null};
  expect(plannedSetSessionTarget(set)).toBeNull();
  expect(plannedSetSessionTarget({...set, weight: 0})).toMatchObject({weight: 0});
});
