// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackExploreMenu } from "@/app/(app)/analytics/track-explore-menu";

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...props }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className} {...props}>{children}</a>
  ),
}));

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

describe("TrackExploreMenu", () => {
  it("opens this week's PRs from Explore", () => {
    vi.useFakeTimers();
    act(() => {
      root.render(
        <TrackExploreMenu
          weekPrs={<p>Week PR list</p>}
          allLifts={<p>All lifts</p>}
          volumeAndWeight={<p>Volume</p>}
        />,
      );
    });

    act(() => {
      host.querySelector('button[aria-label="Explore Track"]')?.click();
    });
    expect(host.textContent).toContain("This week's PRs");
    expect(host.textContent).toContain("Month review");

    const weekPrs = [...host.querySelectorAll("button")].find((button) =>
      button.textContent === "This week's PRs",
    );
    act(() => {
      weekPrs?.click();
    });

    expect(host.textContent).toContain("Week PR list");
    expect(host.textContent).not.toContain("All lifts");
    expect(host.textContent).not.toContain("Volume");
  });
});
