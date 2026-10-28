"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { TempoFields, TempoLabel } from "@/components/ui/tempo";
import { resolveTempo } from "@/lib/tempo";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { IconTrash } from "@/components/ui/icons";
import { EditorSheet, PlannedSetTable, type EditorPanel } from "./workout-editor-controls";
import { PageHeader } from "@/components/ui/page-header";
import { ExerciseCardLabel } from "@/components/ui/exercise-card-label";
import { ExerciseVisual } from "@/components/ui/exercise-visual";
import { recoverySets, newPlannedSet, normalizeGroups, validateEditorPlan, type EditorIssue, type PlannedSet, type PlannedSlot, type WorkoutEditorPlan } from "@/lib/workout-editor";
import { resolveExactWorkoutTarget } from "@/lib/effective-workout-target";
import { exactExerciseIdentity } from "@/lib/strength/identity";
import { draftStation } from "@/lib/workout-editor-station";
import { stationTemplateFor, swapStationLabel } from "@/lib/station";
import type { ResolveVariantInput } from "../../exercise/actions";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import { isSupersetEnd, supersetLabel } from "@/lib/superset";
import { ExercisePicker, StationPicker } from "../../program/exercise-picker";
import { preparePlannedWorkout } from "../../session/actions";
import { saveWorkoutDraft } from "./actions";

