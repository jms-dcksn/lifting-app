// @vitest-environment jsdom
import { act,createElement,StrictMode } from "react";
import { createRoot,type Root } from "react-dom/client";
import { afterEach,beforeEach,it,expect,vi } from "vitest";
import { EditableTextSheet } from "@/components/ui/editable-text-sheet";
let root:Root,host:HTMLDivElement;
const save=vi.fn(),close=vi.fn();
beforeEach(async()=>{
  vi.clearAllMocks();vi.useFakeTimers();
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});
  HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false;});
  vi.spyOn(history,"back").mockImplementation(()=>{});
  vi.spyOn(window,"confirm").mockReturnValue(false);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(createElement(StrictMode,null,createElement(EditableTextSheet,{title:"Exercise note",identity:"Bench",label:"Observation",initial:"Saved",placeholder:"Example",onSave:save,onClose:close}))));
});
afterEach(async()=>{await act(async()=>vi.runOnlyPendingTimers());await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.useRealTimers();});
async function text(value:string) {
  const area=host.querySelector("textarea")!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(area,value);area.dispatchEvent(new Event("input",{bubbles:true}));});
}
function button(label:string){return [...host.querySelectorAll("button")].find(b=>b.textContent===label)!;}
it("preserves text and exposes a retry after a failed save",async()=>{
  save.mockRejectedValueOnce(new Error("Connection failed. Try again."));
  await text("A new observation");await act(async()=>button("Save").click());
  expect(host.querySelector("textarea")!.value).toBe("A new observation");expect(host.textContent).toContain("Connection failed");expect(close).not.toHaveBeenCalled();
  save.mockResolvedValueOnce(undefined);
  await act(async()=>button("Save").click());expect(save).toHaveBeenLastCalledWith("A new observation",false);
});
it("rejects oversized text without truncation, and clearing still requires Save",async()=>{
  await text("a".repeat(2001));await act(async()=>button("Save").click());
  expect(save).not.toHaveBeenCalled();expect(host.querySelector("textarea")!.value).toHaveLength(2001);
  await act(async()=>button("Clear").click());expect(save).not.toHaveBeenCalled();
  save.mockRejectedValueOnce(new Error("offline"));await act(async()=>button("Save").click());expect(save).toHaveBeenCalledWith(null,false);
});
it("guards Escape and Cancel while a changed note is unsaved",async()=>{
  await text("Unsaved");
  await act(async()=>host.querySelector("dialog")!.dispatchEvent(new Event("cancel",{cancelable:true})));
  expect(window.confirm).toHaveBeenCalledWith("Discard unsaved text?");expect(close).not.toHaveBeenCalled();
  await act(async()=>button("Cancel").click());expect(host.querySelector("textarea")!.value).toBe("Unsaved");expect(close).not.toHaveBeenCalled();
});

it("does not navigate Back during Strict Mode effect replay",()=>{
  expect(history.back).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(host.querySelector("dialog")!.open).toBe(true);
});
