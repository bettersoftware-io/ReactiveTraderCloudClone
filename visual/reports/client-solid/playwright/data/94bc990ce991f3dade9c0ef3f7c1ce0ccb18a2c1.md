# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> app/credit-dockview__classic-light
- Location: tests/ui/visual/playwright/visual.spec.ts:17:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  2383 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: classic-light/app-credit-dockview.png

Call log:
  - Expect "toHaveScreenshot(classic-light/app-credit-dockview.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 2383 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 2383 pixels (ratio 0.01 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e7]:
        - img [ref=e8]
        - img [ref=e20]
        - img [ref=e23]
      - generic [ref=e26]:
        - generic [ref=e27]: REACTIVE TRADER
        - generic [ref=e28]: FX · CREDIT · EQUITIES · HUD TERMINAL
    - navigation "Workspace" [ref=e29]:
      - button "FX" [ref=e30] [cursor=pointer]
      - button "Credit" [active] [ref=e31] [cursor=pointer]
      - button "Equities" [ref=e32] [cursor=pointer]
      - button "Admin" [ref=e33] [cursor=pointer]
    - generic [ref=e34]:
      - generic [ref=e37]: LIVE
      - button "J.A.R.V.I.S assistant" [ref=e38] [cursor=pointer]:
        - generic:
          - img
        - generic:
          - img
      - generic [ref=e39]: PROD
      - 'button "Power saver: Off. Activate to switch to Calm." [ref=e40] [cursor=pointer]':
        - generic [ref=e41]: ⌁
        - generic [ref=e42]: ○
      - generic [ref=e43]:
        - button "Switch to system theme" [ref=e44] [cursor=pointer]: 🌙
        - button "Theme skin" [ref=e46] [cursor=pointer]:
          - generic [ref=e50]: Classic
          - generic [ref=e51]: ▾
      - button "Notifications" [ref=e53] [cursor=pointer]:
        - img [ref=e54]
        - generic [ref=e57]: "3"
      - button "Language" [ref=e59] [cursor=pointer]:
        - img [ref=e60]
        - generic [ref=e63]: EN
        - generic [ref=e64]: ▾
      - button "Account" [ref=e67] [cursor=pointer]:
        - generic [ref=e68]:
          - img [ref=e69]
          - generic [ref=e71]: AS
        - generic [ref=e72]: ▾
  - main [ref=e74]:
    - generic [ref=e86]:
      - generic [ref=e92]:
        - region "New RFQ" [ref=e94]:
          - generic [ref=e95]:
            - tablist [ref=e97]:
              - tab "✚ New RFQ" [selected] [ref=e98] [cursor=pointer]:
                - generic [ref=e104]: ✚ New RFQ
            - button "Collapse New RFQ" [ref=e109] [cursor=pointer]: —
          - tabpanel "✚ New RFQ" [ref=e110]:
            - generic [ref=e114]:
              - generic [ref=e115]:
                - button "You Buy" [ref=e116] [cursor=pointer]
                - button "You Sell" [ref=e117] [cursor=pointer]
              - generic [ref=e118]: Instrument
              - button "Select instrument ▾" [ref=e120] [cursor=pointer]:
                - generic [ref=e121]: Select instrument
                - generic [ref=e122]: ▾
              - generic [ref=e123]:
                - generic [ref=e124]:
                  - generic [ref=e125]: Qty (000)
                  - textbox "0" [ref=e126]
                - generic [ref=e127]:
                  - generic [ref=e128]: Duration
                  - generic [ref=e129]: 2 Min
              - generic [ref=e130]: Counterparties
              - generic [ref=e131]:
                - button "All Dealers" [ref=e132] [cursor=pointer]:
                  - generic [ref=e134]: All Dealers
                - button "Adaptive Bank" [ref=e135] [cursor=pointer]:
                  - generic [ref=e137]: Adaptive Bank
                - button "Citi" [ref=e138] [cursor=pointer]:
                  - generic [ref=e140]: Citi
                - button "JP Morgan" [ref=e141] [cursor=pointer]:
                  - generic [ref=e143]: JP Morgan
                - button "Goldman Sachs" [ref=e144] [cursor=pointer]:
                  - generic [ref=e146]: Goldman Sachs
              - generic [ref=e147]:
                - button "CLEAR" [ref=e148] [cursor=pointer]
                - button "SEND RFQ" [disabled] [ref=e149]
        - generic [ref=e155]:
          - region "RFQs" [ref=e157]:
            - generic [ref=e158]:
              - tablist [ref=e160]:
                - tab "◳ RFQs LIVE (1) CLOSED ALL" [selected] [ref=e161] [cursor=pointer]:
                  - generic [ref=e166]:
                    - generic [ref=e167]: ◳ RFQs
                    - generic [ref=e168]:
                      - button "LIVE (1)" [ref=e169]
                      - button "CLOSED" [ref=e170]
                      - button "ALL" [ref=e171]
              - generic [ref=e175]:
                - button "Collapse RFQs" [ref=e176] [cursor=pointer]: —
                - button "Maximize RFQs" [ref=e177] [cursor=pointer]: ⛶
            - tabpanel "◳ RFQs LIVE (1) CLOSED ALL" [ref=e178]:
              - generic [ref=e186]:
                - generic [ref=e187]:
                  - generic [ref=e188]:
                    - generic [ref=e189]:
                      - generic [ref=e190]: BUY
                      - generic [ref=e191]: T 1.5 02/34
                    - generic [ref=e192]: 912828ZQ6 · QTY 5,000,000
                  - generic [ref=e193]: LIVE
                - generic [ref=e194]:
                  - generic [ref=e195]:
                    - generic [ref=e196]:
                      - generic [ref=e197]: ★
                      - generic [ref=e198]: Adaptive Bank
                    - generic [ref=e199]:
                      - generic [ref=e200]: $98.45
                      - button "ACCEPT" [ref=e201] [cursor=pointer]
                  - generic [ref=e202]:
                    - generic [ref=e204]: Citi
                    - generic [ref=e205]:
                      - generic [ref=e206]: $98.50
                      - button "ACCEPT" [ref=e207] [cursor=pointer]
                  - generic [ref=e208]:
                    - generic [ref=e210]: JP Morgan
                    - generic [ref=e212]: …
                - generic [ref=e214]:
                  - generic [ref=e215]: 120 secs
                  - button "CANCEL" [ref=e217] [cursor=pointer]
          - region "Credit Blotter" [ref=e219]:
            - generic [ref=e220]:
              - tablist [ref=e222]:
                - tab "▤ Credit Blotter 1 trades ⤓ CSV" [selected] [ref=e223] [cursor=pointer]:
                  - generic [ref=e228]:
                    - generic [ref=e229]: ▤ Credit Blotter
                    - generic [ref=e230]: 1 trades
                    - textbox "Quick filter..." [ref=e231]
                    - button "⤓ CSV" [ref=e232]
              - generic [ref=e236]:
                - button "Collapse Credit Blotter" [ref=e237] [cursor=pointer]: —
                - button "Maximize Credit Blotter" [ref=e238] [cursor=pointer]: ⛶
            - tabpanel "▤ Credit Blotter 1 trades ⤓ CSV" [ref=e239]:
              - generic [ref=e243]:
                - table [ref=e245]:
                  - rowgroup [ref=e257]:
                    - row "Trade ID ▽ Status ▽ Trade Date ▽ Direction ▽ Counterparty ▽ CUSIP ▽ Security ▽ Quantity ▽ Order Type ▽ Unit Price ▽" [ref=e258]:
                      - columnheader "Trade ID ▽" [ref=e259] [cursor=pointer]:
                        - generic [ref=e260]: Trade ID
                        - button "▽" [ref=e261]
                      - columnheader "Status ▽" [ref=e262] [cursor=pointer]:
                        - generic [ref=e263]: Status
                        - button "▽" [ref=e264]
                      - columnheader "Trade Date ▽" [ref=e265] [cursor=pointer]:
                        - generic [ref=e266]: Trade Date
                        - button "▽" [ref=e267]
                      - columnheader "Direction ▽" [ref=e268] [cursor=pointer]:
                        - generic [ref=e269]: Direction
                        - button "▽" [ref=e270]
                      - columnheader "Counterparty ▽" [ref=e271] [cursor=pointer]:
                        - generic [ref=e272]: Counterparty
                        - button "▽" [ref=e273]
                      - columnheader "CUSIP ▽" [ref=e274] [cursor=pointer]:
                        - generic [ref=e275]: CUSIP
                        - button "▽" [ref=e276]
                      - columnheader "Security ▽" [ref=e277] [cursor=pointer]:
                        - generic [ref=e278]: Security
                        - button "▽" [ref=e279]
                      - columnheader "Quantity ▽" [ref=e280] [cursor=pointer]:
                        - generic [ref=e281]: Quantity
                        - button "▽" [ref=e282]
                      - columnheader "Order Type ▽" [ref=e283] [cursor=pointer]:
                        - generic [ref=e284]: Order Type
                        - button "▽" [ref=e285]
                      - columnheader "Unit Price ▽" [ref=e286] [cursor=pointer]:
                        - generic [ref=e287]: Unit Price
                        - button "▽" [ref=e288]
                - table [ref=e290]:
                  - rowgroup [ref=e302]:
                    - row "102 Accepted 15-Jun-2025 Sell Citi 037833EK8 AAPL 2.4 30 2,000,000 AON $101.2" [ref=e303]:
                      - cell "102" [ref=e304]
                      - cell "Accepted" [ref=e305]
                      - cell "15-Jun-2025" [ref=e306]
                      - cell "Sell" [ref=e307]
                      - cell "Citi" [ref=e308]
                      - cell "037833EK8" [ref=e309]
                      - cell "AAPL 2.4 30" [ref=e310]
                      - cell "2,000,000" [ref=e311]
                      - cell "AON" [ref=e312]
                      - cell "$101.2" [ref=e313]
      - status [ref=e314]
      - alert [ref=e315]
  - contentinfo [ref=e316]:
    - generic [ref=e319]: Connected
    - generic [ref=e320]: │
    - generic [ref=e321]: TRD-0042
    - generic [ref=e322]: │
    - generic [ref=e323]: JARVIS · Haiku 4.5
    - generic [ref=e324]:
      - generic [ref=e325]:
        - generic [ref=e326]: │
        - generic [ref=e327]: GW
        - generic [ref=e328]: eu-west-1
      - generic [ref=e329]:
        - generic [ref=e330]: │
        - generic [ref=e331]: LAT
        - generic [ref=e332]: 12ms
      - generic [ref=e333]:
        - generic [ref=e334]: │
        - generic [ref=e335]: TPUT
        - generic [ref=e336]: 1.24k/s
      - generic [ref=e337]:
        - generic [ref=e338]: │
        - generic [ref=e339]: FPS
        - generic [ref=e340]: "60"
      - generic [ref=e341]:
        - generic [ref=e342]: │
        - generic [ref=e343]: MEM
        - generic [ref=e344]: 248MB
      - generic [ref=e345]:
        - generic [ref=e346]: │
        - generic [ref=e347]: POS
        - generic [ref=e348]: "8"
      - generic [ref=e349]:
        - generic [ref=e350]: │
        - generic [ref=e351]: P&L
        - generic [ref=e352]: +$17.1k
      - generic [ref=e353]:
        - generic [ref=e354]: │
        - generic [ref=e355]: SES
        - generic [ref=e356]: "1284"
      - generic [ref=e357]: BUILD v4.0.1
      - generic [ref=e358]: │
      - generic [ref=e359]: 09:47:03 UTC
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { goldenPathArray } from "@ui-visual-shared/goldenPath";
  3  | import { scenarioActionFor } from "@ui-visual-shared/scenarioActions";
  4  | import { scenarios } from "@ui-visual-shared/scenarios";
  5  | 
  6  | // Framework-agnostic URL-navigation spec — byte-identical to react's own
  7  | // (../../../../client-react/tests/ui/visual/playwright/visual.spec.ts). Per
  8  | // its README's "porting to another framework" section, this file needs ZERO
  9  | // changes for a port: only the host (./host/) and this config's golden
  10 | // routing differ. Kept as a verbatim copy (not an import) so the two remain
  11 | // independently reviewable and this package never depends on client-react's
  12 | // source at runtime.
  13 | 
  14 | for (const [name, scenario] of Object.entries(scenarios)) {
  15 |   const action = scenarioActionFor(name);
  16 | 
  17 |   test(name, async ({ page }) => {
  18 |     // Theme and view-mode are seeded through the seam (per-fixture data.themeMode /
  19 |     // data.viewMode), so dark/light and chart/price scenarios are deterministic
  20 |     // without any localStorage involvement.
  21 | 
  22 |     // The boot sequence reads prefers-reduced-motion to skip its rAF canvas loop;
  23 |     // emulate it BEFORE navigating so only the deterministic chrome is rendered.
  24 |     if (action.reducedMotion) {
  25 |       await page.emulateMedia({ reducedMotion: "reduce" });
  26 |     }
  27 | 
  28 |     await page.goto(`/?scenario=${encodeURIComponent(name)}`);
  29 | 
  30 |     if (action.click) {
  31 |       await page.getByTestId(action.click).click();
  32 |     }
  33 | 
  34 |     for (const step of action.steps ?? []) {
  35 |       if ("click" in step) {
  36 |         await page.getByTestId(step.click).click();
  37 |       } else if ("type" in step) {
  38 |         await page.getByTestId(step.type).fill(step.text);
  39 |       } else {
  40 |         await page.getByTestId(step.select).selectOption(step.value);
  41 |       }
  42 |     }
  43 | 
  44 |     if (action.waitForText) {
  45 |       await expect(page.getByText(action.waitForText)).toBeVisible();
  46 |     }
  47 | 
  48 |     if (action.assertAriaLabelOf !== undefined) {
  49 |       await expect(page.getByTestId(action.assertAriaLabelOf)).toHaveAttribute(
  50 |         "aria-label",
  51 |         action.expectAriaLabel,
  52 |       );
  53 |     }
  54 | 
  55 |     const shot = goldenPathArray(name, scenario);
  56 |     // Strict scenarios (Scenario.strict) pin at ZERO tolerance, overriding the
  57 |     // config-level maxDiffPixelRatio budget: their pixels are
  58 |     // engine-deterministic, so any diff at all is a real divergence.
  59 |     const strictOpts = scenario.strict
  60 |       ? { maxDiffPixels: 0, maxDiffPixelRatio: 0 }
  61 |       : {};
  62 | 
  63 |     if (action.fullPage) {
> 64 |       await expect(page).toHaveScreenshot(shot, {
     |                          ^ Error: expect(page).toHaveScreenshot(expected) failed
  65 |         animations: "disabled",
  66 |         fullPage: true,
  67 |         ...strictOpts,
  68 |       });
  69 |     } else {
  70 |       await expect(page.getByTestId("scenario-root")).toHaveScreenshot(shot, {
  71 |         animations: "disabled",
  72 |         ...strictOpts,
  73 |       });
  74 |     }
  75 |   });
  76 | }
  77 | 
```