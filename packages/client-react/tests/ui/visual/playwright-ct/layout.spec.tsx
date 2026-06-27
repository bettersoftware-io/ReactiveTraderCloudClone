import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("layout/fx-default", async ({ mount }) => {
  const c = await mount(<VisualScenario name="layout/fx-default" />);
  await expect(c.getByTestId("layout-engine")).toBeVisible();
  await expect(c).toHaveScreenshot("fx-default.png", {
    animations: "disabled",
  });
});

test("layout/fx-maximized", async ({ mount }) => {
  const c = await mount(<VisualScenario name="layout/fx-maximized" />);
  await expect(c.getByTestId("panel-fx-rates")).toHaveAttribute(
    "data-maximized",
    "true",
  );
  await expect(c).toHaveScreenshot("fx-maximized.png", {
    animations: "disabled",
  });
});

test("layout/fx-collapsed", async ({ mount }) => {
  const c = await mount(<VisualScenario name="layout/fx-collapsed" />);
  await expect(c.getByTestId("panel-fx-analytics")).toHaveAttribute(
    "data-strip",
    "true",
  );
  await expect(c).toHaveScreenshot("fx-collapsed.png", {
    animations: "disabled",
  });
});
