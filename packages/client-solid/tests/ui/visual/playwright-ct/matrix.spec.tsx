import { expect, test } from "@playwright/test";
import { goldenPathArray } from "@ui-visual-shared/goldenPath";
import { scenarioActionFor } from "@ui-visual-shared/scenarioActions";
import { scenarios } from "@ui-visual-shared/scenarios";

// FALLBACK Tier 1 — see ../playwright-ct.config.ts's header comment for the
// full "why not the real CT adapter" rationale. This spec is deliberately
// named `matrix.spec.tsx` (not `visual.spec.ts`, contrary to how similar the
// body is to ../playwright/visual.spec.ts) so `snapshotPathTemplate`'s
// `{testFileName}` resolves to the SAME path segment react's real CT spec
// produces — the golden tree layout is the porting contract here, not the
// file's own contents (which contain no JSX and could just as well be
// `.ts` — the `.tsx` extension exists purely to match the filename).
//
// Behaviourally this is URL-navigation, structurally identical to
// ../playwright/visual.spec.ts — the only things that differ tier-to-tier are
// the config's golden routing (react's playwright-ct/__screenshots__/) and
// the host's page-level reset (./host/main.tsx's minimal reset, matching
// react's own CT host instead of the fuller app-equivalent reset in
// ../playwright/host/main.tsx).

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

    const shot = goldenPathArray(name, scenario);

    if (action.fullPage) {
      await expect(page).toHaveScreenshot(shot, {
        animations: "disabled",
        fullPage: true,
      });
    } else {
      await expect(page.getByTestId("scenario-root")).toHaveScreenshot(shot, {
        animations: "disabled",
      });
    }
  });
}
