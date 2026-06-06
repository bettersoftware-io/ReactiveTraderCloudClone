import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "./react/VisualScenario";

test("app/fx", async ({ mount, page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await mount(<VisualScenario name="app/fx" />);
  await expect(page).toHaveScreenshot("fx.png", { animations: "disabled", fullPage: true });
});
