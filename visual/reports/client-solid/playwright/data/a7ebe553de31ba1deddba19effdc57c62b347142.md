# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> app/equities__terminal3d-dark
- Location: tests/ui/visual/playwright/visual.spec.ts:17:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  726 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: terminal3d-dark/app-equities.png

Call log:
  - Expect "toHaveScreenshot(terminal3d-dark/app-equities.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 726 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 726 pixels (ratio 0.01 of all image pixels) are different.

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
          - generic [ref=e50]: Terminal 3D
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
  - main [ref=e73]:
    - generic [ref=e74]:
      - generic [ref=e76]:
        - generic [ref=e78]:
          - generic [ref=e79]:
            - generic [ref=e81]:
              - navigation "Instrument tabs" [ref=e83]:
                - button "AAPL" [ref=e84] [cursor=pointer]:
                  - text: AAPL
                  - generic [ref=e85]: ✕
                - button "MSFT" [ref=e86] [cursor=pointer]:
                  - text: MSFT
                  - generic [ref=e87]: ✕
                - button "JPM" [ref=e88] [cursor=pointer]:
                  - text: JPM
                  - generic [ref=e89]: ✕
              - generic [ref=e90]:
                - button "CANDLES" [ref=e91] [cursor=pointer]
                - button "LINE" [ref=e92] [cursor=pointer]
                - button "AREA" [ref=e93] [cursor=pointer]
              - generic [ref=e94]:
                - button "SMA 20" [ref=e95] [cursor=pointer]
                - button "EMA 50" [ref=e96] [cursor=pointer]
                - button "RSI" [ref=e98] [cursor=pointer]
                - button "MACD" [ref=e99] [cursor=pointer]
                - button "LOG" [ref=e101] [cursor=pointer]
              - generic [ref=e102]:
                - button "1D" [ref=e103] [cursor=pointer]
                - button "1W" [ref=e104] [cursor=pointer]
                - button "1M" [ref=e105] [cursor=pointer]
                - button "3M" [ref=e106] [cursor=pointer]
              - generic [ref=e107]:
                - button "TL" [ref=e108] [cursor=pointer]
                - button "H-LINE" [ref=e109] [cursor=pointer]
            - generic [ref=e110]:
              - button "Collapse Equities" [ref=e111] [cursor=pointer]: —
              - button "Maximize Equities" [ref=e112] [cursor=pointer]: ⛶
          - generic [ref=e115]:
            - generic [ref=e116]:
              - generic [ref=e117]:
                - generic [ref=e118]: AAPL
                - generic [ref=e119]: Apple Inc. · NASDAQ
              - generic [ref=e120]:
                - generic [ref=e121]: "178.50"
                - generic [ref=e122]: +5.95 (+3.45%)
              - generic [ref=e123]:
                - generic [ref=e124]:
                  - generic [ref=e125]: BID
                  - generic [ref=e126]: "178.40"
                - generic [ref=e127]:
                  - generic [ref=e128]: ASK
                  - generic [ref=e129]: "178.60"
                - generic [ref=e130]:
                  - generic [ref=e131]: DAY RANGE
                  - generic [ref=e132]: 164.20 – 181.50
                - generic [ref=e133]:
                  - generic [ref=e134]: VOL
                  - generic [ref=e135]: 2.6M
            - generic [ref=e136]:
              - application "Price chart" [ref=e137]:
                - generic [ref=e142]: "180.00"
                - generic [ref=e143]: "175.00"
                - generic [ref=e144]: "170.00"
                - generic [ref=e145]: "165.00"
                - img [ref=e226]
              - generic [ref=e268]:
                - generic [ref=e269]: 06:00
                - generic [ref=e270]: 06:00
                - generic [ref=e271]: 06:01
                - generic [ref=e272]: 06:01
              - group "Chart navigator" [ref=e273]:
                - img [ref=e274]
        - separator [ref=e279]
        - generic [ref=e281]:
          - generic [ref=e282]:
            - generic [ref=e284]:
              - button "▤ Orders" [ref=e285] [cursor=pointer]
              - button "◴ Positions" [ref=e286] [cursor=pointer]
              - generic [ref=e287]: 5 orders
            - generic [ref=e288]:
              - button "Collapse Orders & Positions" [ref=e289] [cursor=pointer]: —
              - button "Maximize Orders & Positions" [ref=e290] [cursor=pointer]: ⛶
          - generic [ref=e293]:
            - generic [ref=e294]:
              - generic [ref=e295]: Time
              - generic [ref=e296]: Symbol
              - generic [ref=e297]: Side
              - generic [ref=e298]: Type
              - generic [ref=e299]: Qty
              - generic [ref=e300]: Price
              - generic [ref=e301]: Status
            - generic [ref=e302]:
              - generic [ref=e303]: 15:06:40
              - generic [ref=e304]: AAPL
              - generic [ref=e305]: Buy
              - generic [ref=e306]: Market
              - generic [ref=e307]: "100"
              - generic [ref=e308]: $178.50
              - generic [ref=e309]: Filled
            - generic [ref=e310]:
              - generic [ref=e311]: 15:06:41
              - generic [ref=e312]: MSFT
              - generic [ref=e313]: Sell
              - generic [ref=e314]: Limit
              - generic [ref=e315]: "50"
              - generic [ref=e316]: $421.00
              - generic [ref=e317]: Working
            - generic [ref=e318]:
              - generic [ref=e319]: 15:06:42
              - generic [ref=e320]: JPM
              - generic [ref=e321]: Buy
              - generic [ref=e322]: Market
              - generic [ref=e323]: 80/200
              - generic [ref=e324]: $197.50
              - generic [ref=e325]: Partial
            - generic [ref=e326]:
              - generic [ref=e327]: 15:06:43
              - generic [ref=e328]: GS
              - generic [ref=e329]: Buy
              - generic [ref=e330]: Market
              - generic [ref=e331]: "75"
              - generic [ref=e332]: —
              - generic [ref=e333]: Rejected
            - generic [ref=e334]:
              - generic [ref=e335]: 15:06:44
              - generic [ref=e336]: XOM
              - generic [ref=e337]: Sell
              - generic [ref=e338]: Market
              - generic [ref=e339]: "150"
              - generic [ref=e340]: —
              - generic [ref=e341]: Working
      - separator [ref=e342]
      - generic [ref=e344]:
        - generic [ref=e346]:
          - generic [ref=e347]:
            - generic [ref=e350] [cursor=pointer]: ✚ Order Ticket
            - generic [ref=e351]:
              - button "Collapse Order Ticket" [ref=e352] [cursor=pointer]: —
              - button "Maximize Order Ticket" [ref=e353] [cursor=pointer]: ⛶
          - generic [ref=e355]:
            - generic [ref=e356]:
              - button "BUY" [ref=e357] [cursor=pointer]
              - button "SELL" [ref=e358] [cursor=pointer]
            - generic [ref=e359]: ORDER TYPE
            - generic [ref=e360]:
              - button "MARKET" [ref=e361] [cursor=pointer]
              - button "LIMIT" [ref=e362] [cursor=pointer]
            - generic [ref=e363]: QUANTITY
            - generic [ref=e364]:
              - button "−" [ref=e365] [cursor=pointer]
              - spinbutton [ref=e366]
              - button "+" [ref=e367] [cursor=pointer]
            - generic [ref=e368]:
              - generic [ref=e369]:
                - generic [ref=e370]: Est. Cost
                - generic [ref=e371]: $0
              - generic [ref=e372]:
                - generic [ref=e373]: Buying Power
                - generic [ref=e374]: $250,000
              - generic [ref=e375]:
                - generic [ref=e376]: Time in Force
                - generic [ref=e377]: Day
            - button "BUY AAPL" [ref=e378] [cursor=pointer]
        - separator [ref=e379]
        - generic [ref=e381]:
          - generic [ref=e382]:
            - generic [ref=e384]:
              - generic [ref=e385] [cursor=pointer]: ☰ Watchlist
              - button "% CHG" [ref=e386] [cursor=pointer]: ⇅ % CHG
            - generic [ref=e387]:
              - button "Collapse Watchlist" [ref=e388] [cursor=pointer]: —
              - button "Maximize Watchlist" [ref=e389] [cursor=pointer]: ⛶
          - generic [ref=e391]:
            - button "NVDA NVIDIA Corp. 875.50 +7.21%" [ref=e392] [cursor=pointer]:
              - generic [ref=e393]:
                - generic [ref=e394]: NVDA
                - generic [ref=e395]: NVIDIA Corp.
              - generic [ref=e396]:
                - generic [ref=e397]: "875.50"
                - generic [ref=e398]: +7.21%
            - button "XOM ExxonMobil Corp. 114.30 +5.12%" [ref=e399] [cursor=pointer]:
              - generic [ref=e400]:
                - generic [ref=e401]: XOM
                - generic [ref=e402]: ExxonMobil Corp.
              - generic [ref=e403]:
                - generic [ref=e404]: "114.30"
                - generic [ref=e405]: +5.12%
            - button "AAPL Apple Inc. 178.50 +3.45%" [ref=e406] [cursor=pointer]:
              - generic [ref=e407]:
                - generic [ref=e408]: AAPL
                - generic [ref=e409]: Apple Inc.
              - generic [ref=e410]:
                - generic [ref=e411]: "178.50"
                - generic [ref=e412]: +3.45%
            - button "MSFT Microsoft Corp. 421.20 +1.23%" [ref=e413] [cursor=pointer]:
              - generic [ref=e414]:
                - generic [ref=e415]: MSFT
                - generic [ref=e416]: Microsoft Corp.
              - generic [ref=e417]:
                - generic [ref=e418]: "421.20"
                - generic [ref=e419]: +1.23%
            - button "GS Goldman Sachs 463.00 -0.88%" [ref=e420] [cursor=pointer]:
              - generic [ref=e421]:
                - generic [ref=e422]: GS
                - generic [ref=e423]: Goldman Sachs
              - generic [ref=e424]:
                - generic [ref=e425]: "463.00"
                - generic [ref=e426]: "-0.88%"
            - button "JPM JPMorgan Chase 197.50 -2.67%" [ref=e427] [cursor=pointer]:
              - generic [ref=e428]:
                - generic [ref=e429]: JPM
                - generic [ref=e430]: JPMorgan Chase
              - generic [ref=e431]:
                - generic [ref=e432]: "197.50"
                - generic [ref=e433]: "-2.67%"
  - contentinfo [ref=e434]:
    - generic [ref=e437]: Connected
    - generic [ref=e438]: │
    - generic [ref=e439]: TRD-0042
    - generic [ref=e440]: │
    - generic [ref=e441]: JARVIS · Haiku 4.5
    - generic [ref=e442]:
      - generic [ref=e443]:
        - generic [ref=e444]: │
        - generic [ref=e445]: GW
        - generic [ref=e446]: eu-west-1
      - generic [ref=e447]:
        - generic [ref=e448]: │
        - generic [ref=e449]: LAT
        - generic [ref=e450]: 12ms
      - generic [ref=e451]:
        - generic [ref=e452]: │
        - generic [ref=e453]: TPUT
        - generic [ref=e454]: 1.24k/s
      - generic [ref=e455]:
        - generic [ref=e456]: │
        - generic [ref=e457]: FPS
        - generic [ref=e458]: "60"
      - generic [ref=e459]:
        - generic [ref=e460]: │
        - generic [ref=e461]: MEM
        - generic [ref=e462]: 248MB
      - generic [ref=e463]:
        - generic [ref=e464]: │
        - generic [ref=e465]: POS
        - generic [ref=e466]: "8"
      - generic [ref=e467]:
        - generic [ref=e468]: │
        - generic [ref=e469]: P&L
        - generic [ref=e470]: +$17.1k
      - generic [ref=e471]:
        - generic [ref=e472]: │
        - generic [ref=e473]: SES
        - generic [ref=e474]: "1284"
      - generic [ref=e475]: BUILD v4.0.1
      - generic [ref=e476]: │
      - generic [ref=e477]: 09:47:03 UTC
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
  56 | 
  57 |     if (action.fullPage) {
> 58 |       await expect(page).toHaveScreenshot(shot, {
     |                          ^ Error: expect(page).toHaveScreenshot(expected) failed
  59 |         animations: "disabled",
  60 |         fullPage: true,
  61 |       });
  62 |     } else {
  63 |       await expect(page.getByTestId("scenario-root")).toHaveScreenshot(shot, {
  64 |         animations: "disabled",
  65 |       });
  66 |     }
  67 |   });
  68 | }
  69 | 
```