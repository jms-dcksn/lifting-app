import { describe, expect, it } from "vitest";
import { exactExerciseIdentity, exactIdentityKey } from "./strength/identity";
import type { ComparisonScope } from "./strength/movement";
import { resolveExactWorkoutTarget } from "./effective-workout-target";

describe("exact identity boundary", () => {
  it("rejects empty identities and preserves separate instances", () => {
    expect(() => exactExerciseIdentity("", null)).toThrow();
    expect(() => exactExerciseIdentity("db-bench", " ")).toThrow();
    expect(exactIdentityKey(exactExerciseIdentity("station", "one"))).not.toBe(exactIdentityKey(exactExerciseIdentity("station", "two")));
  });
  it("keeps unknown exercise targets unavailable without substituting a movement", () => {
    expect(resolveExactWorkoutTarget({ identity: exactExerciseIdentity("unknown", null), slotId: "slot", context: null,
      prescription: { repMin: 6, repMax: 10, targetRir: 2 }, catalog: {}, stats: [], bodyweight: 180,
      history: { progressionByExercise: {}, effortBySlot: {} } }).target).toBeNull();
  });
});

// Compile-time contracts: these examples must fail even though their IDs are strings.
function invalidIdentityContracts(scope: ComparisonScope, input: Parameters<typeof resolveExactWorkoutTarget>[0]) {
  // @ts-expect-error A comparison scope cannot authorize an exact target calculation.
  resolveExactWorkoutTarget({ ...input, identity: scope });
  // @ts-expect-error An interchangeable slot string is not a validated identity object.
  resolveExactWorkoutTarget({ ...input, identity: input.slotId });
}
void invalidIdentityContracts;
