import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

// Phase-2 HUD shell surfaces. Boot is captured under reduced motion so its
// rAF canvas loop is skipped and only the deterministic chrome is golden'd; the
// per-variant animated canvas art is verified in-browser, not pixel-diffed (it
// is rAF/time-driven and NOT frozen by `animations: "disabled"`). Reduced motion
// is emulated BEFORE mount so the component's effect reads it on first render.
test("boot/chrome", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<VisualScenario name="boot/chrome" />);
  await expect(
    page.getByText("TACTICAL TRADING OPERATING SYSTEM · v4.0"),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("boot-chrome.png", {
    animations: "disabled",
  });
});

test("lock/locked", async ({ mount, page }) => {
  await mount(<VisualScenario name="lock/locked" />);
  await expect(page.getByText("SESSION LOCKED")).toBeVisible();
  await expect(page).toHaveScreenshot("lock-locked.png", {
    animations: "disabled",
  });
});

test("prefs/modal", async ({ mount, page }) => {
  await mount(<VisualScenario name="prefs/modal" />);
  await expect(page.getByText("PREFERENCES")).toBeVisible();
  await expect(page).toHaveScreenshot("prefs-modal.png", {
    animations: "disabled",
  });
});

test("chrome/header", async ({ mount }) => {
  const c = await mount(<VisualScenario name="chrome/header" />);
  await expect(c.getByTestId("header")).toBeVisible();
  await expect(c).toHaveScreenshot("chrome-header.png", {
    animations: "disabled",
  });
});

test("status/bar", async ({ mount }) => {
  const c = await mount(<VisualScenario name="status/bar" />);
  await expect(c.getByTestId("connection-status")).toBeVisible();
  await expect(c).toHaveScreenshot("status-bar.png", {
    animations: "disabled",
  });
});
