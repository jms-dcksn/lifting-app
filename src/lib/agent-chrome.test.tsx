// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChat } from "@/components/agent/agent-chat";
import { AgentTranscript } from "@/components/agent/agent-transcript";
import { hideAppChrome } from "@/lib/app-chrome";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
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
});

describe("agent chrome", () => {
  it("hides with the tab bar on session and planner routes", () => {
    expect(hideAppChrome("/session/abc")).toBe(true);
    expect(hideAppChrome("/session/abc/recap")).toBe(true);
    expect(hideAppChrome("/workout/next")).toBe(true);
    expect(hideAppChrome("/program/new")).toBe(true);
    expect(hideAppChrome("/")).toBe(false);
    expect(hideAppChrome("/coach")).toBe(false);
  });

  it("renders the empty transcript prompt", () => {
    act(() => {
      root.render(<AgentTranscript messages={[]} />);
    });
    expect(host.textContent).toContain("Ask how this week went.");
  });

  it("puts you on the right and renders Coach markdown with one source", () => {
    act(() => {
      root.render(
        <AgentTranscript
          messages={[
            {
              id: "u1",
              role: "user",
              createdAt: "2026-09-27T00:00:00.000Z",
              parts: [{ type: "text", text: "How did this week go" }],
            },
            {
              id: "t1",
              role: "assistant",
              createdAt: "2026-09-27T00:00:01.000Z",
              parts: [{ type: "tool-call", id: "call-1", name: "weeklyCoach", args: {} }],
            },
            {
              id: "a1",
              role: "assistant",
              createdAt: "2026-09-27T00:00:02.000Z",
              parts: [{
                type: "text",
                text: "This week went solidly — **4/4 sessions** completed.\n\n- Cable Curl **+8.5%**\n\nSource: Track Coach / Coach check-in",
              }],
            },
          ]}
        />,
      );
    });

    const you = host.querySelector(".ml-auto");
    expect(you?.textContent).toContain("You");
    expect(you?.textContent).toContain("How did this week go");
    expect(you?.querySelector(".bg-accent")).toBeTruthy();

    expect(host.textContent).toContain("Checked this week's Coach report");
    const coach = host.querySelector(".mr-auto");
    expect(coach?.textContent).toContain("Coach");
    expect(coach?.querySelector("strong")?.textContent).toBe("4/4 sessions");
    expect(coach?.querySelector(".text-overload-up")?.textContent).toBe("+8.5%");
    expect(coach?.textContent).toContain("Track Coach / Coach check-in");
    expect(coach?.textContent).not.toContain("**");
    expect([...host.querySelectorAll(".uppercase")].map((node) => node.textContent)).toEqual(["You", "Coach"]);
  });

  it("opens on the latest message with the composer still on screen", () => {
    const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 900 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 200 });
    try {
      act(() => {
        root.render(
          <AgentChat
            variant="sheet"
            initialMessages={[{
              id: "1",
              role: "user",
              createdAt: "2026-09-27T00:00:00.000Z",
              parts: [{ type: "text", text: "latest" }],
            }]}
          />,
        );
      });
      const scroller = host.querySelector(".overflow-y-auto");
      const form = host.querySelector("form");
      expect(scroller?.scrollTop).toBe(900);
      expect(scroller?.contains(form)).toBe(false);
      expect(host.querySelector("a")?.textContent).toBe("Full screen");
      expect(host.querySelector("input")?.hasAttribute("disabled")).toBe(false);
      expect(host.querySelector("button[aria-label='Send'] path")?.getAttribute("d")).toBe("M12 19V5M6 11l6-6 6 6");
    } finally {
      if (scrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeight);
      if (clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
    }
  });
});
