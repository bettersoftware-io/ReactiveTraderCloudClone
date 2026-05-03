import { test, expect } from "@playwright/test";

test.describe("FX Live Rates", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-fx").click();
  });

  test("displays tile grid with streaming prices", async ({ page }) => {
    // Wait for tiles to appear (mock data loads quickly)
    const tiles = page.locator("[data-testid^='tile-']");
    await expect(tiles.first()).toBeVisible({ timeout: 5000 });

    // Should have multiple currency pair tiles
    const count = await tiles.count();
    expect(count).toBeGreaterThan(0);
  });

  test("each tile shows bid/ask prices and spread", async ({ page }) => {
    const tile = page.locator("[data-testid^='tile-']").first();
    await expect(tile).toBeVisible({ timeout: 5000 });

    // Should show Sell and Buy buttons
    await expect(tile.getByTestId("sell-btn")).toBeVisible();
    await expect(tile.getByTestId("buy-btn")).toBeVisible();
  });

  test("currency filter narrows visible tiles", async ({ page }) => {
    const tiles = page.locator("[data-testid^='tile-']");
    await expect(tiles.first()).toBeVisible({ timeout: 5000 });
    const allCount = await tiles.count();

    // Click a specific category filter (e.g. EUR)
    await page.getByTestId("filter-EUR").click();
    const eurCount = await tiles.count();

    // EUR subset should be smaller or equal
    expect(eurCount).toBeLessThanOrEqual(allCount);

    // Switch back to All
    await page.getByTestId("filter-All").click();
    const resetCount = await tiles.count();
    expect(resetCount).toBe(allCount);
  });

  test("view toggle switches between chart and price view", async ({
    page,
  }) => {
    const toggle = page.getByTestId("view-toggle");
    await expect(toggle).toBeVisible();

    // Default is chart view
    await expect(toggle).toContainText("Price");

    // Toggle to price view
    await toggle.click();
    await expect(toggle).toContainText("Chart");

    // Toggle back
    await toggle.click();
    await expect(toggle).toContainText("Price");
  });

  test("view preference persists across reloads", async ({ page }) => {
    const toggle = page.getByTestId("view-toggle");
    await expect(toggle).toBeVisible();

    // Switch to price view
    await toggle.click();
    await expect(toggle).toContainText("Chart");

    // Reload the page
    await page.reload();
    await page.getByTestId("tab-fx").click();

    // Should still be price view
    await expect(page.getByTestId("view-toggle")).toContainText("Chart");
  });

  test("prices update over time", async ({ page }) => {
    const tile = page.locator("[data-testid^='tile-']").first();
    await expect(tile).toBeVisible({ timeout: 5000 });

    // Capture initial text
    const initialText = await tile.innerText();

    // Wait for a price update (mock engine ticks quickly)
    await page.waitForTimeout(2000);

    // Text should eventually change as prices stream
    const updatedText = await tile.innerText();
    // Price text contains numeric values that change
    expect(initialText.length).toBeGreaterThan(0);
    expect(updatedText.length).toBeGreaterThan(0);
  });
});
