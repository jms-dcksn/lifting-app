// @vitest-environment jsdom

import { act, StrictMode, type ReactNode } from "react";
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
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  push.mockReset();
  sessionStorage.clear();
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
  const input = host.querySelector("textarea");
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
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

describe("durable Coach controls", () => {
  const surfaces = ["sheet", "page"] as const;

  it.each(surfaces)("resumes in %s without duplicating input or replaying navigation", async variant => {
    if (saved.open.kind !== "saved") throw Error("Saved fixture required");
    const conversation = saved.open;
    const requestId = "40000000-0000-4000-8000-000000000001";
    const runtime = { requestId, status: "interrupted" as const, readOnly: false };
    const answer: AgentMessage = { id: "recovered", role: "tool", createdAt: "2026-11-08T00:00:00Z",
      parts: [{ type: "tool-result", id: "nav", name: "openProgram", result: { action: "navigate", href: "/program/existing" } }] };
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse([
      { type: "thread", thread: saved.threads[0], userMessage: conversation.messages[0] },
      { type: "runtime", status: { ...runtime, status: "running" } },
      { type: "done", messages: [answer], replayed: true },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { root.render(<AgentChat variant={variant} initial={{ ...saved, open: { ...conversation, runtime } }} />); });
    expect(button("Send")?.disabled).toBe(true);
    const resume = [...host.querySelectorAll("button")].find(button => button.textContent === "Resume response");
    await act(async () => {
      resume?.click();
      for (let tick = 0; tick < 5; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ resume: true, requestId, threadId: A });
    expect(push).not.toHaveBeenCalled();
    expect(host.querySelectorAll(".uppercase")).toHaveLength(1);
    expect([...host.querySelectorAll("button")].some(button => button.textContent === "Resume response")).toBe(false);
    expect(host.querySelector("textarea")?.disabled).toBe(false);
  });

  it.each(surfaces)("offers recovery after a %s disconnect", async variant => {
    if (saved.open.kind !== "saved") throw Error("Saved fixture required");
    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      streamController = controller;
      for (const event of [
        { type: "thread", thread: saved.threads[0], userMessage: userMessage("live-input", "Inspect") },
        { type: "runtime", status: { requestId: "request", status: "running", readOnly: false } },
        { type: "text", text: "Live response fragment" },
      ] satisfies AgentStreamEvent[]) controller.enqueue(encoder.encode(encodeSse(event)));
    } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { headers: { "Content-Type": "text/event-stream" } })));
    await act(async () => { root.render(<AgentChat variant={variant} initial={saved} />); });
    type("Inspect");
    await submit();
    expect(host.textContent).toContain("Live response fragment");
    expect(host.textContent).not.toContain("Refresh response");
    expect(host.textContent).not.toContain("Refresh to check its progress");
    expect(host.textContent).not.toContain("Resume response");
    await act(async () => { streamController.close(); });
    const refresh = [...host.querySelectorAll("button")].find(button => button.textContent === "Refresh response");
    expect(refresh).toBeDefined();
    expect(refresh?.disabled).toBe(false);
  });

  it("refreshes a running response without generation", async () => {
    if (saved.open.kind !== "saved") throw Error("Saved fixture required");
    const initial = { ...saved, open: { ...saved.open, runtime: { requestId: "request", status: "running" as const, readOnly: false } } };
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(initial));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { root.render(<AgentChat variant="sheet" initial={initial} />); });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { [...host.querySelectorAll("button")].find(button => button.textContent === "Refresh response")?.click(); });
    expect(fetchMock).toHaveBeenCalledWith(`/api/agent/chat?thread=${A}`, { signal: expect.any(AbortSignal) });
    expect([...host.querySelectorAll("button")].some(button => button.textContent === "Resume response")).toBe(false);
  });

  it("keeps read-only history visible and blocks submits in assistant-ui", async () => {
    if (saved.open.kind !== "saved") throw Error("Saved fixture required");
    const initial = { ...saved, open: { ...saved.open, runtime: { requestId: "", status: "interrupted" as const, readOnly: true } } };
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { root.render(<AgentChat variant="page" initial={initial} initialReview={null} />); });
    expect(host.querySelector('[data-message-id="1"]')?.textContent).toBe("Youlatest");
    expect(host.textContent).toContain("This conversation is temporarily read-only.");
    expect(host.textContent).not.toContain("Resume response");
    expect(host.querySelector("textarea")?.disabled).toBe(true);
    await submit();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores an old refresh that returns after a successful resume", async () => {
    if (saved.open.kind !== "saved") throw Error("Saved fixture required");
    const open = saved.open;
    const runtime = { requestId: "40000000-0000-4000-8000-000000000001", status: "interrupted" as const, readOnly: false };
    const interrupted = { ...saved, open: { ...open, runtime } };
    let completeRefresh!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method !== "POST") return new Promise(resolve => { completeRefresh = resolve; });
      return sseResponse([
        { type: "thread", thread: saved.threads[0], userMessage: open.messages[0] },
        { type: "runtime", status: { ...runtime, status: "running" } },
        { type: "done", messages: [{ ...userMessage("resumed", "Recovered reply"), role: "assistant" }], replayed: true },
      ]);
    });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<AgentChat initial={interrupted} initialReview={null} variant="page" />));
    const recoveryButton = (label: string) => [...host.querySelectorAll("button")].find(node => node.textContent === label);
    act(() => { recoveryButton("Refresh response")?.click(); });
    await act(async () => {
      recoveryButton("Resume response")?.click();
      for (let tick = 0; tick < 5; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => { completeRefresh(Response.json(interrupted)); });
    expect(host.textContent).toContain("Recovered reply");
    expect(recoveryButton("Resume response")).toBeUndefined();
    expect(host.querySelector("textarea")?.disabled).toBe(false);
  });

  it.each(["sheet", "page"] as const)("projects saved, optimistic and streamed rows in the assistant-ui %s", async variant => {
    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } });
    const emit = (event: AgentStreamEvent) => streamController.enqueue(encoder.encode(encodeSse(event)));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream)));
    const rows = () => [...host.querySelectorAll("[data-message-id]")].map(row => row.textContent);
    await act(async () => { root.render(<AgentChat variant={variant} initial={saved} initialReview={null} />); });
    expect(rows()).toEqual(["Youlatest"]);

    type("Inspect");
    await submit();
    expect(rows()).toEqual(["Youlatest", "YouInspect", "Coach"]);
    await act(async () => {
      emit({ type: "thread", thread: saved.threads[0], userMessage: userMessage("saved-input", "Inspect") });
      emit({ type: "runtime", status: { requestId: "request", status: "running", readOnly: false } });
      emit({ type: "tool-start", callId: "target", name: "nextWorkout" });
      emit({ type: "text", text: "Try **8 reps**." });
    });
    expect(rows()).toHaveLength(3);
    expect(rows()[1]).toBe("YouInspect");
    expect(rows()[2]).toContain("8 reps");
    expect(rows()[2]).toContain("Checking your next workout");
    expect(host.querySelector("strong")?.textContent).toBe("8 reps");
    expect(host.textContent).not.toContain("Refresh response");

    await act(async () => {
      emit({ type: "tool-end", callId: "target", outcome: "complete" });
      emit({ type: "done", messages: [
        { ...userMessage("private-result", ""), role: "tool",
          parts: [{ type: "tool-result", id: "target", name: "nextWorkout", result: { private: "unrendered payload" } }] },
        { ...userMessage("saved-reply", "Try **8 reps**."), role: "assistant" },
      ] });
      streamController.close();
    });
    expect(rows()).toEqual(["Youlatest", "YouInspect", "CoachTry 8 reps."]);
    expect(host.textContent).not.toContain("unrendered payload");
  });
});

