# `@rtc/client-prototype` P2.5 — FX Aside (Analytics + Positions)

**Date:** 2026-07-01
**Status:** Design — approved
**Author:** Claude (brainstormed with @nasantsogt)
**Parent spec:** `docs/superpowers/specs/2026-06-30-client-prototype-design.md` (§6, phase between P2 and P3)

## 1. Purpose

P2 shipped the FX dock but left the **aside column** (the right-hand stack of
Analytics over Positions) as two `· P2.5` placeholders. This phase fills those
two panel bodies with a faithful port of the PROTO aside, and completes the one
piece of live behavior the aside needs: the running **PnL** figure.

Everything else in the dock — the three splits, maximize, aside-collapse strip,
the `ana`/`pos` `PanelId`s — already exists from P2 and does **not** change.

### Fidelity source

PROTO = `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html`.
- Aside markup: **L503–531**.
- Analytics/Positions view-model builders: **L1296–1300**.
- PnL state + walk: seed `L816` (`pnl: 17120`), tick walk `L1135`, fill jump `L1152`.

What is **live** vs **static** in the PROTO (verified by reading the source):
- **Live:** only `S.pnl` (the big number). It drifts on every rate tick and
  jumps on every trade fill.
- **Static seed:** the PnL sparkline shape (`pnlPts` is a hardcoded array), the
  6 per-pair bars (`bars`), and all 7 position bubbles (`bubData`). These never
  change at runtime. Porting them as static seed data is faithful, not a
  simplification.

## 2. Goals & Non-Goals

### Goals
- Faithful port of the Analytics and Positions panel bodies (PROTO L503–531).
- Live PnL: seed `17120`, per-tick drift, per-fill jump — matching PROTO exactly.
- Small, single-purpose components + co-located static seed data + CSS Modules,
  matching the P2 folder pattern (`LiveRates/`, `Blotter/`).
- Passes the same gate as P2 (build, typecheck, Biome, ESLint incl. inline-style
  ban, stylelint, `#/` imports) and the repo-wide CI gates (knip, manypkg/
  syncpack, dependency-cruiser, rules).

### Non-Goals
- **No dock/split/maximize/collapse changes.** That machinery is done.
- **No new runtime deps.** Bubble spin uses the `spin` keyframe already in
  `global.css` (P0). The sparkline is inline SVG.
- **No live behavior beyond PnL.** Bars/bubbles/sparkline stay static per PROTO.
- No visual-golden / UI-contract / e2e tiers (per parent spec §5).

## 3. Architecture

Two feature folders under `src/fx/`, mirroring P2's `LiveRates/` and `Blotter/`.

```
src/fx/Analytics/
  AnalyticsView.tsx        # panel body: two labelled sections, stacked
  PnlSummary.tsx           # "Profit & Loss · Today" label + live number + sparkline
  PnlSparkline.tsx         # static area+line SVG (gradient fill, buy polyline)
  PairPnlBars.tsx          # "PnL per Currency Pair" + 6 bars
  analyticsData.ts         # PAIR_PNL seed + PNL_PTS + fmtPnl(pnl)
  AnalyticsView.module.css  PnlSummary.module.css  PairPnlBars.module.css
src/fx/Positions/
  PositionsView.tsx        # panel body: "Net Exposure" + bubble cluster + rows
  ExposureBubbles.tsx      # 7 sized/spinning/glowing ccy bubbles
  ExposureRows.tsx         # 7 ccy | amount rows
  positionsData.ts         # EXPOSURE seed (with derived size/large)
  PositionsView.module.css  ExposureBubbles.module.css  ExposureRows.module.css
```

`FxScreen.tsx` swaps the two placeholder `<div>`s for `<AnalyticsView
pnl={rates.pnl} />` and `<PositionsView />`, and the now-unused `.placeholder`
class is removed from `FxScreen.module.css`.

### 3.1 Component contracts

```ts
// Analytics
interface AnalyticsViewProps { pnl: number; }              // pnl from useFxRates
interface PnlSummaryProps    { pnl: number; }
// PnlSparkline takes no props — points are module constants.
interface PairPnlBarsProps   { rows: PairPnl[]; }           // rows = PAIR_PNL

interface PairPnl { pair: string; val: number; width: number; positive: boolean; }

// Positions
// PositionsView takes no props.
interface ExposureBubblesProps { rows: Exposure[]; }        // rows = EXPOSURE
interface ExposureRowsProps    { rows: Exposure[]; }

interface Exposure {
  ccy: string; val: number; positive: boolean;
  size: number;   // Math.round(40 + Math.sqrt(Math.abs(val)) * 11)
  large: boolean; // size > 62
}
```

