"use client";

import { useMemo, useState } from "react";
import {
  KNOWN_BRANDS,
  MACHINE_TYPE_LABEL,
  PATTERN_LABEL,
  type Equipment,
  type ExerciseDef,
  type MachineType,
  type Pattern,
} from "@/lib/strength/coefficients";
import { createCustomExercise, resolveVariant } from "../exercise/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";

const EQUIPMENTS: Equipment[] = ["barbell", "dumbbell", "cable", "machine", "bodyweight"];

// Searchable exercise list, recent-first, in a bottom sheet. Reused by the builder
// (add slot, templates kept as-is) and by swap (resolveMachines: a machine template is
// instantiated to a brand/type variant before it is returned). "Add custom exercise"
// creates a concrete exercise. onPick always receives a concrete, loggable def when
// resolveMachines is set. Picking dismisses the sheet; parent unmounts via onClose.
export function ExercisePicker({
  catalog,
  recentIds = [],
  patternFilter,
  resolveMachines = false,
  onPick,
  onClose,
}: {
  catalog: ExerciseDef[];
  recentIds?: string[];
  patternFilter?: Pattern;
  resolveMachines?: boolean;
  onPick: (exercise: ExerciseDef) => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} className="flex h-[85dvh] flex-col">
      <PickerBody
        catalog={catalog}
        recentIds={recentIds}
        patternFilter={patternFilter}
        resolveMachines={resolveMachines}
        onPick={onPick}
      />
    </Sheet>
  );
}

type View =
  | { kind: "list" }
  | { kind: "machine"; template: ExerciseDef }
  | { kind: "custom" };

function PickerBody({
  catalog,
  recentIds,
  patternFilter,
  resolveMachines,
  onPick,
}: {
  catalog: ExerciseDef[];
  recentIds: string[];
  patternFilter?: Pattern;
  resolveMachines: boolean;
  onPick: (exercise: ExerciseDef) => void;
}) {
  const dismiss = useSheetDismiss();
  const [view, setView] = useState<View>({ kind: "list" });

  if (view.kind === "machine") {
    return (
      <MachineForm
        template={view.template}
        onBack={() => setView({ kind: "list" })}
        onResolved={(def) => {
          onPick(def);
          dismiss();
        }}
      />
    );
  }
  if (view.kind === "custom") {
    return (
      <CustomForm
        onBack={() => setView({ kind: "list" })}
        onCreated={(def) => {
          onPick(def);
          dismiss();
        }}
      />
    );
  }

  return (
    <ListView
      catalog={catalog}
      recentIds={recentIds}
      patternFilter={patternFilter}
      onRowPick={(e) => {
        if (resolveMachines && e.machineTemplate) {
          setView({ kind: "machine", template: e });
        } else {
          onPick(e);
          dismiss();
        }
      }}
      onAddCustom={() => setView({ kind: "custom" })}
      dismiss={dismiss}
    />
  );
}

function ListView({
  catalog,
  recentIds,
  patternFilter,
  onRowPick,
  onAddCustom,
  dismiss,
}: {
  catalog: ExerciseDef[];
  recentIds: string[];
  patternFilter?: Pattern;
  onRowPick: (exercise: ExerciseDef) => void;
  onAddCustom: () => void;
  dismiss: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const activeFilter = showAll ? undefined : patternFilter;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (e: ExerciseDef) => {
      const i = recentIds.indexOf(e.id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return catalog
      .filter((e) => {
        if (activeFilter && e.pattern !== activeFilter) return false;
        if (!q) return true;
        return e.name.toLowerCase().includes(q) || e.pattern.includes(q);
      })
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [catalog, query, recentIds, activeFilter]);

  // Group recents under their own header when browsing (no query); a search flattens.
  const grouped = query.trim() === "" && recentIds.length > 0;
  const recent = grouped ? results.filter((e) => recentIds.includes(e.id)) : [];
  const rest = grouped ? results.filter((e) => !recentIds.includes(e.id)) : results;

  return (
    <>
      <div className="flex items-center gap-1 border-b border-border px-3 pb-3">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          enterKeyHint="search"
          autoComplete="off"
          className="h-11 flex-1"
        />
        <button type="button" onClick={dismiss} className="px-3 py-2 text-body text-muted">
          Cancel
        </button>
      </div>
      {patternFilter && (
        <div className="flex gap-2 border-b border-border px-4 py-2">
          <Chip selected={!showAll} onClick={() => setShowAll(false)}>
            {patternFilter.replace(/_/g, " ")}
          </Chip>
          <Chip selected={showAll} onClick={() => setShowAll(true)}>
            All patterns
          </Chip>
        </div>
      )}
      <ul className="flex-1 overflow-y-auto overscroll-contain">
        {recent.length > 0 && <SectionHeader>Recent</SectionHeader>}
        {recent.map((e) => (
          <ExerciseRow key={e.id} exercise={e} onPick={onRowPick} />
        ))}
        {recent.length > 0 && rest.length > 0 && <SectionHeader>All exercises</SectionHeader>}
        {rest.map((e) => (
          <ExerciseRow key={e.id} exercise={e} onPick={onRowPick} />
        ))}
        {results.length === 0 && (
          <li className="px-4 py-6 text-center text-body text-muted">No matches</li>
        )}
      </ul>
      <div className="border-t border-border p-3">
        <Button type="button" variant="secondary" className="w-full" onClick={onAddCustom}>
          Add custom exercise
        </Button>
      </div>
    </>
  );
}

// Brand + type step for instantiating a machine template into a trackable variant.
function MachineForm({
  template,
  onBack,
  onResolved,
}: {
  template: ExerciseDef;
  onBack: () => void;
  onResolved: (def: ExerciseDef) => void;
}) {
  const [brand, setBrand] = useState("");
  const [machineType, setMachineType] = useState<MachineType>("selectorized");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      const def = await resolveVariant({
        baseExerciseId: template.id,
        brand: brand.trim() || null,
        machineType,
      });
      onResolved(def);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not select machine");
      setPending(false);
    }
  };

  return (
    <FormShell title={template.name} subtitle="Choose brand & type" onBack={onBack}>
      <MachineFields
        brand={brand}
        setBrand={setBrand}
        machineType={machineType}
        setMachineType={setMachineType}
      />
      {error && <p className="text-caption text-danger">{error}</p>}
      <Button type="button" className="w-full" pending={pending} onClick={confirm}>
        Use this machine
      </Button>
    </FormShell>
  );
}

