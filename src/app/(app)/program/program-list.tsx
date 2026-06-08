"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cloneProgram, setActiveProgram } from "./actions";

interface ProgramRow {
  id: string;
  name: string;
  weeks: number;
  isActive: boolean;
}

// Saved programs: switch active, clone to start a new block, or edit. Shown below the builder.
export function ProgramList({ programs, editingId }: { programs: ProgramRow[]; editingId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const others = programs.filter((p) => p.id !== editingId);
  if (others.length === 0) return null;

  return (
    <section className="px-4 pb-28">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Saved programs
      </h2>
      <ul className="flex flex-col gap-2">
        {others.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
          >
            <span>
              {p.name}
              {p.isActive && <span className="ml-2 text-xs text-emerald-600">active</span>}
            </span>
            <span className="flex gap-3 text-xs">
              <button onClick={() => router.push(`/program?id=${p.id}`)} className="text-zinc-500">
                Edit
              </button>
              {!p.isActive && (
                <button
                  disabled={pending}
                  onClick={() => start(async () => { await setActiveProgram(p.id); router.refresh(); })}
                  className="text-zinc-500 disabled:opacity-40"
                >
                  Make active
                </button>
              )}
              <button
                disabled={pending}
                onClick={() => start(async () => { const id = await cloneProgram(p.id); router.push(`/program?id=${id}`); })}
                className="text-zinc-500 disabled:opacity-40"
              >
                Clone
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