### 3.2 Seed data (verbatim from PROTO)

```ts
// analyticsData.ts — PROTO L1300 `bars`: [pair, val(k), width%, positive]
const PAIR_PNL: PairPnl[] = [
  { pair: "EURUSD", val: 13,  width: 78, positive: true  },
  { pair: "USDJPY", val: -4,  width: 26, positive: false },
  { pair: "GBPUSD", val: 9,   width: 58, positive: true  },
  { pair: "AUDUSD", val: 6,   width: 42, positive: true  },
  { pair: "USDCAD", val: -2,  width: 16, positive: false },
  { pair: "EURJPY", val: 5,   width: 38, positive: true  },
];

// PROTO L1297: static sparkline points (y at 11 evenly spaced x across 300 wide)
const PNL_PTS = [92, 76, 84, 54, 64, 40, 48, 34, 22, 14, 8];

// positionsData.ts — PROTO L1299 `bubData`: [ccy, val(M), positive]; size/large derived
const EXPOSURE_SEED: Array<[string, number, boolean]> = [
  ["EUR", 15.2, true], ["USD", -22.8, false], ["JPY", 8.4, true],
  ["GBP", -6.1, false], ["AUD", 4.7, true], ["CAD", -3.2, false],
  ["NZD", 2.1, true],
];
// Derived sizes (Math.round(40+sqrt(abs(val))*11)): EUR 83, USD 93, JPY 72,
// GBP 67, AUD 64, CAD 60, NZD 56. large (>62): EUR,USD,JPY,GBP,AUD; small: CAD,NZD.
```

### 3.3 Formatting (verbatim from PROTO)

- **PnL string** (`fmtPnl`, PROTO L1299): `pos = pnl >= 0`; text =
  `${pos ? "+" : "-"}$${(Math.abs(pnl) / 1000).toFixed(1)}k`. Sign also drives
  color (buy when `pos`, else sell).
- **Bar value** (PROTO L1300): `${val > 0 ? "+" : ""}${val}k`.
- **Bubble amount** (PROTO L1299): `${val > 0 ? "+" : ""}${val}M`.
- **Sparkline geometry** (PROTO L1297–1298): with `n = PNL_PTS.length`,
  `line = PNL_PTS.map((y,i) => `${Math.round(i/(n-1)*300)},${y}`).join(" ")`;
  `area = `M0,${PNL_PTS[0]} ${line} L300,100 L0,100 Z``. Both are module
  constants (the input is static).

## 4. Live PnL integration (`useFxRates`)

`pnl` is **already** in `RatesApi` and `useFxRates`, and the per-fill jump is
already implemented (`setPnl` in `book()` using `PNL_SPAN=800`, `PNL_BIAS=0.3`).
Two changes bring it to full PROTO fidelity:

1. **Seed** — change `useState(0)` to `useState(PNL_SEED)` with
   `const PNL_SEED = 17120;` (PROTO L816).
2. **Per-tick drift** — inside the existing 250ms walk `setInterval` callback,
   add a second updater:
   ```ts
   setPnl((prev) => Math.max(0, prev + Math.round((rngRef.current() - PNL_TICK_BIAS) * PNL_TICK_SPAN)));
   ```
   with `const PNL_TICK_SPAN = 500;` and `const PNL_TICK_BIAS = 0.42;`
   (PROTO L1135). This mirrors the walk-tick's own `rngRef.current()` usage, so
   determinism under a seeded rng is preserved.

No consumer signature changes (the `pnl` field already exists). No existing test
pins `pnl`, so the seed change breaks nothing.

## 5. CSS taxonomy (same discipline as P2)

Runtime-varying values use the repo-sanctioned `--custom-property` escape hatch
via a **named-const** `style={x}` object (the ESLint inline-style ban matches
object literals `style={{…}}` only, not variable refs — no `eslint-disable`
needed). Everything else is static classes or semantic `data-*`.

- **Bar fill:** width → `--bar-pct` custom prop; sign → `data-sign="pos|neg"`
  selecting `var(--buy)`/`var(--sell)` for background + glow.
- **Bubble:** diameter → `--bubble-size` custom prop; `data-sign` for
  border/glow/background color; `data-large="true|false"` for the 15px-vs-12px
  ccy label.
