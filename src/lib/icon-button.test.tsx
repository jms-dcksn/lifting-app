// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IconButton } from "@/components/ui/icon-button";
import { IconSwap } from "@/components/ui/icons";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function render(node: ReactNode) {
  act(() => {
    root.render(node);
  });
}

describe("IconButton", () => {
  it("requires a 44px named control and keeps the glyph", () => {
    render(
      <IconButton aria-label="Swap bench">
        <IconSwap />
      </IconButton>,
    );
    const button = host.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("Swap bench");
    expect(button?.className).toContain("size-11");
    expect(host.querySelector("svg")).toBeTruthy();
  });

  it("disables and shows busy state when pending", () => {
    render(
      <IconButton aria-label="Swap bench" pending>
        <IconSwap />
      </IconButton>,
    );
    const button = host.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-busy")).toBe("true");
    expect(host.querySelector("svg")).toBeNull();
  });
});
