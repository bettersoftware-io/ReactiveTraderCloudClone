import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("admin/panel-loaded", async ({ mount, page }) => {
  // AdminPanel fetches throughput on mount (outside the HooksProvider seam);
  // stub it so the loaded slider state renders deterministically.
  await page.route("**/throughput", (route) =>
    route.fulfill({ json: { value: 250 } }),
  );
  const c = await mount(<VisualScenario name="admin/panel-loaded" />);
  await expect(page.getByText("Throughput Control")).toBeVisible();
  await expect(c).toHaveScreenshot("panel-loaded.png", { animations: "disabled" });
});
