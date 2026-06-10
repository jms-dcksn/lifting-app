"use client";

import { useMemo, useState } from "react";
import { EXERCISES, type ExerciseDef, type Pattern } from "@/lib/strength/coefficients";

// Searchable exercise list, recent-first. Reused by the builder (add slot) and by swap
// (same-pattern filter first, with a show-all escape hatch). Overlay; parent controls
// open via conditional render.
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
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-black">
      <div className="flex items-center gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button onClick={onClose} className="px-2 text-sm text-zinc-500">
          Cancel
        </button>
      </div>
      {patternFilter && (
        <div className="border-b border-zinc-100 px-4 py-2 dark:border-zinc-900">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-zinc-500 underline-offset-2 hover:underline"
          >
            {showAll
              ? `Only ${patternFilter.replace(/_/g, " ")}`
              : "Show all patterns"}
          </button>
        </div>
      )}
      <ul className="flex-1 overflow-y-auto">
        {results.map((e) => (
          <li key={e.id}>
            <button
              onClick={() => onPick(e)}
              className="flex w-full items-center justify-between border-b border-zinc-100 px-4 py-3 text-left active:bg-zinc-50 dark:border-zinc-900 dark:active:bg-zinc-900"
            >
              <span>
                <span className="block text-sm font-medium">{e.name}</span>
                <span className="block text-xs text-zinc-400">
                  {e.pattern.replace(/_/g, " ")} · {e.equipment.replace(/_/g, " ")}
                </span>
              </span>
              {recentIds.includes(e.id) && (
                <span className="text-xs text-zinc-400">recent</span>
              )}
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-400">No matches</li>
        )}
      </ul>
    </div>
  );
}
