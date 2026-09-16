import { expect, test } from "@playwright/test";
import { dockTabStripsAreSettled } from "@ui-visual-shared/dockResizeFlash";
import { goldenPathArray } from "@ui-visual-shared/goldenPath";
import { settleAnimationsForCapture } from "@ui-visual-shared/holdMotion";
import { scenarioActionFor } from "@ui-visual-shared/scenarioActions";
import { scenarios } from "@ui-visual-shared/scenarios";

for (const [name, scenario] of Object.entries(scenarios)) {
  const action = scenarioActionFor(name);

  test(name, async ({ page }) => {
    // Theme and view-mode are seeded through the seam (per-fixture data.themeMode /
    // data.viewMode), so dark/light and chart/price scenarios are deterministic
    // without any localStorage involvement.

    // The boot sequence reads prefers-reduced-motion to skip its rAF canvas loop;
    // emulate it BEFORE navigating so only the deterministic chrome is rendered.
    if (action.reducedMotion) {
      await page.emulateMedia({ reducedMotion: "reduce" });
    }

    await page.goto(`/?scenario=${encodeURIComponent(name)}`);

    if (action.click) {
      await page.getByTestId(action.click).click();
    }

    for (const step of action.steps ?? []) {
      if ("click" in step) {
        await page.getByTestId(step.click).click();
      } else if ("type" in step) {
        await page.getByTestId(step.type).fill(step.text);
      } else {
        await page.getByTestId(step.select).selectOption(step.value);
      }
    }

    if (action.waitForText) {
      await expect(page.getByText(action.waitForText)).toBeVisible();
    }

    if (action.assertAriaLabelOf !== undefined) {
      await expect(page.getByTestId(action.assertAriaLabelOf)).toHaveAttribute(
        "aria-label",
        action.expectAriaLabel,
      );
    }

    // Wait out dockview's tab-strip resize flash FIRST. Dockview adds
    // `dv-scrollable-resizing` on every ResizeObserver tick of a tab strip and
    // clears it 500 ms after the last one, and while it is there the strip
    // paints a 4 px scrollbar thumb — so on a dockview scenario whether the
    // golden contains that bar was decided by wall clock, not by the fixture.
    // It shipped `app/equities-instances-dockview` with the bar in 6 of its 10
    // x86 skins and 9 of its 10 arm64 ones (one generation run each, one DOM),
    // then cost solid ~4 post-merge runs in 5 on the one skin where the two
    // clients' luck differed: 1766 px against a 100 px cap. The wait needs no
    // wall-clock constant of its own — the class's ABSENCE already means "past
    // dockview's own 500 ms timer" — see @ui-visual-shared/dockResizeFlash.
    //
    // It goes immediately before the settle pass on purpose: removing the class
    // starts dockview's `transition: background-color 1s`, so capturing right
    // after this wait could still catch the thumb MID-FADE. The pass below
    // finishes that transition, leaving it at exactly zero alpha.
    await page.waitForFunction(dockTabStripsAreSettled);

    // Settle page motion OURSELVES, then capture with `animations: "allow"`.
    // Playwright's `animations: "disabled"` finishes every finite animation,
    // which is right for entrances/flashes/fades but wrong for the RFQ drain
    // bars: those are one mount-time keyframe fast-forwarded by a negative
    // delay, so their END is an empty bar and their TIME 0 is the fixture's
    // state — every countdown golden held a drained bar for a live RFQ. It was
    // also a race: when the fast-forward missed the compositor-owned
    // animation, the stability loop accepted the static running bar and
    // captured it FULL, one red cell per post-merge run. This pass mirrors
    // Playwright's rules everywhere else and holds only the
    // `data-motion="fast-forwarded"` family at its mount frame — see
    // @ui-visual-shared/holdMotion.
    await page.evaluate(settleAnimationsForCapture);

    const shot = goldenPathArray(name, scenario);
    // Strict scenarios (Scenario.strict) pin at ZERO tolerance, overriding the
    // config-level maxDiffPixelRatio budget: their pixels are
    // engine-deterministic, so any diff at all is a real divergence. A
    // scenario-level maxDiffPixels instead RAISES the absolute cap for a
    // measured, mechanism-understood divergence (see Scenario's doc).
    const strictOpts = scenario.strict
      ? { maxDiffPixels: 0, maxDiffPixelRatio: 0 }
      : scenario.maxDiffPixels !== undefined
        ? { maxDiffPixels: scenario.maxDiffPixels }
        : {};

    if (action.fullPage) {
      await expect(page).toHaveScreenshot(shot, {
        animations: "allow",
        fullPage: true,
        ...strictOpts,
      });
    } else {
      await expect(page.getByTestId("scenario-root")).toHaveScreenshot(shot, {
        animations: "allow",
        ...strictOpts,
      });
    }
  });
}
