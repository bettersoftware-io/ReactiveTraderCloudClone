import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "./react/VisualScenario";

test("fx-blotter/populated", async ({ mount }) => {
  const c = await mount(<VisualScenario name="fx-blotter/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});
