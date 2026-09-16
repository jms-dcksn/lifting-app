import type { MachineType } from "@/lib/strength/coefficients";

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const TYPE_TAG: Record<MachineType, string> = { plate_loaded: "plate", selectorized: "stack" };

export function variantId(baseId: string, brand: string | null, machineType: MachineType): string {
  return `${baseId}__${slug(brand ?? "")}__${machineType}`;
}

export function variantName(
  baseName: string,
  brand: string | null,
  machineType: MachineType,
): string {
  const tag = TYPE_TAG[machineType];
  return brand ? `${baseName} — ${brand} (${tag})` : `${baseName} (${tag})`;
}

// Terse brand/type identity for a resolved variant — the axis that actually differs when
// swapping machines for the same movement. Null when the exercise carries no machine identity.
export function variantShortLabel(
  brand: string | null | undefined,
  machineType: MachineType | null | undefined,
): string | null {
  const tag = machineType ? TYPE_TAG[machineType] : null;
  if (brand && tag) return `${brand} (${tag})`;
  return brand ?? tag;
}

export function slugifyCustom(name: string): string {
  return `custom-${slug(name)}-${Math.random().toString(36).slice(2, 7)}`;
}
