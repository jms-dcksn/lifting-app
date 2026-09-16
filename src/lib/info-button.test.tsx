// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { InfoButton } from "@/components/ui/info-button";

const restToneBody =
  "Two short beeps play in this tab when rest ends. Phone vibration is separate.";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

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
  vi.useRealTimers();
});

function render(node: ReactNode) {
  act(() => {
    root.render(node);
  });
}

describe("InfoButton", () => {
  it("names the trigger About {title} by default", () => {
    render(<InfoButton title="Rest complete tone">{restToneBody}</InfoButton>);
    expect(host.querySelector("button")?.getAttribute("aria-label")).toBe(
      "About Rest complete tone",
    );
  });

  it("uses the label override as the trigger name", () => {
    render(
      <InfoButton title="Rest complete tone" label="What is rest tone?">
        {restToneBody}
      </InfoButton>,
    );
    expect(host.querySelector("button")?.getAttribute("aria-label")).toBe(
      "What is rest tone?",
    );
  });

  it("opens a sheet with the title and body, then Done closes it", () => {
    vi.useFakeTimers();
    render(<InfoButton title="Rest complete tone">{restToneBody}</InfoButton>);

    const trigger = host.querySelector("button");
    expect(trigger).toBeTruthy();
    act(() => {
      trigger!.click();
    });

    const dialog = host.querySelector("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-label")).toBe("Rest complete tone");
    expect(host.querySelector("h2")?.textContent).toBe("Rest complete tone");
    expect(host.textContent).toContain(restToneBody);

    const done = [...host.querySelectorAll("button")].find((button) => button.textContent === "Done");
    expect(done).toBeTruthy();
    act(() => {
      done!.click();
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(host.querySelector("dialog")).toBeNull();
  });
});
