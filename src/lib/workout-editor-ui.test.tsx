// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { newPlannedSet, type WorkoutEditorPlan } from "./workout-editor";
const save=vi.hoisted(()=>vi.fn());
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/components/ui/page-header",()=>({PageHeader:({title,actions}: {title:string;actions:React.ReactNode})=>createElement("header",null,title,actions)}));
vi.mock("@/app/(app)/workout/next/actions",()=>({saveWorkoutDraft:save}));
vi.mock("@/app/(app)/session/actions",()=>({preparePlannedWorkout:vi.fn()}));
import { WorkoutPlanner } from "@/app/(app)/workout/next/workout-planner";
let root:Root;let host:HTMLDivElement;let plan:WorkoutEditorPlan;
function button(text:string) {return [...host.querySelectorAll("button")].find(b=>b.textContent===text)!;}
beforeEach(async()=>{
  vi.clearAllMocks();
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  window.HTMLElement.prototype.scrollIntoView=vi.fn();
  globalThis.requestAnimationFrame=fn=>{fn(0);return 0;};
  plan={version:1,slots:[{id:randomUUID(),programSlotId:null,exerciseId:"db-bench",pattern:"horizontal_press",restSeconds:120,supersetGroup:null,
    sets:[{...newPlannedSet(randomUUID(),{repMin:5,repMax:8,targetRirMin:1,targetRirMax:1}),weight:100}]}]};
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(createElement(WorkoutPlanner,{planKey:"key",programId:"program",dayId:"day",completed:0,sourceRevision:1,revision:0,
    programName:"Program",dayName:"Upper",week:1,slots:[],plan,recovery:null,stats:[],bodyweight:180,targetHistory:{progressionByExercise:{},effortBySlot:{}},catalog:Object.values(EXERCISE_BY_ID)})));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("keeps removal and Undo in one draft; Cancel restores the saved prescription",async()=>{
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  expect(button("Start workout")).toBeUndefined();
  await act(async()=>button("Remove exercise").click());
  expect(host.textContent).toContain("Add an exercise to build this workout");
  expect(save).not.toHaveBeenCalled();
  await act(async()=>button("Undo removal").click());
  expect((host.querySelector('[data-field="slots.0.sets.0.weight"]') as HTMLInputElement).value).toBe("100");
  await act(async()=>button("Use suggested weight").click());
  expect((host.querySelector('[data-field="slots.0.sets.0.weight"]') as HTMLInputElement).value).toBe("");
  await act(async()=>button("Cancel").click());
  expect(host.textContent).toContain("100 lb · Your target");
  expect(save).not.toHaveBeenCalled();
});
it("retains the whole draft on failed Save and retries the same request",async()=>{
  save.mockRejectedValue(new Error("Connection failed. Try again."));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  await act(async()=>button("Add set").click());
  await act(async()=>button("Save changes").click());
  expect(host.textContent).toContain("Connection failed");
  expect([...host.querySelectorAll("legend")].filter(l=>/^Set \d/.test(l.textContent ?? ""))).toHaveLength(2);
  await act(async()=>button("Save changes").click());
  expect(save.mock.calls[0][0].requestId).toBe(save.mock.calls[1][0].requestId);
  expect(save.mock.calls[0][0].scope).toBe("workout");
  expect(save.mock.calls[0][0].plan.slots[0].sets.map((s:{weight:number})=>s.weight)).toEqual([100,100]);
});
it("rejects an empty card and focuses its Add set control without writing",async()=>{
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  await act(async()=>button("Remove set").click());
  await act(async()=>button("Save changes").click());
  expect(save).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button("Add set"));
});

it("opens preserved normal-week effort and volume when editing a recovery occurrence",async()=>{
  const normal=Array.from({length:4},()=>({...newPlannedSet(randomUUID(),{repMin:5,repMax:8,targetRirMin:1,targetRirMax:1}),rirEdited:true,weight:100}));
  const recovery={id:"recovery",position:0,name:"Recovery",description:null,weekStart:3,weekEnd:3,targetRirMin:3,targetRirMax:4,setMultiplier:0.5,isDeload:true};
  const recoveryPlan:WorkoutEditorPlan={...plan,slots:[{...plan.slots[0],normalSets:normal,sets:normal.slice(0,2).map(r=>({...r,weight:null,rirMin:3,rirMax:4}))}]};
  await act(async()=>root.render(createElement(WorkoutPlanner,{planKey:"key",programId:"program",dayId:"day",completed:4,sourceRevision:1,revision:0,
    programName:"Program",dayName:"Upper",week:3,slots:[],plan:recoveryPlan,recovery,stats:[],bodyweight:180,targetHistory:{progressionByExercise:{},effortBySlot:{}},catalog:Object.values(EXERCISE_BY_ID)})));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  expect((host.querySelector('[data-field="slots.0.sets.0.rirMax"]') as HTMLInputElement).value).toBe("4");
  const scope=[...host.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==="program"))!;
  await act(async()=>{scope.value="program";scope.dispatchEvent(new Event("change",{bubbles:true}));});
  expect([...host.querySelectorAll("legend")].filter(l=>/^Set \d/.test(l.textContent ?? ""))).toHaveLength(4);
  expect((host.querySelector('[data-field="slots.0.sets.0.rirMax"]') as HTMLInputElement).value).toBe("1");
});