describe("agent chrome", () => {
  it("keeps a multiline draft and sends it once even when submit fires twice", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<AgentChat initial={{ threads: [], open: { kind: "draft" } }} variant="page" />));
    const composer = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]');
    expect(composer).not.toBeNull();
    type("How was my week?\nFocus on bench.");
    await act(async () => {
      const form = composer?.form;
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      for (let tick = 0; tick < 5; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).text).toBe("How was my week?\nFocus on bench.");
    expect(composer?.value).toBe("How was my week?\nFocus on bench.");
  });

  it("reuses the send request when retrying a lost acknowledgement", async () => {
    const input = userMessage("retry-input", "Lost acknowledgement");
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(sseResponse([
        { type: "thread", thread: saved.threads[0], userMessage: input },
        { type: "done", messages: [input, { ...userMessage("retry-reply", "One saved reply"), role: "assistant" }], replayed: true },
      ]));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<AgentChat initial={saved} initialReview={null} variant="sheet" />));
    type("Lost acknowledgement");
    await submit();
    expect(host.querySelector("textarea")?.value).toBe("Lost acknowledgement");
    await submit();
    const requests = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    expect(host.querySelectorAll('[data-message-id="retry-input"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-message-id="retry-reply"]')).toHaveLength(1);
  });
  it("starts an explicitly requested episode discussion once, then reopens without another model call", async () => {
    const seed = userMessage("seed", "Opened a Coach exception review (evidence revision 1). Use the current authorized review context; this message does not confirm a training change.");
    const snapshot: AgentChatSnapshot = { threads: saved.threads, open: { kind: "saved", threadId: A, title: "Plateau", messages: [seed] } };
    const fetcher = vi.fn().mockResolvedValue(sseResponse([
      { type: "thread", thread: saved.threads[0], userMessage: seed },
      { type: "done", messages: [seed, { id: "answer", role: "assistant", createdAt: seed.createdAt, parts: [{ type: "text", text: "Here is why I recommend 12–15 reps." }] }] },
    ]));
    vi.stubGlobal("fetch", fetcher);
    window.history.replaceState(null, "", `/coach?thread=${A}&discuss=1`);
    await act(async () => root.render(<StrictMode><AgentChat initial={snapshot} variant="page" discuss /></StrictMode>));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ discuss: true, threadId: A });
    expect(window.location.search).not.toContain("discuss");
    expect(host.textContent).toContain("Here is why I recommend 12–15 reps.");
    expect(host.textContent).not.toContain("Opened a Coach exception review");
    await act(async () => root.render(<StrictMode><AgentChat initial={snapshot} variant="page" discuss /></StrictMode>));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not invoke the agent when an episode conversation is opened normally", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<AgentChat initial={saved} variant="page" />));
    expect(fetcher).not.toHaveBeenCalled();
  });
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
        <AgentChat variant="page" initialReview={null}
          initial={{ threads: [], open: { kind: "saved", threadId: A, title: "Week", messages: [
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
          ] } }}
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

  it("keeps the composer outside the scrollable transcript", () => {
    act(() => { root.render(<AgentChat variant="sheet" initial={saved} initialReview={null} />); });
    const scroller = host.querySelector('[aria-label="Chat messages"]');
    const form = host.querySelector("form");
    expect(scroller?.contains(form)).toBe(false);
    expect(host.querySelector("h2")?.textContent).toBe("Coach");
    expect(button("Chat history")).toBeTruthy();
    expect(button("New chat")).toBeTruthy();
    expect(button("Copy your message")).toBeTruthy();
    expect(button("Jump to latest")?.disabled).toBe(true);
    expect(host.querySelector("a")?.getAttribute("href")).toBe(`/coach?thread=${A}`);
    expect(host.querySelector("textarea")?.disabled).toBe(false);
    expect(button("Send")?.disabled).toBe(true);
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

    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Coach is temporarily unavailable. Try again.");
    expect(host.querySelector("textarea")?.value).toBe("and squat?");
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

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      text: "How was my week?",
      threadId: null,
      context: {
        pathname: "/",
        activeProgramId: null,
        openSessionId: null,
        focusedExerciseId: null,
      },
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
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
