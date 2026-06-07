import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-harness";

test("app/fx", async ({ mount, page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await mount(<VisualScenario name="app/fx" />);
  await expect(page).toHaveScreenshot("fx.png", { animations: "disabled", fullPage: true });
});

test("app/credit", async ({ mount, page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await mount(<VisualScenario name="app/credit" />);
  await page.getByTestId("tab-credit").click();
  await expect(page.getByText("Credit Trades")).toBeVisible();
  await expect(page).toHaveScreenshot("credit.png", { animations: "disabled", fullPage: true });
});

test("app/admin", async ({ mount, page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  // AdminPanel fetches throughput on mount; stub it so the loaded state is
  // deterministic instead of racing a (failing) request to a missing server.
  await page.route("**/throughput", (route) => route.fulfill({ json: { value: 250 } }));
  await mount(<VisualScenario name="app/admin" />);
  await page.getByTestId("tab-admin").click();
  await expect(page.getByText("Throughput Control")).toBeVisible();
  await expect(page).toHaveScreenshot("admin.png", { animations: "disabled", fullPage: true });
});

test("app/fx-light", async ({ mount, page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await mount(<VisualScenario name="app/fx-light" />);
  // Default theme is dark; toggle to light, then confirm the switch took effect
  // (the button now offers switching back to dark) before screenshotting.
  await page.getByTestId("theme-toggle").click();
  await expect(page.getByTestId("theme-toggle")).toHaveAttribute(
    "aria-label",
    "Switch to dark theme",
  );
  await expect(page).toHaveScreenshot("fx-light.png", { animations: "disabled", fullPage: true });
});
