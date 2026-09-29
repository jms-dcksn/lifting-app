import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExerciseVisual } from "@/components/ui/exercise-visual";

function render(
  props: Parameters<typeof ExerciseVisual>[0] = {},
) {
  return renderToStaticMarkup(createElement(ExerciseVisual, props));
}

describe("ExerciseVisual", () => {
  it("renders the mapped illustration as a decorative image", () => {
    const html = render({ exerciseId: "bb-bench" });
    expect(html).toContain('data-exercise-visual="image"');
    expect(html).toContain('src="/exercises/bb-bench.jpg"');
    expect(html).toContain('alt=""');
    expect(html).toContain("aria-hidden");
    expect(html).toContain("h-9");
    expect(html).toContain("w-16");
    expect(html).toContain("object-cover");
    expect(html).not.toContain("object-contain");
  });

  it("uses the larger 16:9 frame on headers", () => {
    const html = render({ exerciseId: "hack-squat", size: "lg" });
    expect(html).toContain("h-16");
    expect(html).toContain("w-[7.11rem]");
    expect(html).toContain('src="/exercises/hack-squat.jpg"');
    expect(html).toContain("object-cover");
  });

  it("shows the dumbbell fallback when the identity has no art", () => {
    const html = render({ exerciseId: "custom-my-lift-ab12" });
    expect(html).toContain('data-exercise-visual="icon"');
    expect(html).not.toContain("<img");
    expect(html).toContain("<svg");
  });

  it("never renders a broken image for an empty or unknown id", () => {
    expect(render({})).toContain('data-exercise-visual="icon"');
    expect(render({ exerciseId: "bb-row" })).toContain('data-exercise-visual="icon"');
    expect(render({ exerciseId: "bb-bench__flex-fitness__bench" })).toContain(
      'src="/exercises/bb-bench.jpg"',
    );
  });
});
