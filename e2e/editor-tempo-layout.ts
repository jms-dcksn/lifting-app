import { expect, type Page } from "@playwright/test";

// Phone editor: tempo is the first row of the set grid. Its outer cells share
// the weight and RIR column edges, and the row stays within one set-row height.
const EDGE_TOLERANCE_PX = 2;
const ROW_HEIGHT_TOLERANCE_PX = 4;

export type TempoLayout = {
  tempoCount: number;
  leftDelta: number | null;
  rightDelta: number | null;
  columnLeftDelta: number | null;
  columnRightDelta: number | null;
  tempoRowHeight: number | null;
  setRowHeight: number | null;
  legacyTempoHeight: number | null;
  fontSize: number | null;
  cellHeight: number | null;
  changeButtonHeight: number | null;
  scrollOverflow: number;
};

export async function measureTempoLayout(page: Page): Promise<TempoLayout> {
  return page.evaluate(() => {
    const card = document.querySelector('[aria-label="Exercise 1"]');
    const empty = {
      tempoCount: 0, leftDelta: null, rightDelta: null, columnLeftDelta: null, columnRightDelta: null,
      tempoRowHeight: null, setRowHeight: null, legacyTempoHeight: null, fontSize: null, cellHeight: null,
      changeButtonHeight: null, scrollOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
    if (!(card instanceof HTMLElement)) return empty;
    const tempoEls = [...card.querySelectorAll("[data-tempo-cell]")].flatMap((el) => el instanceof HTMLElement ? [el] : []);
    const tempo = tempoEls.map((el) => el.getBoundingClientRect());
    const setRow = card.querySelector("[data-set-row]") ?? card.querySelector("tbody tr");
    const tempoRow = card.querySelector("[data-tempo-row]");
    const legacy = [...card.querySelectorAll("fieldset")].find((el) => (el.textContent ?? "").includes("Tempo"));
    const weight = card.querySelector('[data-field="slots.0.sets.0.weight"]');
    const weightColumn = weight?.closest("[data-set-column]");
    const rir = card.querySelector('[aria-label="Edit RIR for set 1 of exercise 1"]');
    const rirColumn = rir?.closest("[data-set-column]");
    const tempoTrack = card.querySelector("[data-tempo-cells]");
    const change = [...card.querySelectorAll("button")].find((el) => el.textContent === "Change exercise");
    const first = tempo[0];
    const last = tempo.at(-1);
    const weightBox = weight instanceof HTMLElement ? weight.getBoundingClientRect() : null;
    const rirBox = rir instanceof HTMLElement ? rir.getBoundingClientRect() : null;
    const weightColumnBox = weightColumn instanceof HTMLElement ? weightColumn.getBoundingClientRect() : null;
    const rirColumnBox = rirColumn instanceof HTMLElement ? rirColumn.getBoundingClientRect() : null;
    const trackBox = tempoTrack instanceof HTMLElement ? tempoTrack.getBoundingClientRect() : null;
    return {
      tempoCount: tempo.length,
      leftDelta: first && weightBox ? Math.abs(first.left - weightBox.left) : null,
      rightDelta: last && rirBox ? Math.abs(last.right - rirBox.right) : null,
      columnLeftDelta: trackBox && weightColumnBox ? Math.abs(trackBox.left - weightColumnBox.left) : null,
      columnRightDelta: trackBox && rirColumnBox ? Math.abs(trackBox.right - rirColumnBox.right) : null,
      tempoRowHeight: tempoRow instanceof HTMLElement ? tempoRow.getBoundingClientRect().height : null,
      setRowHeight: setRow instanceof HTMLElement ? setRow.getBoundingClientRect().height : null,
      legacyTempoHeight: legacy instanceof HTMLElement ? legacy.getBoundingClientRect().height : null,
      fontSize: tempoEls[0] ? Number.parseFloat(getComputedStyle(tempoEls[0]).fontSize) : null,
      cellHeight: first ? first.height : null,
      changeButtonHeight: change instanceof HTMLElement ? change.getBoundingClientRect().height : null,
      scrollOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

export function assertTempoLayout(measured: TempoLayout) {
  expect(measured.tempoCount, "tempo row should expose four phase cells").toBe(4);
  expect(measured.leftDelta, "first tempo cell should share the weight cell's left edge").toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
  expect(measured.rightDelta, "last tempo cell should share the RIR cell's right edge").toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
  expect(measured.columnLeftDelta, "tempo track should share the weight column's left edge").toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
  expect(measured.columnRightDelta, "tempo track should share the RIR column's right edge").toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
  expect(measured.tempoRowHeight, "tempo row height").not.toBeNull();
  expect(measured.setRowHeight, "set row height").not.toBeNull();
  expect(measured.tempoRowHeight!).toBeLessThanOrEqual(measured.setRowHeight! + ROW_HEIGHT_TOLERANCE_PX);
  expect(measured.fontSize!).toBeGreaterThanOrEqual(16);
  expect(measured.cellHeight!).toBeGreaterThanOrEqual(44);
  expect(measured.changeButtonHeight!).toBeGreaterThanOrEqual(44);
  expect(measured.changeButtonHeight!).toBeLessThanOrEqual(48);
  expect(measured.scrollOverflow).toBeLessThanOrEqual(0);
}
