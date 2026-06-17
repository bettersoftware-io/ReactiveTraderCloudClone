import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("admin/panel-loaded", async ({ mount }) => {
  // AdminPanel reads throughput through the HooksProvider seam; the visual
  // fake (buildFakeHooks/app-fx fixture) provides a loaded value of 250, so the
  // slider state renders deterministically with no transport stub needed.
  const c = await mount(<VisualScenario name="admin/panel-loaded" />);
  await expect(c.getByText("Throughput Control")).toBeVisible();
  await expect(c).toHaveScreenshot("panel-loaded.png", { animations: "disabled" });
});
