"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cx } from "@/components/ui/cx";

export interface ExerciseListItem {
  exerciseId: string;
  name: string;
  pattern: string;
  currentE1rm: number | null;
  bestE1rm: number | null;
  lastPerformedAt: string;
  sessionCount: number;
  delta: number | null;
}

export function ExerciseList({ items }: { items: ExerciseListItem[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.pattern.toLowerCase().includes(q) ||
        item.exerciseId.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search logged exercises..."
        enterKeyHint="search"
        autoComplete="off"
        className="h-11"
      />
      <ul className="divide-y divide-border">
        {filtered.map((item) => (
          <li key={item.exerciseId}>
            <Link
              href={`/history/${item.exerciseId}`}
              className="flex min-h-16 items-center justify-between gap-3 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-body font-medium">{item.name}</span>
                <span className="block text-caption capitalize text-muted">
                  {item.pattern.replace(/_/g, " ")} · {item.sessionCount} session
                  {item.sessionCount === 1 ? "" : "s"} · {shortDate(item.lastPerformedAt)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                <span className="text-caption tabular-nums text-muted">
                  {item.currentE1rm == null
                    ? "no e1RM"
                    : `${Math.round(item.currentE1rm)} lb e1RM`}
                </span>
                <TrendChip delta={item.delta} />
              </span>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="py-6 text-center text-body text-muted">No matches</li>
        )}
      </ul>
    </div>
  );
}

function TrendChip({ delta }: { delta: number | null }) {
  if (delta == null) {
    return (
      <span className="rounded-full border border-border px-2 py-0.5 text-caption text-muted">
        no trend yet
      </span>
    );
  }

  const rounded = Math.round(delta);
  const signed = rounded > 0 ? `+${rounded}` : rounded < 0 ? `${rounded}` : "+0";
  return (
    <span
      className={cx(
        "rounded-full border px-2 py-0.5 text-caption tabular-nums",
        rounded > 0 && "border-overload-up text-overload-up",
        rounded < 0 && "border-overload-down text-overload-down",
        rounded === 0 && "border-border text-muted",
      )}
    >
      {signed} lb
    </span>
  );
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
