// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { newPlannedSet, type WorkoutEditorPlan } from "./workout-editor";
import { draftStation } from "./workout-editor-station";
const save=vi.hoisted(()=>vi.fn());
const resolveStation=vi.hoisted(()=>vi.fn());
vi.mock("@/app/(app)/exercise/actions",()=>({resolveVariant:resolveStation,createCustomExercise:vi.fn()}));
vi.mock("@/components/ui/sheet",async()=>{
  const {createContext,useContext,createElement}=await import("react");
  const Dismiss=createContext(()=>{});
  return {
    Sheet:({children,onClose,ariaLabel}: {children:React.ReactNode;onClose:()=>void;ariaLabel?:string})=>createElement(Dismiss.Provider,{value:onClose},createElement("dialog",{open:true,role:"dialog","aria-label":ariaLabel},createElement("button",{onClick:onClose,"aria-label":"Dismiss sheet"},"Dismiss sheet"),children)),
    useSheetDismiss:()=>useContext(Dismiss),
  };
});
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/components/ui/page-header",()=>({PageHeader:({title,actions}: {title:string;actions:React.ReactNode})=>createElement("header",null,title,actions)}));
vi.mock("@/app/(app)/workout/next/actions",()=>({saveWorkoutDraft:save}));
vi.mock("@/app/(app)/session/actions",()=>({preparePlannedWorkout:vi.fn()}));
import { WorkoutPlanner } from "@/app/(app)/workout/next/workout-planner";
let root:Root;let host:HTMLDivElement;let plan:WorkoutEditorPlan;
function button(text:string) {return [...host.querySelectorAll("button")].find(b=>b.textContent===text || b.getAttribute("aria-label")===text)!;}
async function editSet(set=1,kind="reps",exercise=1) {
  await act(async()=>button(`Edit ${kind} for set ${set} of exercise ${exercise}`).click());
}
async function setNumber(path:string,value:string) {
  const input=host.querySelector<HTMLInputElement>(`[role="dialog"] [data-field="${path}"]`)
    ??host.querySelector<HTMLInputElement>(`[data-field="${path}"]`)!;
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
}
async function discard() {
  await act(async()=>button("Cancel").click());
  await act(async()=>button("Discard changes").click());
}
beforeEach(async()=>{
  vi.resetAllMocks();
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  window.HTMLElement.prototype.scrollIntoView=vi.fn();
  globalThis.requestAnimationFrame=fn=>{fn(0);return 0;};
  globalThis.cancelAnimationFrame=vi.fn();
  plan={version:1,slots:[{id:randomUUID(),programSlotId:null,exerciseId:"db-bench",pattern:"horizontal_press",restSeconds:120,supersetGroup:null,
    sets:[{...newPlannedSet(randomUUID(),{repMin:5,repMax:8,targetRirMin:1,targetRirMax:1}),weight:100}]}]};
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(createElement(WorkoutPlanner,{planKey:"key",programId:"program",dayId:"day",completed:0,sourceRevision:1,revision:0,
    programName:"Program",dayName:"Upper",week:1,slots:[],plan,recovery:null,stats:[],bodyweight:180,targetHistory:{progressionByExercise:{},effortBySlot:{}},catalog:Object.values(EXERCISE_BY_ID)})));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("shows a Home start failure beside a retryable saved workout",async()=>{
  await act(async()=>root.render(createElement(WorkoutPlanner,{key:"retry",planKey:"key",programId:"program",dayId:"day",completed:0,sourceRevision:1,revision:0,
    initialError:"Could not start your workout. Your plan is still saved. Try again.",
    programName:"Program",dayName:"Upper",week:1,slots:[],plan,recovery:null,stats:[],bodyweight:180,targetHistory:{progressionByExercise:{},effortBySlot:{}},catalog:Object.values(EXERCISE_BY_ID)})));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Your plan is still saved");
  expect(button("Start workout").disabled).toBe(false);
  expect(host.textContent).toContain("100 lb · Your target");
});
it("keeps removal and Undo in one draft; Cancel restores the saved prescription",async()=>{
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  expect(button("Start workout")).toBeUndefined();
  await act(async()=>button("Remove exercise 1").click());
  expect(host.textContent).toContain("Add an exercise to build this workout");
  expect(save).not.toHaveBeenCalled();
  await act(async()=>button("Undo removal").click());
  expect((host.querySelector('[data-field="slots.0.sets.0.weight"]') as HTMLInputElement).value).toBe("100");
  await editSet();
  await act(async()=>button("Use suggested weight").click());
  await act(async()=>button("Done").click());
  expect((host.querySelector('[data-field="slots.0.sets.0.weight"]') as HTMLInputElement).value).toBe("");
  await discard();
  expect(host.textContent).toContain("100 lb · Your target");
  expect(save).not.toHaveBeenCalled();
});
it("retains the whole draft on failed Save and retries the same request",async()=>{
  save.mockRejectedValue(new Error("Connection failed. Try again."));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  await act(async()=>button("+ Add set").click());
  await act(async()=>button("Save changes").click());
  expect(host.textContent).toContain("Connection failed");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
  await act(async()=>button("Save changes").click());
  expect(save.mock.calls[0][0].requestId).toBe(save.mock.calls[1][0].requestId);
  expect(save.mock.calls[0][0].scope).toBe("workout");
  expect(save.mock.calls[0][0].plan.slots[0].sets.map((s:{weight:number})=>s.weight)).toEqual([100,100]);
});
it("rejects an empty card and focuses its Add set control without writing",async()=>{
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  await editSet();
  await act(async()=>button("Remove set").click());
  await act(async()=>button("Save changes").click());
  expect(save).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button("+ Add set"));
});

