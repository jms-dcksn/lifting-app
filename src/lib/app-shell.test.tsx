// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabBar } from "@/app/(app)/app-shell";

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...props }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className} {...props}>{children}</a>
  ),
}));

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

function currentTab() {
  return host.querySelector("[aria-current='page']")?.getAttribute("href");
}

describe("TabBar current destination", () => {
  it("marks Track current on Exercise review", () => {
    act(() => {
      root.render(<TabBar pathname="/history/bb-bench" />);
    });
    expect(currentTab()).toBe("/analytics");
    expect(host.querySelector('a[href="/"]')?.getAttribute("aria-current")).toBeNull();
  });

  it("marks Track current on Track itself", () => {
    act(() => {
      root.render(<TabBar pathname="/analytics" />);
    });
    expect(currentTab()).toBe("/analytics");
  });

  it("does not mark Track current on Lift", () => {
    act(() => {
      root.render(<TabBar pathname="/" />);
    });
    expect(currentTab()).toBe("/");
  });
});
