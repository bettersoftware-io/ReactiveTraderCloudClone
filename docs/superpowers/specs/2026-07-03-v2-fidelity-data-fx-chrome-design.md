# v2 Fidelity Iteration — Demo-Data Realism, FX Right Column, Chrome (Design)

**Date:** 2026-07-03
**Status:** Approved (design approved in-session; spec pending user review)
**Pixel/data source of truth (PROTO):** `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html` (line refs below are into this file)
**Prior art:** flagship slice (`docs/superpowers/specs/2026-07-02-v2-fidelity-flagship-fx-design.md`, PR #88), 3d skins (`docs/superpowers/specs/2026-07-03-v2-3d-skins-design.md`, PR #100)

## 1. Purpose

A live side-by-side of the deployed app (rtc-clone.vercel.app) against the deployed v2 prototype (rtc-clone-cd-proto.vercel.app) showed the "prototype looks much better" gap is **not** skin tokens — it is structural and data-driven. This slice closes the two highest-leverage cross-cutting gaps:

- **(a) Demo-data realism**: the pricing simulator emits wrong-scale rates (EUR/USD ≈ 3.08, USD/JPY ≈ 9.96) because `generateInitialMid()` returns `Math.random() * 10`; every blotter/RFQ/event stream starts empty, so most screens render empty states.
- **(b) FX right column + chrome fidelity**: the FX right column is one ~895px-wide Analytics panel (duplicated title, raw `-1,499` PnL, overlapping exposure bubbles) instead of the prototype's fixed **360px** rail holding **two** panels (Analytics + Positions); nav casing/pill, panel-head tabs, boot log, and tile details diverge.

Per-module restructures (Equities, Admin, Credit screens) are later slices.

## 2. Scope

**In scope**
- Domain: per-pair base mid rates + pip-unit-scaled spread/step in `PricingSimulator`; seed rows in `TradeStoreSimulator`, `CreditRfqSimulator`, `EventLogSimulator`; rescaled `AnalyticsSimulator` positions; `formatPnlHeadline` k-formatter.
- client-react FX screen: right rail fixed at 360px with two panels (`fx-analytics` + new `fx-positions`); AnalyticsPanel restyle; new PositionsPanel.
- client-react chrome: uppercase nav + outlined active pill; panel-head tab slot (Live Rates/Watchlist + CHARTS toggle; FX Blotter/Activity + count + filter + CSV chip); boot-log lines; header right-cluster parity (hexagon avatar + user dropdown, EN selector, LIVE/PROD styles); status-bar label fixes.
- client-react FX tile: tight-left pair title, sparkline opacity, notional text-align.
- Tests: domain updates + seeds tests; UI contract specs; **both golden sets regenerated, all three tiers**.

**Out of scope**
- Functional Watchlist and Activity views (tabs render a styled placeholder; real views are a follow-up slice).
- Equities/Admin/Credit per-module fidelity restructures; preferences-catalogue parity.
- RN visual work (RN inherits data realism automatically through domain; no RN UI changes).
- Server wire-format changes (seeds flow through existing SoW/snapshot mechanisms).

## 3. §1 Realistic rates (domain)

### 3.1 `CurrencyPairMeta` gains two fields

`packages/domain/src/fx/currencyPair.ts` (`KNOWN_CURRENCY_PAIRS`, lines 22–95): add `baseMid: number` and `typicalSpreadPips: number` to every entry. Values (PROTO `baseRates` L804 + `meta.spread` L750–755, verbatim; EURCAD/EURAUD are cross-derived because PROTO lacks them):

| Symbol | baseMid | typicalSpreadPips | Source |
|---|---|---|---|
| EURUSD | 1.09213 | 1.4 | PROTO |
| GBPUSD | 1.26414 | 1.8 | PROTO |
| USDJPY | 151.203 | 1.6 | PROTO |
| EURJPY | 165.142 | 2.1 | PROTO |
| GBPJPY | 191.085 | 2.6 | PROTO |
| AUDUSD | 0.66121 | 2.0 | PROTO |
| NZDUSD | 0.61054 | 2.4 | PROTO |
| EURCAD | 1.49385 | 2.2 | = EURUSD × USDCAD (1.09213 × 1.36782); spread from PROTO USDCAD |
| EURAUD | 1.65172 | 2.0 | = EURUSD ÷ AUDUSD (1.09213 / 0.66121); spread mirrors AUDUSD |

### 3.2 `PricingSimulator` uses them

`packages/domain/src/simulators/PricingSimulator.ts`:
- **Initial mid** = the pair's `baseMid` exactly (delete `generateInitialMid()`, L27–29). Seeded 90-point history keeps its existing noise mechanism but centers on `baseMid` (PROTO seeds history at ±0.15% around base, L805 — matching that magnitude is acceptable; do not exceed it).
- **Pip unit** `pu = 10^-pipsPosition` (0.01 for JPY pairs, 0.0001 otherwise — same rule as PROTO L1265).
- **Half-spread** = `typicalSpreadPips / 2 × pu` (replaces flat `HALF_SPREAD = 0.0002`, L18, which is ~19 pips wrong on JPY pairs).
- **Random-walk step** = `(random − 0.5) × stepSize` where `stepSize = 1.8 × pu` for 4-pip-position pairs and `2 × pu` for JPY pairs (PROTO `tick()` L1132: 0.00018 / 0.02). Mids stay positive and round to `ratePrecision`.
- RFQ quote spread keeps its existing relationship to the normal spread (PROTO uses ×1.4, L1153 — align if the current code differs).

This one change fixes the deployed in-browser simulator (`createSimulatorPorts` via `packages/client-core/src/adapters/portFactory.ts:138`), the WS server (`packages/server/src/services/serviceContainer.ts:38-39`), and RN — all instantiate the same `PricingSimulator`.

## 4. §2 Seeded demo state (domain, PROTO-verbatim)

Seeding follows the existing `AnalyticsSimulator.STATIC_POSITIONS` precedent: constants in the simulator module, emitted as the initial snapshot/state-of-the-world, live behavior appends on top. Dates are computed relative to "now" at simulator construction (PROTO `_seedFx` day offsets, L834).

### 4.1 FX blotter — `TradeStoreSimulator`

`packages/domain/src/simulators/TradeStoreSimulator.ts` (today: `trades = new Map()` empty). Seed 5 trades (PROTO L818, verbatim; rate = pair `baseMid`):

| id | status | direction | symbol | dealt | notional | rate | trader | tradeDate offset (days) |
|---|---|---|---|---|---|---|---|---|
| 1042 | Done | Buy | EURUSD | EUR | 1,000,000 | 1.09213 | A.Stark | −3 |
| 1041 | Done | Sell | USDJPY | USD | 2,000,000 | 151.203 | A.Stark | −3 |
| 1040 | Rejected | Buy | GBPUSD | GBP | 500,000 | 1.26414 | N.Romanoff | −4 |
| 1039 | Done | Sell | EURJPY | EUR | 1,500,000 | 165.142 | S.Rogers | −5 |
| 1038 | Done | Buy | AUDUSD | AUD | 3,000,000 | 0.66121 | B.Banner | −6 |

Value date = trade date + 2 days (PROTO `_fmtDate(off+2)`). New live trades continue the id sequence from 1043 (PROTO `fxSeq = 1043`, L784). Map the trader field onto whatever the domain `Trade` entity supports; if `Trade` has no trader field today, add it (the prototype's blotter displays a TRADER column and the later blotter-fidelity work needs it).

### 4.2 Credit — `CreditRfqSimulator`

`packages/domain/src/simulators/CreditRfqSimulator.ts` (today: empty SoW). Seed 2 terminal RFQs (PROTO L820/L835) and 2 credit trades (PROTO L821):

- **RFQ 238** — state Closed/accepted, direction Buy, instrument **MSFT 3.3 02/27** (cusip 594918BV5, ref 99.8), qty 3,500,000, accepted dealer **Citi** at price **99.80**; the other three dealer quotes are priced around 99.8 (PROTO randomizes ±0.5 — deterministic fixed values in that band are preferred over randomness, e.g. 99.47 / 99.54 / 100.27 for Adaptive Bank / JP Morgan / Goldman Sachs).
- **RFQ 237** — state Cancelled, direction Sell, instrument **TSLA 5.3 08/25** (cusip 88160RAG6, ref 100.6), qty 2,000,000, all four dealer quotes `passed`.
- **Credit blotter trades:** id 238 Done Buy Citi MSFT 3.3 02/27 qty 3,500,000 AON $99.8 (date −2d); id 235 Done Sell Goldman Sachs **AAPL 2.4 08/30** (cusip 037833DX5) qty 2,000,000 AON $101.2 (date −6d).
- New RFQs continue from id 240 (PROTO `creditSeq = 240`).

**Catalogue replacement (resolved):** the app's existing catalogues (`InstrumentSimulator`: "MSFT 4.111 10/10/2024"-style names; `DealerSimulator`: "J.P. Morgan", "Citigroup", …) do not match PROTO, and both are user-visible (RFQ cards, counterparty checklist). Replace them with PROTO's verbatim:

Dealers (PROTO L757, in this order): Adaptive Bank, Citi, JP Morgan, Goldman Sachs, Morgan Stanley, Barclays, RBC, HSBC, Deutsche Bank. (PROTO gives Adaptive Bank an accent highlight and a ~0.18 better quote bias, L1169 — carry the quote bias into the RFQ quote simulator if it has a per-dealer hook; the accent styling belongs to the later credit-module slice.)

Instruments (PROTO L758–763):

| ticker | name | cusip | ref price |
|---|---|---|---|
| AAPL 2.4 08/30 | Apple Inc | 037833DX5 | 98.4 |
| MSFT 3.3 02/27 | Microsoft Corp | 594918BV5 | 99.8 |
| AMZN 4.05 08/47 | Amazon.com Inc | 023135BW5 | 96.2 |
| GOOGL 1.1 08/30 | Alphabet Inc | 02079KAC1 | 91.5 |
| TSLA 5.3 08/25 | Tesla Inc | 88160RAG6 | 100.6 |
| UST 4.0 11/34 | US Treasury 10Y | 91282CFP1 | 98.9 |
| VZ 4.5 08/33 | Verizon Comms | 92343VGE9 | 97.3 |
| KO 1.45 06/27 | Coca-Cola Co | 191216DA5 | 93.7 |

Existing tests pinning old catalogue entries update alongside. RN's credit screen consumes these via domain — data-only change, no RN code edits.

### 4.3 Admin events — `EventLogSimulator`

`packages/domain/src/simulators/EventLogSimulator.ts` (today: PRNG generates over time, empty snapshot). Pre-populate the initial snapshot with PROTO `seedEvents` (L796–803), timestamps back-dated relative to now (roughly minute-spaced, oldest last):

| severity | service | message |
|---|---|---|
| INFO | analytics | Snapshot recomputed in 38ms |
| WARN | refdata | Latency 48ms exceeds 40ms SLO |
| ERROR | refdata | Upstream timeout · retry 1/3 scheduled |
| INFO | pricing | Subscribed 8 instruments |
| INFO | execution | Gateway handshake complete |
| INFO | kernel | Secure enclave mounted · AES-256 |

Live PRNG events append after the seed.

### 4.4 Analytics — `AnalyticsSimulator`

`packages/domain/src/simulators/AnalyticsSimulator.ts`: rescale `STATIC_POSITIONS` (L15–40) to PROTO magnitudes so the live-derived outputs land in prototype-looking ranges (PROTO bubbles L1300, bars L1302):

- **Net exposure by currency (millions):** EUR +15.2M, USD −22.8M, JPY +8.4M, GBP −6.1M, AUD +4.7M, CAD −3.2M, NZD +2.1M.
- **Per-pair basePnl** tuned so PnL-per-pair bars read ≈ EURUSD +13k, USDJPY −4k, GBPUSD +9k, AUDUSD +6k, EURCAD −2k, EURJPY +5k (PROTO shows USDCAD −2k; the app's ninth-pair set maps that magnitude onto EURCAD; remaining pairs may be small/zero).
- **Headline PnL seed** ≈ +17,120 (PROTO `pnl: 17120`, L816) instead of the current random start; existing drift behavior stays.

Positions/PnL remain **live-derived** — this slice tunes seeds, it does not copy PROTO's static render arrays.

### 4.5 Headline formatter — new domain function

`packages/domain/src/analytics/formatPnlHeadline.ts` (new, next to `formatPnlValue.ts`):

```ts
formatPnlHeadline(pnl: number): string
// (pnl >= 0 ? "+" : "-") + "$" + (Math.abs(pnl) / 1000).toFixed(1) + "k"
// 17120 → "+$17.1k"; -1499 → "-$1.5k"    (PROTO L1299, verbatim rule)
```

`formatPnlValue` stays for other call sites; only the FX Analytics headline (and the status-bar P&L segment, §6.4) switch to the headline format.

## 5. §3 FX right column — two panels in a 360px rail

**Measured root cause:** PROTO's aside is `width: 360px; flex: 0 0 auto` (live-measured on the deployed prototype); the app's analytics cell flexes to ~895px at the same viewport. The tile grid CSS is **identical** in both (`repeat(auto-fill, minmax(300px, 1fr))`) — fixing the rail width restores the tile column count; **no grid change**.

### 5.1 Layout (composition root, per ADR-004 §2c)

- `packages/client-core/src/layout/defaultLayoutPort.ts`: FX layout's right rail becomes fixed-width 360px and stacks **two** panels: `fx-analytics` (title "Analytics") over **new `fx-positions`** (title "Positions"). Express the fixed width through the layout engine's sizing mechanism (plan-time: verify how `InhouseLayoutEngine` encodes fixed vs flex cells; the flagship's flex-grow×1000 quirk lives here).
- `packages/client-react/src/ui/shell/layout/engine/appPanelRegistry.tsx`: register `fx-positions` → `PositionsPanel`.
- Panel collapse/maximize chrome behaves like every other panel (engine-provided).

### 5.2 `AnalyticsPanel` (restyle in place)

`packages/client-react/src/ui/fx/analytics/AnalyticsPanel.tsx`:
- **Delete the inner `<span>Analytics</span>` heading** (L29) — the panel chrome already renders the title from the layout spec (this is the duplicated-title bug).
- **Move the Positions section out** (`PositionBubbles` usage leaves this panel).
- Section label `PROFIT & LOSS · TODAY` — mono 10px, letter-spacing 0.14em, uppercase, faint (PROTO L507).
- Headline: `formatPnlHeadline(pnl)` in `--font-logo` (Orbitron) 700, 32px, letter-spacing 0.02em, colored positive/negative accent with `text-shadow: 0 0 18px currentColor` (PROTO L508). Sign color keys off `data-sign`, matching the existing PnlChart pattern.
- **PnlChart**: add an area fill under the line — SVG `linearGradient` from the accent at 0.32 opacity to 0, line stroke 2px with drop-shadow glow (PROTO L509). Keep the existing `data-sign` glow behavior.
- **PairPnlBars** restyle (PROTO L510–511): label column 62px mono 11px dim; track `flex:1`, height 8px, `--bg2`-style background, radius 2px, overflow hidden; fill absolutely-positioned with sign color + `0 0 10px` glow; value column 38px right-aligned mono 11px in sign color, formatted `+13k`/`−4k` (`Math.round(value/1000)` with explicit `+` for positives).

### 5.3 `PositionsPanel` (new)

`packages/client-react/src/ui/fx/positions/PositionsPanel.tsx` + module CSS (new directory):
- Section label `NET EXPOSURE` (same label style as §5.2).
- **Bubble cluster** (PROTO L521–523, L1300–1301): container `display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:6px` — a flex-wrap cloud, **not** a physics/packing layout (this fixes the current overlap). Per bubble: diameter `Math.round(40 + Math.sqrt(Math.abs(valueMillions)) * 11)` px; circular; background = sign color at 0.10 alpha; radial glow layer at 0.22 alpha; centered currency label (15px when diameter > 62, else 12px) + amount `+15.2M` / `−22.8M` (`(v > 0 ? "+" : "") + v + "M"`, one decimal); slow decorative spin ring (22s linear infinite) **gated on the existing animation-intents/reduced-motion seam**.
- **Ladder rows** below the cluster: one row per currency, `display:flex; justify-content:space-between`, padding 6px 2px, 1px bottom border, 12px; currency weight 600; amount in sign color.
- Data comes from the existing `useAnalytics()` positions, aggregated per currency by a **pure domain helper** (e.g. `netExposureByCurrency(positions)` in `packages/domain/src/analytics/`) — no rxjs/fetch in `src/ui` per the dumb-UI rule, and the helper is reusable by RN later.

## 6. §4 Chrome

### 6.1 Nav (HeaderChrome)

`packages/client-react/src/ui/shell/chrome/HeaderChrome.module.css` `.navButton` (PROTO `navStyle` L1188, verbatim targets):
- `text-transform: uppercase` (labels stay mixed-case in code; CSS transforms), `letter-spacing: 0.08em`, `font-weight: 600`, `font-size: 12px`, padding 7px 12px, radius 3px.
- Inactive: transparent background, `1px solid transparent` border, dim color.
- Active (`data-active="true"`): `background: var(--chip)`, `border: 1px solid var(--border-strong)`, accent text, glow box-shadow. **`--chip` may hold a gradient on 3d skins — use the `background` shorthand, never `background-color`** (repo-wide gradient-token rule from PR #100).

### 6.2 Panel-head tab slot + FX heads

- `InhouseLayoutEngine` panel head (`renderPanel`, `InhouseLayoutEngine.tsx:273-325`) gains a **per-panel head-content slot**: a panel registration may supply head content that renders where the title currently sits (title-only remains the default for all other panels). Follow the existing headControls extension pattern from the HUD workstream.
- **Live Rates head**: tabs `◧ Live Rates` | `☰ Watchlist` (tab style PROTO L1191: padding 9px 14px, 11px, weight 600, letter-spacing 0.06em; active = accent text + `--panel` background + 2px accent bottom border; inactive dim/transparent), spacer, `CHARTS` toggle chip (PROTO L1257: 9px, weight 600, letter-spacing 0.1em, padding 4px 11px, radius 4px; active = chip bg + strong border + accent).
- **Blotter head**: tabs `▤ FX Blotter` | `⚡ Activity`, then (blotter tab only) trade count `"N trades"` (live from the blotter stream), filter input (`⌕` icon, placeholder `Filter…`, 11px, width 130px — rewires the existing quick-filter), and `⤓ CSV` chip (10px, letter-spacing 0.1em, accent + strong border, padding 4px 10px — rewires the existing export action).
- **Watchlist / Activity tab bodies**: styled HUD placeholder, exact copy: `WATCHLIST VIEW — COMING ONLINE` / `ACTIVITY FEED — COMING ONLINE` (mono, faint, centered; consistent with the app's empty-state style). Real views are a named follow-up slice.
- **CHARTS toggle** hides all tile sparklines. View-level UI state (local React state in the Live Rates panel, passed down; no persistence — PROTO doesn't persist it either). State expressed as semantic `data-charts` on the grid for tests.

### 6.3 Boot log (BootSequence)

`packages/client-react/src/ui/shell/boot/BootSequence.tsx`: add the boot-log block between subtitle and progress bar (PROTO L71–72, L785–788, L904–917):

```
BOOT> initializing kernel ............ OK
BOOT> mounting secure enclave ........ OK
NET > linking pricing engine ......... OK
NET > credit rfq gateway ............. OK
NET > equities market data ........... OK
SYS > calibrating HUD shaders ........ OK
SYS > all systems nominal ▸ ONLINE
```

- Mono 11px, line-height 1.85, dim color, fixed-height container (~148px), left-aligned; the final line (contains `ONLINE`) renders bold in the positive accent.
- Lines appear staggered at `350 + i × 480` ms.
- **Reduced-motion / disabled-animations arm: all 7 lines render immediately** (no stagger, no glitch animation) — keeps the `boot/chrome` golden deterministic. Route timing through the existing boot seam (`useBootSequence`) rather than raw `setTimeout` in the component if the seam already owns boot phase timing (plan-time check).

### 6.4 Right cluster + status bar

- **Avatar**: hexagon `<polygon>` outline (30×30, chip fill, accent stroke + drop-shadow) with initials `AS`; dropdown shows the PROTO user object verbatim: `Anthony Stark`, `a.stark@reactivetrader.io`, `Senior FX Trader`, `TRD-0042`, `G10 Spot · London`, `CLEARANCE LEVEL 4 · FULL` (L789, L199–219). Menu entries may map to existing actions (Preferences, Reboot HUD → existing reload/boot replay if present, Sign Out → existing lock).
- **EN selector**: cosmetic language dropdown (globe icon + `EN ▾`); selecting a language updates the label only. Languages (PROTO L790, verbatim): EN English, 中文 中文 (简体), 日本 日本語, DE Deutsch, FR Français, ES Español.
- **LIVE + PROD**: 7px pulsing positive dot + `LIVE` 10px letter-spacing 0.16em; `PROD` chip mono 9px weight 600, positive border/text, padding 3px 6px (PROTO L149–153).
- **Status bar** (`StatusBar.tsx` / `CosmeticMetrics.tsx`): gateway label reads `GW eu-west-1` (currently `GB`); P&L segment labeled `P&L` with `formatPnlHeadline` value colored by sign; other segments (LAT/TPUT/FPS/MEM/POS/SES) keep existing behavior, labels aligned to PROTO L1393–1401.

## 7. §5 FX tile nits

- **Pair title** (`TileHeader.module.css` L16–19): the pair renders as one tight left group `EUR / USD` (fontD 600, 15px, letter-spacing 0.06em) — replace the base/terms `justify-content: space-between` stretch with a left-aligned inline group; the pip-movement badge remains right-aligned (title-left, badge-right row).
- **Sparkline** (`TileChart.tsx` L23–29): add `opacity: 0.75` on the polyline (PROTO L412). Stroke width 1.5 and sign-based color already match — do not change them.
- **Notional input** (`TileNotional.module.css` L33): `text-align: left` (PROTO's input has no explicit alignment = left, L1286). The reset `↺` control already exists — keep it.
- **No tile-grid change** (see §5 root cause).

## 8. §6 Testing & acceptance

**Domain (vitest):**
- Update pinned tests: `AnalyticsSimulator.test.ts` (exact positions L34–50), `PricingSimulator.test.ts` (ask/bid = mid ± flat 0.0002 pins → per-pair pip-scaled), `TradeStoreSimulator` / `CreditRfqSimulator` / `EventLogSimulator` contract tests (streams no longer start empty).
- New tests: every pair's initial mid equals `baseMid`; JPY vs non-JPY spread/step scaling; seed contents (ids, statuses, instruments) for trades/RFQs/events; `formatPnlHeadline` cases (`17120 → "+$17.1k"`, `-1499 → "-$1.5k"`, `0 → "+$0.0k"`).

**UI contract (`packages/client-react/tests/ui/contract/`):**
- New `PositionsPanel` spec: renders one bubble + ladder row per currency, amount formatting, sign colors via semantic attrs.
- Updated `AnalyticsPanel` spec: no inner duplicate heading; headline uses k-format.
- Head-tabs spec: tab switching (Live Rates ↔ Watchlist placeholder; FX Blotter ↔ Activity placeholder), CHARTS toggle flips `data-charts`, count reads "5 trades" with seeds.
- Nav spec: active tab carries `data-active` and outlined-pill semantics; boot spec: reduced-motion arm renders all 7 log lines immediately.
- Run the **UI contract coverage ≥95% gate** (`test:ui:contract:coverage`) before merge (CI-only-gates lesson).

**Visual goldens:** regenerate **both committed sets** (CI `react/` on x86 + `react-local/<arch>/`) across **all three tiers**. Expected churn: `analytics/*`, `app/fx*`, `chrome/header`, `boot/chrome`, `tile/*`, `live-rates/*`, `layout/fx*`, `status/bar`; **new** `positions/*` scenarios (populated / negative / empty). Zero-diff is *not* expected for this slice — the diff review is the gate.

**Acceptance:** live side-by-side screenshots against the deployed prototype (same skin, dark + one light check), as in the flagship and 3d phases. The FX screen must show: realistic rates, 5 seeded blotter rows, 360px two-panel right rail, k-format PnL, non-overlapping exposure bubbles, uppercase nav, head tabs, boot log.

**Whole-branch review:** required (fable, most capable model) — this slice touches paint-level details that jsdom and classic-pinned goldens cannot see (gradient-token rule, cross-skin legibility).

## 9. Global constraints

- Verbatim rule: PROTO values above are transcription targets — no "improvements" to copy, magic numbers, or formats.
- Dependency rule: domain stays rxjs-only; no new runtime deps anywhere.
- Dumb-UI rule: no rxjs/localStorage/fetch in `client-react/src/ui`; new state flows through the ViewModel seam or local React state as specified.
- ADR-004: any new ViewModel member must be implemented in the real factory **and both test harnesses** (`buildFakeViewModel.ts`, `viewModelFromWorld.ts`) — compile-enforced.
- Gradient-token rule (PR #100): `--panel`/`--panel-head`/`--chip` may hold gradients — always `background:` shorthand, never `background-color:`, never SVG `fill=` with these tokens, never longhand-only state overrides.
- No lint disables; both ESLint configs + Biome + stylelint must pass (CI lints beyond Biome).
- All repo changes in this worktree/branch; merge via PR per shipping-repo-changes.
