"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import type { Program } from "@/lib/program";
import { validateProgramPhases, type ProgramPhase } from "@/lib/periodization";
import { Button } from "@/components/ui/button";
import { ExerciseCardLabel } from "@/components/ui/exercise-card-label";
import { ExerciseVisual } from "@/components/ui/exercise-visual";
import { Card } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/info-button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { withViewTransition } from "@/components/ui/view-transition";
import { PageHeader } from "@/components/ui/page-header";
import { ProgramRepRangeSheet, ProgramSlotOptionsSheet } from "./program-builder-sheets";
import { resolveTempo, formatTempo } from "@/lib/tempo";
import { saveProgram, type SaveDayInput, type SavePhaseInput, type SaveSlotInput } from "./actions";
import { ExercisePicker } from "./exercise-picker";
import { TagInput } from "./tag-input";
import { SwapStationButton } from "./swap-station-button";

const uid = () => crypto.randomUUID();

const MAX_DAYS = 6;
const MAX_PHASES = 12;

function blankProgram(): Program {
  return { id: uid(), name: "", description: null, tags: [], weeks: 5, style: "classic", isActive: true, phases: [], days: [] };
}

// Local editable mirror of SaveProgramInput. Program type already matches closely.
type Draft = Program;

export function ProgramBuilder({
  initial,
  recentIds,
  catalog: initialCatalog,
  afterSaveHref = "/",
  cancelHref,
}: {
  initial: Program | null;
  recentIds: string[];
  catalog: ExerciseDef[];
  afterSaveHref?: string;
  cancelHref?: string;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState(initialCatalog);
  const byId = useMemo(() => Object.fromEntries(catalog.map((d) => [d.id, d])), [catalog]);
  const [draft, setDraft] = useState<Draft>(() => initial ?? blankProgram());
  const [selectedDayId, setSelectedDayId] = useState<string | null>(initial?.days[0]?.id ?? null);
  const [changingSlotId, setChangingSlotId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panel, setPanel] = useState<{kind:"range" | "options"; dayId:string; slotId:string} | null>(null);
  const [pickerDayId, setPickerDayId] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(fn: (d: Draft) => Draft) {
    setDraft((d) => fn(structuredClone(d)));
  }

  function addDay() {
    const id = uid();
    setSelectedDayId(id);
    update((d) => {
      d.days.push({ id, name: `Day ${d.days.length + 1}`, slots: [] });
      return d;
    });
  }

  function addPhase() {
    update((d) => {
      const priorEnd = d.phases.at(-1)?.weekEnd ?? 0;
      const week = Math.min(d.weeks, priorEnd + 1);
      d.phases.push({
        id: uid(),
        position: d.phases.length,
        name: `Phase ${d.phases.length + 1}`,
        description: null,
        weekStart: week,
        weekEnd: week,
        targetRirMin: 2,
        targetRirMax: 2,
        setMultiplier: null,
        isDeload: false,
      });
      return d;
    });
  }

  function updatePhase(id: string, patch: Partial<ProgramPhase>) {
    update((d) => {
      const phase = d.phases.find((candidate) => candidate.id === id);
      if (phase) Object.assign(phase, patch);
      return d;
    });
  }

  function removePhase(id: string) {
    update((d) => ({ ...d, phases: d.phases.filter((phase) => phase.id !== id) }));
  }

  function movePhase(index: number, direction: -1 | 1) {
    update((d) => {
      const destination = index + direction;
      if (destination < 0 || destination >= d.phases.length) return d;
      [d.phases[index], d.phases[destination]] = [d.phases[destination], d.phases[index]];
      return d;
    });
  }

  function removeDay(dayId: string) {
    update((d) => ({ ...d, days: d.days.filter((x) => x.id !== dayId) }));
  }

  function moveDay(index: number, dir: -1 | 1) {
    withViewTransition(() =>
      update((d) => {
        const j = index + dir;
        if (j < 0 || j >= d.days.length) return d;
        [d.days[index], d.days[j]] = [d.days[j], d.days[index]];
        return d;
      }),
    );
  }

  function renameDay(dayId: string, name: string) {
    update((d) => {
      const day = d.days.find((x) => x.id === dayId);
      if (day) day.name = name;
      return d;
    });
  }

  function addSlot(dayId: string, ex: ExerciseDef) {
    update((d) => {
      const day = d.days.find((x) => x.id === dayId);
      if (day) {
        day.slots.push({
          id: uid(),
          exerciseId: ex.id,
          pattern: ex.pattern,
          targetSets: 3,
          repMin: 8,
          repMax: 12,
          targetRir: 2,
          restSeconds: null,
          plateauPatience: null,
        });
      }
      return d;
    });
  }

  function updateSlot(dayId: string, slotId: string, patch: Partial<ProgramSlotLike>) {
    update((d) => {
      const slot = d.days.find((x) => x.id === dayId)?.slots.find((s) => s.id === slotId);
      if (slot) Object.assign(slot, patch);
      return d;
    });
  }

  function removeSlot(dayId: string, slotId: string) {
    update((d) => {
      const day = d.days.find((x) => x.id === dayId);
      if (day) day.slots = day.slots.filter((s) => s.id !== slotId);
      return d;
    });
  }

  function moveSlot(dayId: string, index: number, dir: -1 | 1) {
    withViewTransition(() =>
      update((d) => {
        const day = d.days.find((x) => x.id === dayId);
        if (!day) return d;
        const j = index + dir;
        if (j < 0 || j >= day.slots.length) return d;
        [day.slots[index], day.slots[j]] = [day.slots[j], day.slots[index]];
        return d;
      }),
    );
  }

  function handleSave() {
    setError(null);
    if (draft.days.length === 0 || draft.days.every((d) => d.slots.length === 0)) {
      setError("Add at least one day with one exercise.");
      return;
    }
    const phaseErrors = validateProgramPhases(
      draft.phases.map((phase, position) => ({ ...phase, position })),
      draft.weeks,
    );
    if (draft.style === "classic" && phaseErrors.length) {
      setSettingsOpen(true);
      setError(phaseErrors[0]);
      return;
    }
    startSave(async () => {
      try {
        await saveProgram({
          id: draft.id,
          name: draft.name,
          description: draft.description,
          tags: draft.tags,
          weeks: draft.weeks,
          style: draft.style,
          phases: draft.phases.map<SavePhaseInput>((phase) => ({
            id: phase.id,
            name: phase.name,
            description: phase.description,
            weekStart: phase.weekStart,
            weekEnd: phase.weekEnd,
            targetRirMin: phase.targetRirMin,
            targetRirMax: phase.targetRirMax,
            setMultiplier: phase.setMultiplier,
            isDeload: phase.isDeload ?? false,
          })),
          days: draft.days.map<SaveDayInput>((d) => ({
            id: d.id,
            name: d.name,
            slots: d.slots.map<SaveSlotInput>((s) => ({
              id: s.id,
              exerciseId: s.exerciseId,
              pattern: s.pattern,
              targetSets: s.targetSets,
              repMin: s.repMin,
              repMax: s.repMax,
              targetRir: s.targetRir,
              tempo: s.tempo ?? null,
              restSeconds: s.restSeconds,
              supersetGroup: s.supersetGroup ?? null,
              plateauPatience: s.plateauPatience,
            })),
          })),
        });
        if (cancelHref) router.replace(afterSaveHref);
        else router.push(afterSaveHref);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function handleCancel() {
    if (cancelHref) router.replace(cancelHref);
  }

  const saveLabel = initial?.isActive ? "Save changes" : "Save & make active";
  const selectedDay = draft.days.find(day => day.id === selectedDayId) ?? draft.days[0];
  const panelSlot = panel ? draft.days.find(day => day.id === panel.dayId)?.slots.find(slot => slot.id === panel.slotId) : null;

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-4 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <PageHeader title={initial ? "Edit program" : "Build your program"} context={<p className="text-caption text-muted">{initial ? "Program draft" : "New program"}</p>} />
      <fieldset disabled={saving} className="contents">
      <div className="flex w-full max-w-page flex-col gap-3">
        <label className="flex flex-col gap-1 text-caption text-muted">Program name
        <Input
          aria-label="Program name"
          value={draft.name}
          onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
          placeholder="Program name"
          enterKeyHint="done"
          autoComplete="off"
          className="text-heading! text-foreground"
        />
        </label>
        <details open={settingsOpen} onToggle={event => setSettingsOpen(event.currentTarget.open)} className="rounded-card border border-border px-3">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-caption">
          <span className="text-muted">{draft.style === "classic" ? `Classic · ${draft.weeks} weeks` : "Adaptive"} · {draft.days.length} days</span>
          <span>Program settings ⋯</span>
        </summary>
        <div className="flex flex-col gap-3 pb-3">
        <textarea
          aria-label="Program description"
          value={draft.description ?? ""}
          onChange={(e) => update((d) => ({ ...d, description: e.target.value || null }))}
          placeholder="Description (optional)"
          rows={2}
          className="w-full resize-none rounded-control border border-border-strong bg-transparent p-2 text-body outline-none"
        />
        <TagInput value={draft.tags} onChange={(tags) => update((d) => ({ ...d, tags }))} />

        <div className="flex flex-col gap-2">
          <span className="text-body text-muted">Progression style</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={draft.style === "classic" ? "primary" : "secondary"}
              size="md"
              onClick={() => update((d) => ({ ...d, style: "classic" }))}
            >
              Classic
            </Button>
            <Button
              type="button"
              variant={draft.style === "fluid" ? "primary" : "secondary"}
              size="md"
              onClick={() => update((d) => ({ ...d, style: "fluid" }))}
            >
              Adaptive
            </Button>
            <InfoButton title={draft.style === "fluid" ? "Adaptive" : "Classic"}>
              {draft.style === "fluid"
                ? "No end week. When a lift stalls, the app suggests a new rep range or exercise."
                : "A set number of weeks. Add weight when you hit the top of the rep range."}
            </InfoButton>
          </div>
        </div>

        {draft.style === "classic" && (
          <div className="flex flex-wrap items-center gap-3 text-body">
            <span className="text-muted">Repeat for</span>
            <Stepper
              label="Weeks"
              layout="row"
              inputMode="numeric"
              value={draft.weeks}
              step={1}
              min={4}
              max={12}
              onChange={(v) => update((d) => ({ ...d, weeks: v }))}
            />
            <span className="text-muted">weeks</span>
          </div>
        )}

        {draft.style === "classic" && (
          <section className="mt-2 flex flex-col gap-3 rounded-card border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-1">
                <h2 className="text-heading">Weekly phases</h2>
                <InfoButton title="Weekly phases">
                  A phase can change RIR and working-set volume for a week range. Mark recovery phases as deload to exclude their sets from strength progression and PRs.
                </InfoButton>
              </div>
              {draft.phases.length < MAX_PHASES && (
                <Button type="button" variant="secondary" size="md" onClick={addPhase}>
                  Add phase
                </Button>
              )}
            </div>

            {draft.phases.map((phase, index) => (
              <div key={phase.id} className="rounded-control bg-surface p-3">
                <div className="flex items-center gap-1">
                  <Input
                    value={phase.name}
                    onChange={(event) => updatePhase(phase.id, { name: event.target.value })}
                    aria-label={`Phase ${index + 1} name`}
                    className="h-11 flex-1 px-2 font-medium"
                  />
                  <ReorderButtons
                    what={phase.name}
                    onUp={() => movePhase(index, -1)}
                    onDown={() => movePhase(index, 1)}
                  />
                  <RemoveButton what={phase.name} onClick={() => removePhase(phase.id)} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <NumField label="Week from" value={phase.weekStart} min={1} max={draft.weeks}
                    onChange={(value) => updatePhase(phase.id, { weekStart: value })} />
                  <NumField label="Week to" value={phase.weekEnd} min={1} max={draft.weeks}
                    onChange={(value) => updatePhase(phase.id, { weekEnd: value })} />
                  <NumField label="RIR min" value={phase.targetRirMin ?? 0} min={0} max={10}
                    onChange={(value) => updatePhase(phase.id, { targetRirMin: value })} />
                  <NumField label="RIR max" value={phase.targetRirMax ?? 0} min={0} max={10}
                    onChange={(value) => updatePhase(phase.id, { targetRirMax: value })} />
                </div>
                <label className="mt-2 flex items-center justify-between gap-2 text-caption text-muted">
                  <span className="uppercase tracking-wide">Working-set volume</span>
                  <select
                    value={phase.setMultiplier ?? ""}
                    onChange={(event) => updatePhase(phase.id, {
                      setMultiplier: event.target.value === "" ? null : Number(event.target.value),
                    })}
                    className="min-h-11 rounded-control border border-border-strong bg-background px-2 text-sm font-semibold"
                  >
                    <option value="">Normal</option>
                    <option value="0.75">75%</option>
                    <option value="0.5">50%</option>
                  </select>
                </label>
                <label className="flex min-h-11 items-center gap-2 text-body">
                  <input type="checkbox" checked={phase.isDeload ?? false}
                    onChange={(event) => updatePhase(phase.id, { isDeload: event.target.checked })} />
                  Deload
                </label>
                <textarea
                  value={phase.description ?? ""}
                  onChange={(event) => updatePhase(phase.id, { description: event.target.value || null })}
                  placeholder="Explain this phase to the lifter"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-control border border-border-strong bg-background p-2 text-body outline-none"
                />
              </div>
            ))}

            {draft.phases.length === 0 && (
              <p className="rounded-control bg-surface p-3 text-body text-muted">
                Using the prescriptions below.
              </p>
            )}
          </section>
        )}
        </div></details>
      </div>

      <div role="group" aria-label="Training day" className="flex flex-wrap gap-2">
        {draft.days.map((day, i) => <Button key={day.id} type="button" size="md"
          variant={day.id === selectedDay?.id ? "primary" : "secondary"}
          aria-label={`Day ${i + 1} · ${day.name}`} aria-pressed={day.id === selectedDay?.id}
          onClick={() => setSelectedDayId(day.id)}>Day {i + 1}</Button>)}
        {draft.days.length < MAX_DAYS && <Button type="button" variant="secondary" size="md" onClick={addDay}>+ Add day</Button>}
      </div>
      {draft.days.length === 0 && <Card><p className="text-body">Add a training day to begin.</p></Card>}

      <div className="flex min-w-0 flex-col gap-4">
        {draft.days.map((day, di) => day.id === selectedDay?.id ? (
          <Card
            key={day.id}
            className="border-0! p-0!"
            style={{ viewTransitionName: `vt-${day.id}` }}
          >
            <div className="flex items-center gap-1">
              <Input
                value={day.name}
                onChange={(e) => renameDay(day.id, e.target.value)}
                aria-label="Day name"
                enterKeyHint="done"
                autoComplete="off"
                className="h-11 flex-1 px-2 font-medium"
              />
              <ReorderButtons
                what={day.name}
                onUp={() => moveDay(di, -1)}
                onDown={() => moveDay(di, 1)}
              />
              <RemoveButton what={day.name} onClick={() => removeDay(day.id)} />
            </div>

            <ul className="mt-3 flex flex-col gap-2">
              {day.slots.map((slot, si) => (
                <li key={slot.id} data-program-slot={slot.id} style={{viewTransitionName:`vt-${slot.id}`}} className="overflow-hidden rounded-card border border-border">
                  <div className="flex items-start gap-3 px-3 pt-3">
                    <ExerciseVisual exerciseId={slot.exerciseId} baseExerciseId={byId[slot.exerciseId]?.baseExerciseId} size="sm" />
                    <div className="min-w-0 flex-1">{byId[slot.exerciseId]
                      ? <ExerciseCardLabel as="h3" size="heading" compact def={byId[slot.exerciseId]} catalog={byId} />
                      : <h3 className="break-words text-heading">{slot.exerciseId}</h3>}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1 border-b border-border px-2 pb-1">
                    <Button type="button" variant="ghost" size="md" className="text-caption!"
                      aria-label={`Change exercise for ${exerciseName(byId,slot.exerciseId)}`} onClick={() => {
                        setChangingSlotId(slot.id); setPickerDayId(day.id);
                      }}>Change exercise</Button>
                    <ReorderButtons what={exerciseName(byId,slot.exerciseId)}
                      onUp={() => moveSlot(day.id,si,-1)} onDown={() => moveSlot(day.id,si,1)}
                      disableUp={si === 0} disableDown={si === day.slots.length - 1} />
                  </div>
                  <div className="px-3">
                    <SwapStationButton exerciseId={slot.exerciseId} catalog={byId} size="md" className="mt-2 min-h-11 text-caption!" onPick={def => {
                      setCatalog(current => current.some(exercise => exercise.id === def.id) ? current : [...current,def]);
                      updateSlot(day.id,slot.id,{exerciseId:def.id,pattern:def.pattern});
                    }} />
                  </div>
                  <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2 px-3 py-3">
                    <NumField label="Sets" value={slot.targetSets} min={1} max={10}
                      onChange={value => updateSlot(day.id,slot.id,{targetSets:value})} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-center text-caption text-muted">Rep range</span>
                      <Button type="button" variant="secondary" className="min-w-0 px-1! tabular-nums"
                        aria-label={`Edit rep range for ${exerciseName(byId,slot.exerciseId)}`}
                        onClick={() => setPanel({kind:"range",dayId:day.id,slotId:slot.id})}>
                        {slot.repMin === slot.repMax ? slot.repMin : `${slot.repMin}–${slot.repMax}`}
                      </Button>
                    </div>
                    <NumField label="RIR" value={slot.targetRir} min={0} max={5}
                      onChange={value => updateSlot(day.id,slot.id,{targetRir:value})} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 border-t border-border px-3 text-caption text-muted">
                    <span>{slot.restSeconds !== null ? `${slot.restSeconds}s` : "Default"} {slot.supersetGroup ? `round rest · Superset ${slot.supersetGroup}` : "rest"} · {formatTempo(resolveTempo(byId[slot.exerciseId],slot.tempo))}</span>
                    <Button type="button" variant="ghost" size="md" className="px-0! text-caption!"
                      aria-label={`More options for ${exerciseName(byId,slot.exerciseId)}`}
                      onClick={() => setPanel({kind:"options",dayId:day.id,slotId:slot.id})}>More ⋯</Button>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setPickerDayId(day.id)}
              className="mt-3 h-11 w-full rounded-control border border-dashed border-border-strong text-body font-medium text-foreground active:bg-surface"
            >
              + Add exercise
            </button>
          </Card>
        ) : null)}


      </div>

      {error && <p role="alert" className="text-body text-danger">{error}</p>}
      </fieldset>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 px-4 py-3 backdrop-blur [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-page">
          <div className="flex gap-2">
            <Button
              type="button"
              size="lg"
              className="min-w-0 flex-1"
              onClick={handleSave}
              pending={saving}
            >
              {saveLabel}
            </Button>
            {cancelHref && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="shrink-0"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {panel && panelSlot && (panel.kind === "range"
        ? <ProgramRepRangeSheet key={panel.slotId} name={exerciseName(byId,panelSlot.exerciseId)} slot={panelSlot}
            onApply={patch => updateSlot(panel.dayId,panel.slotId,patch)} onClose={() => setPanel(null)} />
        : <ProgramSlotOptionsSheet key={panel.slotId} name={exerciseName(byId,panelSlot.exerciseId)} slot={panelSlot}
            def={byId[panelSlot.exerciseId]} adaptive={draft.style === "fluid"}
            onApply={patch => updateSlot(panel.dayId,panel.slotId,patch)}
            onRemove={() => {removeSlot(panel.dayId,panel.slotId);setPanel(null);}} onClose={() => setPanel(null)} />)}
      {pickerDayId && (
        <ExercisePicker
          catalog={catalog}
          recentIds={recentIds}
          onPick={(ex) => {
            setCatalog(current => current.some(def => def.id === ex.id) ? current : [...current,ex]);
            if (changingSlotId) updateSlot(pickerDayId,changingSlotId,{exerciseId:ex.id,pattern:ex.pattern});
            else addSlot(pickerDayId,ex);
          }}
          onClose={() => {setPickerDayId(null);setChangingSlotId(null);}}
        />
      )}
    </div>
  );
}

type ProgramSlotLike = Draft["days"][number]["slots"][number];

function exerciseName(byId: Record<string, ExerciseDef>, id: string) {
  return byId[id]?.name ?? id;
}

function ReorderButtons({
  what,
  onUp,
  onDown,
  disableUp = false,
  disableDown = false,
}: {
  what: string;
  onUp: () => void;
  onDown: () => void;
  disableUp?: boolean;
  disableDown?: boolean;
}) {
  const cls =
    "flex h-11 w-11 shrink-0 items-center justify-center text-muted active:bg-surface rounded-control disabled:opacity-30";
  return (
    <span className="flex">
      <button type="button" aria-label={`Move ${what} up`} disabled={disableUp} onClick={onUp} className={cls}>
        ↑
      </button>
      <button type="button" aria-label={`Move ${what} down`} disabled={disableDown} onClick={onDown} className={cls}>
        ↓
      </button>
    </span>
  );
}

function RemoveButton({ what, onClick }: { what: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Remove ${what}`}
      onClick={onClick}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-body text-danger active:bg-surface"
    >
      ✕
    </button>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-center text-caption text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Math.min(max, Math.max(min, Number.isFinite(n) ? n : min)));
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 w-full min-w-0 rounded-control border border-border-strong bg-transparent text-center text-sm font-semibold tabular-nums"
      />
    </label>
  );
}
