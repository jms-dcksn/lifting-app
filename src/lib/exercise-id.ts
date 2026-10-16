import { normalizeStationModel, stationModelLabel } from "./machine-models";
import type { StationTag } from "@/lib/strength/coefficients";

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const TYPE_TAG: Record<StationTag, string> = {
  plate_loaded: "plate",
  selectorized: "stack",
  bench: "bench",
  rack: "rack",
  platform: "platform",
};

export function variantId(baseId: string, brand: string | null, machineType: StationTag, model?: string | null): string {
  const normalized = normalizeStationModel(model);
  // Lossless UTF-8 suffix avoids collisions between punctuation/non-ASCII model names.
  const suffix = normalized ? "__model-" + Array.from(new TextEncoder().encode(normalized), byte => byte.toString(16).padStart(2, "0")).join("") : "";
  return `${baseId}__${slug(brand ?? "")}__${machineType}${suffix}`;
}

// Canonical slugs are not namespaced, but exercise.id is a global PK. When another
// user already holds that slug, own the id so find-or-create can still insert.
export function ownedVariantId(
  baseId: string,
  brand: string | null,
  machineType: StationTag,
  userId: string,
  model?: string | null,
): string {
  return `${variantId(baseId, brand, machineType, model)}__${userId}`;
}

export function variantName(
  baseName: string,
  brand: string | null,
  machineType: StationTag,
  model?: string | null,
): string {
  const tag = TYPE_TAG[machineType];
  const station = [brand, stationModelLabel(normalizeStationModel(model))].filter(Boolean).join(" · ");
  return station ? `${baseName} — ${station} (${tag})` : `${baseName} (${tag})`;
}

// Terse brand/type identity for a resolved variant — the axis that actually differs when
// swapping machines for the same movement. Null when the exercise carries no machine identity.
export function variantShortLabel(
  brand: string | null | undefined,
  machineType: StationTag | null | undefined,
  model?: string | null,
): string | null {
  brand = [brand, stationModelLabel(model)].filter(Boolean).join(" · ") || null;
  const tag = machineType ? TYPE_TAG[machineType] : null;
  if (brand && tag) return `${brand} (${tag})`;
  return brand ?? tag;
}

export function slugifyCustom(name: string): string {
  return `custom-${slug(name)}-${Math.random().toString(36).slice(2, 7)}`;
}
