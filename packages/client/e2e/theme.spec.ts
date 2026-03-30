import { test, expect } from "@playwright/test";

test.describe("Theme", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("theme toggle button is visible", async ({ page }) => {
    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();
  });

  test("clicking theme toggle changes the theme", async ({ page }) => {
    const toggle = page.getByTestId("theme-toggle");
    const root = page.locator("#root");

    // Get initial background color
    const initialBg = await root.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    // Toggle theme
    await toggle.click();

    // Background color should change
    const newBg = await root.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(newBg).not.toBe(initialBg);
  });

  test("theme persists across page reloads", async ({ page }) => {
    const toggle = page.getByTestId("theme-toggle");
    const root = page.locator("#root");

    // Toggle to the other theme
    await toggle.click();
    const afterToggleBg = await root.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    // Reload
    await page.reload();

    // Background should match the toggled theme
    const afterReloadBg = await page.locator("#root").evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(afterReloadBg).toBe(afterToggleBg);
  });

  test("toggle button shows correct icon for current theme", async ({
    page,
  }) => {
    const toggle = page.getByTestId("theme-toggle");

    // Default is dark theme — should show sun emoji (switch to light)
    const initialLabel = await toggle.getAttribute("aria-label");
    expect(initialLabel).toContain("light");

    // Toggle
    await toggle.click();

    // Now in light theme — should show moon emoji (switch to dark)
    const newLabel = await toggle.getAttribute("aria-label");
    expect(newLabel).toContain("dark");
  });

  test("all workspace tabs work in both themes", async ({ page }) => {
    // Test in default (dark) theme
    await page.getByTestId("tab-fx").click();
    await expect(page.locator("[data-testid^='tile-']").first()).toBeVisible({
      timeout: 5000,
    });

    // Switch to light theme
    await page.getByTestId("theme-toggle").click();

    // Navigate to credit
    await page.getByTestId("tab-credit").click();
    await expect(page.getByTestId("credit-nav")).toBeVisible();

    // Navigate to admin
    await page.getByTestId("tab-admin").click();

    // Navigate back to FX
    await page.getByTestId("tab-fx").click();
    await expect(page.locator("[data-testid^='tile-']").first()).toBeVisible({
      timeout: 5000,
    });
  });
});
