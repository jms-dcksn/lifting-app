"use client";

import { useCallback, useState } from "react";
import { PreviousNotes } from "@/components/ui/previous-notes";
import { IconButton } from "@/components/ui/icon-button";
import { IconSettings, IconNote } from "@/components/ui/icons";
import { EditableTextSheet } from "@/components/ui/editable-text-sheet";
import { ExerciseCardLabel } from "@/components/ui/exercise-card-label";
import { supportsSetup, type WorkoutExerciseDetail, type RememberedSetup } from "@/lib/workout-details";
import { stationTemplateFor } from "@/lib/station";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import { saveWorkoutExerciseDetail } from "../actions";

export function WorkoutExerciseDetails({sessionId,slotId,exerciseId,equipmentInstanceId,catalog,details,remembered,equipmentLabels,compact=false,onChooseSetup}: {
  onChooseSetup?:()=>void;
  compact?:boolean;sessionId:string;slotId:string;exerciseId:string;equipmentInstanceId:string|null;
  equipmentLabels:Record<string,string>;
  catalog:Record<string,ExerciseDef>;details:WorkoutExerciseDetail[];remembered:RememberedSetup[];
}) {
  const [editing,setEditing]=useState<{kind:"setup"|"note";exerciseId:string;equipment:string|null;initial:string|null;reference:string|null}|null>(null);
  const close=useCallback(()=>setEditing(null),[]);
  const def=catalog[exerciseId];
  const current=details.find(d=>d.exercise_id===exerciseId && d.equipment_instance_id===equipmentInstanceId);
  const reference=remembered.find(d=>d.exercise_id===exerciseId && d.equipment_instance_id===equipmentInstanceId);
  function open(kind:"setup"|"note",id=exerciseId,equipment=equipmentInstanceId) {
    const detail=details.find(d=>d.exercise_id===id && d.equipment_instance_id===equipment);
    const reference=remembered.find(d=>d.exercise_id===id && d.equipment_instance_id===equipment);
    setEditing({kind,exerciseId:id,equipment,initial:detail?.[kind]??null,reference:reference?.setup??null});
  }
  const label=def?.name??exerciseId;
  const template=stationTemplateFor(def,catalog);
  const setupProfile=template?.stationProfile ?? def?.equipment;
  const setupTitle=setupProfile==="cable" ? "Cable setup" : "Machine setup";
  const canEditSetup=supportsSetup(def,catalog);
  const needsSetupStation=!canEditSetup && !!template && (setupProfile==="machine" || setupProfile==="cable");
  return <div className="mt-3 border-t border-border pt-2">
    <div className="grid grid-cols-2 items-start gap-x-3 gap-y-1">
      {canEditSetup && <DetailAction compact={compact} title={setupTitle} label={`Edit machine or cable setup for ${label}`} saved={!!current?.setup}
        value={current?.setup??reference?.setup} remembered={!current?.setup && !!reference?.setup}
        onClick={()=>open("setup")}><IconSettings /></DetailAction>}
      {needsSetupStation && <DetailAction compact={compact}
        title={setupTitle} label={`Choose ${setupProfile} to edit setup for ${label}`} saved={false}
        status={onChooseSetup ? `Choose ${setupProfile} first` : `No ${setupProfile} selected`} disabled={!onChooseSetup} onClick={()=>onChooseSetup?.()}><IconSettings /></DetailAction>}
      <DetailAction compact={compact} title="Exercise note" label={`Edit exercise note for ${label}`} saved={!!current?.note} value={current?.note}
        onClick={()=>open("note")}><IconNote /></DetailAction>
    {compact && <div className={canEditSetup || needsSetupStation ? "col-span-2" : undefined}><PreviousNotes inline exerciseId={exerciseId} equipmentInstanceId={equipmentInstanceId} excludeSessionId={sessionId} def={def} catalog={catalog} equipmentLabel={equipmentInstanceId?equipmentLabels[equipmentInstanceId]:undefined}/></div>}
    </div>
    {!compact && <PreviousNotes exerciseId={exerciseId} equipmentInstanceId={equipmentInstanceId} excludeSessionId={sessionId} def={def} catalog={catalog} equipmentLabel={equipmentInstanceId?equipmentLabels[equipmentInstanceId]:undefined}/>}
    {details.some(d=>d.exercise_id!==exerciseId || d.equipment_instance_id!==equipmentInstanceId) && <details className="mt-2 text-caption">
      <summary className="min-h-11 cursor-pointer py-3">Earlier exercise details</summary>
      {details.filter(d=>d.exercise_id!==exerciseId || d.equipment_instance_id!==equipmentInstanceId).map(d=><div key={d.id} className="mt-2 rounded-control bg-surface p-3">
        {catalog[d.exercise_id]?<ExerciseCardLabel as="p" size="body" def={catalog[d.exercise_id]} catalog={catalog}/>:<p className="font-medium">{d.exercise_id}</p>}{d.equipment_instance_id && <p>{equipmentLabels[d.equipment_instance_id]??d.equipment_instance_id}</p>}
        {d.setup && <button type="button" className="block min-h-11 w-full break-words text-left" onClick={()=>open("setup",d.exercise_id,d.equipment_instance_id)}>Setup: {d.setup}</button>}
        {d.note && <button type="button" className="block min-h-11 w-full break-words text-left" onClick={()=>open("note",d.exercise_id,d.equipment_instance_id)}>Exercise note: {d.note}</button>}
      </div>)}
    </details>}
    {editing && <EditableTextSheet title={editing.kind==="setup"?"Machine / cable setup":"Exercise note"}
      identity={<>{catalog[editing.exerciseId]?<ExerciseCardLabel as="div" size="body" def={catalog[editing.exerciseId]} catalog={catalog}/>:editing.exerciseId}{editing.equipment && <p>{equipmentLabels[editing.equipment]??editing.equipment}</p>}</>}
      label={editing.kind==="setup"?"Setup for this workout":"Observation for this exercise in this workout"}
      initial={editing.initial}
      placeholder={editing.kind==="setup"?"Seat 4, back pad 2; pulley at 12, rope attachment":"Last set felt unstable; shorten range next time"}
      remembered={editing.kind==="setup"?editing.reference:undefined}
      onClose={close} onSave={async(text,remember)=>{
        await saveWorkoutExerciseDetail({sessionId,slotId,exerciseId:editing.exerciseId,equipmentInstanceId:editing.equipment,kind:editing.kind,text,
          expected:editing.initial,remember,referenceExpected:editing.reference});
      }}/>}
  </div>;
}
function DetailAction({title,label,value,saved,remembered,onClick,children,compact=false,status,disabled}:{compact?:boolean;title:string;label:string;value?:string|null;saved:boolean;remembered?:boolean;onClick:()=>void;children:React.ReactNode;status?:string;disabled?:boolean}) {
  return <div className={compact ? "min-w-0" : "min-w-0 rounded-control bg-surface px-2 pb-2"}>
    <IconButton variant="ghost" className="h-auto min-h-11 w-full justify-start gap-2 py-1 text-left" aria-label={label} disabled={disabled} onClick={onClick}>{children}
      <span className="min-w-0 text-caption">{title}<span className="block text-faint">{status??(saved?"Saved":remembered?"Remembered · not applied":"Add")}</span></span></IconButton>
    {value && <button type="button" aria-label={`Read ${title.toLowerCase()}: ${label}`} onClick={onClick} className="line-clamp-2 min-h-11 w-full break-words text-left text-caption text-muted">{value}</button>}
  </div>;
}
