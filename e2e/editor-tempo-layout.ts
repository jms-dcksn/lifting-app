import { expect, type Page } from "@playwright/test";

// Tempo belongs to the exercise; the set header must lead straight into sets.
export async function measureTempoLayout(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector('[aria-label="Exercise 1"]');
    const tempo = card?.querySelector("fieldset");
    const cells = [...(tempo?.querySelectorAll("[data-tempo-cell]") ?? [])];
    const table = card?.querySelector('[role="table"]');
    const firstRow = table?.querySelector('[role="row"] + [role="row"]');
    const change = [...(card?.querySelectorAll("button") ?? [])].find(el => el.textContent === "Change exercise");
    return {
      tempoCount: cells.length,
      separate: !!tempo && !tempo.closest('[role="table"], table'),
      labeled: tempo?.querySelector("legend")?.textContent?.includes("Tempo") ?? false,
      setsFollowHeader: firstRow?.hasAttribute("data-set-row") ?? false,
      cellHeights: cells.map(el => el.getBoundingClientRect().height),
      fontSizes: cells.map(el => Number.parseFloat(getComputedStyle(el).fontSize)),
      changeButtonHeight: change?.getBoundingClientRect().height ?? 0,
      scrollOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

export function assertTempoLayout(measured: Awaited<ReturnType<typeof measureTempoLayout>>) {
  expect(measured.tempoCount).toBe(4);
  expect(measured.separate).toBe(true);
  expect(measured.labeled).toBe(true);
  expect(measured.setsFollowHeader).toBe(true);
  for (const height of measured.cellHeights) expect(height).toBeGreaterThanOrEqual(44);
  for (const size of measured.fontSizes) expect(size).toBeGreaterThanOrEqual(16);
  expect(measured.changeButtonHeight).toBeGreaterThanOrEqual(44);
  expect(measured.scrollOverflow).toBeLessThanOrEqual(0);
}
