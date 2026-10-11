import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExerciseCardLabel } from "@/components/ui/exercise-card-label";
import { EXERCISE_BY_ID, type ExerciseDef } from "./strength/coefficients";

function render(def: ExerciseDef, size?: "display" | "heading" | "body") {
  return renderToStaticMarkup(
    createElement(ExerciseCardLabel, { def, size, as: size === "display" ? "h1" : "h2" }),
  );
}

describe("ExerciseCardLabel", () => {
  it("renders three lines for a machine variant", () => {
    const html = render({
      ...EXERCISE_BY_ID["hack-squat"],
      id: "hack-squat__cybex__plate_loaded",
      baseExerciseId: "hack-squat",
      brand: "Cybex",
      machineType: "plate_loaded",
    });
    expect(html).toContain("Hack Squat");
    expect(html).toContain("Cybex");
    expect(html).toContain("Plate-loaded");
    expect(html).toContain("text-heading");
    expect(html).toContain("text-caption text-muted");
  });

  it("omits a third line for dumbbell movements", () => {
    const html = render(EXERCISE_BY_ID["db-lateral-raise"], "body");
    expect(html).toContain("Lateral Raise");
    expect(html).toContain("Dumbbell");
    expect(html.match(/<span class="block/g)?.length).toBe(2);
  });
});
