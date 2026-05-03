import { test, expect } from "@playwright/test";

test.describe("FX Trading", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-fx").click();
  });

  test("execute a buy trade and see confirmation", async ({ page }) => {
    const tile = page.locator("[data-testid^='tile-']").first();
    await expect(tile).toBeVisible({ timeout: 5000 });

    // Click Buy
    await tile.getByTestId("buy-btn").click();

    // Confirmation overlay should appear
    const confirmation = tile.getByTestId("trade-confirmation");
    await expect(confirmation).toBeVisible({ timeout: 5000 });

    // Should show "Executing..." or final result
    await expect(confirmation).toContainText(
      /Executing|You Bought|rejected/i,
    );
  });

  test("execute a sell trade and see confirmation", async ({ page }) => {
    const tile = page.locator("[data-testid^='tile-']").first();
    await expect(tile).toBeVisible({ timeout: 5000 });

    // Click Sell
    await tile.getByTestId("sell-btn").click();

    // Confirmation overlay should appear
    const confirmation = tile.getByTestId("trade-confirmation");
    await expect(confirmation).toBeVisible({ timeout: 5000 });

    await expect(confirmation).toContainText(
      /Executing|You Sold|rejected/i,
    );
  });

  test("trade confirmation is dismissible by clicking", async ({ page }) => {
    const tile = page.locator("[data-testid^='tile-']").first();
    await expect(tile).toBeVisible({ timeout: 5000 });

    await tile.getByTestId("buy-btn").click();

    const confirmation = tile.getByTestId("trade-confirmation");
    await expect(confirmation).toBeVisible({ timeout: 5000 });

    // Wait for the execution to complete (moves past "started" state)
    await expect(confirmation).toContainText(
      /You Bought|You Sold|rejected|timed out|Credit limit/i,
      { timeout: 10000 },
    );

    // Click to dismiss
    await confirmation.click();
    await expect(confirmation).toBeHidden({ timeout: 5000 });
  });

  test("executed trade appears in the blotter", async ({ page }) => {
    const tile = page.locator("[data-testid^='tile-']").first();
    await expect(tile).toBeVisible({ timeout: 5000 });

    // Execute a trade
    await tile.getByTestId("buy-btn").click();

    // Wait for trade to process
    await page.waitForTimeout(2000);

    // Blotter should show at least one trade
    const blotter = page.getByTestId("blotter-table");
    await expect(blotter).toBeVisible();

    const rows = blotter.locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test("notional input accepts custom values", async ({ page }) => {
    const tile = page.locator("[data-testid^='tile-']").first();
    await expect(tile).toBeVisible({ timeout: 5000 });

    // Find the notional input in the tile
    const input = tile.locator("input");
    await expect(input).toBeVisible();

    // Clear and type a new value
    await input.click();
    await input.fill("5000000");
    await input.press("Enter");
  });
});
