# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> fx-blotter/highlighted-row__classic-dark
- Location: tests/ui/visual/playwright/visual.spec.ts:9:3

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: getByTestId('scenario-root')
  Expected an image 684px by 71px, received 582px by 72px. 9287 pixels (ratio 0.19 of all image pixels) are different.

  Snapshot: classic-dark/fx-blotter-highlighted-row.png

Call log:
  - Expect "toHaveScreenshot(classic-dark/fx-blotter-highlighted-row.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for getByTestId('scenario-root')
    - locator resolved to <div data-testid="scenario-root">…</div>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - Expected an image 684px by 71px, received 582px by 72px. 9287 pixels (ratio 0.19 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for getByTestId('scenario-root')
    - locator resolved to <div data-testid="scenario-root">…</div>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - Expected an image 684px by 71px, received 582px by 72px. 9287 pixels (ratio 0.19 of all image pixels) are different.

```

# Page snapshot

```yaml
- table [ref=e4]:
  - rowgroup [ref=e5]:
    - row "4001 Done 06-Jun-2026 Buy EURUSD EUR 1,000,000 1.09221 08-Jun-2026 Trade 4001" [ref=e6]:
      - cell "4001" [ref=e7]
      - cell "Done" [ref=e8]
      - cell "06-Jun-2026" [ref=e9]
      - cell "Buy" [ref=e10]
      - cell "EURUSD" [ref=e11]
      - cell "EUR" [ref=e12]
      - cell "1,000,000" [ref=e13]
      - cell "1.09221" [ref=e14]
      - cell "08-Jun-2026" [ref=e15]
      - cell "Trade 4001" [ref=e16]
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { goldenPathArray } from "@ui-visual-shared/goldenPath";
  3  | import { scenarioActionFor } from "@ui-visual-shared/scenarioActions";
  4  | import { scenarios } from "@ui-visual-shared/scenarios";
  5  | 
  6  | for (const [name, scenario] of Object.entries(scenarios)) {
  7  |   const action = scenarioActionFor(name);
  8  | 
  9  |   test(name, async ({ page }) => {
  10 |     // Theme and view-mode are seeded through the seam (per-fixture data.themeMode /
  11 |     // data.viewMode), so dark/light and chart/price scenarios are deterministic
  12 |     // without any localStorage involvement.
  13 | 
  14 |     // The boot sequence reads prefers-reduced-motion to skip its rAF canvas loop;
  15 |     // emulate it BEFORE navigating so only the deterministic chrome is rendered.
  16 |     if (action.reducedMotion) {
  17 |       await page.emulateMedia({ reducedMotion: "reduce" });
  18 |     }
  19 | 
  20 |     await page.goto(`/?scenario=${encodeURIComponent(name)}`);
  21 | 
  22 |     if (action.click) {
  23 |       await page.getByTestId(action.click).click();
  24 |     }
  25 | 
  26 |     for (const step of action.steps ?? []) {
  27 |       if ("click" in step) {
  28 |         await page.getByTestId(step.click).click();
  29 |       } else if ("type" in step) {
  30 |         await page.getByTestId(step.type).fill(step.text);
  31 |       } else {
  32 |         await page.getByTestId(step.select).selectOption(step.value);
  33 |       }
  34 |     }
  35 | 
  36 |     if (action.waitForText) {
  37 |       await expect(page.getByText(action.waitForText)).toBeVisible();
  38 |     }
  39 | 
  40 |     if (action.assertAriaLabelOf !== undefined) {
  41 |       await expect(page.getByTestId(action.assertAriaLabelOf)).toHaveAttribute(
  42 |         "aria-label",
  43 |         action.expectAriaLabel,
  44 |       );
  45 |     }
  46 | 
  47 |     const shot = goldenPathArray(name, scenario);
  48 | 
  49 |     if (action.fullPage) {
  50 |       await expect(page).toHaveScreenshot(shot, {
  51 |         animations: "disabled",
  52 |         fullPage: true,
  53 |       });
  54 |     } else {
> 55 |       await expect(page.getByTestId("scenario-root")).toHaveScreenshot(shot, {
     |                                                       ^ Error: expect(locator).toHaveScreenshot(expected) failed
  56 |         animations: "disabled",
  57 |       });
  58 |     }
  59 |   });
  60 | }
  61 | 
```