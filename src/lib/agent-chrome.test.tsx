// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChat } from "@/components/agent/agent-chat";
import { AgentTranscript } from "@/components/agent/agent-transcript";
import type { AgentChatSnapshot, ThreadId } from "@/lib/agent/chat-state";
import type { AgentMessage } from "@/lib/agent/messages";
import { encodeSse, type AgentStreamEvent } from "@/lib/agent/stream";
import { hideAppChrome } from "@/lib/app-chrome";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push }),
}));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
  push.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const A = "0199a3b2-0000-7000-8000-00000000000a" as ThreadId;
const B = "0199a3b2-0000-7000-8000-00000000000b" as ThreadId;

function userMessage(id: string, text: string): AgentMessage {
  return { id, role: "user", createdAt: "2026-09-27T00:00:00.000Z", parts: [{ type: "text", text }] };
}

const saved: AgentChatSnapshot = {
  threads: [
    { id: A, title: "Bench check", updatedAt: "2026-09-27T12:00:00.000Z" },
    { id: B, title: "Deload?", updatedAt: "2026-09-20T12:00:00.000Z" },
  ],
  open: { kind: "saved", threadId: A, title: "Bench check", messages: [userMessage("1", "latest")] },
};

function button(label: string) {
  return host.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
}

function click(label: string) {
  act(() => {
    button(label)?.click();
  });
}

