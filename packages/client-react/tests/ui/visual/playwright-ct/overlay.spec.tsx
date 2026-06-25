import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("connection-overlay/offline", async ({ mount, page }) => {
  await mount(<VisualScenario name="connection-overlay/offline" />);
  await expect(page).toHaveScreenshot("offline.png", {
    animations: "disabled",
  });
});

test("connection-overlay/idle", async ({ mount, page }) => {
  await mount(<VisualScenario name="connection-overlay/idle" />);
  await expect(page).toHaveScreenshot("idle.png", {
    animations: "disabled",
  });
});
