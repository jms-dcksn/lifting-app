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
        />,
      );
    });

    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Explore Track"]');
    expect(trigger).toBeTruthy();
    act(() => {
      trigger!.click();
    });
    expect(host.textContent).toContain("This week's PRs");
    expect(host.textContent).toContain("Month review");
    expect(host.textContent).toContain("Coach");
    expect(host.textContent).toContain("Body");
    expect(host.textContent).toContain("Volume");
    expect(host.textContent).not.toContain("Volume & weight");

    const weekPrs = [...host.querySelectorAll("button")].find((button) =>
      button.textContent === "This week's PRs",
    );
    act(() => {
      weekPrs?.click();
    });

    expect(host.textContent).toContain("Week PR list");
    expect(host.textContent).not.toContain("All lifts");
  });

  it("links Coach, Body, and Volume as Track routes", () => {
    act(() => {
      root.render(
        <TrackExploreMenu
          weekPrs={<p>Week PR list</p>}
          allLifts={<p>All lifts</p>}
        />,
      );
    });
    act(() => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Explore Track"]')!.click();
    });

    const hrefs = [...host.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs).toContain("/analytics/month");
    expect(hrefs).toContain("/analytics/coach");
    expect(hrefs).toContain("/analytics/body");
    expect(hrefs).toContain("/analytics/volume");
  });
});
