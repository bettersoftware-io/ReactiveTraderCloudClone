import { test, expect } from "@playwright/test";

test.describe("Connection Status", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows Connected status in footer", async ({ page }) => {
    const statusBar = page.getByTestId("connection-status");
    await expect(statusBar).toBeVisible();
    await expect(statusBar).toContainText("Connected");
  });

  test("connection overlay is not visible when connected", async ({
    page,
  }) => {
    await expect(page.getByTestId("connection-overlay")).toBeHidden();
  });

  test("going offline shows overlay with offline message", async ({
    page,
    context,
  }) => {
    // Simulate offline
    await context.setOffline(true);

    const overlay = page.getByTestId("connection-overlay");
    await expect(overlay).toBeVisible({ timeout: 3000 });
    await expect(overlay).toContainText(/offline/i);

    // Status bar should show offline state
    const statusBar = page.getByTestId("connection-status");
    await expect(statusBar).toContainText("Offline");
  });

  test("coming back online dismisses overlay", async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);
    await expect(page.getByTestId("connection-overlay")).toBeVisible({
      timeout: 3000,
    });

    // Come back online
    await context.setOffline(false);

    // Overlay should dismiss
    await expect(page.getByTestId("connection-overlay")).toBeHidden({
      timeout: 5000,
    });

    // Status should return to Connected
    await expect(page.getByTestId("connection-status")).toContainText(
      "Connected",
    );
  });
});
