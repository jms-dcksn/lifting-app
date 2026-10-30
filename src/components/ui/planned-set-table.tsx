import type { PlannedSet } from "@/lib/workout-editor";

export function setRange(min: number, max: number) {
  return min === max ? String(min) : `${min}–${max}`;
}

export function PlannedSetSummary({ sets, label, loadMode, addedLoad = false }: {
  sets: PlannedSet[];
  label: string;
  addedLoad?: boolean;
  loadMode?: "reps_only" | "assisted";
}) {
  const repsOnly = loadMode === "reps_only";
  const assisted = loadMode === "assisted";
  return <table aria-label={label} className="mt-2 w-full table-fixed text-right text-body tabular-nums">
    <thead className="border-y border-border bg-surface text-caption font-normal text-muted"><tr>
      <th scope="col" className="w-10 px-2 py-2 text-left font-normal">Set</th>
      {!repsOnly && <th scope="col" className="w-[42%] px-2 py-2 font-normal">{assisted ? "Assistance · lb" : addedLoad ? "Added · lb" : "Weight · lb"}</th>}
      <th scope="col" className="px-2 py-2 font-normal">Reps</th><th scope="col" className="px-3 py-2 font-normal">RIR</th>
    </tr></thead>
    <tbody>{sets.map((set, i) => {
      const weight = set.weight ?? set.suggestedWeight;
      const provenance = set.weight !== null ? "Your target" : set.suggestedWeight !== null ? "Suggested" : "Weight not set";
      return <tr key={set.id} data-readonly-set-row className="border-b border-border last:border-0">
        <th scope="row" className="px-2 py-2 text-left text-caption font-normal text-muted">{i + 1}</th>
        {!repsOnly && <td className="px-2 py-2">
          {weight === null ? "—" : assisted ? Math.abs(weight) : weight}
          <span className="sr-only">{weight !== null ? " lb · " : " "}</span>
          <span className="block text-[10px] leading-4 text-muted">{provenance}</span>
        </td>}
        <td className="px-2 py-2">{setRange(set.repMin, set.repMax)}</td>
        <td className="px-3 py-2">{setRange(set.rirMin, set.rirMax)}</td>
      </tr>;
    })}</tbody>
  </table>;
}
