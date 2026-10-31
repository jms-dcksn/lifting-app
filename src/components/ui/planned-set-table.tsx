import type { PlannedSet } from "@/lib/workout-editor";

export function setRange(min: number, max: number) {
  return min === max ? String(min) : `${min}–${max}`;
}

export function PlannedSetSummary({ sets, label, loadMode, pendingEquipment = false, addedLoad = false }: {
  sets: PlannedSet[];
  label: string;
  addedLoad?: boolean;
  pendingEquipment?: boolean;
  loadMode?: "reps_only" | "assisted";
}) {
  const repsOnly = loadMode === "reps_only";
  const assisted = loadMode === "assisted";
  return <table aria-label={label} className="mt-2 w-full table-fixed text-right text-body tabular-nums">
    <thead className="border-y border-border bg-surface text-caption font-normal text-muted"><tr>
      <th scope="col" className="w-10 px-2 py-2 text-left font-normal">Set</th>
      <th scope="col" className="w-[42%] px-2 py-2 font-normal">Upcoming target
        {!repsOnly && <span className="block text-[10px]">{assisted ? "Assistance · lb" : addedLoad ? "Added · lb" : "Weight · lb"}</span>}</th>
      <th scope="col" className="px-2 py-2 font-normal">Reps</th><th scope="col" className="px-3 py-2 font-normal">RIR</th>
    </tr></thead>
    <tbody>{sets.map((set, i) => {
      const weight = set.weight ?? set.suggestedWeight;
      return <tr key={set.id} data-readonly-set-row className="border-b border-border last:border-0">
        <th scope="row" className="px-2 py-2 text-left text-caption font-normal text-muted">{i + 1}</th>
        <td className="px-2 py-2">
          {pendingEquipment ? <span className="text-caption text-muted">Choose equipment</span>
            : weight === null ? <span className="text-caption text-muted">Not available</span>
            : <>{!repsOnly && <>{assisted ? Math.abs(weight) : weight} lb{addedLoad ? " added" : ""}{" × "}</>}{set.targetReps} reps
              {set.weight !== null && <span className="block text-[10px] leading-4 text-muted">Your target</span>}</>}
        </td>
        <td className="px-2 py-2">{setRange(set.repMin, set.repMax)}</td>
        <td className="px-3 py-2">{setRange(set.rirMin, set.rirMax)}</td>
      </tr>;
    })}</tbody>
  </table>;
}
