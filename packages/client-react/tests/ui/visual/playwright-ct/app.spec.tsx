import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("app/fx", async ({ mount, page }) => {
  await page.addInitScript(() => {
    return window.localStorage.clear();
  });
  await mount(<VisualScenario name="app/fx" />);
  await expect(page).toHaveScreenshot("fx.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("app/credit", async ({ mount, page }) => {
  await page.addInitScript(() => {
    return window.localStorage.clear();
  });
  await mount(<VisualScenario name="app/credit" />);
  await page.getByTestId("tab-credit").click();
  await expect(page.getByText("▤ Credit Blotter")).toBeVisible();
  await expect(page).toHaveScreenshot("credit.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("app/admin", async ({ mount, page }) => {
  await page.addInitScript(() => {
    return window.localStorage.clear();
  });
  // AdminPanel fetches throughput on mount; stub it so the loaded state is
  // deterministic instead of racing a (failing) request to a missing server.
  await page.route("**/throughput", (route) => {
    return route.fulfill({ json: { value: 250 } });
  });
  await mount(<VisualScenario name="app/admin" />);
  await page.getByTestId("tab-admin").click();
  // "Throughput Control" appears in both the engine panel header and the AdminPanel
  // h2, so getByText is not unique. "Updates/sec" is only in the AdminPanel slider
  // row and proves the panel is fully loaded without a strict-mode violation.
  await expect(page.getByText("Updates/sec")).toBeVisible();
  await expect(page).toHaveScreenshot("admin.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("app/fx-light", async ({ mount, page }) => {
  // Light theme is seeded through the seam (fixture theme "light"); confirm the
  // toggle offers switching to system (the next step in the cycle) before
  // screenshotting.
  await mount(<VisualScenario name="app/fx-light" />);
  await expect(page.getByTestId("theme-toggle")).toHaveAttribute(
    "aria-label",
    "Switch to system theme",
  );
  await expect(page).toHaveScreenshot("fx-light.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("app/fx-system", async ({ mount, page }) => {
  // System mode preference: the toggle shows the third (🖥️) icon and offers a
  // switch to dark (cycle wrap). With no OS media query the page paints dark.
  await mount(<VisualScenario name="app/fx-system" />);
  await expect(page.getByTestId("theme-toggle")).toHaveAttribute(
    "aria-label",
    "Switch to dark theme",
  );
  await expect(page).toHaveScreenshot("fx-system.png", {
    animations: "disabled",
    fullPage: true,
  });
});
