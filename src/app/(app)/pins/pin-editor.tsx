"use client";

import { useMemo, useState, useTransition } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { IconPin } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";
import { toggleExercisePin } from "./actions";

export interface PinEditorItem {
  exerciseId: string;
  name: string;
  group: "compound" | "extra";
  pinned: boolean;
}

export function PinEditorButton({ items }: { items: PinEditorItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton variant="ghost" aria-label="Edit pins" onClick={() => setOpen(true)}>
        <IconPin filled />
      </IconButton>
      {open && (
        <Sheet ariaLabel="Edit pins" onClose={() => setOpen(false)}>
          <PinEditorBody items={items} />
        </Sheet>
      )}
    </>
  );
}

function PinEditorBody({ items }: { items: PinEditorItem[] }) {
  const dismiss = useSheetDismiss();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(() =>
    Object.fromEntries(items.map((item) => [item.exerciseId, item.pinned])),
  );
  const [pending, start] = useTransition();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => !q || item.name.toLowerCase().includes(q) || item.exerciseId.includes(q));
  }, [items, query]);
  const compounds = filtered.filter((item) => item.group === "compound");
  const extras = filtered.filter((item) => item.group === "extra");

  function toggle(item: PinEditorItem) {
    setError(null);
    setPendingId(item.exerciseId);
    start(async () => {
      const result = await toggleExercisePin(item.exerciseId);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPinned((current) => ({ ...current, [item.exerciseId]: result.pinned }));
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
      <h2 className="text-heading">Pins</h2>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search lifts"
        enterKeyHint="search"
        autoComplete="off"
      />
      {error && <p role="alert" className="text-caption text-danger">{error}</p>}
      <Section title="Compounds" items={compounds} pinned={pinned} pendingId={pendingId} onToggle={toggle} />
      <Section title="More lifts" items={extras} pinned={pinned} pendingId={pendingId} onToggle={toggle} />
      <Button type="button" variant="ghost" disabled={pending} onClick={dismiss}>
        Done
      </Button>
    </div>
  );
}

function Section({
  title,
  items,
  pinned,
  pendingId,
  onToggle,
}: {
  title: string;
  items: PinEditorItem[];
  pinned: Record<string, boolean>;
  pendingId: string | null;
  onToggle: (item: PinEditorItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.exerciseId} className="flex items-center justify-between gap-3 py-1">
            <span className="min-w-0 truncate text-body">{item.name}</span>
            <IconButton
              variant="ghost"
              aria-label={pinned[item.exerciseId] ? `Unpin ${item.name}` : `Pin ${item.name}`}
              aria-pressed={!!pinned[item.exerciseId]}
              pending={pendingId === item.exerciseId}
              onClick={() => onToggle(item)}
            >
              <IconPin filled={!!pinned[item.exerciseId]} />
            </IconButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
