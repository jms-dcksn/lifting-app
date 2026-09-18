export const VARIANTS = [
  { key: "A", name: "Board" },
  { key: "B", name: "Atlas" },
  { key: "C", name: "Pulse" },
] as const;

export type VariantKey = (typeof VARIANTS)[number]["key"];

export function normalizeVariant(value?: string | null): VariantKey {
  const key = value?.toUpperCase();
  if (key === "A" || key === "B" || key === "C") return key;
  return "A";
}
