import { expect, type Page } from "@playwright/test";

// Fixed-slot tiles: the e1RM in one row shares a top edge even when the name
// wraps or the sparkline is only a baseline, and the tile does not grow sideways.
const E1RM_TOP_TOLERANCE_PX = 1;

export type BoardTileLayout = {
  rowDeltas: number[];
  overflows: number[];
  names: string[];
  charts: string[];
};

export async function measureBoardTiles(page: Page): Promise<BoardTileLayout> {
  return page.evaluate(() => {
    const tiles = [...document.querySelectorAll("[data-board-tile]")].flatMap((node) =>
      node instanceof HTMLElement ? [node] : [],
    );
    const items = tiles.map((tile) => {
      const e1rm = tile.querySelector("[data-board-e1rm]");
      const name = tile.querySelector("p");
      const chart = tile.querySelector("[data-board-sparkline]");
      return {
        top: tile.getBoundingClientRect().top,
        e1rmTop: e1rm instanceof HTMLElement ? e1rm.getBoundingClientRect().top : null,
        overflow: tile.scrollWidth - tile.clientWidth,
        name: name?.textContent ?? "",
        chart: chart?.getAttribute("data-board-sparkline") ?? "",
      };
    });
    const rows: { top: number; e1rmTops: number[] }[] = [];
    for (const item of [...items].sort((a, b) => a.top - b.top)) {
      if (item.e1rmTop == null) continue;
      const row = rows.at(-1);
      if (!row || Math.abs(item.top - row.top) > 8) rows.push({ top: item.top, e1rmTops: [item.e1rmTop] });
      else row.e1rmTops.push(item.e1rmTop);
    }
    return {
      rowDeltas: rows.map((row) => Math.max(...row.e1rmTops) - Math.min(...row.e1rmTops)),
      overflows: items.map((item) => item.overflow),
      names: items.map((item) => item.name),
      charts: items.map((item) => item.chart),
    };
  });
}

export function assertBoardTileLayout(measured: BoardTileLayout) {
  expect(measured.names.some((name) => name.length > 28), "a long name is in the mix").toBe(true);
  expect(measured.names.some((name) => name.length < 16), "a short name is in the mix").toBe(true);
  expect(measured.charts, "sparkline and empty baseline are both present").toEqual(
    expect.arrayContaining(["series", "empty"]),
  );
  expect(measured.rowDeltas.length, "at least one measured row").toBeGreaterThan(0);
  for (const delta of measured.rowDeltas) {
    expect(delta, "e1RM tops in a row").toBeLessThanOrEqual(E1RM_TOP_TOLERANCE_PX);
  }
  for (const overflow of measured.overflows) {
    expect(overflow, "tile scrollWidth exceeds clientWidth").toBeLessThanOrEqual(0);
  }
}
