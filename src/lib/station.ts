import {
  STATION_TAGS_BY_PROFILE,
  needsStation,
  type ExerciseDef,
  type MachineType,
  type StationProfile,
  type StationTag,
} from "./strength/coefficients";

export const CHOOSE_STATION_COPY = {
  machine: "Choose machine",
  cable: "Choose cable",
  bench: "Choose bench",
  rack: "Choose rack",
  platform: "Choose platform",
} as const satisfies Record<Exclude<StationProfile, "none">, string>;

export function chooseStationCopy(profile: StationProfile | undefined): string | null {
  if (!profile || profile === "none") return null;
  return CHOOSE_STATION_COPY[profile];
}

export function isLoggableExercise(def: Pick<ExerciseDef, "stationProfile"> | undefined): boolean {
  return !!def && !needsStation(def);
}

export type StationPickerForm =
  | { kind: "none" }
  | { kind: "brand-and-type"; copy: typeof CHOOSE_STATION_COPY.machine }
  | { kind: "brand-only"; copy: string; machineType: StationTag };

export function stationPickerForm(def: Pick<ExerciseDef, "stationProfile">): StationPickerForm {
  const profile = def.stationProfile ?? "none";
  if (profile === "none") return { kind: "none" };
  if (profile === "machine") {
    return { kind: "brand-and-type", copy: CHOOSE_STATION_COPY.machine };
  }
  return {
    kind: "brand-only",
    copy: CHOOSE_STATION_COPY[profile],
    machineType: STATION_TAGS_BY_PROFILE[profile][0],
  };
}

export function shouldResolveStation(
  def: Pick<ExerciseDef, "stationProfile">,
  resolveStations: boolean,
): boolean {
  return resolveStations && needsStation(def);
}

// Smallest useful resolve helper: session/planner forms lock cable to selectorized
// and barbell stations to their profile tag. Machines keep the plate/stack choice.
export function stationResolveInput(
  template: Pick<ExerciseDef, "id" | "stationProfile">,
  input: { brand: string | null; machineType?: MachineType },
): { baseExerciseId: string; brand: string | null; machineType: StationTag } {
  const form = stationPickerForm(template);
  if (form.kind === "none") {
    throw new Error("Template does not require a station");
  }
  return {
    baseExerciseId: template.id,
    brand: input.brand,
    machineType: form.kind === "brand-only" ? form.machineType : (input.machineType ?? "selectorized"),
  };
}