- **PnL number:** `data-sign="pos|neg"` drives color; glow is
  `text-shadow: 0 0 18px currentColor` (no inline color).
- **Sparkline:** static inline SVG; `stroke`/`stop-color` read `var(--buy)` /
  `var(--accent2)` directly; the `d`/`points` come from the module constants.
- **Section labels** ("PROFIT & LOSS · TODAY", "PNL PER CURRENCY PAIR", "NET
  EXPOSURE"): static classes (uppercase, `--faint`, mono, letter-spacing).

## 6. Panel head accessory (`⊕`)

PROTO's aside heads (L505, L518) show a decorative `⊕` add glyph between the
panel title and the maximize button. It has **no behavior** in the PROTO. To
port it faithfully, add one optional prop to the shared `Panel`:

```ts
interface PanelProps { /* …existing… */ headAccessory?: ReactNode; }
```

rendered right-aligned immediately before the maximize button (decorative, not a
`<button>` — it takes no click). The Analytics and Positions panels pass
`headAccessory={<span aria-hidden="true">⊕</span>}`; the Live Rates / FX Blotter
panels omit it (unchanged). This is the only P2-shared-component touch besides
`useFxRates`.

## 7. Testing (smoke-only, P2 conventions)

`@testing-library/react`; explicit `cleanup()` in `afterEach`; `arrow-body-style:
always`; named interfaces (no inline object types); `rtc/newspaper-order`
(helpers/types below tests); real `<button type="button">` for interactive
elements.

- **`fx-analytics.test.tsx`** — `AnalyticsView` renders the "Profit & Loss ·
  Today" label, a `$…k`-formatted PnL string for a given `pnl`, and all 6 pair
  bars (by pair label).
- **`fx-positions.test.tsx`** — `PositionsView` renders "Net Exposure", 7 bubbles
  (asserted by ccy text), and 7 exposure rows.
- **`fx-pnl-live.test.ts`** — `useFxRates` with a seeded rng and fake timers:
  `pnl` starts at `17120`; after advancing several tick intervals it has changed
  (drifted); it never goes below 0.
- **Update `fx-screen.test.tsx`** — lines currently asserting `/Analytics ·
  P2\.5/` and `/Positions · P2\.5/` retarget to real aside content (e.g.
  "Profit & Loss" and "Net Exposure").

## 8. Global Constraints

- Package: `@rtc/client-prototype` only. **No** `@rtc/domain`/`@rtc/shared`, no
  RxJS/machines, no `ViewModel` seam, no React Compiler.
- Full CSS Modules; **zero** `style={{…}}` object literals (named-const custom-
  property objects are the only inline-style form permitted).
- `#/` subpath imports; no `../../` (≥2-up) relative imports.
- All PROTO values (seed arrays, `pnl` constants, formulas, sizes) are used
  **verbatim** as given in §3–4.
- Faithful to PROTO L503–531 / L1296–1300: bars/bubbles/sparkline static; only
  `pnl` is live.

## 9. Build Order

Single implementation plan (one reviewable branch, shipped as one merge commit).
Ordered inward-out so each task is independently testable:

1. Live PnL in `useFxRates` (seed + tick drift) + `fx-pnl-live` test.
2. `Panel.headAccessory` prop.
3. Analytics seed data + `analyticsData.ts` (+ `fmtPnl`).
4. `PnlSparkline`, `PnlSummary`, `PairPnlBars`, `AnalyticsView` + `fx-analytics`.
5. Positions seed data + `positionsData.ts` (derived size/large).
6. `ExposureBubbles`, `ExposureRows`, `PositionsView` + `fx-positions`.
7. Wire into `FxScreen` (swap placeholders, drop `.placeholder`) + update
   `fx-screen` smoke.

## 10. Risks & Mitigations

- **Re-opening sealed P2 code** (`useFxRates`, `Panel`): both touches are
  additive and minimal (2 pnl lines; 1 optional prop). No consumer signatures
  change. Mitigation: no existing test pins `pnl`; `Panel` prop is optional so
  existing panels are untouched.
- **Custom-property escape-hatch drift** (accidental `style={{…}}` literal):
  caught by the ESLint inline-style ban in CI. Mitigation: named-const objects
  only, as in P2's tiles.
- **`fx-screen` smoke false-green** if the placeholder assertions aren't
  retargeted: the task explicitly updates those lines.

## 11. Open Questions

None.
