// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinishedWorkoutNav, RecapNav } from "@/app/(app)/session/[id]/session-nav";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
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

describe("session navigation", () => {
  it("lets recap return home or open the workout", () => {
    act(() => {
      root.render(<RecapNav sessionId="s1" />);
    });
    expect([...host.querySelectorAll("a")].map((el) => [el.getAttribute("href"), el.textContent])).toEqual([
      ["/", "Home"],
      ["/session/s1", "View workout"],
    ]);
  });

  it("lets a finished workout return home or open the recap", () => {
    act(() => {
      root.render(<FinishedWorkoutNav sessionId="s1" />);
    });
    expect([...host.querySelectorAll("a")].map((el) => [el.getAttribute("href"), el.textContent])).toEqual([
      ["/", "Home"],
      ["/session/s1/recap", "View recap"],
    ]);
  });
});
