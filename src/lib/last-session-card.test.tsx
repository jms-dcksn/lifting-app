// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LastSessionCard } from "@/app/(app)/last-session-card";

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

describe("LastSessionCard", () => {
  it("sends recap and workout to separate routes", () => {
    act(() => {
      root.render(
        <LastSessionCard sessionId="s1" dayName="Push" totalSets={12} headline="2 PRs" />,
      );
    });

    const recap = host.querySelector('a[href="/session/s1/recap"]');
    const workout = host.querySelector('a[href="/session/s1"]');
    expect(recap).toBeTruthy();
    expect(workout).toBeTruthy();
    expect(recap?.textContent).toContain("2 PRs");
    expect(recap?.textContent).toContain("View recap");
    expect(workout?.textContent).toContain("View workout");
    expect(host.textContent).toContain("Push · 12 working sets");
  });

  it("shows that session's record chips without nested links", () => {
    act(() => {
      root.render(
        <LastSessionCard
          sessionId="s1"
          dayName="Push"
          totalSets={12}
          headline="2 PRs"
          chips={[
            { label: "Bench 225 × 8 +1" },
            { label: "Bench 275 e1RM +5" },
          ]}
        />,
      );
    });

    const recap = host.querySelector('a[href="/session/s1/recap"]');
    const records = host.querySelector('[aria-label="Session personal records"]');
    expect(records?.textContent).toContain("Bench 225 × 8 +1");
    expect(records?.textContent).toContain("Bench 275 e1RM +5");
    expect(recap?.contains(records)).toBe(true);
    expect(records?.querySelector("a")).toBeNull();
  });

  it("hides chips when the last session earned no records", () => {
    act(() => {
      root.render(
        <LastSessionCard sessionId="s1" dayName="Push" totalSets={12} headline={null} />,
      );
    });

    expect(host.querySelector('[aria-label="Session personal records"]')).toBeNull();
    expect(host.textContent).toContain("Push · 12 working sets");
    expect(host.textContent).not.toContain("PR");
  });
});