function CustomForm({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (def: ExerciseDef) => void;
}) {
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState<Pattern>("horizontal_press");
  const [equipment, setEquipment] = useState<Equipment>("barbell");
  const [brand, setBrand] = useState("");
  const [machineType, setMachineType] = useState<MachineType>("selectorized");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMachine = equipment === "machine";

  const confirm = async () => {
    if (!name.trim()) {
      setError("Name required");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const def = await createCustomExercise({
        name,
        pattern,
        equipment,
        brand: isMachine ? brand.trim() || null : null,
        machineType: isMachine ? machineType : null,
      });
      onCreated(def);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create exercise");
      setPending(false);
    }
  };

  return (
    <FormShell title="Custom exercise" subtitle="Maps to a movement pattern" onBack={onBack}>
      <Field label="Name">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Landmine Press"
          className="h-11 w-full"
        />
      </Field>
      <Field label="Pattern">
        <Select value={pattern} onChange={(v) => setPattern(v as Pattern)}>
          {Object.entries(PATTERN_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Equipment">
        <Select value={equipment} onChange={(v) => setEquipment(v as Equipment)}>
          {EQUIPMENTS.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>
      {isMachine && (
        <MachineFields
          brand={brand}
          setBrand={setBrand}
          machineType={machineType}
          setMachineType={setMachineType}
        />
      )}
      {error && <p className="text-caption text-danger">{error}</p>}
      <Button type="button" className="w-full" pending={pending} onClick={confirm}>
        Create exercise
      </Button>
    </FormShell>
  );
}

function MachineFields({
  brand,
  setBrand,
  machineType,
  setMachineType,
}: {
  brand: string;
  setBrand: (v: string) => void;
  machineType: MachineType;
  setMachineType: (v: MachineType) => void;
}) {
  const isOther = brand !== "" && !KNOWN_BRANDS.includes(brand as (typeof KNOWN_BRANDS)[number]);
  const [other, setOther] = useState(isOther);

  return (
    <>
      <Field label="Brand">
        <Select
          value={other ? "__other" : brand}
          onChange={(v) => {
            if (v === "__other") {
              setOther(true);
              setBrand("");
            } else {
              setOther(false);
              setBrand(v);
            }
          }}
        >
          <option value="">Unbranded</option>
          {KNOWN_BRANDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          <option value="__other">Other…</option>
        </Select>
      </Field>
      {other && (
        <Input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Brand name"
          className="h-11 w-full"
        />
      )}
      <Field label="Type">
        <div className="flex gap-2">
          {(Object.keys(MACHINE_TYPE_LABEL) as MachineType[]).map((t) => (
            <Chip key={t} selected={machineType === t} onClick={() => setMachineType(t)}>
              {MACHINE_TYPE_LABEL[t]}
            </Chip>
          ))}
        </div>
      </Field>
    </>
  );
}

function FormShell({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 pb-3">
        <button type="button" onClick={onBack} className="px-2 py-2 text-body text-muted">
          ← Back
        </button>
        <div className="min-w-0">
          <p className="truncate text-body font-medium">{title}</p>
          <p className="truncate text-caption text-muted">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">{children}</div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-control border border-border-strong bg-background px-3 text-body capitalize"
    >
      {children}
    </select>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "rounded-full border px-3 py-1 text-caption font-medium capitalize transition-colors " +
        (selected
          ? "border-foreground bg-foreground text-background"
          : "border-border-strong text-muted active:bg-surface")
      }
    >
      {children}
    </button>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <li className="sticky top-0 bg-background px-4 pb-1 pt-3 text-caption font-semibold uppercase tracking-wide text-muted">
      {children}
    </li>
  );
}

function ExerciseRow({
  exercise: e,
  onPick,
}: {
  exercise: ExerciseDef;
  onPick: (exercise: ExerciseDef) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(e)}
        className="flex min-h-11 w-full items-center justify-between border-b border-border px-4 py-3 text-left active:bg-surface"
      >
        <span>
          <span className="block text-body font-medium">{e.name}</span>
          <span className="block text-caption capitalize text-muted">
            {e.pattern.replace(/_/g, " ")} · {e.equipment.replace(/_/g, " ")}
          </span>
        </span>
      </button>
    </li>
  );
}