it("opens preserved normal-week effort and volume when editing a recovery occurrence",async()=>{
  const normal=Array.from({length:4},()=>({...newPlannedSet(randomUUID(),{repMin:5,repMax:8,targetRirMin:1,targetRirMax:1}),rirEdited:true,weight:100}));
  const recovery={id:"recovery",position:0,name:"Recovery",description:null,weekStart:3,weekEnd:3,targetRirMin:3,targetRirMax:4,setMultiplier:0.5,isDeload:true};
  const recoveryPlan:WorkoutEditorPlan={...plan,slots:[{...plan.slots[0],normalSets:normal,sets:normal.slice(0,2).map(r=>({...r,weight:null,rirMin:3,rirMax:4}))}]};
  await act(async()=>root.render(createElement(WorkoutPlanner,{planKey:"key",programId:"program",dayId:"day",completed:4,sourceRevision:1,revision:0,
    programName:"Program",dayName:"Upper",week:3,slots:[],plan:recoveryPlan,recovery,stats:[],bodyweight:180,targetHistory:{progressionByExercise:{},effortBySlot:{}},catalog:Object.values(EXERCISE_BY_ID)})));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  await editSet(1,"RIR");
  expect((host.querySelector('[data-field="slots.0.sets.0.rirMax"]') as HTMLInputElement).value).toBe("4");
  await act(async()=>button("Done").click());
  const scope=[...host.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==="program"))!;
  await act(async()=>{scope.value="program";scope.dispatchEvent(new Event("change",{bubbles:true}));});
  expect(host.querySelectorAll('tbody tr')).toHaveLength(4);
  await editSet(1,"RIR");
  expect((host.querySelector('[data-field="slots.0.sets.0.rirMax"]') as HTMLInputElement).value).toBe("1");
});

it.each([
  ["machine-chest-press","machine","selectorized"],
  ["lat-pulldown","cable","selectorized"],
  ["bb-deadlift","platform","platform"],
  ["bb-back-squat","rack","rack"],
  ["bb-bench","bench","bench"],
] as const)("changes %s equipment in the draft and preserves prescriptions until Save",async(baseExerciseId,noun,machineType)=>{
  const old=draftStation({baseExerciseId,brand:"Life Fitness",machineType},"old-station");
  const normal=Array.from({length:4},()=>({...plan.slots[0].sets[0],id:randomUUID()}));
  const stationPlan:WorkoutEditorPlan={...plan,slots:[{...plan.slots[0],exerciseId:old.id,equipmentInstanceId:"previous-instance",pattern:old.pattern,
    sets:normal.slice(0,2),normalSets:normal}]};
  const catalog=[...Object.values(EXERCISE_BY_ID),old];
  await act(async()=>root.render(createElement(WorkoutPlanner,{key:baseExerciseId,planKey:"key",programId:"program",dayId:"day",completed:0,sourceRevision:1,revision:0,
    programName:"Program",dayName:"Upper",week:1,slots:[],plan:stationPlan,recovery:null,stats:[],bodyweight:180,targetHistory:{progressionByExercise:{},effortBySlot:{}},catalog})));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  await act(async()=>button(`Change ${noun}`).click());
  expect(host.querySelector('[placeholder="Search exercises…"]')).toBeNull();
  const brand=host.querySelector<HTMLSelectElement>('select[aria-label="Brand"]')!;
  await act(async()=>{brand.value="Technogym";brand.dispatchEvent(new Event("change",{bubbles:true}));});
  await act(async()=>button(`Use this ${noun}`).click());
  expect(resolveStation).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect((host.querySelector('[data-field="slots.0.sets.0.weight"]') as HTMLInputElement).value).toBe("");
  save.mockResolvedValue({issues:[]});
  await act(async()=>button("Save changes").click());
  const result=save.mock.calls[0][0].plan as WorkoutEditorPlan;
  expect(result.variants).toEqual([expect.objectContaining({baseExerciseId,brand:"Technogym",machineType})]);
  expect(result.slots[0]).toMatchObject({id:stationPlan.slots[0].id,programSlotId:null,equipmentInstanceId:null,pattern:old.pattern,restSeconds:120,supersetGroup:null,
    exerciseId:result.variants![0].id});
  for(const rows of [result.slots[0].sets,result.slots[0].normalSets!]) {
    expect(rows.map(row=>row.id)).toEqual(normal.slice(0,rows.length).map(row=>row.id));
    expect(rows.every(row=>row.weight===null && row.seedAt===null && row.repMin===5 && row.repMax===8 && row.rirMin===1 && row.rirMax===1)).toBe(true);
  }
});

