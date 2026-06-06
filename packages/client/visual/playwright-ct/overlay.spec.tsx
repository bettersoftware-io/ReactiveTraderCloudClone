import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-harness";

test("connection-overlay/offline", async ({ mount, page }) => {
  await mount(<VisualScenario name="connection-overlay/offline" />);
  await expect(page).toHaveScreenshot("offline.png", { animations: "disabled" });
});
