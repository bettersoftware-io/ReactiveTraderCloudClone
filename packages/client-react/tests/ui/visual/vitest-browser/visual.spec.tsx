import { VisualScenario } from "@ui-visual";
import { goldenPath } from "@ui-visual-shared/goldenPath";
import { scenarioActionFor } from "@ui-visual-shared/scenarioActions";
import { scenarios } from "@ui-visual-shared/scenarios";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

declare const __RTC_VISUAL_SKIP_DIFF__: boolean;

// Tier 3 — Vitest browser mode. Drives the SAME shared scenario manifest and
// interaction table as the plain-Playwright tier (`../playwright/visual.spec.ts`),
// so the two stay behaviourally in lock-step. Coverage-only since the
// 2026-07-20 test-tooling bake-off: this tier's own goldens were retired, and
// the pixel assert below is compiled out via __RTC_VISUAL_SKIP_DIFF__ (see
// ../ADR-001-visual-diff-tooling.md's Outcome section).
//
// Golden basename: `<skin>-<mode>/<base-name>` (see `goldenPath`) — used only
// to name the assertion when this tier's diff role is re-enabled; unused
// while __RTC_VISUAL_SKIP_DIFF__ is true.

// Stub matchMedia so a query reports as matching (delegating every other query
// to the real impl). Used for prefers-reduced-motion, which this runner cannot
// emulate natively — the boot sequence reads it to skip its rAF canvas loop.
function stubReducedMotion(): MediaQueryList {
  return {
    matches: true,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => {
      return false;
    },
  } as unknown as MediaQueryList;
}

for (const [name, scenario] of Object.entries(scenarios)) {
  const action = scenarioActionFor(name);

  test(name, async () => {
    // Theme and view-mode are seeded through the seam (per-fixture data.themeMode /
    // data.viewMode), so dark/light and chart/price scenarios are deterministic
    // without any localStorage involvement.
    const realMatchMedia = window.matchMedia;

    if (action.reducedMotion) {
      window.matchMedia = ((query: string): MediaQueryList => {
        return query.includes("prefers-reduced-motion")
          ? stubReducedMotion()
          : realMatchMedia.call(window, query);
      }) as typeof window.matchMedia;
    }

    try {
      // vitest-browser-react v2: render() is async (wraps React's async act).
      const screen = await render(<VisualScenario name={name} />);

      // VisualScenario renders null until document.fonts.load() resolves (the
      // font-determinism gate). The first test in a fresh page pays that cold
      // latency, so an eager getByTestId(...).element() for the first
      // interaction throws "Cannot find element" against an empty <div/> before
      // the content mounts — which makes any -t-filtered / single-scenario run
      // fail its first test. Await the first interaction target visible to wait
      // the gate out. The final toMatchScreenshot auto-retries on its own, so
      // non-interaction scenarios need no gate here.
      const firstStep = action.steps?.[0];
      const firstInteractionTestId =
        action.click ??
        (firstStep &&
          ("click" in firstStep
            ? firstStep.click
            : "type" in firstStep
              ? firstStep.type
              : firstStep.select));

      if (firstInteractionTestId) {
        await expect
          .element(screen.getByTestId(firstInteractionTestId))
          .toBeVisible();
      }

      if (action.click) {
        await userEvent.click(screen.getByTestId(action.click).element());
      }

      for (const step of action.steps ?? []) {
        if ("click" in step) {
          await userEvent.click(screen.getByTestId(step.click).element());
        } else if ("type" in step) {
          const el = screen
            .getByTestId(step.type)
            .element() as HTMLInputElement;
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
        await expect
          .element(screen.getByText(action.waitForText))
          .toBeVisible();
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

      if (!__RTC_VISUAL_SKIP_DIFF__) {
        await expect
          .element(target)
          .toMatchScreenshot(goldenPath(name, scenario));
      }
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });
}
