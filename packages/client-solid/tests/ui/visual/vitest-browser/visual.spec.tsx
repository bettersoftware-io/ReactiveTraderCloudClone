import { VisualScenario } from "@ui-visual";
import { scenarioActionFor } from "@ui-visual-shared/scenarioActions";
import { scenarios } from "@ui-visual-shared/scenarios";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-solid";

// Solid's coverage-only visual tier. It walks the SAME shared scenario manifest
// and interaction table as the plain-Playwright tier
// (`../playwright/visual.spec.ts`), so the two stay behaviourally in lock-step
// — but it asserts no pixels at all. client-solid owns no goldens (its
// playwright tier asserts against the react-generated set in @rtc/ui-contract),
// so this tier's entire job is to let istanbul watch which of `src/ui` the
// golden matrix actually renders. See vitest-browser.coverage.config.ts.
//
// Two API differences from the react twin, both from vitest-browser-solid:
// `render` is SYNCHRONOUS (no async act to await), and it takes a component
// FACTORY rather than an element — `render(() => <X />)`, which is also how
// Solid keeps the component's reactive scope owned by the renderer.

for (const [name] of Object.entries(scenarios)) {
  const action = scenarioActionFor(name);

  test(name, async () => {
    // Theme and view-mode are seeded through the seam (per-fixture
    // data.themeMode / data.viewMode), so dark/light and chart/price scenarios
    // are deterministic without any localStorage involvement.
    const realMatchMedia = window.matchMedia;

    if (action.reducedMotion) {
      window.matchMedia = ((query: string): MediaQueryList => {
        return query.includes("prefers-reduced-motion")
          ? stubReducedMotion()
          : realMatchMedia.call(window, query);
      }) as typeof window.matchMedia;
    }

    try {
      const screen = render(() => {
        return <VisualScenario name={name} />;
      });

      // VisualScenario renders null until document.fonts.load() resolves (the
      // font-determinism gate). The first test in a fresh page pays that cold
      // latency, so an eager getByTestId(...).element() for the first
      // interaction throws "Cannot find element" against an empty <div/> before
      // the content mounts. Await the first interaction target to wait the gate
      // out; scenarios with no interaction have nothing to race.
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
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });
}

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
