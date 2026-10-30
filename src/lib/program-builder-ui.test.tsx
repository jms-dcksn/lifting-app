// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import type { Program } from "./program";
const save=vi.hoisted(()=>vi.fn());
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),replace:vi.fn()})}));
vi.mock("@/app/(app)/program/actions",()=>({saveProgram:save}));
vi.mock("@/app/(app)/program/exercise-picker",()=>({ExercisePicker:({onPick,onClose}:{onPick:(def:unknown)=>void;onClose:()=>void})=>createElement("button",{onClick:()=>{onPick(EXERCISE_BY_ID['db-shoulder-press']);onClose();}},"Pick shoulder press")}));
vi.mock("@/components/ui/sheet",async()=>{
  const {createContext,useContext,createElement}=await import("react");const Dismiss=createContext(()=>{});
  return {Sheet:({children,onClose,ariaLabel}:{children:React.ReactNode;onClose:()=>void;ariaLabel?:string})=>createElement(Dismiss.Provider,{value:onClose},createElement("dialog",{open:true,"aria-label":ariaLabel},children)),useSheetDismiss:()=>useContext(Dismiss)};
});
vi.mock("@/components/ui/page-header",()=>({PageHeader:({title}:{title:string})=>createElement("header",null,title)}));
import { ProgramBuilder } from "@/app/(app)/program/program-builder";
let root:Root,host:HTMLDivElement;
const baseSlot={id:"slot-1",exerciseId:"db-bench",pattern:"horizontal_press" as const,targetSets:3,repMin:6,repMax:8,targetRir:2,restSeconds:120,plateauPatience:null};
const initial:Program={id:"program",name:"Strong",description:"Keep this description",tags:["strength"],weeks:5,style:"classic",isActive:true,phases:[],days:[
  {id:"day-1",name:"Upper",slots:[baseSlot]},
  {id:"day-2",name:"Lower",slots:[{...baseSlot,id:"slot-2",exerciseId:"bb-rdl",pattern:"hinge"}]},
]};
function button(label:string){return [...host.querySelectorAll("button")].find(b=>b.textContent===label||b.getAttribute("aria-label")===label)!;}
async function input(label:string,value:string){const el=host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));});}
beforeEach(async()=>{vi.clearAllMocks();(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root.render(createElement(ProgramBuilder,{initial:structuredClone(initial),recentIds:[],catalog:Object.values(EXERCISE_BY_ID)})));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("switches days without dropping prescriptions and saves the complete program",async()=>{
  const tab=button("Day 2 · Lower");expect(tab).toBeDefined();await act(async()=>tab.click());
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Day name"]')!.value).toBe("Lower");
  await act(async()=>button("Day 1 · Upper").click());await act(async()=>button("Save changes").click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({description:initial.description,tags:initial.tags,days:expect.arrayContaining([expect.objectContaining({id:"day-2"})])}));
});
it("applies valid rep ranges explicitly and discards cancelled sheet edits",async()=>{
  const range=button("Edit rep range for Dumbbell Bench Press");expect(range).toBeDefined();await act(async()=>range.click());
  await input("Minimum reps","12");await input("Maximum reps","8");await act(async()=>button("Apply range").click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("maximum");
  await act(async()=>button("Cancel range").click());expect(button("Edit rep range for Dumbbell Bench Press").textContent).toBe("6–8");
  await act(async()=>button("Edit rep range for Dumbbell Bench Press").click());await input("Minimum reps","8");await input("Maximum reps","12");await act(async()=>button("Apply range").click());
  await act(async()=>button("Save changes").click());expect(save.mock.calls[0][0].days[0].slots[0]).toMatchObject({repMin:8,repMax:12});
});
it("changes an exercise without resetting its prescription and retains a failed save",async()=>{
  expect(button("Change exercise for Dumbbell Bench Press")).toBeDefined();await act(async()=>button("Change exercise for Dumbbell Bench Press").click());await act(async()=>button("Pick shoulder press").click());
  save.mockRejectedValueOnce(new Error("Save unavailable"));await act(async()=>button("Save changes").click());expect(host.textContent).toContain("Save unavailable");
  await act(async()=>button("Save changes").click());expect(save.mock.calls[1][0].days[0].slots[0]).toMatchObject({exerciseId:'db-shoulder-press',targetSets:3,repMin:6,repMax:8,restSeconds:120});
});

it("cancels option drafts without changing inherited tempo or rest",async()=>{
  await act(async()=>button("More options for Dumbbell Bench Press").click());
  await input("Rest seconds","180");
  await act(async()=>button("Cancel options").click());
  await act(async()=>button("Save changes").click());
  expect(save.mock.calls[0][0].days[0].slots[0]).toMatchObject({restSeconds:120,tempo:null,supersetGroup:null});
});
it("saves secondary options without materializing an unchanged default tempo",async()=>{
  await act(async()=>button("More options for Dumbbell Bench Press").click());
  await input("Rest seconds","180");
  await act(async()=>button("Apply options").click());
  await act(async()=>button("Save changes").click());
  expect(save.mock.calls[0][0].days[0].slots[0]).toMatchObject({restSeconds:180,tempo:null});
});
