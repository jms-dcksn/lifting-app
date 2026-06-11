"use client";

import { useMemo, useState } from "react";
import { EXERCISES, type ExerciseDef, type Pattern } from "@/lib/strength/coefficients";
import { Input } from "@/components/ui/input";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";

// Searchable exercise list, recent-first, in a bottom sheet. Reused by the builder
// (add slot) and by swap (same-pattern filter first, with a show-all escape hatch).
// Picking dismisses the sheet itself; parent unmounts via onClose.
export function ExercisePicker({
  recentIds = [],
  patternFilter,
  onPick,
  onClose,
}: {
  recentIds?: string[];
  patternFilter?: Pattern;
  onPick: (exercise: ExerciseDef) => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} className="flex h-[85dvh] flex-col">
      <PickerBody recentIds={recentIds} patternFilter={patternFilter} onPick={onPick} />
    </Sheet>
  );
}

function PickerBody({
  recentIds,
  patternFilter,
  onPick,
}: {
  recentIds: string[];
  patternFilter?: Pattern;
  onPick: (exercise: ExerciseDef) => void;
}) {
  const dismiss = useSheetDismiss();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const activeFilter = showAll ? undefined : patternFilter;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (e: ExerciseDef) => {
      const i = recentIds.indexOf(e.id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return EXERCISES.filter((e) => {
      if (activeFilter && e.pattern !== activeFilter) return false;
      if (!q) return true;
      return e.name.toLowerCase().includes(q) || e.pattern.includes(q);
    }).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [query, recentIds, activeFilter]);

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
        <button
          type="button"
          onClick={dismiss}
          className="px-3 py-2 text-body text-muted"
        >
          Cancel
        </button>
      </div>
      {patternFilter && (
        <div className="border-b border-border px-4 py-1">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="py-2 text-caption text-muted underline-offset-2 hover:underline"
          >
            {showAll
              ? `Only ${patternFilter.replace(/_/g, " ")}`
              : "Show all patterns"}
          </button>
        </div>
      )}
      <ul className="flex-1 overflow-y-auto overscroll-contain">
        {results.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => {
                onPick(e);
                dismiss();
              }}
              className="flex min-h-11 w-full items-center justify-between border-b border-border px-4 py-3 text-left active:bg-surface"
            >
              <span>
                <span className="block text-body font-medium">{e.name}</span>
                <span className="block text-caption text-muted">
                  {e.pattern.replace(/_/g, " ")} · {e.equipment.replace(/_/g, " ")}
                </span>
              </span>
              {recentIds.includes(e.id) && (
                <span className="text-caption text-faint">recent</span>
              )}
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-4 py-6 text-center text-body text-muted">No matches</li>
        )}
      </ul>
    </>
  );
}
