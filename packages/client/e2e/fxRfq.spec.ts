import { test, expect } from "@playwright/test";

test.describe("FX RFQ Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-fx").click();
  });

  test("entering large notional triggers RFQ mode on tile", async ({
    page,
  }) => {
    const tile = page.locator("[data-testid^='tile-']").first();
    await expect(tile).toBeVisible({ timeout: 5000 });

    // Enter a very large notional to trigger RFQ
    const input = tile.locator("input");
    await input.click();
    await input.fill("10000000");
    await input.press("Enter");

    // After entering a large notional, the tile should switch from
    // Buy/Sell buttons to an RFQ initiation button
    // Look for "Initiate RFQ" or "Request Quote" text
    await expect(
      tile.getByText(/initiate rfq|request quote/i),
    ).toBeVisible({ timeout: 3000 });
  });

  test("RFQ can be initiated and shows countdown", async ({ page }) => {
    const tile = page.locator("[data-testid^='tile-']").first();
    await expect(tile).toBeVisible({ timeout: 5000 });

    // Set large notional for RFQ
    const input = tile.locator("input");
    await input.click();
    await input.fill("10000000");
    await input.press("Enter");

    // Click to initiate RFQ
    const rfqButton = tile.getByText(/initiate rfq|request quote/i);
    await expect(rfqButton).toBeVisible({ timeout: 3000 });
    await rfqButton.click();

    // Should show a countdown or quote state
    await expect(
      tile.getByText(/\d+s|accepting|expired|quote/i),
    ).toBeVisible({ timeout: 5000 });
  });
});
