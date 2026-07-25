import { expect, test } from "@playwright/test";
import {
  collectFreezeViolations,
  FREEZE_SCENARIOS,
} from "@ui-visual-shared/freezeContract";
import { scenarioActionFor } from "@ui-visual-shared/scenarioActions";

// The power-saver freeze contract, asserted against computed style instead of
// pixels. See freezeContract.ts for why neither the jsdom tiers nor the golden
// tier can witness this: `toHaveScreenshot({ animations: "disabled" })` calls
// `animation.finish()`, which jumps past `animation-delay` entirely. Nothing
// here screenshots, so the live animation state is genuinely observable.
//
// Deliberately co-located with visual.spec.ts: it needs the same host, the same
// scenario matrix and the same webServer, and the visual CI job already runs
// this whole directory.

// Without this the loop below silently generates zero tests if the fixtures
// ever stop seeding "freeze" — a green suite asserting nothing.
test("the freeze scenario matrix is non-empty", () => {
  expect(FREEZE_SCENARIOS.length).toBeGreaterThan(0);
});

for (const name of FREEZE_SCENARIOS) {
  const action = scenarioActionFor(name);

  test(`freeze contract — ${name}`, async ({ page }) => {
    await page.goto(`/?scenario=${encodeURIComponent(name)}`);

    // The same readiness signal visual.spec.ts uses. Full-page scenarios are
    // fixed-position overlays that render no `scenario-root` box, so waiting on
    // that testid would hang for exactly the scenarios seeded with freeze.
    if (action.waitForText) {
      await expect(page.getByText(action.waitForText)).toBeVisible();
    } else {
      await expect(page.getByTestId("scenario-root")).toBeVisible();
    }

    // Precondition, not decoration: if the harness stopped writing the
    // attribute, every assertion below would pass vacuously.
    await expect(page.locator("html")).toHaveAttribute(
      "data-power-saver",
      "freeze",
    );

    // Settle every animation before sampling. Two rAFs alone were NOT enough on
    // a loaded CI runner: an animation still in its pending/before phase applies
    // `backwards` fill, so `.sealed` read `opacity: 0` and the run flaked.
    // Awaiting the animations' own `finished` promises removes the race — under
    // freeze they all complete in 0.01ms. The timeout is a backstop so a
    // never-finishing animation fails the assertion rather than hanging.
    //
    // This does NOT weaken the delay guard. `animation-delay` is a static
    // computed-style fact, so collectFreezeViolations reports it no matter when
    // it samples; that assertion — not the opacity one — is what catches the
    // delay+`backwards` class, and it is why settling here is safe.
    await page.evaluate(async () => {
      async function twoFrames(): Promise<void> {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
      }

      await twoFrames();
      await Promise.race([
        Promise.all(
          document.getAnimations().map((animation) => {
            return animation.finished.catch(() => {
              return undefined;
            });
          }),
        ),
        new Promise((resolve) => {
          setTimeout(resolve, 2000);
        }),
      ]);
      await twoFrames();
    });

    expect(await page.evaluate(collectFreezeViolations)).toEqual([]);
  });
}
