// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type { PreviousNotesPage } from "./previous-notes";
const load=vi.hoisted(()=>vi.fn());
vi.mock("@/app/previous-notes-actions",()=>({getPreviousNotes:load}));
vi.mock("@/components/ui/sheet",async()=>{
  const {createContext,useContext,createElement}=await import("react");
  const Close=createContext(()=>{});
  return {Sheet:({children,onClose}:{children:React.ReactNode;onClose:()=>void})=>createElement(Close.Provider,{value:onClose},createElement("dialog",{open:true},children)),useSheetDismiss:()=>useContext(Close)};
});
import { PreviousNotes } from "@/components/ui/previous-notes";
let host:HTMLDivElement,root:Root;
const page:PreviousNotesPage={remembered:"Remembered only",equipmentLabel:null,workouts:[],nextCursor:null};
async function click(text:string){await act(async()=>{[...host.querySelectorAll("button")].find(b=>b.textContent?.includes(text))!.click();});}
async function render(exerciseId="first"){await act(async()=>root.render(createElement(PreviousNotes,{exerciseId,equipmentInstanceId:null,catalog:{}})));}
beforeEach(()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("loads only on demand, handles retry and keeps browsing read-only",async()=>{
  load.mockRejectedValueOnce(Error("offline")).mockResolvedValue(page);
  await render();expect(load).not.toHaveBeenCalled();
  await click("Previous notes");expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await click("Try again");expect(host.textContent).toContain("Remembered setup · not applied");
  expect(host.textContent).toContain("No previous workout notes");expect(host.querySelector("textarea,input")).toBeNull();
});
it("drops responses from the previous identity when selection changes",async()=>{
  let finish!:(result:PreviousNotesPage)=>void;
  load.mockImplementationOnce(()=>new Promise<PreviousNotesPage>(resolve=>{finish=resolve;})).mockResolvedValue({...page,remembered:"New identity"});
  await render();await click("Previous notes");expect(host.textContent).toContain("Loading");
  await render("second");expect(host.textContent).toContain("New identity");
  await act(async()=>finish({...page,remembered:"Wrong old identity"}));
  expect(host.textContent).not.toContain("Wrong old identity");expect(load).toHaveBeenLastCalledWith(expect.objectContaining({exerciseId:"second"}));
});
it("appends older workouts without duplicating already visible entries",async()=>{
  const workout={id:"workout",finishedAt:"2026-10-28T12:00:00Z",occurrences:[]};
  load.mockResolvedValueOnce({...page,workouts:[workout],nextCursor:{finishedAt:workout.finishedAt,id:workout.id}}).mockResolvedValueOnce({...page,workouts:[workout,{...workout,id:"older"}]});
  await render();await click("Previous notes");await click("Load older");
  expect(host.querySelectorAll('section[aria-label^="Workout"]')).toHaveLength(2);
  expect(host.textContent).not.toContain("Load older");
});
