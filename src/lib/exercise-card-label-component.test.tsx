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
  it("puts the equipment chip before supporting brand and load details", () => {
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
    expect(html.indexOf(">Machine</span>")).toBeLessThan(html.indexOf("Cybex"));
    expect(html).toContain("Cybex · Plate-loaded");
    expect(html).not.toContain("<button");
  });

  it("omits a third line for dumbbell movements", () => {
    const html = render(EXERCISE_BY_ID["db-lateral-raise"], "body");
    expect(html).toContain("Lateral Raise");
    expect(html).toContain("Dumbbell");
    expect(html).not.toContain("Selectorized");
    expect(html).not.toContain("Weight stack");
  });
});