it("offers Choose for unresolved equipment and Cancel discards a new station",async()=>{
  const stationPlan:WorkoutEditorPlan={...plan,slots:[{...plan.slots[0],exerciseId:"machine-chest-press"}]};
  await act(async()=>root.render(createElement(WorkoutPlanner,{key:"unresolved",planKey:"key",programId:"program",dayId:"day",completed:0,sourceRevision:1,revision:0,
    programName:"Program",dayName:"Upper",week:1,slots:[],plan:stationPlan,recovery:null,stats:[],bodyweight:180,targetHistory:{progressionByExercise:{},effortBySlot:{}},catalog:Object.values(EXERCISE_BY_ID)})));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  await act(async()=>button("Choose machine").click());
  await act(async()=>button("Use this machine").click());
  expect(button("Change machine")).toBeDefined();
  await discard();
  expect(save).not.toHaveBeenCalled();
  expect(resolveStation).not.toHaveBeenCalled();
  expect(host.textContent).toContain("100 lb · Your target");
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  expect(button("Choose machine")).toBeDefined();
});

it("does not offer station changes for an exercise without a station profile",async()=>{
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Edit workout"]')!.click());
  expect([...host.querySelectorAll("button")].some(b=>/^(Change|Choose) (machine|cable|platform|rack|bench)$/.test(b.textContent??""))).toBe(false);
});

it("validates range edits in the sheet and reopens an invalid hidden range on Save",async()=>{
  await act(async()=>button("Edit workout").click());
  expect(host.querySelector('[data-field="slots.0.sets.0.repMin"]')).toBeNull();
  await editSet();
  await setNumber("slots.0.sets.0.repMin","9");
  await act(async()=>button("Done").click());
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Maximum reps must be at least minimum reps");
  expect((document.activeElement as HTMLElement).dataset.field).toBe("slots.0.sets.0.repMax");
  // Dismissing the sheet retains the draft; Save must surface this hidden invalid field.
  await act(async()=>button("Dismiss sheet").click());
  await act(async()=>button("Save changes").click());
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Edit set 1");
  expect((document.activeElement as HTMLElement).dataset.field).toBe("slots.0.sets.0.repMax");
  await setNumber("slots.0.sets.0.repMax","12");
  await setNumber("slots.0.sets.0.rirMin","0");
  await act(async()=>button("Done").click());
  save.mockResolvedValue({issues:[]});
  await act(async()=>button("Save changes").click());
  expect(save.mock.calls[0][0].plan.slots[0].sets[0]).toMatchObject({repMin:9,repMax:12,rirMin:0,rirMax:1,targetReps:9,repsEdited:true,rirEdited:true});
});

it("undoes set removal without losing later weight edits",async()=>{
  await act(async()=>button("Edit workout").click());
  await act(async()=>button("+ Add set").click());
  await editSet();
  await act(async()=>button("Remove set").click());
  await setNumber("slots.0.sets.0.weight","75");
  await act(async()=>button("Undo removal").click());
  expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
  save.mockResolvedValue({issues:[]});
  await act(async()=>button("Save changes").click());
  const rows=save.mock.calls[0][0].plan.slots[0].sets;
  expect(rows[0]).toMatchObject({id:plan.slots[0].sets[0].id,weight:100});
  expect(rows[1].weight).toBe(75);
});

it("keeps secondary tools in More and validates hidden rest before saving",async()=>{
  await act(async()=>button("Edit workout").click());
  expect(host.querySelector('[data-field="slots.0.restSeconds"]')).toBeNull();
  expect(host.textContent).not.toContain("Apply first set RIR");
  await act(async()=>button("More options for exercise 1").click());
  await setNumber("slots.0.restSeconds","-1");
  await act(async()=>button("Done").click());
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect((document.activeElement as HTMLElement).dataset.field).toBe("slots.0.restSeconds");
  await setNumber("slots.0.restSeconds","90");
  await act(async()=>button("Done").click());
  expect(host.textContent).toContain("90s rest");
  await act(async()=>button("Cancel").click());
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Discard workout changes?");
  await act(async()=>button("Keep editing").click());
  expect(host.textContent).toContain("90s rest");
  save.mockResolvedValue({issues:[]});
  await act(async()=>button("Save changes").click());
  expect(save.mock.calls[0][0].plan.slots[0].restSeconds).toBe(90);
});