function type(text: string) {
  const input = host.querySelector("input");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, text);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function sseResponse(events: AgentStreamEvent[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(encodeSse(event)));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("agent chrome", () => {
  it("hides with the tab bar on session and planner routes", () => {
    expect(hideAppChrome("/session/abc")).toBe(true);
    expect(hideAppChrome("/session/abc/recap")).toBe(true);
    expect(hideAppChrome("/workout/next")).toBe(true);
    expect(hideAppChrome("/program/new")).toBe(true);
    expect(hideAppChrome("/")).toBe(false);
    expect(hideAppChrome("/coach")).toBe(false);
  });

  it("renders starter prompts on an empty transcript", () => {
    act(() => {
      root.render(<AgentTranscript messages={[]} onChipSelect={() => {}} />);
    });
    expect(host.textContent).toContain("Ask Coach about your week, next workout, or a gallery program.");
    expect(host.textContent).toContain("Build me a program");
    expect(host.textContent).toContain("How was my week?");
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

  it.each([
    ["sheet", "history"],
    ["page", "history"],
    ["sheet", "done"],
    ["page", "done"],
  ] as const)("omits blank Coach labels in %s after %s", async (variant, delivery) => {
    const messages: AgentMessage[] = [
      userMessage("u1", "Why is my next hack squat target what it is?"),
      {
        id: "a1", role: "assistant", createdAt: "2026-10-12T00:00:01Z",
        parts: [
          { type: "text", text: " \n\t " },
          { type: "tool-call", id: "target-1", name: "nextWorkout", args: {} },
        ],
      },
      {
        id: "t1", role: "tool", createdAt: "2026-10-12T00:00:02Z",
        parts: [{ type: "tool-result", id: "target-1", name: "nextWorkout", result: {} }],
      },
      {
        id: "a2", role: "assistant", createdAt: "2026-10-12T00:00:03Z",
        parts: [{ type: "text", text: "\n" }, { type: "text", text: " \t" }],
      },
      {
        id: "a3", role: "assistant", createdAt: "2026-10-12T00:00:04Z",
        parts: [{ type: "text", text: "Your target is **150 lb for 6 reps at 2 RIR**.\n\nSource: nextWorkout → sessionTarget()" }],
      },
    ];
    const open: AgentChatSnapshot["open"] = {
      kind: "saved", threadId: A, title: "Hack squat target", messages: delivery === "history" ? messages : [],
    };
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => sseResponse([
      { type: "thread", thread: { id: A, title: open.title, updatedAt: messages[0].createdAt }, userMessage: messages[0] },
      { type: "done", messages },
    ])));
    act(() => { root.render(<AgentChat variant={variant} initial={{ threads: [], open }} />); });
    if (delivery === "done") {
      type("Why is my next hack squat target what it is?");
      await submit();
    }

    expect([...host.querySelectorAll(".uppercase")].map((node) => node.textContent)).toEqual(["You", "Coach"]);
    expect(host.querySelectorAll(".overflow-y-auto .mr-auto")).toHaveLength(1);
    expect(host.textContent).toContain("Checked next workout targets");
    expect(host.querySelector("strong")?.textContent).toBe("150 lb for 6 reps at 2 RIR");
    expect(host.textContent).toContain("nextWorkout → sessionTarget()");
    expect(host.querySelectorAll(".coach-dot")).toHaveLength(0);
  });

  it("opens on the latest message with the composer still on screen", () => {
    const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 900 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 200 });
    try {
      act(() => {
        root.render(<AgentChat variant="sheet" initial={saved} />);
      });
      const scroller = host.querySelector(".overflow-y-auto");
      const form = host.querySelector("form");
      expect(scroller?.scrollTop).toBe(900);
      expect(scroller?.contains(form)).toBe(false);
      expect(host.querySelector("h2")?.textContent).toBe("Coach");
      expect([...host.querySelectorAll("button[aria-label]")].map((node) => node.getAttribute("aria-label")))
        .toEqual(["Chat history", "New chat", "Send"]);
      expect(host.querySelector("a")?.textContent).toBe("Full screen");
      expect(host.querySelector("a")?.getAttribute("href")).toBe("/coach?thread=0199a3b2-0000-7000-8000-00000000000a");
      expect(host.querySelector("input")?.hasAttribute("disabled")).toBe(false);
      expect(host.querySelector("button[aria-label='Send'] path")?.getAttribute("d")).toBe("M12 19V5M6 11l6-6 6 6");
    } finally {
      if (scrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeight);
      if (clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
    }
  });

  it("starts a new chat without a request and points Full screen at a fresh draft", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    act(() => {
      root.render(<AgentChat variant="sheet" initial={saved} />);
    });
    expect(host.textContent).not.toContain("Build me a program");

    click("New chat");

    expect(host.textContent).toContain("Build me a program");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/coach?thread=new");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists saved chats in history with the open one marked", () => {
    act(() => {
      root.render(<AgentChat variant="sheet" initial={saved} />);
    });

    click("Chat history");

    expect(button("Chat history")?.getAttribute("aria-pressed")).toBe("true");
    expect([...host.querySelectorAll("li button")].map((row) => [row.textContent, row.getAttribute("aria-current")]))
      .toEqual([["Bench checkSep 27", "true"], ["Deload?Sep 20", null]]);
    expect(host.querySelector("form")).toBeNull();
  });

  it("says No earlier chats when nothing is saved yet", () => {
    act(() => {
      root.render(<AgentChat variant="sheet" initial={{ threads: [], open: { kind: "draft" } }} />);
    });

    click("Chat history");

    expect(host.querySelector(".overflow-y-auto")?.textContent).toBe("No earlier chats");
  });

  it("locks history, new chat, and Full screen while a reply streams", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    act(() => {
      root.render(<AgentChat variant="sheet" initial={saved} />);
    });

    type("and squat?");
    await submit();

    expect([button("Chat history")?.disabled, button("New chat")?.disabled]).toEqual([true, true]);
    expect(host.querySelector("a")).toBeNull();
    expect(host.querySelector("[role='link']")?.getAttribute("aria-disabled")).toBe("true");
    expect(host.textContent).toContain("and squat?");
  });


  it.each(["sheet", "page"] as const)("shows immediate activity in %s before the server responds", async (variant) => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    act(() => { root.render(<AgentChat variant={variant} initial={saved} />); });
    type("How was my week?");
    await submit();
    expect(host.querySelector("[role=status]")?.textContent).toBe("Coach is working.");
    expect(host.querySelectorAll(".coach-dot")).toHaveLength(3);
    expect([...host.querySelectorAll(".uppercase")].map((node) => node.textContent)).toEqual(["You", "You", "Coach"]);
  });


  it.each(["sheet", "page"] as const)("keeps one Coach bubble through tools and answer in %s", async (variant) => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(value) { controller = value; },
    }))));
    act(() => { root.render(<AgentChat variant={variant} initial={saved} />); });
    type("Compare lifts");
    await submit();
    const status = host.querySelector("[role=status]");
    const bubble = host.querySelector(".overflow-y-auto .mr-auto");
    async function emit(event: AgentStreamEvent) {
      await act(async () => {
        controller.enqueue(new TextEncoder().encode(encodeSse(event)));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    await emit({ type: "tool-start", callId: "a", name: "weeklyCoach" });
    await emit({ type: "tool-start", callId: "b", name: "exerciseReview" });
    expect(status?.textContent).toContain("Checking your weekly report");
    expect(status?.textContent).toContain("Reviewing your exercise history");
    await emit({ type: "tool-end", callId: "a", outcome: "complete" });
    expect(status?.textContent).toBe("Reviewing your exercise history.");
    await emit({ type: "tool-end", callId: "b", outcome: "error" });
    expect(status?.textContent).toBe("Could not review your exercise history.");
    expect(host.querySelectorAll(".coach-dot")).toHaveLength(3);
    const scroller = host.querySelector<HTMLDivElement>(".overflow-y-auto")!;
    Object.defineProperties(scroller, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
    act(() => { scroller.scrollTop = 100; scroller.dispatchEvent(new Event("scroll", { bubbles: true })); });
    await emit({ type: "text", text: "Three sessions completed." });
    expect(scroller.scrollTop).toBe(100);
    expect(host.querySelector(".overflow-y-auto .mr-auto")).toBe(bubble);
    expect(host.querySelectorAll(".overflow-y-auto .mr-auto")).toHaveLength(1);
    expect(host.querySelector("[role=status]")).toBe(status);
    expect(status?.textContent).not.toContain("Three sessions");
    expect(bubble?.textContent).toContain("Three sessions completed.");
    const answer: AgentMessage = { id: "answer", role: "assistant", createdAt: "2026-10-12T00:00:00Z", parts: [{ type: "text", text: "Three sessions completed." }] };
    await emit({ type: "done", messages: [answer] });
    await act(async () => { controller.close(); });
    expect(host.querySelectorAll(".coach-dot")).toHaveLength(0);
    expect(status?.textContent).toBe("");
    expect(host.querySelectorAll(".overflow-y-auto .mr-auto")).toHaveLength(1);
    expect(button("New chat")?.disabled).toBe(false);
  });

  it.each(["error", "drop"] as const)("clears activity after %s and allows another send", async (ending) => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(value) { controller = value; },
    }))));
    act(() => { root.render(<AgentChat variant="sheet" initial={saved} />); });
    type("How was my week?");
    await submit();
    await act(async () => {
      if (ending === "error") controller.enqueue(new TextEncoder().encode(encodeSse({ type: "error", message: "Coach unavailable." })));
      controller.close();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.querySelectorAll(".coach-dot")).toHaveLength(0);
    expect(host.querySelector("[role=status]")?.textContent).toBe("");
    expect(host.querySelector(".text-danger")?.textContent).toBe(ending === "error" ? "Coach unavailable." : "Connection lost.");
    type("Try again");
    await submit();
    expect(host.querySelectorAll(".coach-dot")).toHaveLength(3);
    await act(async () => { controller.close(); });
  });

  it("hands the text back when a send fails before the server saves it", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(null, { status: 503 })));
    act(() => {
      root.render(<AgentChat variant="sheet" initial={saved} />);
    });

    type("and squat?");
    await submit();

    expect(host.querySelector(".text-danger")?.textContent).toBe("Coach is not configured.");
    expect(host.querySelector("input")?.value).toBe("and squat?");
    expect(host.querySelector(".overflow-y-auto")?.textContent).not.toContain("and squat?");
    expect(button("New chat")?.disabled).toBe(false);
  });

  it("sends a draft with threadId null and moves the page URL to the saved thread", async () => {
    const user = userMessage("m1", "How was my week?");
    const answer: AgentMessage = {
      id: "m2",
      role: "assistant",
      createdAt: "2026-09-27T00:00:01.000Z",
      parts: [{ type: "text", text: "3/4 sessions." }],
    };
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse([
      { type: "thread", thread: { id: A, title: "How was my week?", updatedAt: user.createdAt }, userMessage: user },
      { type: "text", text: "3/4 sessions." },
      { type: "done", messages: [user, answer] },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/coach?thread=new");
    act(() => {
      root.render(<AgentChat variant="page" initial={{ threads: [], open: { kind: "draft" } }} />);
    });

    type("How was my week?");
    await submit();

    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({
      text: "How was my week?",
      threadId: null,
      context: {
        pathname: "/",
        activeProgramId: null,
        openSessionId: null,
        focusedExerciseId: null,
      },
    }));
    expect(`${window.location.pathname}${window.location.search}`).toBe("/coach?thread=0199a3b2-0000-7000-8000-00000000000a");
    expect(host.querySelector("h1")?.textContent).toBe("Coach");
    expect([...host.querySelectorAll(".uppercase")].map((node) => node.textContent)).toEqual(["You", "Coach"]);
    expect(host.querySelector(".overflow-y-auto .mr-auto")?.textContent).toContain("3/4 sessions.");
  });

  it("shows a confirm chip after startNextWorkout and navigates on openCoachCheckIn", async () => {
    const user = userMessage("m1", "Open my coach check-in");
    const answer: AgentMessage = {
      id: "m2",
      role: "assistant",
      createdAt: "2026-09-27T00:00:01.000Z",
      parts: [
        { type: "tool-call", id: "nav-1", name: "openCoachCheckIn", args: {} },
        { type: "text", text: "Opening Coach check-in." },
      ],
    };
    const tool: AgentMessage = {
      id: "m3",
      role: "tool",
      createdAt: "2026-09-27T00:00:02.000Z",
      parts: [{
        type: "tool-result",
        id: "nav-1",
        name: "openCoachCheckIn",
        result: { action: "navigate", href: "/coach?review=1" },
      }],
    };
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse([
      { type: "thread", thread: { id: A, title: "Open my coach check-in", updatedAt: user.createdAt }, userMessage: user },
      { type: "done", messages: [user, answer, tool] },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    act(() => {
      root.render(<AgentChat variant="sheet" initial={saved} />);
    });

    type("Open my coach check-in");
    await submit();

    expect(push).toHaveBeenCalledWith("/coach?review=1");
  });

  it("renders a Start workout confirm chip for startNextWorkout tool calls", () => {
    act(() => {
      root.render(
        <AgentTranscript
          messages={[
            {
              id: "a1",
              role: "assistant",
              createdAt: "2026-09-27T00:00:00.000Z",
              parts: [
                { type: "tool-call", id: "start-1", name: "startNextWorkout", args: {} },
                { type: "text", text: "Tap Start workout when you are ready." },
              ],
            },
            {
              id: "t1",
              role: "tool",
              createdAt: "2026-09-27T00:00:01.000Z",
              parts: [{
                type: "tool-result",
                id: "start-1",
                name: "startNextWorkout",
                result: { action: "confirm" },
              }],
            },
          ]}
        />,
      );
    });

    expect(host.querySelector("button")?.textContent).toBe("Start workout");
  });
});
