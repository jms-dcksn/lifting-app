import { expect, test } from "@playwright/test";
import { assertBoardTileLayout, measureBoardTiles } from "./board-tile-layout";

for (const width of [390, 320]) {
  test(`track board tiles align the e1RM at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/board-tile-fixture");
    await expect(page.getByRole("heading", { name: "Track" })).toBeVisible();
    await expect(page.getByText("Machine").first()).toBeVisible();
    await expect(page.getByText("Barbell")).toBeVisible();
    await expect(page.getByText("▲ 5")).toBeVisible();
    await expect(page.getByText("▼ 12")).toBeVisible();
    assertBoardTileLayout(await measureBoardTiles(page));
  });
}
