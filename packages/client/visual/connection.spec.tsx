import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "./react/VisualScenario";

test("connection-status/connected", async ({ mount }) => {
  const c = await mount(<VisualScenario name="connection-status/connected" />);
  await expect(c).toHaveScreenshot("connected.png", { animations: "disabled" });
});

test("connection-status/disconnected", async ({ mount }) => {
  const c = await mount(<VisualScenario name="connection-status/disconnected" />);
  await expect(c).toHaveScreenshot("disconnected.png", { animations: "disabled" });
});
