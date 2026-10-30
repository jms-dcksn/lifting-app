"use client";

import { useEffect, useState } from "react";
import { getPreviousNotes } from "@/app/previous-notes-actions";
import type { NotesSelection, PreviousNotesPage } from "@/lib/previous-notes";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import { Sheet, useSheetDismiss } from "./sheet";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { IconNote } from "./icons";
import { ExerciseCardLabel } from "./exercise-card-label";

export function PreviousNotes({exerciseId,equipmentInstanceId,excludeSessionId,def,catalog,equipmentLabel,inline=false}: Omit<NotesSelection,"cursor"> & {
  def?:ExerciseDef;catalog:Record<string,ExerciseDef>;equipmentLabel?:string;inline?:boolean;
}) {
  const [open,setOpen] = useState(false);
  const name=def?.name??exerciseId;
  return <div className={inline ? "min-w-0" : "mt-2"}>
    <IconButton variant="ghost" className={`h-auto min-h-11 justify-start gap-2 text-left ${inline ? "w-auto" : "w-full"}`} aria-label={`Previous notes for ${name}`} onClick={()=>setOpen(true)}>
      <IconNote/><span className="text-caption">Previous notes</span>
    </IconButton>
    {open && <Sheet ariaLabel={`Previous notes for ${name}`} onClose={()=>setOpen(false)}>
      <NotesContent key={JSON.stringify([exerciseId,equipmentInstanceId,excludeSessionId])}
        selection={{exerciseId,equipmentInstanceId,excludeSessionId}} name={name} def={def} catalog={catalog} equipmentLabel={equipmentLabel}/>
    </Sheet>}
  </div>;
}
function NotesContent({selection,name,def,catalog,equipmentLabel}:{selection:NotesSelection;name:string;def?:ExerciseDef;catalog:Record<string,ExerciseDef>;equipmentLabel?:string}) {
  const dismiss=useSheetDismiss();
  const [page,setPage]=useState<PreviousNotesPage|null>(null);
  const [cursor,setCursor]=useState<NotesSelection["cursor"]>(null);
  const [attempt,setAttempt]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const {exerciseId,equipmentInstanceId,excludeSessionId}=selection;
  useEffect(()=>{
    let active=true;
    getPreviousNotes({exerciseId,equipmentInstanceId,excludeSessionId,cursor}).then(result=>{
      if(!active) return;
      setPage(previous=>({ ...result,workouts:[...(previous?.workouts??[]),...result.workouts.filter(w=>!previous?.workouts.some(p=>p.id===w.id))]}));
      setLoading(false);
    },()=>{if(active){setError(true);setLoading(false);}});
    return ()=>{active=false;};
  },[exerciseId,equipmentInstanceId,excludeSessionId,cursor,attempt]);
  return <div className="flex max-h-[80dvh] flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
    <header className="flex shrink-0 items-start justify-between gap-3 pb-4">
      <div className="min-w-0">{def?<ExerciseCardLabel as="h2" size="heading" def={def} catalog={catalog}/>:<h2 className="text-heading">{name}</h2>}
        <p className="text-caption text-muted">Previous notes</p>
        {(equipmentLabel || page?.equipmentLabel) && <p className="text-caption text-muted">{equipmentLabel??page?.equipmentLabel}</p>}
      </div>
      <Button variant="secondary" size="sm" onClick={dismiss}>Close</Button>
    </header>
    <div className="min-h-0 overflow-y-auto overscroll-contain" tabIndex={0} aria-label="Previous workout notes">
      {page?.remembered && <section className="mb-4 rounded-control bg-surface p-3"><h3 className="text-caption font-medium">Remembered setup · not applied</h3><Text value={page.remembered}/></section>}
      {page?.workouts.map(workout=><section key={workout.id} className="mb-4 rounded-card border border-border p-3" aria-label={`Workout ${workout.finishedAt}`}>
        <h3 className="text-body font-medium">Workout · <time dateTime={workout.finishedAt??undefined}>{new Date(workout.finishedAt!).toLocaleString()}</time></h3>
        {workout.occurrences.map((occurrence,index)=><div key={occurrence.id} className="mt-3 border-t border-border pt-2">
          {workout.occurrences.length>1 && <p className="text-caption text-muted">Occurrence {index+1} · {occurrence.occurrence_id.slice(0,8)}</p>}
          {occurrence.setup && <><h4 className="text-caption font-medium">Previous workout setup</h4><Text value={occurrence.setup}/></>}
          {occurrence.note && <><h4 className="mt-2 text-caption font-medium">Previous exercise note</h4><Text value={occurrence.note}/></>}
          {occurrence.setContexts.map(set=><div key={set.id} className="mt-2"><h4 className="text-caption font-medium">Set setup snapshot · {new Date(set.created_at).toLocaleTimeString()}</h4><Text value={set.setup_snapshot!}/></div>)}
          {!occurrence.setup && !occurrence.note && !occurrence.setContexts.length && <p className="text-caption text-muted">No saved notes for this occurrence.</p>}
        </div>)}
      </section>)}
      {page?.workouts.length===0 && <p className="py-4 text-muted">No previous workout notes for this exercise and equipment.</p>}
      {loading && <p role="status" className="py-4 text-muted">Loading previous notes…</p>}
      {error && <div role="alert"><p>Couldn’t load previous notes.</p><Button variant="secondary" onClick={()=>{setError(false);setLoading(true);setAttempt(a=>a+1);}}>Try again</Button></div>}
      {!loading && !error && page?.nextCursor && <Button variant="secondary" onClick={()=>{setLoading(true);setCursor(page.nextCursor);}}>Load older</Button>}
    </div>
  </div>;
}
function Text({value}:{value:string}) {
  return <details className="text-caption"><summary className="min-h-11 cursor-pointer py-2"><span className="line-clamp-2 whitespace-pre-wrap break-words">{value}</span><span className="text-faint">Read full text</span></summary><p className="whitespace-pre-wrap break-words pb-3">{value}</p></details>;
}
