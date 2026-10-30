// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkoutExerciseDetails } from "@/app/(app)/session/[id]/workout-exercise-details";
import { EXERCISE_BY_ID } from "./strength/coefficients";

vi.mock("@/app/(app)/session/actions",()=>({saveWorkoutExerciseDetail:vi.fn()}));
let root:Root,host:HTMLDivElement;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});
  HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false;});
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});

it("keeps setup discoverable before choosing a machine, without editing unresolved setup",async()=>{
  const choose=vi.fn();
  await act(async()=>root.render(createElement(WorkoutExerciseDetails,{
    compact:true,sessionId:"session",slotId:"slot",exerciseId:"assisted-pullup",equipmentInstanceId:null,
    catalog:EXERCISE_BY_ID,details:[],remembered:[],equipmentLabels:{},onChooseSetup:choose,
  })));
  const setup=host.querySelector<HTMLButtonElement>('[aria-label^="Choose machine to edit setup"]');
  expect(setup).not.toBeNull();
  expect(setup?.textContent).toContain("Machine setup");
  expect(setup?.textContent).toContain("Choose machine first");
  await act(async()=>setup!.click());
  expect(choose).toHaveBeenCalledOnce();
  expect(host.querySelector("textarea")).toBeNull();
});

it("shows saved machine settings and opens their editor independently of exercise notes",async()=>{
  const def={...EXERCISE_BY_ID["assisted-pullup"],id:"machine",baseExerciseId:"assisted-pullup",stationProfile:undefined};
  await act(async()=>root.render(createElement(WorkoutExerciseDetails,{
    compact:true,sessionId:"session",slotId:"slot",exerciseId:def.id,equipmentInstanceId:null,
    catalog:{...EXERCISE_BY_ID,[def.id]:def},equipmentLabels:{},remembered:[],
    details:[{id:"detail",occurrence_id:"slot",exercise_id:def.id,equipment_instance_id:null,setup:"Knee pad 4",note:"Keep shoulders down"}],
  })));
  const setup=host.querySelector<HTMLButtonElement>('[aria-label^="Edit machine or cable setup"]')!;
  expect(setup.textContent).toContain("Machine setup");
  expect(host.textContent).toContain("Knee pad 4");
  expect(host.textContent).toContain("Keep shoulders down");
  await act(async()=>setup.click());
  expect(host.querySelector("textarea")?.value).toBe("Knee pad 4");
});
