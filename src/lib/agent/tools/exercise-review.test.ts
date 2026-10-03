import { describe, expect, it } from "vitest";
import { EXERCISES } from "@/lib/strength/coefficients";
import { variantId, variantName } from "@/lib/exercise-id";
import { resolveExerciseIdentity } from "./exercise-review";

const catalog = Object.fromEntries(EXERCISES.map((def) => [def.id, def]));

const nautilus = {
  id: variantId("hack-squat", "Nautilus", "plate_loaded"),
  name: variantName("Hack Squat", "Nautilus", "plate_loaded"),
};
const cybex = {
  id: variantId("hack-squat", "Cybex", "plate_loaded"),
  name: variantName("Hack Squat", "Cybex", "plate_loaded"),
};
const withStations = { ...catalog, [nautilus.id]: nautilus, [cybex.id]: cybex };

function idOf(
  name: string,
  source: Record<string, { id: string; name: string }> = catalog,
  logged?: string[],
) {
  return resolveExerciseIdentity(source, { name, loggedExerciseIds: logged });
}

describe("resolveExerciseIdentity", () => {
  it("resolves incline bench press to the barbell incline, not flat bench", () => {
    expect(idOf("incline bench press")).toEqual({ exerciseId: "bb-incline-bench" });
  });

  it("folds plurals onto the singular catalog name", () => {
    expect(idOf("deadlifts")).toEqual({ exerciseId: "bb-deadlift" });
    expect(idOf("hip thrusts")).toEqual({ exerciseId: "bb-hip-thrust" });
    expect(idOf("leg extensions")).toEqual({ exerciseId: "leg-extension" });
    const curls = idOf("curls");
    expect(curls).not.toEqual({ exerciseId: "hammer-rope-curl" });
    expect(curls).toEqual({ exerciseId: "bb-curl" });
  });

  it("joins a split compound onto one catalog token", () => {
    expect(idOf("lat pull down")).toEqual({ exerciseId: "lat-pulldown" });
    expect(idOf("skull crushers")).toEqual({ exerciseId: "db-skullcrusher" });
    expect(idOf("pull ups")).toEqual({ exerciseId: "weighted-pullup" });
  });

  it("resolves gym nicknames", () => {
    expect(idOf("rdl")).toEqual({ exerciseId: "bb-rdl" });
    expect(idOf("rdls")).toEqual({ exerciseId: "bb-rdl" });
    expect(idOf("ohp")).toEqual({ exerciseId: "bb-ohp" });
    expect(idOf("military press")).toEqual({ exerciseId: "bb-ohp" });
    expect(idOf("bss")).toEqual({ exerciseId: "db-split-squat" });
    expect(idOf("pullups")).toEqual({ exerciseId: "weighted-pullup" });
    const dbBench = idOf("db bench");
    expect(dbBench).toMatchObject({ needsDisambiguation: true });
    if ("matches" in dbBench) {
      expect(dbBench.matches.map((match) => match.id).sort()).toEqual([
        "db-bench",
        "db-incline-bench",
      ]);
    }
    const bbSquat = idOf("bb squat");
    expect(bbSquat).toMatchObject({ needsDisambiguation: true });
    if ("matches" in bbSquat) {
      expect(bbSquat.matches.map((match) => match.id).sort()).toEqual([
        "bb-back-squat",
        "bb-front-squat",
      ]);
    }
  });

  it("accepts a one-letter typo on a long token", () => {
    expect(idOf("romanian deadlfit")).toEqual({ exerciseId: "bb-rdl" });
    expect(idOf("incline benc")).toEqual({ exerciseId: "bb-incline-bench" });
  });

  it("treats flat as not-incline and still prefers barbell", () => {
    expect(idOf("flat bench")).toEqual({ exerciseId: "bb-bench" });
  });

  it("returns not found when a token matches nothing", () => {
    expect(idOf("face pulls")).toEqual({
      source: "exerciseReview",
      error: "No exercise matched “face pulls”.",
    });
  });

  it("keeps an exact template when no station is logged", () => {
    expect(idOf("hack squat", withStations)).toEqual({ exerciseId: "hack-squat" });
    expect(idOf("nautilus hack squat", withStations)).toEqual({ exerciseId: nautilus.id });
  });

  it("prefers the only logged station over the empty template", () => {
    expect(idOf("hack squat", withStations, [nautilus.id])).toEqual({ exerciseId: nautilus.id });
  });

  it("asks when two logged stations both match", () => {
    const resolved = idOf("hack squat", withStations, [nautilus.id, cybex.id]);
    expect(resolved).toMatchObject({ needsDisambiguation: true });
    if ("matches" in resolved) {
      expect(resolved.matches.map((match) => match.id).sort()).toEqual([cybex.id, nautilus.id].sort());
    }
  });

  it("resolves squat to the only logged barbell squat", () => {
    expect(idOf("squat", catalog, ["bb-back-squat"])).toEqual({ exerciseId: "bb-back-squat" });
  });
});
