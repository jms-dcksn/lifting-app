"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CardLabel } from "@/components/ui/card";
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

  const action = "px-2 py-3 text-muted disabled:opacity-40";

  return (
    <section className="w-full max-w-page px-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <CardLabel className="mb-2">Saved programs</CardLabel>
      <ul className="flex flex-col gap-2">
        {others.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-control border border-border px-3 py-1 text-body"
          >
            <span>
              {p.name}
              {p.isActive && (
                <span className="ml-2 text-caption font-medium uppercase tracking-wide">
                  active
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-caption">
              <button onClick={() => router.push(`/program?id=${p.id}`)} className={action}>
                Edit
              </button>
              {!p.isActive && (
                <button
                  disabled={pending}
                  onClick={() => start(async () => { await setActiveProgram(p.id); router.refresh(); })}
                  className={action}
                >
                  Make active
                </button>
              )}
              <button
                disabled={pending}
                onClick={() => start(async () => { const id = await cloneProgram(p.id); router.push(`/program?id=${id}`); })}
                className={action}
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
