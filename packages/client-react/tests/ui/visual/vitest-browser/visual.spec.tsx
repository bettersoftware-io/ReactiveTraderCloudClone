import { VisualScenario } from "@ui-visual";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { scenarioActions } from "../scenarioActions";
import { scenarios } from "../shared/scenarios";

// Tier 3 — Vitest browser mode. Drives the SAME shared scenario manifest and
// interaction table as the plain-Playwright tier (`../playwright/visual.spec.ts`),
// so the two stay behaviourally in lock-step. Goldens are routed per-environment
// by `vitest-browser.config.ts` (CI `react/` vs local `react-local/<arch>/`).
//
// Golden basename: scenario name with "/" → "-". The matcher appends the browser
// name (e.g. `app-fx-chromium.png`); see the config's resolveScreenshotPath.
function goldenName(scenario: string): string {
  return scenario.replace(/\//g, "-");
}

for (const name of Object.keys(scenarios)) {
  const action = scenarioActions[name] ?? {};

  test(name, async () => {
    // Theme and view-mode are seeded through the seam (per-fixture data.themeMode /
    // data.viewMode), so dark/light and chart/price scenarios are deterministic
    // without any localStorage involvement.

    // vitest-browser-react v2: render() is async (wraps React's async act).
    const screen = await render(<VisualScenario name={name} />);

    if (action.click) {
      await userEvent.click(screen.getByTestId(action.click).element());
    }

    for (const step of action.steps ?? []) {
      if ("click" in step) {
        await userEvent.click(screen.getByTestId(step.click).element());
      } else if ("type" in step) {
        const el = screen.getByTestId(step.type).element() as HTMLInputElement;
        await userEvent.clear(el);
        await userEvent.type(el, step.text);
      } else {
        await userEvent.selectOptions(
          screen.getByTestId(step.select).element(),
          step.value,
        );
      }
    }

    if (action.waitForText) {
      await expect.element(screen.getByText(action.waitForText)).toBeVisible();
    }

    if (action.assertAriaLabelOf !== undefined) {
      await expect
        .element(screen.getByTestId(action.assertAriaLabelOf))
        .toHaveAttribute("aria-label", action.expectAriaLabel);
    }

    // Full-bleed App scenarios have no `scenario-root` wrapper (VisualScenario
    // renders App directly), so capture the whole test body; component scenarios
    // capture just their padded `scenario-root` box.
    const target = action.fullPage
      ? page.elementLocator(document.body)
      : screen.getByTestId("scenario-root");

    await expect.element(target).toMatchScreenshot(goldenName(name));
  });
}
