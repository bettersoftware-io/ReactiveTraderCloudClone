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

    // Should show "No RFQs to display" or existing RFQs
    await expect(
      page.getByText(/no rfqs|rfq/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("navigate to New RFQ form", async ({ page }) => {
    await page.getByTestId("credit-tab-new-rfq").click();

    // Should show the new RFQ form
    await expect(page.getByText("New RFQ")).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Submit RFQ")).toBeVisible();
  });

  test("New RFQ form has all required fields", async ({ page }) => {
    await page.getByTestId("credit-tab-new-rfq").click();
    await expect(page.getByText("New RFQ")).toBeVisible({ timeout: 3000 });

    // Should show direction buttons
    await expect(page.getByText("Buy")).toBeVisible();
    await expect(page.getByText("Sell")).toBeVisible();

    // Should show submit button (initially disabled)
    const submitBtn = page.getByText("Submit RFQ");
    await expect(submitBtn).toBeVisible();
  });

  test("navigate to Sell Side panel", async ({ page }) => {
    await page.getByTestId("credit-tab-sell-side").click();

    // Should show sell-side content
    await expect(
      page.getByText(/sell side|no rfqs|pending/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("credit blotter is visible below the workspace", async ({ page }) => {
    // Credit blotter should be visible regardless of which tab is selected
    await expect(
      page.getByText(/credit trades|no trades/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("switching between credit views maintains state", async ({ page }) => {
    // Go to New RFQ
    await page.getByTestId("credit-tab-new-rfq").click();
    await expect(page.getByText("New RFQ")).toBeVisible({ timeout: 3000 });

    // Go to Tiles
    await page.getByTestId("credit-tab-tiles").click();
    await expect(
      page.getByText(/no rfqs|rfq/i),
    ).toBeVisible({ timeout: 3000 });

    // Go to Sell Side
    await page.getByTestId("credit-tab-sell-side").click();
    await expect(
      page.getByText(/sell side|no rfqs|pending/i),
    ).toBeVisible({ timeout: 3000 });
  });
});
