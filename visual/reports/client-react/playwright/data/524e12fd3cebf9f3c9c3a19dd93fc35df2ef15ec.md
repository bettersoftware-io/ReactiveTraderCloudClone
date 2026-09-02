# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> app/equities-dockview__holo3d-dark
- Location: tests/ui/visual/playwright/visual.spec.ts:9:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  6317 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: holo3d-dark/app-equities-dockview.png

Call log:
  - Expect "toHaveScreenshot(holo3d-dark/app-equities-dockview.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 6317 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 6317 pixels (ratio 0.01 of all image pixels) are different.

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
      - button "Credit" [ref=e31] [cursor=pointer]
      - button "Equities" [active] [ref=e32] [cursor=pointer]
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
        - button "Switch to light theme" [ref=e44] [cursor=pointer]: ☀️
        - button "Theme skin" [ref=e46] [cursor=pointer]:
          - generic [ref=e50]: Holo HUD 3D
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
        - generic [ref=e98]:
          - region "Equities" [ref=e100]:
            - generic [ref=e101]:
              - tablist [ref=e103]:
                - tab "Instrument tabs CANDLES LINE AREA SMA 20 EMA 50 RSI MACD LOG VS MSFT NVDA JPM GS XOM 1D 1W 1M 3M TL H-LINE" [selected] [ref=e104] [cursor=pointer]:
                  - generic [ref=e108]:
                    - navigation "Instrument tabs" [ref=e110]:
                      - button "AAPL" [ref=e111]:
                        - text: AAPL
                        - generic [ref=e112]: ✕
                      - button "MSFT" [ref=e113]:
                        - text: MSFT
                        - generic [ref=e114]: ✕
                      - button "JPM" [ref=e115]:
                        - text: JPM
                        - generic [ref=e116]: ✕
                    - generic [ref=e117]:
                      - button "CANDLES" [ref=e118]
                      - button "LINE" [ref=e119]
                      - button "AREA" [ref=e120]
                    - generic [ref=e121]:
                      - button "SMA 20" [ref=e122]
                      - button "EMA 50" [ref=e123]
                      - button "RSI" [ref=e125]
                      - button "MACD" [ref=e126]
                      - button "LOG" [ref=e128]
                    - generic [ref=e129]:
                      - generic [ref=e130]: VS
                      - button "MSFT" [ref=e131]
                      - button "NVDA" [ref=e132]
                      - button "JPM" [ref=e133]
                      - button "GS" [ref=e134]
                      - button "XOM" [ref=e135]
                    - generic [ref=e136]:
                      - button "1D" [ref=e137]
                      - button "1W" [ref=e138]
                      - button "1M" [ref=e139]
                      - button "3M" [ref=e140]
                    - generic [ref=e141]:
                      - button "TL" [ref=e142]
                      - button "H-LINE" [ref=e143]
              - generic [ref=e146]:
                - button "Collapse Equities" [ref=e147] [cursor=pointer]: —
                - button "Maximize Equities" [ref=e148] [cursor=pointer]: ⛶
            - tabpanel "Instrument tabs CANDLES LINE AREA SMA 20 EMA 50 RSI MACD LOG VS MSFT NVDA JPM GS XOM 1D 1W 1M 3M TL H-LINE" [ref=e149]:
              - generic [ref=e153]:
                - generic [ref=e154]:
                  - generic [ref=e155]:
                    - generic [ref=e156]: AAPL
                    - generic [ref=e157]: Apple Inc. · NASDAQ
                  - generic [ref=e158]:
                    - generic [ref=e159]: "178.50"
                    - generic [ref=e160]: +5.95 (+3.45%)
                  - generic [ref=e161]:
                    - generic [ref=e162]:
                      - generic [ref=e163]: BID
                      - generic [ref=e164]: "178.40"
                    - generic [ref=e165]:
                      - generic [ref=e166]: ASK
                      - generic [ref=e167]: "178.60"
                    - generic [ref=e168]:
                      - generic [ref=e169]: DAY RANGE
                      - generic [ref=e170]: 164.20 – 181.50
                    - generic [ref=e171]:
                      - generic [ref=e172]: VOL
                      - generic [ref=e173]: 2.6M
                - generic [ref=e174]:
                  - application "Price chart" [ref=e175]:
                    - img [ref=e260]
                    - generic [ref=e261]: "180.00"
                    - generic [ref=e262]: "175.00"
                    - generic [ref=e263]: "170.00"
                    - generic [ref=e264]: "165.00"
                  - generic [ref=e306]:
                    - generic [ref=e307]: 06:00
                    - generic [ref=e308]: 06:00
                    - generic [ref=e309]: 06:01
                    - generic [ref=e310]: 06:01
                  - group "Chart navigator" [ref=e311]:
                    - img [ref=e312]
          - region "Orders & Positions" [ref=e318]:
            - generic [ref=e319]:
              - tablist [ref=e321]:
                - tab "▤ Orders ◴ Positions 5 orders" [selected] [ref=e322] [cursor=pointer]:
                  - generic [ref=e326]:
                    - button "▤ Orders" [ref=e327]
                    - button "◴ Positions" [ref=e328]
                    - generic [ref=e329]: 5 orders
              - generic [ref=e332]:
                - button "Collapse Orders & Positions" [ref=e333] [cursor=pointer]: —
                - button "Maximize Orders & Positions" [ref=e334] [cursor=pointer]: ⛶
            - tabpanel "▤ Orders ◴ Positions 5 orders" [ref=e335]:
              - generic [ref=e339]:
                - generic [ref=e340]:
                  - generic [ref=e341]: Time
                  - generic [ref=e342]: Symbol
                  - generic [ref=e343]: Side
                  - generic [ref=e344]: Type
                  - generic [ref=e345]: Qty
                  - generic [ref=e346]: Price
                  - generic [ref=e347]: Status
                - generic [ref=e348]:
                  - generic [ref=e349]: 15:06:40
                  - generic [ref=e350]: AAPL
                  - generic [ref=e351]: Buy
                  - generic [ref=e352]: Market
                  - generic [ref=e353]: "100"
                  - generic [ref=e354]: $178.50
                  - generic [ref=e355]: Filled
                - generic [ref=e356]:
                  - generic [ref=e357]: 15:06:41
                  - generic [ref=e358]: MSFT
                  - generic [ref=e359]: Sell
                  - generic [ref=e360]: Limit
                  - generic [ref=e361]: "50"
                  - generic [ref=e362]: $421.00
                  - generic [ref=e363]: Working
                - generic [ref=e364]:
                  - generic [ref=e365]: 15:06:42
                  - generic [ref=e366]: JPM
                  - generic [ref=e367]: Buy
                  - generic [ref=e368]: Market
                  - generic [ref=e369]: 80/200
                  - generic [ref=e370]: $197.50
                  - generic [ref=e371]: Partial
                - generic [ref=e372]:
                  - generic [ref=e373]: 15:06:43
                  - generic [ref=e374]: GS
                  - generic [ref=e375]: Buy
                  - generic [ref=e376]: Market
                  - generic [ref=e377]: "75"
                  - generic [ref=e378]: —
                  - generic [ref=e379]: Rejected
                - generic [ref=e380]:
                  - generic [ref=e381]: 15:06:44
                  - generic [ref=e382]: XOM
                  - generic [ref=e383]: Sell
                  - generic [ref=e384]: Market
                  - generic [ref=e385]: "150"
                  - generic [ref=e386]: —
                  - generic [ref=e387]: Working
        - generic [ref=e393]:
          - region "Order Ticket" [ref=e395]:
            - generic [ref=e396]:
              - tablist [ref=e398]:
                - tab "✚ Order Ticket" [selected] [ref=e399] [cursor=pointer]:
                  - generic [ref=e404]: ✚ Order Ticket
              - generic [ref=e407]:
                - button "Collapse Order Ticket" [ref=e408] [cursor=pointer]: —
                - button "Maximize Order Ticket" [ref=e409] [cursor=pointer]: ⛶
            - tabpanel "✚ Order Ticket" [ref=e410]:
              - generic [ref=e413]:
                - generic [ref=e414]:
                  - button "BUY" [ref=e415] [cursor=pointer]
                  - button "SELL" [ref=e416] [cursor=pointer]
                - generic [ref=e417]: ORDER TYPE
                - generic [ref=e418]:
                  - button "MARKET" [ref=e419] [cursor=pointer]
                  - button "LIMIT" [ref=e420] [cursor=pointer]
                - generic [ref=e421]: QUANTITY
                - generic [ref=e422]:
                  - button "−" [ref=e423] [cursor=pointer]
                  - spinbutton [ref=e424]
                  - button "+" [ref=e425] [cursor=pointer]
                - generic [ref=e426]:
                  - generic [ref=e427]:
                    - generic [ref=e428]: Est. Cost
                    - generic [ref=e429]: $0
                  - generic [ref=e430]:
                    - generic [ref=e431]: Buying Power
                    - generic [ref=e432]: $250,000
                  - generic [ref=e433]:
                    - generic [ref=e434]: Time in Force
                    - generic [ref=e435]: Day
                - button "BUY AAPL" [ref=e436] [cursor=pointer]
          - region "Watchlist" [ref=e438]:
            - generic [ref=e439]:
              - tablist [ref=e441]:
                - tab "☰ Watchlist % CHG" [selected] [ref=e442] [cursor=pointer]:
                  - generic [ref=e446]:
                    - generic [ref=e447]: ☰ Watchlist
                    - button "% CHG" [ref=e448]: ⇅ % CHG
              - generic [ref=e451]:
                - button "Collapse Watchlist" [ref=e452] [cursor=pointer]: —
                - button "Maximize Watchlist" [ref=e453] [cursor=pointer]: ⛶
            - tabpanel "☰ Watchlist % CHG" [ref=e454]:
              - generic [ref=e457]:
                - button "NVDA NVIDIA Corp. 875.50 +7.21%" [ref=e458] [cursor=pointer]:
                  - generic [ref=e459]:
                    - generic [ref=e460]: NVDA
                    - generic [ref=e461]: NVIDIA Corp.
                  - generic [ref=e462]:
                    - generic [ref=e463]: "875.50"
                    - generic [ref=e464]: +7.21%
                - button "XOM ExxonMobil Corp. 114.30 +5.12%" [ref=e465] [cursor=pointer]:
                  - generic [ref=e466]:
                    - generic [ref=e467]: XOM
                    - generic [ref=e468]: ExxonMobil Corp.
                  - generic [ref=e469]:
                    - generic [ref=e470]: "114.30"
                    - generic [ref=e471]: +5.12%
                - button "AAPL Apple Inc. 178.50 +3.45%" [ref=e472] [cursor=pointer]:
                  - generic [ref=e473]:
                    - generic [ref=e474]: AAPL
                    - generic [ref=e475]: Apple Inc.
                  - generic [ref=e476]:
                    - generic [ref=e477]: "178.50"
                    - generic [ref=e478]: +3.45%
                - button "MSFT Microsoft Corp. 421.20 +1.23%" [ref=e479] [cursor=pointer]:
                  - generic [ref=e480]:
                    - generic [ref=e481]: MSFT
                    - generic [ref=e482]: Microsoft Corp.
                  - generic [ref=e483]:
                    - generic [ref=e484]: "421.20"
                    - generic [ref=e485]: +1.23%
                - button "GS Goldman Sachs 463.00 -0.88%" [ref=e486] [cursor=pointer]:
                  - generic [ref=e487]:
                    - generic [ref=e488]: GS
                    - generic [ref=e489]: Goldman Sachs
                  - generic [ref=e490]:
                    - generic [ref=e491]: "463.00"
                    - generic [ref=e492]: "-0.88%"
                - button "JPM JPMorgan Chase 197.50 -2.67%" [ref=e493] [cursor=pointer]:
                  - generic [ref=e494]:
                    - generic [ref=e495]: JPM
                    - generic [ref=e496]: JPMorgan Chase
                  - generic [ref=e497]:
                    - generic [ref=e498]: "197.50"
                    - generic [ref=e499]: "-2.67%"
      - status [ref=e500]
      - alert [ref=e501]
  - contentinfo [ref=e502]:
    - generic [ref=e505]: Connected
    - generic [ref=e506]: │
    - generic [ref=e507]: TRD-0042
    - generic [ref=e508]: │
    - generic [ref=e509]: JARVIS · Haiku 4.5
    - generic [ref=e510]:
      - generic [ref=e511]:
        - generic [ref=e512]: │
        - generic [ref=e513]: GW
        - generic [ref=e514]: eu-west-1
      - generic [ref=e515]:
        - generic [ref=e516]: │
        - generic [ref=e517]: LAT
        - generic [ref=e518]: 12ms
      - generic [ref=e519]:
        - generic [ref=e520]: │
        - generic [ref=e521]: TPUT
        - generic [ref=e522]: 1.24k/s
      - generic [ref=e523]:
        - generic [ref=e524]: │
        - generic [ref=e525]: FPS
        - generic [ref=e526]: "60"
      - generic [ref=e527]:
        - generic [ref=e528]: │
        - generic [ref=e529]: MEM
        - generic [ref=e530]: 248MB
      - generic [ref=e531]:
        - generic [ref=e532]: │
        - generic [ref=e533]: POS
        - generic [ref=e534]: "8"
      - generic [ref=e535]:
        - generic [ref=e536]: │
        - generic [ref=e537]: P&L
        - generic [ref=e538]: +$17.1k
      - generic [ref=e539]:
        - generic [ref=e540]: │
        - generic [ref=e541]: SES
        - generic [ref=e542]: "1284"
      - generic [ref=e543]: BUILD v4.0.1
      - generic [ref=e544]: │
      - generic [ref=e545]: 09:47:03 UTC
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
  48 |     // Strict scenarios (Scenario.strict) pin at ZERO tolerance, overriding the
  49 |     // config-level maxDiffPixelRatio budget: their pixels are
  50 |     // engine-deterministic, so any diff at all is a real divergence.
  51 |     const strictOpts = scenario.strict
  52 |       ? { maxDiffPixels: 0, maxDiffPixelRatio: 0 }
  53 |       : {};
  54 | 
  55 |     if (action.fullPage) {
> 56 |       await expect(page).toHaveScreenshot(shot, {
     |                          ^ Error: expect(page).toHaveScreenshot(expected) failed
  57 |         animations: "disabled",
  58 |         fullPage: true,
  59 |         ...strictOpts,
  60 |       });
  61 |     } else {
  62 |       await expect(page.getByTestId("scenario-root")).toHaveScreenshot(shot, {
  63 |         animations: "disabled",
  64 |         ...strictOpts,
  65 |       });
  66 |     }
  67 |   });
  68 | }
  69 | 
```