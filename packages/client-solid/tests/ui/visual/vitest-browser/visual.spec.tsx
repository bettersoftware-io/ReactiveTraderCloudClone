import { VisualScenario } from "@ui-visual";
import { goldenPath } from "@ui-visual-shared/goldenPath";
import { scenarioActionFor } from "@ui-visual-shared/scenarioActions";
import { scenarios } from "@ui-visual-shared/scenarios";
import { render } from "solid-js/web";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

// Tier 3 — Vitest browser mode, SolidJS side. Drives the SAME shared scenario
// manifest and interaction table as the react tier's spec
// (../../../../client-react/tests/ui/visual/vitest-browser/visual.spec.tsx),
// so the two stay behaviourally in lock-step, and asserts against react's
// COMMITTED goldens (see vitest-browser.config.ts's resolveScreenshotPath) —
// this package owns no goldens of its own.
//
// Mounting: manual `solid-js/web` `render` (no `vitest-browser-solid`
// dependency — Solid has no such package with parity to `vitest-browser-
// react`'s `render`/`screen` helpers as of this tier's authoring). Each test
// creates its own container appended to `document.body`, mounts via `render`,
// then disposes and removes the container in a `finally` block — Solid has no
// StrictMode double-invoke to guard against (unlike react-bindings'
// useMachine), but explicit per-test disposal still matters here because
// every test in this file shares one real browser document across the whole
// run (unlike jsdom-per-test isolation).
//
// Golden basename: `<skin>-<mode>/<base-name>` (see `goldenPath`). The matcher
// appends the browser name (e.g. `classic-dark/app-fx-chromium.png`); see the
// config's resolveScreenshotPath.

// Stub matchMedia so a query reports as matching (delegating every other query
// to the real impl). Used for prefers-reduced-motion, which this runner cannot
// emulate natively — the boot sequence reads it to skip its rAF canvas loop.
// Byte-identical to the react tier's stub.
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

    const container = document.createElement("div");
    document.body.append(container);
    const dispose = render(() => {
      return <VisualScenario name={name} />;
    }, container);

    try {
      if (action.click) {
        await userEvent.click(page.getByTestId(action.click));
      }

      for (const step of action.steps ?? []) {
        if ("click" in step) {
          await userEvent.click(page.getByTestId(step.click));
        } else if ("type" in step) {
          const el = page.getByTestId(step.type);
          await userEvent.clear(el);
          await userEvent.type(el, step.text);
        } else {
          await userEvent.selectOptions(
            page.getByTestId(step.select),
            step.value,
          );
        }
      }

      if (action.waitForText) {
        await expect.element(page.getByText(action.waitForText)).toBeVisible();
      }

      if (action.assertAriaLabelOf !== undefined) {
        await expect
          .element(page.getByTestId(action.assertAriaLabelOf))
          .toHaveAttribute("aria-label", action.expectAriaLabel);
      }

      // Full-bleed App scenarios have no `scenario-root` wrapper (VisualScenario
      // renders App directly), so capture the whole test body; component scenarios
      // capture just their padded `scenario-root` box.
      const target = action.fullPage
        ? page.elementLocator(document.body)
        : page.getByTestId("scenario-root");

      await expect
        .element(target)
        .toMatchScreenshot(goldenPath(name, scenario));
    } finally {
      window.matchMedia = realMatchMedia;
      dispose();
      container.remove();
    }
  });
}
