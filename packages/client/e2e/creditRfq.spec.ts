import { test, expect } from "@playwright/test";

test.describe("Credit RFQ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-credit").click();
  });

  test("credit workspace shows navigation tabs", async ({ page }) => {
    const nav = page.getByTestId("credit-nav");
    await expect(nav).toBeVisible();

    await expect(page.getByTestId("credit-tab-tiles")).toBeVisible();
    await expect(page.getByTestId("credit-tab-new-rfq")).toBeVisible();
    await expect(page.getByTestId("credit-tab-sell-side")).toBeVisible();
  });

  test("RFQ tiles panel shows initial state", async ({ page }) => {
    // Default view is tiles
    await expect(page.getByTestId("credit-tab-tiles")).toBeVisible();

    // Should show "No RFQs to display" text
    await expect(
      page.getByText("No RFQs to display"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("navigate to New RFQ form", async ({ page }) => {
    await page.getByTestId("credit-tab-new-rfq").click();

    // Should show the new RFQ form with submit button
    await expect(page.getByText("Submit RFQ")).toBeVisible({ timeout: 3000 });
  });

  test("New RFQ form has all required fields", async ({ page }) => {
    await page.getByTestId("credit-tab-new-rfq").click();
    await expect(page.getByText("Submit RFQ")).toBeVisible({ timeout: 3000 });

    // Should show direction buttons (use exact match to avoid "Sell Side" tab)
    await expect(page.getByRole("button", { name: "Buy", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sell", exact: true })).toBeVisible();

    // Should show Direction label in the form
    await expect(page.locator("label").filter({ hasText: "Direction" })).toBeVisible();
  });

  test("navigate to Sell Side panel", async ({ page }) => {
    await page.getByTestId("credit-tab-sell-side").click();

    // Should show sell-side heading
    await expect(
      page.getByText("Sell Side (Adaptive Bank)"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("credit blotter is visible below the workspace", async ({ page }) => {
    // Credit blotter should be visible — use exact match for heading
    await expect(
      page.getByText("Credit Trades", { exact: true }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("switching between credit views maintains state", async ({ page }) => {
    // Go to New RFQ
    await page.getByTestId("credit-tab-new-rfq").click();
    await expect(page.getByText("Submit RFQ")).toBeVisible({ timeout: 3000 });

    // Go to Tiles
    await page.getByTestId("credit-tab-tiles").click();
    await expect(
      page.getByText("No RFQs to display"),
    ).toBeVisible({ timeout: 3000 });

    // Go to Sell Side
    await page.getByTestId("credit-tab-sell-side").click();
    await expect(
      page.getByText("Sell Side (Adaptive Bank)"),
    ).toBeVisible({ timeout: 3000 });
  });
});
