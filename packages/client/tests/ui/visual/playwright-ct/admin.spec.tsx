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

test("admin/panel-loading", async ({ mount }) => {
  // Throughput not yet loaded (loading:true) → the "Loading throughput…" arm.
  const c = await mount(<VisualScenario name="admin/panel-loading" />);
  await expect(c.getByText(/loading throughput/i)).toBeVisible();
  await expect(c).toHaveScreenshot("panel-loading.png", { animations: "disabled" });
});