export function WorkoutPlanner({ planKey, programId, dayId, completed, sourceRevision, revision,
  programName, dayName, week, plan, recovery, stats, bodyweight, targetHistory, initialError, catalog: initialCatalog }: {
  initialError?: string;
  stats: import("@/lib/strength/recommend").ExerciseStat[]; bodyweight: number | null; targetHistory: import("@/lib/effective-workout-target").WorkoutTargetHistory;
  planKey: string; programId: string; dayId: string; completed: number; sourceRevision: number; revision: number;
  programName: string; dayName: string; week: number; recovery: import("@/lib/periodization").ProgramPhase | null; slots: unknown[]; plan: WorkoutEditorPlan; catalog: ExerciseDef[];
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState(initialCatalog);
  const catalogMap = Object.fromEntries(catalog.map(d => [d.id, d]));
  const [draft, setDraft] = useState<WorkoutEditorPlan | null>(null);
  const [saved, setSaved] = useState(plan);
  const [picking, setPicking] = useState<string | "add" | null>(null);
  const [stationSlotId, setStationSlotId] = useState<string | null>(null);
  type Removal = { kind: "exercise"; slot: PlannedSlot; index: number; before: PlannedSlot[] }
    | { kind: "set"; slotId: string; set: PlannedSet; index: number; normalSet?: PlannedSet; normalIndex: number };
  const [removed, setRemoved] = useState<Removal[]>([]);
  const [panel, setPanel] = useState<EditorPanel | null>(null);
  const [scope, setScope] = useState<"workout" | "program">("workout");
  const [pending, startSaving] = useTransition();
  const [issues, setIssues] = useState<EditorIssue[]>([]);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const [keyboardInset,setKeyboardInset]=useState(0);
  const request = useRef<{ content: string; id: string } | null>(null);
  const editing = draft !== null;
  const current = draft ?? saved;
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(saved);
  const panelIndex = panel && panel.kind !== "discard" ? current.slots.findIndex(slot => slot.id === panel.slotId) : -1;
  const panelSlot = current.slots[panelIndex];
  const panelSetIndex = panel?.kind === "set" ? panelSlot?.sets.findIndex(set => set.id === panel.setId) ?? -1 : -1;
  const panelSet = panelSlot?.sets[panelSetIndex];
  const panelRestSlot = panelSlot?.supersetGroup ? current.slots.filter(slot => slot.supersetGroup === panelSlot.supersetGroup).at(-1) : panelSlot;
  const panelRestPath = `slots.${current.slots.findIndex(slot => slot.id === panelRestSlot?.id)}.restSeconds`;
  const panelPath = `slots.${panelIndex}`;
  const setPath = `${panelPath}.sets.${panelSetIndex}`;
  const panelIssues = issues.filter(issue => panel?.kind === "set" ? issue.path.startsWith(`${setPath}.`) :
    panel?.kind === "options" && (issue.path === panelRestPath || issue.path === "slots"));
  const stationSlot = current.slots.find(slot => slot.id === stationSlotId);
  const stationTemplate = stationSlot ? stationTemplateFor(catalogMap[stationSlot.exerciseId], catalogMap) : null;

  // Preserve a failed/unsaved draft when revalidation changes server props.
  const [sourcePlan, setSourcePlan] = useState(plan);
  if (sourcePlan !== plan) { setSourcePlan(plan); if (!draft) setSaved(plan); }
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a[href]");
      if (anchor && !window.confirm("Discard unsaved workout changes?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    // Browsers cannot cancel popstate; retain a sentinel while editing and restore it
    // when Back is declined. Explicit Cancel/Save removes the sentinel without navigation.
    history.pushState({ workoutEditor: true }, "", location.href);
    const back = () => {
      if (window.confirm("Discard unsaved workout changes?")) { setDraft(null); history.back(); }
      else history.pushState({ workoutEditor: true }, "", location.href);
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
      window.removeEventListener("popstate", back);
      if (history.state?.workoutEditor) history.replaceState(null, "", location.href);
    };
  }, [dirty]);

  useEffect(()=>{
    const viewport=window.visualViewport;
    if(!editing || !viewport) return;
    const update=()=>setKeyboardInset(Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop));
    const frame=requestAnimationFrame(update);
    viewport.addEventListener("resize",update);viewport.addEventListener("scroll",update);
    return ()=>{cancelAnimationFrame(frame);viewport.removeEventListener("resize",update);viewport.removeEventListener("scroll",update);};
  },[editing]);

  function suggestedRow(def: ExerciseDef, row: PlannedSet, slotId: string): PlannedSet {
    const target = resolveExactWorkoutTarget({slotId,identity:exactExerciseIdentity(def.id,null),
      prescription:{repMin:row.repMin,repMax:row.repMax,targetRir:row.rirMax},context:null,
      history:targetHistory,catalog:{...catalogMap,[def.id]:def},stats,bodyweight,isDeload:recovery?.isDeload}).target;
    return {...row,weight:null,seedAt:null,suggestedWeight:target?.weight??null,targetReps:target?.targetReps??row.repMin};
  }
  function change(update: (value: WorkoutEditorPlan) => WorkoutEditorPlan) {
    setDraft(value => value ? update(value) : value);
    setIssues([]); setError(null);
  }
  function updateSlot(id: string, update: (slot: PlannedSlot) => PlannedSlot) {
    change(p => ({ ...p, slots: p.slots.map(s => s.id === id ? update(s) : s) }));
  }
  function updateSet(slotId: string, setId: string, field: keyof PlannedSet, value: number | null) {
    const now=new Date().toISOString();
    const patch=(row:PlannedSet):PlannedSet=>{
      if(row.id!==setId) return row;
      if(field==="repMin" || field==="repMax") {
        const next={...row,[field]:value,repsEdited:true,contextAt:now};
        return {...next,targetReps:next.repMin};
      }
      if(field==="rirMin" || field==="rirMax") return {...row,[field]:value,rirEdited:true,contextAt:now};
      return {...row,[field]:value,...(field==="weight"?{seedAt:value===null?null:now}:{})};
    };
    updateSlot(slotId,slot=>({...slot,sets:slot.sets.map(patch),normalSets:slot.normalSets?.map(patch)}));
  }
  async function resolveDraftVariant(input: ResolveVariantInput) {
    const existing=catalog.find(d=>d.baseExerciseId===input.baseExerciseId && (d.brand??null)===input.brand && d.machineType===input.machineType && (d.stationModel??null)===(input.stationModel??null));
    if(existing) return existing;
    const def=draftStation(input,`station-${crypto.randomUUID()}`);
    change(p=>({...p,variants:[...(p.variants??[]),{id:def.id,baseExerciseId:input.baseExerciseId,brand:input.brand,machineType:input.machineType,stationModel:input.stationModel??null}]}));
    return def;
  }
  function replaceExercise(slotId: string, def: ExerciseDef) {
    setCatalog(c=>c.some(d=>d.id===def.id)?c:[...c,def]);
    updateSlot(slotId,s=>def.id===s.exerciseId?s:({...s,equipmentInstanceId:null,exerciseId:def.id,pattern:def.pattern,normalSets:s.normalSets?.map(row=>suggestedRow(def,row,s.id)),
      sets:s.sets.map(row=>suggestedRow(def,row,s.id))}));
  }
  function addSet(slotId:string) {
    const id=crypto.randomUUID();
    updateSlot(slotId,slot=>{
      const previous=slot.sets.at(-1);
      const fallback=newPlannedSet(id,{repMin:8,repMax:12,targetRirMin:2,targetRirMax:2});
      const normal=slot.normalSets?.find(r=>r.id===previous?.id);
      return {...slot,sets:[...slot.sets,previous?{...previous,id}:fallback],
        normalSets:slot.normalSets?[...slot.normalSets,normal?{...normal,id}:fallback]:undefined};
    });
  }
  function reorder(index: number, offset: number) {
    change(p => {
      const rows = [...p.slots];
      const other = index + offset;
      if (other < 0 || other >= rows.length) return p;
      [rows[index], rows[other]] = [rows[other], rows[index]];
      return { ...p, slots: normalizeGroups(rows) };
    });
  }
  function apply(slot: PlannedSlot, field: "reps" | "weight" | "rir", suggested = false) {
    const first=slot.sets[0],now=new Date().toISOString();
    const patch=(row:PlannedSet):PlannedSet=>field==="reps"
      ? {...row,repMin:first.repMin,repMax:first.repMax,targetReps:first.repMin,repsEdited:true,contextAt:now}
      :field==="rir"?{...row,rirMin:first.rirMin,rirMax:first.rirMax,rirEdited:true,contextAt:now}
      :{...row,weight:suggested?null:first.weight,seedAt:suggested?null:now};
    updateSlot(slot.id,s=>({...s,sets:s.sets.map(patch),
      normalSets:s.normalSets?.map(row=>s.sets.some(visible=>visible.id===row.id)?patch(row):row)}));
  }
  function removeSet(slot: PlannedSlot, set: PlannedSet) {
    setRemoved(rows => [...rows, { kind: "set", slotId: slot.id, set: structuredClone(set), index: slot.sets.indexOf(set),
      normalSet: slot.normalSets?.find(row => row.id === set.id), normalIndex: slot.normalSets?.findIndex(row => row.id === set.id) ?? -1 }]);
    updateSlot(slot.id, s => ({ ...s, normalSets: s.normalSets?.filter(row => row.id !== set.id), sets: s.sets.filter(row => row.id !== set.id) }));
    setPanel(null);
  }
  function undoRemoval() {
    const last = removed.at(-1);
    if (!last) return;
    if (last.kind === "exercise") change(p => {
      const rows = [...p.slots]; rows.splice(Math.min(last.index, rows.length), 0, last.slot);
      return { ...p, slots: normalizeGroups(rows.map(s => ({ ...s, supersetGroup: last.before.find(b => b.id === s.id)?.supersetGroup ?? s.supersetGroup }))) };
    });
    else updateSlot(last.slotId, slot => {
      const sets = [...slot.sets]; sets.splice(Math.min(last.index, sets.length), 0, last.set);
      const normalSets = slot.normalSets ? [...slot.normalSets] : undefined;
      if (normalSets && last.normalSet) normalSets.splice(Math.min(last.normalIndex, normalSets.length), 0, last.normalSet);
      return { ...slot, sets, normalSets };
    });
    setRemoved(rows => rows.slice(0, -1));
  }
  function cancel() {
    setCatalog(initialCatalog); setDraft(null); setRemoved([]); setIssues([]); setError(null);
    setPicking(null); setStationSlotId(null); setPanel(null);
  }
  function focusIssue(found: EditorIssue[]) {
    const first = found[0];
    const match = first?.path.match(/^slots\.(\d+)(?:\.sets\.(\d+)\.(\w+))?/);
    const slot = match ? current.slots[Number(match[1])] : undefined;
    if (slot && match?.[2] !== undefined && match[3] !== "weight") {
      const set = slot.sets[Number(match[2])];
      if (set) setPanel({ kind: "set", slotId: slot.id, setId: set.id, field: match[3] === "targetReps" ? "repMin" : match[3] as keyof PlannedSet });
    } else if (slot && first.path.endsWith(".restSeconds")) setPanel({ kind: "options", slotId: slot.id, field: first.path });
    setIssues(found);
  }
  useEffect(() => {
    if (!issues.length) return;
    const frame = requestAnimationFrame(() => {
      const controls = [...(root.current?.querySelectorAll<HTMLElement>("[data-field]") ?? [])];
      const control = controls.find(el => el.closest("dialog") && el.dataset.field === issues[0].path)
        ?? controls.find(el => el.dataset.field === issues[0].path)
        ?? root.current?.querySelector<HTMLElement>("#editor-sheet-errors, #editor-errors");
      control?.focus(); control?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [issues, panel]);
  function finishPanel() {
    if (!draft) return true;
    const found = validateEditorPlan(draft, catalogMap).filter(issue => panel?.kind === "set"
      ? issue.path.startsWith(`${setPath}.`)
      : issue.path === panelRestPath || issue.path === "slots");
    if (found.length) { focusIssue(found); return false; }
    setIssues([]);
    return true;
  }
  function save() {
    if (!draft || pending) return;
    const found = validateEditorPlan(draft, catalogMap);
    if (found.length) { focusIssue(found); return; }
    const content = JSON.stringify({ draft, scope, sourceRevision, revision });
    if (request.current?.content !== content) request.current = { content, id: crypto.randomUUID() };
    setError(null);
    startSaving(async () => {
      try {
        const result = await saveWorkoutDraft({ key: planKey, programId, dayId, completed, sourceRevision,
          revision, scope, plan: draft, requestId: request.current!.id });
        if (result.issues.length) { focusIssue(result.issues); return; }
        setSaved(draft); setDraft(null); setRemoved([]); setPanel(null); request.current = null;
        setNotice(scope === "program" ? "Saved for this day for the remainder of the program." : "Workout changes saved.");
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Your changes are still here. Try again."); }
    });
  }
  function field(path: string) {
    return { "data-field": path, "aria-invalid": issues.some(i => i.path === path) || undefined,
      "aria-describedby": issues.some(i => i.path === path) ? panel ? "editor-sheet-errors" : "editor-errors" : undefined };
  }
  function numeric(path: string, label: string, value: number | null, onChange: (value: number | null) => void, nullable = false) {
    return <label className="flex min-w-0 flex-col gap-1 text-caption">{label}
      <Input {...field(path)} type="number" inputMode="decimal" step="any" value={Number.isNaN(value) ? "" : value ?? ""}
        onChange={event => onChange(event.target.value === "" ? nullable ? null : NaN : Number(event.target.value))} />
    </label>;
  }

  return <div ref={root} className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 pb-6">
    <PageHeader title={dayName} back={<Link href="/">← Home</Link>}
      context={<p className="text-caption text-muted">{programName} · Week {week}{editing ? " · Editing workout" : ""}</p>}
      actions={!editing ? <Button type="button" variant="ghost" aria-label="Edit workout" onClick={() => {
        setCatalog(initialCatalog);setDraft(structuredClone(saved)); setRemoved([]); setScope("workout"); setNotice(""); setError(null);
      }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z" stroke="currentColor" strokeWidth="1.75" /></svg><span className="hidden sm:inline">Edit workout</span></Button> : undefined} />
    {editing && scope==="program" && recovery?.setMultiplier!=null && recovery.setMultiplier<1 && <p className="text-caption">Editing normal-week sets. Recovery uses {Math.round(recovery.setMultiplier*100)}% volume and recovery RIR.</p>}
    <p className="text-caption text-muted">{current.slots.length} {current.slots.length===1?"exercise":"exercises"} · {current.slots.reduce((n,s) => n+s.sets.length,0)} working sets</p>
    <fieldset disabled={pending} className="contents">
    {current.slots.length === 0 && <Card><p>Add an exercise to build this workout.</p></Card>}
    {current.slots.map((slot, index) => {
      const def = catalogMap[slot.exerciseId];
      const path = `slots.${index}`;
      const restSlot=slot.supersetGroup?current.slots.filter(s=>s.supersetGroup===slot.supersetGroup).at(-1)!:slot;
      return <Card key={slot.id} className={editing ? "p-0!" : undefined} aria-label={`Exercise ${index + 1}`}>
        <div className={editing ? "px-3 pt-1" : ""}>
          <div className="flex min-h-11 items-center justify-between gap-2">
            <CardLabel>Exercise {index + 1}</CardLabel>
            {editing && <div className="flex shrink-0">
              <IconButton variant="ghost" aria-label={`Move exercise ${index + 1} up`} disabled={index === 0} onClick={() => reorder(index, -1)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 14 6-6 6 6" stroke="currentColor" strokeWidth="1.75" /></svg>
              </IconButton>
              <IconButton variant="ghost" aria-label={`Move exercise ${index + 1} down`} disabled={index === current.slots.length - 1} onClick={() => reorder(index, 1)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 10 6 6 6-6" stroke="currentColor" strokeWidth="1.75" /></svg>
              </IconButton>
              <IconButton variant="ghost" className="text-danger!" aria-label={`Remove exercise ${index + 1}`} onClick={() => {
                setRemoved(rows => [...rows, { kind: "exercise", slot: structuredClone(slot), index, before: structuredClone(current.slots) }]);
                change(p => ({ ...p, slots: normalizeGroups(p.slots.filter(s => s.id !== slot.id)) }));
              }}><IconTrash /></IconButton>
            </div>}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <ExerciseVisual exerciseId={slot.exerciseId} baseExerciseId={def?.baseExerciseId} size={editing ? "sm" : "lg"} />
            <div className="min-w-0 flex-1">{def ? <ExerciseCardLabel as="h3" size="heading" def={def} catalog={catalogMap} /> : <h3>{slot.exerciseId}</h3>}
              {slot.supersetGroup && <p className="text-caption text-muted">Superset {supersetLabel(current.slots, index)}</p>}
            </div>
          </div>
          {slot.normalSets && slot.normalSets.length !== slot.sets.length && <p className="mt-3 text-caption">Recovery: {slot.sets.length} of {slot.normalSets.length} normal-week sets</p>}
          {editing && <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="flex-1 whitespace-nowrap px-2! text-caption!" {...field(`${path}.exerciseId`)} onClick={() => setPicking(slot.id)}>Change exercise</Button>
            {stationTemplateFor(def, catalogMap) && <Button type="button" variant="secondary" className="flex-1 whitespace-nowrap px-2! text-caption!" onClick={() => setStationSlotId(slot.id)}>{swapStationLabel(def, catalogMap)?.replace("Swap ", "Change ")}</Button>}
          </div>}
          <div className="mt-3">{editing
            ? <TempoFields value={resolveTempo(def, slot.tempo)} onChange={tempo => updateSlot(slot.id, s => ({ ...s, tempo }))} />
            : <TempoLabel value={resolveTempo(def, slot.tempo)} />}</div>
        </div>
        {editing ? <>
          <PlannedSetTable slot={slot} index={index} assisted={def?.loadMode === "assisted"} issues={issues}
            onWeight={(setId, value) => updateSet(slot.id, setId, "weight", value)}
            onEdit={(setId, field) => setPanel({ kind: "set", slotId: slot.id, setId, field })} />
          <div className="flex flex-wrap items-center justify-between gap-1 p-2">
            <Button type="button" variant="ghost" className="px-2! text-caption! text-foreground!" {...field(`${path}.sets`)} onClick={() => addSet(slot.id)}>+ Add set</Button>
            <Button type="button" variant="ghost" className="px-2! text-caption!" aria-label={`More options for exercise ${index + 1}`}
              onClick={() => setPanel({ kind: "options", slotId: slot.id })}>{restSlot.restSeconds}s {slot.supersetGroup ? "round rest" : "rest"} · More ⋯</Button>
          </div>
        </> : <>
          <div className="mt-4 flex flex-col gap-3">{slot.sets.map((set, si) => <fieldset key={set.id} className="min-w-0 rounded-control border border-border p-3">
            <legend className="px-1 text-caption">Set {si + 1}</legend>
            <p className="text-body tabular-nums">{set.repMin}{set.repMax !== set.repMin ? `–${set.repMax}` : ""} reps · {set.rirMin}{set.rirMax !== set.rirMin ? `–${set.rirMax}` : ""} RIR · {set.weight !== null ? `${set.weight} lb · Your target` : set.suggestedWeight !== null ? `${set.suggestedWeight} lb · Suggested` : "Weight not set"}</p>
          </fieldset>)}</div>
          <p className="mt-3 text-caption text-muted">{!isSupersetEnd(current.slots, index) ? "No rest before the next superset exercise" : `Rest ${slot.restSeconds} seconds ${slot.supersetGroup ? "after the round" : "between sets"}`}</p>
        </>}
      </Card>;
    })}
    {editing && <>
      <Button type="button" variant="secondary" className="border-dashed" {...field("slots")} onClick={() => setPicking("add")}>Add exercise</Button>
    </>}
    </fieldset>
    <div style={{bottom:editing?keyboardInset:0}} className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-background px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {editing && removed.length > 0 && <div role="status" className="mb-2 flex items-center justify-between gap-3 rounded-control bg-surface px-3">
        <p className="text-caption">{removed.at(-1)?.kind === "set" ? "Set removed" : "Exercise removed"}</p>
        <Button type="button" variant="ghost" disabled={pending} onClick={undoRemoval}>Undo removal</Button>
      </div>}
      {issues.length>0 && <div id="editor-errors" tabIndex={-1} role="alert" className="mb-3 text-caption text-danger">{issues.map((i,n)=><p key={n}>{i.message}</p>)}</div>}
      {error && <p role="alert" className="mb-3 text-caption text-danger">{error}</p>}
      <p role="status" className="text-caption text-muted">{pending ? "Saving changes…" : notice}</p>
      {editing ? <>
        <label className="mb-3 flex items-center gap-3 text-caption"><span className="shrink-0 text-muted">Apply to</span>
          <select aria-label="Apply changes to" className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-caption" value={scope} disabled={pending} onChange={e=>{
              const nextScope=e.target.value as "workout"|"program";
              if(recovery?.setMultiplier!=null && recovery.setMultiplier<1) change(p=>({...p,slots:p.slots.map(s=>{
                if(!s.sets.length) return s;
                if(nextScope==="program") return {...s,sets:s.normalSets??s.sets,normalSets:undefined};
                const first=s.sets[0];
                return {...s,normalSets:s.sets,sets:recoverySets(s.sets,{targetSets:s.sets.length,repMin:first.repMin,repMax:first.repMax,targetRir:recovery.targetRirMax??first.rirMax,targetRirMin:recovery.targetRirMin??first.rirMin,targetRirMax:recovery.targetRirMax??first.rirMax,phase:recovery})};
              })}));
              setScope(nextScope);
            }}>
            <option value="workout">This workout only</option><option value="program">This day for the remainder of the program</option>
          </select>
        </label>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" disabled={pending} onClick={() => dirty ? setPanel({ kind: "discard" }) : cancel()}>Cancel</Button>
          <Button type="button" className="flex-1" pending={pending} onClick={save}>Save changes</Button>
        </div>
      </> : <Button type="button" size="lg" className="w-full" pending={pending} disabled={!current.slots.length} onClick={()=>{
        startSaving(async()=>{
          const result=await preparePlannedWorkout(planKey);
          if("error" in result) {setError(result.error);return;}
          if(result.destination==="/workout/next") {setError("Your workout changed. Review the latest plan before starting.");router.refresh();return;}
          router.push(result.destination);
        });
      }}>Start workout</Button>}
    </div>
    {editing && panel?.kind === "set" && panelSlot && panelSet && <EditorSheet key={panelSet.id}
      title={`Edit set ${panelSetIndex + 1}`} context={catalogMap[panelSlot.exerciseId]?.name ?? panelSlot.exerciseId}
      focusField={`${setPath}.${panel.field}`} issues={panelIssues} onClose={() => setPanel(null)} onDone={finishPanel}
      secondary={<Button type="button" variant="destructive" onClick={() => removeSet(panelSlot, panelSet)}>Remove set</Button>}>
      {numeric(`${setPath}.weight`, catalogMap[panelSlot.exerciseId]?.loadMode === "assisted" ? "Load (negative lb assistance)" : "Target weight (lb)", panelSet.weight, value => updateSet(panelSlot.id, panelSet.id, "weight", value), true)}
      <div className="grid grid-cols-2 gap-3">
        {numeric(`${setPath}.repMin`, "Minimum reps", panelSet.repMin, value => updateSet(panelSlot.id, panelSet.id, "repMin", value))}
        {numeric(`${setPath}.repMax`, "Maximum reps", panelSet.repMax, value => updateSet(panelSlot.id, panelSet.id, "repMax", value))}
        {numeric(`${setPath}.rirMin`, "Minimum RIR", panelSet.rirMin, value => updateSet(panelSlot.id, panelSet.id, "rirMin", value))}
        {numeric(`${setPath}.rirMax`, "Maximum RIR", panelSet.rirMax, value => updateSet(panelSlot.id, panelSet.id, "rirMax", value))}
      </div>
      <Button type="button" variant="secondary" onClick={() => updateSet(panelSlot.id, panelSet.id, "weight", null)}>Use suggested weight{panelSet.suggestedWeight !== null ? ` · ${panelSet.suggestedWeight} lb` : ""}</Button>
    </EditorSheet>}
    {editing && panel?.kind === "options" && panelSlot && (() => {
      const restSlot = panelRestSlot!;
      return <EditorSheet title="Exercise options" context={catalogMap[panelSlot.exerciseId]?.name ?? panelSlot.exerciseId}
        focusField={panel.field} issues={panelIssues} onClose={() => setPanel(null)} onDone={finishPanel}>
        {numeric(panelRestPath, panelSlot.supersetGroup ? "Rest after round (seconds)" : "Rest between sets (seconds)", restSlot.restSeconds, value => updateSlot(restSlot.id, s => ({ ...s, restSeconds: value ?? NaN })))}
        <label className="flex min-w-0 flex-col gap-1 text-caption">Superset
          <select className="min-h-11 rounded-control border border-border bg-surface px-2 text-body" value={panelSlot.supersetGroup ?? ""} onChange={event => {
            const group = event.target.value;
            change(p => {
              if (!group) return { ...p, slots: p.slots.map(s => s.supersetGroup === panelSlot.supersetGroup ? { ...s, supersetGroup: null } : s) };
              const groupId = group === "previous" ? p.slots[panelIndex - 1]?.supersetGroup ?? `G${panelIndex}` : group;
              return { ...p, slots: normalizeGroups(p.slots.map((s, i) => i === panelIndex || (group === "previous" && i === panelIndex - 1) ? { ...s, supersetGroup: groupId } : s)) };
            });
          }}><option value="">Independent</option>{panelSlot.supersetGroup && <option value={panelSlot.supersetGroup}>{panelSlot.supersetGroup}</option>}{panelIndex > 0 && <option value="previous">Group with previous</option>}</select>
        </label>
        {panelSlot.sets.length > 0 && <details><summary className="min-h-11 cursor-pointer py-3 text-body">Bulk set tools</summary>
          <div className="flex flex-col gap-2">
            <Button type="button" variant="secondary" onClick={() => apply(panelSlot, "reps")}>Apply first set reps to all sets</Button>
            <Button type="button" variant="secondary" onClick={() => apply(panelSlot, "weight")}>Apply first set weight to all sets</Button>
            <Button type="button" variant="secondary" onClick={() => apply(panelSlot, "rir")}>Apply first set RIR to all sets</Button>
            <Button type="button" variant="secondary" onClick={() => apply(panelSlot, "weight", true)}>Use suggested weight for all sets</Button>
          </div>
        </details>}
      </EditorSheet>;
    })()}
    {panel?.kind === "discard" && <EditorSheet title="Discard workout changes?" context={dayName} issues={[]} doneLabel="Discard changes"
      onClose={() => setPanel(null)} onDone={() => { cancel(); return true; }}>
      <p className="text-body">Your saved workout will be restored.</p>
      <Button type="button" variant="secondary" onClick={() => setPanel(null)}>Keep editing</Button>
    </EditorSheet>}
    {picking && <ExercisePicker catalog={catalog} resolveStations allowCustom={false}
      resolveVariantAction={resolveDraftVariant}
      onPick={def=>{
        setCatalog(c=>c.some(d=>d.id===def.id)?c:[...c,def]);
        if(picking==="add") change(p=>({...p,slots:[...p.slots,{id:crypto.randomUUID(),programSlotId:null,exerciseId:def.id,pattern:def.pattern,
          restSeconds:120,supersetGroup:null,sets:Array.from({length:3},()=>suggestedRow(def,newPlannedSet(crypto.randomUUID(),{repMin:8,repMax:12,targetRirMin:2,targetRirMax:2}),"new"))}]}));
        else replaceExercise(picking,def);
      }} onClose={()=>setPicking(null)} />}
    {stationSlot && stationTemplate && <StationPicker template={stationTemplate} resolveVariantAction={resolveDraftVariant}
      onPick={def=>replaceExercise(stationSlot.id,def)} onClose={()=>setStationSlotId(null)} />}
  </div>;
}
