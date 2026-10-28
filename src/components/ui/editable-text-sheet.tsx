"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sheet, useSheetDismiss } from "./sheet";
import { Button } from "./button";
import { WORKOUT_TEXT_LIMIT, normalizeWorkoutText } from "@/lib/workout-details";

export function EditableTextSheet({ title, identity, label, initial, placeholder, remembered, onSave, onClose }: {
  title: string; identity: React.ReactNode; label: string; initial: string | null;
  placeholder: string; remembered?: string | null;
  onSave: (text: string | null, remember: boolean) => Promise<void>; onClose: () => void;
}) {
  const [text, setText] = useState(initial ?? "");
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(0);
  const allowClose = useRef(false);
  const dirty = text !== (initial ?? "") || remember;
  const dirtyRef = useRef(dirty);
  const pendingRef = useRef(pending);
  const onCloseRef = useRef(onClose);
  useEffect(()=>{dirtyRef.current=dirty;pendingRef.current=pending;onCloseRef.current=onClose;},[dirty,pending,onClose]);
  const id = useId();

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => setKeyboard(viewport ? Math.max(0,innerHeight-viewport.height-viewport.offsetTop) : 0);
    viewport?.addEventListener("resize",resize); viewport?.addEventListener("scroll",resize);
    const unload = (event: BeforeUnloadEvent) => { if(dirtyRef.current || pendingRef.current) event.preventDefault(); };
    window.addEventListener("beforeunload",unload);
    // Defer the sentinel so Strict Mode's mount/cleanup replay cannot navigate Back.
    let added=false;
    const push=()=>{history.pushState({...history.state,workoutText:id},"",location.href);added=true;};
    const frame=requestAnimationFrame(push);
    const back = () => {
      if(!added) return;
      added=false;
      if(pendingRef.current || (dirtyRef.current && !confirm("Discard unsaved text?"))) push();
      else {allowClose.current=true;onCloseRef.current();}
    };
    window.addEventListener("popstate",back);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize",resize);viewport?.removeEventListener("scroll",resize);
      window.removeEventListener("beforeunload",unload);window.removeEventListener("popstate",back);
      if(added && history.state?.workoutText===id) history.back();
    };
  },[id]);

  return <Sheet ariaLabel={title} onClose={onClose} dismissible={!pending}
    onBeforeDismiss={() => allowClose.current || !dirtyRef.current || confirm("Discard unsaved text?")}
    style={{bottom:keyboard,maxHeight:`calc(90dvh - ${keyboard}px)`}}>
    <TextBody title={title} identity={identity}>
      <label className="block text-caption text-muted" htmlFor={id}>{label}</label>
      <textarea id={id} disabled={pending} value={text} rows={5} placeholder={placeholder} aria-describedby={`${id}-count`} aria-invalid={Array.from(text).length>WORKOUT_TEXT_LIMIT || undefined}
        className="mt-1 min-h-32 w-full resize-y rounded-control border border-border bg-surface p-3 text-body focus-visible:outline-2 focus-visible:outline-foreground"
        onChange={event=>{setText(event.target.value);setError(null);}} />
      <p id={`${id}-count`} className="text-caption text-muted">{Array.from(text).length.toLocaleString()} / {WORKOUT_TEXT_LIMIT.toLocaleString()} characters</p>
      {remembered !== undefined && <>
        {remembered && <details className="mt-3 rounded-control bg-surface p-3"><summary className="min-h-11 cursor-pointer py-2 text-caption">Remembered setup</summary><p className="whitespace-pre-wrap break-words text-body">{remembered}</p>
          <Button type="button" variant="secondary" disabled={pending} onClick={()=>setText(remembered)}>Use remembered setup</Button></details>}
        <label className="mt-3 flex min-h-11 items-center gap-2 text-body"><input type="checkbox" disabled={pending} checked={remember} onChange={event=>setRemember(event.target.checked)} />Remember for this machine / cable</label>
      </>}
      {error && <p role="alert" className="mt-3 text-body text-danger">{error}</p>}
      <TextActions pending={pending} clear={()=>setText("")} save={async dismiss=>{
        if(pending) return;
        try {
          const normalized=normalizeWorkoutText(text);
          setPending(true);setError(null);
          await onSave(normalized,remember);allowClose.current=true;dismiss();
        } catch(cause) {setError(cause instanceof Error?cause.message:"Could not save. Your draft is still here. Try again.");}
        finally {setPending(false);}
      }} />
    </TextBody>
  </Sheet>;
}
function TextBody({title,identity,children}:{title:string;identity:React.ReactNode;children:React.ReactNode}) {
  return <div className="max-h-[inherit] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6"><h2 className="text-heading">{title}</h2><div className="mb-4 mt-1 text-body text-muted">{identity}</div>{children}</div>;
}
function TextActions({pending,clear,save}:{pending:boolean;clear:()=>void;save:(dismiss:()=>void)=>void}) {
  const dismiss=useSheetDismiss();
  return <div className="sticky bottom-0 mt-4 flex flex-wrap gap-2 bg-background pb-2 pt-3">
    <Button type="button" variant="ghost" disabled={pending} onClick={clear}>Clear</Button>
    <Button type="button" variant="secondary" disabled={pending} onClick={dismiss}>Cancel</Button>
    <Button type="button" className="flex-1" pending={pending} onClick={()=>save(dismiss)}>Save</Button>
  </div>;
}
