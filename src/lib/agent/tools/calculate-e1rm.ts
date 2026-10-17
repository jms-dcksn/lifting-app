import { z } from "zod";
import { computeE1rm } from "@/lib/strength/e1rm";
import { effectiveLoad } from "@/lib/strength/recompute";

export const calculateE1rmSchema = z.object({
  exerciseName: z.string().trim().min(1).max(160).optional()
    .describe("Optional user-provided lift label; no catalog id or logged history required."),
  weight: z.number().finite().optional()
    .describe("Total external load, one dumbbell's load, or this machine's logged load. Bodyweight: added load (0 for unweighted); assisted_bodyweight: negative assistance."),
  reps: z.number().int().positive().optional().describe("Whole-number reps performed."),
  rir: z.number().finite().min(0).max(5).optional()
    .describe("Reps in reserve, 0–5. Omit only when unknown; the tool discloses its default of 2."),
  unit: z.enum(["kg", "lb"]).optional().describe("Explicit unit shared by weight and bodyweight; never infer from app storage."),
  loadConvention: z.enum([
    "total_external", "per_hand", "machine", "bodyweight", "assisted_bodyweight", "reps_only",
  ]).optional().describe("Use the user's stated load context. total_external includes the bar; per_hand is one dumbbell (never double); machine stays station-specific; bodyweight/assisted require bodyweight. Ask when ambiguous. reps_only has no load-based e1RM."),
  bodyweight: z.number().finite().positive().optional()
    .describe("Explicit bodyweight in the same unit, required for bodyweight/assisted estimates; never infer from profile or current weight history."),
});

export type CalculateE1rmInput = z.infer<typeof calculateE1rmSchema>;

/** Hypothetical calculation only: no catalog lookup, ledger reads, or writes. */
export function calculateE1rm(raw: unknown) {
  const parsed = calculateE1rmSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      source: "calculateE1rm" as const,
      status: "invalid_input" as const,
      issues: parsed.error.issues.map(({ path, message }) => ({ field: path.join("."), message })),
    };
  }
  const input = parsed.data;
  const { weight, reps, unit, loadConvention } = input;
  if (input.loadConvention === "reps_only") {
    return { source: "calculateE1rm" as const, status: "unavailable" as const,
      reason: "Rep-only movements have no load-based e1RM in this app." };
  }
  const isBodyweight = input.loadConvention === "bodyweight" || input.loadConvention === "assisted_bodyweight";
  const missing = (["weight", "reps", "unit", "loadConvention"] as const)
    .filter((field) => input[field] === undefined) as string[];
  if (isBodyweight && input.bodyweight === undefined) missing.push("bodyweight");
  if (missing.length || weight === undefined || reps === undefined || unit === undefined || loadConvention === undefined) {
    return { source: "calculateE1rm" as const, status: "needs_input" as const, missing,
      reason: "Ask for the missing inputs and load context before calculating; all loads must share one unit." };
  }

  const assisted = loadConvention === "assisted_bodyweight";
  if (assisted ? weight > 0 : isBodyweight ? weight < 0 : weight <= 0) {
    return { source: "calculateE1rm" as const, status: "invalid_input" as const,
      issues: [{ field: "weight", message: assisted
        ? "Store assistance as negative added load (or zero)."
        : isBodyweight ? "Added load must be zero or positive; use assisted_bodyweight for assistance."
          : "External, per-hand and machine loads must be positive." }] };
  }
  const load = effectiveLoad({ equipment: isBodyweight ? "bodyweight" : "barbell" }, weight, input.bodyweight ?? null);
  const rir = input.rir ?? 2;
  const estimate = load == null || load <= 0 ? NaN : computeE1rm(load, reps, rir);
  if (!Number.isFinite(estimate) || estimate <= 0) {
    return { source: "calculateE1rm" as const, status: "invalid_input" as const,
      issues: [{ field: "weight", message: "Effective load and resulting e1RM must be finite and positive; assistance must be less than bodyweight." }] };
  }
  return {
    source: "calculateE1rm" as const,
    status: "estimated" as const,
    kind: "hypothetical" as const,
    formula: "computeE1rm" as const,
    inputs: { exerciseName: input.exerciseName ?? null, weight, reps, rir, unit, loadConvention,
      bodyweight: isBodyweight ? input.bodyweight : null },
    rirDefaulted: input.rir === undefined,
    effectiveLoad: load,
    estimatedOneRepMax: estimate,
    unit,
    estimateBasis: isBodyweight ? "total_system_load" : loadConvention === "per_hand" ? "per_hand" : loadConvention,
    assumptions: [
      input.rir === undefined ? "RIR was omitted; assumed 2 reps in reserve." : `Used the supplied RIR of ${rir}.`,
      isBodyweight ? "Uses bodyweight plus added load; negative added load is assistance. The estimate is total system load, not added weight or assistance."
        : loadConvention === "per_hand" ? "Uses one dumbbell's load; the estimate is per hand, not both dumbbells combined."
          : loadConvention === "machine" ? "Uses this machine's logged load; stack labels and leverage do not transfer to another station or free weights."
            : "Uses total external load, including the bar where applicable.",
      "RPE/RIR model estimate, not a measured maximum, logged result, record or training target.",
      ...(reps + rir > 12 ? ["Effective reps exceed the model's 12-rep table; this uses the canonical extrapolation and is less certain."] : []),
    ],
  };
}
