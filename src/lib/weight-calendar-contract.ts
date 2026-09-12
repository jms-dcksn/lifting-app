import type { BodyweightEntry } from "./bodyweight";

export type WeightWrite = {
  entryId: string | null;
  loggedOn: string;
  weight: number;
  replaceEntryId?: string | null;
};
export type WeightWriteResult =
  | { ok: true; id: string }
  | { ok: false; error: string; conflict?: BodyweightEntry };

export type WeightCalendarActions = {
  load: (month: string) => Promise<{ entries: BodyweightEntry[]; today: string }>;
  save: (input: WeightWrite) => Promise<WeightWriteResult>;
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>;
};
