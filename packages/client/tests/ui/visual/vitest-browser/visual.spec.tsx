import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { VisualScenario } from "@ui-visual";
import { scenarios } from "../shared/scenarios";
import { scenarioActions } from "../scenarioActions";

// Tier 3 — Vitest browser mode. Drives the SAME shared scenario manifest and
// interaction table as the plain-Playwright tier (`../playwright/visual.spec.ts`),
// so the two stay behaviourally in lock-step. Goldens are routed per-environment
// by `vitest-browser.config.ts` (CI `react/` vs local `react-local/<arch>/`).
//
// Golden basename: scenario name with "/" → "-". The matcher appends the browser
// name (e.g. `app-fx-chromium.png`); see the config's resolveScreenshotPath.
const goldenName = (scenario: string) => scenario.replace(/\//g, "-");

for (const name of Object.keys(scenarios)) {
  const action = scenarioActions[name] ?? {};

  test(name, async () => {
    // Theme persists to localStorage (rtc-theme); clear it before each render so
    // the dark/light scenarios are deterministic regardless of run order.
    window.localStorage.clear();

    // Admin throughput fetch: the browser tier has no `page.route`, so stub the
    // global fetch before App mounts and fires the request (admin only).
    if (action.stubThroughput !== undefined) {
      const value = action.stubThroughput;
      window.fetch = (async () =>
        new Response(JSON.stringify({ value }), {
          headers: { "content-type": "application/json" },
        })) as typeof fetch;
    }

    // vitest-browser-react v2: render() is async (wraps React's async act).
    const screen = await render(<VisualScenario name={name} />);

    if (action.click) {
      await userEvent.click(screen.getByTestId(action.click).element());
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
