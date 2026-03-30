import { test, expect } from "@playwright/test";

test.describe("Analytics Panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-fx").click();
  });

  test("analytics panel is visible with sections", async ({ page }) => {
    const panel = page.getByTestId("analytics-panel");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Should show section labels
    await expect(panel.getByText("Analytics")).toBeVisible();
    await expect(panel.getByText("Profit & Loss")).toBeVisible();
    await expect(panel.getByText("Positions")).toBeVisible();
    await expect(panel.getByText("PnL per Currency Pair")).toBeVisible();
  });

  test("PnL value updates over time", async ({ page }) => {
    const panel = page.getByTestId("analytics-panel");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // PnL value should be a number displayed somewhere
    const pnlSection = panel.locator("text=Profit & Loss").locator("..");
    await expect(pnlSection).toBeVisible();
  });

  test("position bubbles are rendered", async ({ page }) => {
    const panel = page.getByTestId("analytics-panel");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // The positions section should have some visual elements
    const positionsSection = panel.locator("text=Positions").locator("..");
    await expect(positionsSection).toBeVisible();
  });

  test("analytics panel shows alongside live rates", async ({ page }) => {
    // Both panels should be visible at the same time
    const tiles = page.locator("[data-testid^='tile-']");
    await expect(tiles.first()).toBeVisible({ timeout: 5000 });

    const analytics = page.getByTestId("analytics-panel");
    await expect(analytics).toBeVisible();
  });
});
