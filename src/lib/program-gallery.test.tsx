// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramSummary } from "./program-summary";
import type { TemplateSummary } from "@/app/(app)/program/program-gallery";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...props
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}));

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
}));

vi.mock("@/app/(app)/program/actions", () => ({
  createFromTemplate: vi.fn(),
  deleteProgram: vi.fn(),
}));

import { deleteProgram } from "@/app/(app)/program/actions";
import { ProgramGallery } from "@/app/(app)/program/program-gallery";

const programs: ProgramSummary[] = [
  {
    id: "ppl",
    name: "Home PPL",
    tags: ["ppl"],
    weeks: 5,
    isActive: true,
    style: "classic",
    dayCount: 3,
    exerciseCount: 12,
  },
  {
    id: "upper",
    name: "Upper strength",
    tags: ["strength"],
    weeks: 6,
    isActive: false,
    style: "fluid",
    dayCount: 4,
    exerciseCount: 8,
  },
];

const templates: TemplateSummary[] = [
  { id: "sf", name: "Strong Foundations", dayCount: 4, tags: ["full-body"] },
];

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
  nav.replace.mockReset();
  vi.mocked(deleteProgram).mockReset();
  vi.mocked(deleteProgram).mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.useRealTimers();
});

function render(props?: { programs?: ProgramSummary[]; templates?: TemplateSummary[] }) {
  act(() => {
    root.render(
      <ProgramGallery
        programs={props?.programs ?? programs}
        templates={props?.templates ?? templates}
      />,
    );
  });
}

function click(label: string) {
  const button = [...host.querySelectorAll("button")].find((el) => el.textContent === label);
  if (!button) throw new Error(`missing button ${label}`);
  act(() => {
    button.click();
  });
}

function clickAria(label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`missing button ${label}`);
  act(() => {
    button.click();
  });
}

function programNames() {
  return [...host.querySelectorAll('a[href^="/program/"]')]
    .map((anchor) => anchor.getAttribute("href"))
    .filter((href) => href && href !== "/program/new");
}

describe("ProgramGallery", () => {
  it("promotes New program and keeps templates below owned tiles", () => {
    render();

    expect(host.querySelector("h1")?.textContent).toBe("Programs");
    const create = [...host.querySelectorAll("a")].find((anchor) => anchor.textContent === "New program");
    expect(create?.getAttribute("href")).toBe("/program/new");
    expect(host.textContent).not.toContain("+ New");

    const headings = [...host.querySelectorAll("h2")].map((el) => el.textContent);
    expect(headings).toEqual(["My programs", "Templates"]);
    expect(host.textContent).toContain("Start from a built-in split");

    const lists = host.querySelectorAll("ul");
    expect(lists[0]?.textContent).toContain("Home PPL");
    expect(lists[0]?.textContent).toContain("Upper strength");
    expect(lists[0]?.textContent).not.toContain("Strong Foundations");
    expect(lists[1]?.textContent).toContain("Strong Foundations");
    expect(lists[1]?.textContent).toContain("Add");
  });

  it("hides tag chips until Filter opens, then filters and clears", () => {
    vi.useFakeTimers();
    render();

    expect(host.querySelector("dialog")).toBeNull();
    expect(host.textContent).not.toContain("Filtered ·");
    expect([...host.querySelectorAll("button")].some((el) => el.textContent === "All")).toBe(false);

    click("Filter");
    const dialog = host.querySelector("dialog");
    expect(dialog?.getAttribute("aria-label")).toBe("Filter programs");
    expect([...dialog!.querySelectorAll("button")].map((el) => el.textContent)).toEqual(
      expect.arrayContaining(["All", "ppl", "strength", "Done"]),
    );

    click("ppl");
    expect(programNames()).toEqual(["/program/ppl"]);
    expect(host.textContent).toContain("Filtered · ppl");
    expect(host.textContent).toContain("Strong Foundations");

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(host.querySelector("dialog")).toBeNull();

    click("Clear");
    expect(programNames()).toEqual(["/program/ppl", "/program/upper"]);
    expect(host.textContent).not.toContain("Filtered ·");
  });

  it("omits Filter when no owned program has tags", () => {
    render({
      programs: [{ ...programs[0], tags: [] }, { ...programs[1], tags: [] }],
    });

    expect([...host.querySelectorAll("button")].some((el) => el.textContent === "Filter")).toBe(
      false,
    );
    expect(host.querySelector("h2")?.textContent).toBe("My programs");
  });

  it("confirms Remove on a My programs tile before deleting", async () => {
    vi.useFakeTimers();
    render();

    clickAria("Remove Home PPL");
    const dialog = host.querySelector("dialog");
    expect(dialog?.getAttribute("aria-label")).toBe("Remove program");
    expect(dialog?.textContent).toContain("Remove Home PPL?");
    expect(dialog?.textContent).toContain("Logged workouts stay.");
    expect(deleteProgram).not.toHaveBeenCalled();
    expect(programNames()).toEqual(["/program/ppl", "/program/upper"]);

    click("Cancel");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(host.querySelector("dialog")).toBeNull();
    expect(deleteProgram).not.toHaveBeenCalled();

    clickAria("Remove Home PPL");
    await act(async () => {
      const confirm = [...host.querySelectorAll("button")].find((el) => el.textContent === "Remove");
      if (!confirm) throw new Error("missing button Remove");
      confirm.click();
    });
    expect(deleteProgram).toHaveBeenCalledWith("ppl");
    expect(nav.replace).toHaveBeenCalledWith("/program");
  });
});
