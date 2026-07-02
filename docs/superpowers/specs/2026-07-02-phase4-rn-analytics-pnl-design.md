# Phase 4 — React Native Analytics / P&L — Design

**Status:** Approved (design), pending spec review
**Date:** 2026-07-02
**Package:** `@rtc/client-react-native`
**Roadmap:** `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md` §Phasing line 136 — "…execution + blotter → **analytics / P&L** (where the `d3-*` / `motion` DOM-coupled stragglers get handled) → theming → …"

---

## 1. Purpose

Bring the **FX analytics / P&L** feature to the React Native client, reusing the
existing neutral analytics presenter and domain math unchanged. This is the phase
the roadmap earmarked for "handling the `d3-*` straggler" — so the design's second
job is to demonstrate that the DOM-coupled position-bubble chart reduces cleanly to
**pure math + declarative `react-native-svg`**, with zero regression to the web.

## 2. Thesis (continuity with Phases 2–3)

The analytics **data and math already exist and are already framework-neutral**:

- `AnalyticsPresenter.position$: Observable<PositionUpdates>` (`@rtc/client-core`) is
  already bound into the shared ViewModel, so the RN app receives it **for free** via
  `useViewModel()` — no new `domain` / `client-core` / `react-bindings` code.
- All numeric shaping is pure `@rtc/domain`: `aggregatePositionsByCurrency`,
  `formatPnlValue`, `formatWithScale`, `formatPrecise2`.

Therefore Phase 4 = **RN leaf components + one pure layout util + an Analytics tab +
one Expo-Go-safe dependency (`react-native-svg`).** No new neutral-layer code, no
`d3`, no `motion`.

### Explicit non-goals

- **Equities positions** (`useEquityPositions` / `EquityPosition`) — belongs to a
  future equities phase, not FX analytics.
- **Bubble interaction** — no drag, no tooltip (those were the DOM-coupled parts of
  the web chart; omitted deliberately, may return with a later animation phase).
- **Animations** — no entrance/ring animation this phase (deferred to the theming /
  animation phase alongside `useAnimationIntents`).
- **Maestro e2e + RN visual baselines** — deferred to their own dedicated phase; this
  phase ships on the existing jest-expo unit + contract island, exactly as Phases 2–3.

## 3. Reused signatures (design against these verbatim)

From the shared ViewModel (`@rtc/react-bindings` `createViewModel`):

```ts
useAnalytics(): PositionUpdates | null   // null until first emission
useAnalyticsStaleFlag(): boolean
```

From `@rtc/domain`:

```ts
type PositionUpdates = {
  readonly currentPositions: readonly CurrencyPairPosition[];
  readonly history: readonly HistoricPosition[];
};
type CurrencyPairPosition = {
  symbol: string; basePnl: number;
  baseTradedAmount: number; counterTradedAmount: number;
};
type HistoricPosition = { timestamp: string; usdPnl: number };

interface CurrencyPositionNode {
  readonly currency: string; readonly tradedAmount: number;
  readonly radius: number;                 // linear scale [15,60] over abs(tradedAmount)
  readonly sign: "pos" | "neg"; readonly text: string;
}
function aggregatePositionsByCurrency(
  positions: readonly CurrencyPairPosition[],
): readonly CurrencyPositionNode[];
const POSITION_MIN_RADIUS = 15;
const POSITION_MAX_RADIUS = 60;

function formatPnlValue(value: number): string;
function formatWithScale(value: number): string;
function formatPrecise2(value: number): string;
```

## 4. Files

All new/modified files live under `packages/client-react-native`.

```
src/ui/analytics/
  AnalyticsScreen.tsx        // NEW  composition: useAnalytics()+useAnalyticsStaleFlag()
  PnlValue.tsx               // NEW  <Text> USD {formatPnlValue(v)}, pos/neg style
  PnlChart.tsx               // NEW  react-native-svg <Svg><Path>/<Line>; ports buildChart()
  buildChart.ts              // NEW  PURE: buildChart(history) → { path, zeroY } (verbatim port)
  PairPnlBars.tsx            // NEW  RN <View> rows; bar width % from basePnl; formatWithScale
  ExposureBubbles.tsx        // NEW  react-native-svg <Circle>+<Text>; xy from bubbleLayout()
  bubbleLayout.ts            // NEW  PURE: computeBubbleLayout(nodes,{width,height}) → positioned[]
  AnalyticsScreen.test.tsx   // NEW  jest-expo (loading / populated / stale)
  PnlChart.test.tsx          // NEW  jest-expo
  PnlValue.test.tsx          // NEW  jest-expo
  PairPnlBars.test.tsx       // NEW  jest-expo
  ExposureBubbles.test.tsx   // NEW  jest-expo
  buildChart.test.ts         // NEW  vitest (pure)
  bubbleLayout.test.ts       // NEW  vitest (pure)
app/analytics.tsx            // NEW  route → <AnalyticsScreen/>
app/_layout.tsx              // MODIFY add third <Tabs.Screen name="analytics">
package.json                 // MODIFY add react-native-svg (expo install)
```

**`buildChart.ts` split out** so the SVG-path math is unit-tested as pure `.ts`
(vitest) independent of the RN renderer — mirrors how the web keeps `buildChart`
inline but lets us test it without jest-expo.

## 5. Component behaviour

### AnalyticsScreen
Mirrors the web `AnalyticsPanel`. `const data = useAnalytics(); const stale =
useAnalyticsStaleFlag();`
- `data === null` → a "Loading analytics…" `<Text>` (testID `analytics-loading`).
- else → a scrollable screen (testID `analytics-panel`) with three sections:
  **Profit & Loss** (`PnlValue` on `latestPnl` + `PnlChart` on `data.history`),
  **Positions** (`ExposureBubbles` on `data.currentPositions`),
  **PnL per Currency Pair** (`PairPnlBars` on `data.currentPositions`).
  `latestPnl = history.length ? history.at(-1).usdPnl : 0`.
- `stale` dims the content (reduced opacity via a style flag) — the RN analogue of
  the web `StaleIndicator`. No new presenter; purely visual.

### PnlValue
`<Text>` → `USD {formatPnlValue(value)}`; sign style `value >= 0 ? pos : neg`.

### PnlChart + buildChart
`buildChart(history)` is a **verbatim port** of the web pure function (same
constants `CHART_WIDTH=400`, `CHART_HEIGHT=120`, `PADDING=8`; same linear-interp path
string; same zero-baseline rule): returns `{ path: string; zeroY: number | null }`,
`path === ""` when `history.length < 2`. `PnlChart` renders
`<Svg viewBox="0 0 400 120">` with a dashed zero `<Line>` (when `zeroY !== null`) and
a `<Path d={path}>` stroked positive/negative by the last value. Colours from RN
`StyleSheet` constants (no CSS variables in RN).

### PairPnlBars
One `<View>` row per position (RN idiom, not SVG). `maxAbsPnl = max(|basePnl|…, 1)`;
`barWidth% = |basePnl/maxAbsPnl| * 50`; a centre line with the bar growing left/right
by sign. Label shows `formatWithScale(basePnl)` (no hover on mobile — the web's
hover→`formatPrecise2` swap is a pointer affordance and is dropped). testID
`pair-pnl-row-{symbol}`.

### ExposureBubbles + bubbleLayout (the straggler, resolved)
`aggregatePositionsByCurrency(positions)` (pure domain) yields nodes with `radius`,
`sign`, `text`. `computeBubbleLayout(nodes, { width, height })` is **pure TS, no d3**:
assigns each node a deterministic `{ x, y }` by **largest-radius-first placement**
within the viewport, clamped so every circle stays fully inside `[r, width-r] ×
[r, height-r]`, deterministically nudging later circles to avoid overlap with
already-placed ones (bounded number of candidate offsets; falls back to a clamped
position if none is collision-free). Deterministic → unit-testable, no physics, no
animation loop. `ExposureBubbles` renders `<Svg><Circle cx cy r fill(sign)/><Text>
{currency}</Text></Svg>`. testID `exposure-bubble-{currency}`.

## 6. The straggler decision (recorded)

The web `PositionBubbles` couples three concerns that `d3` bundled: **sizing**
(already pure in `@rtc/domain`), **spatial layout** (`d3-force`), and **interaction**
(`d3-drag`/`d3-selection`). Only layout + interaction are DOM-coupled.

**Chosen:** replace the force simulation with a **deterministic √-scaled static
layout** in pure TS, rendered declaratively with `react-native-svg`. This mirrors the
validated `client-prototype` P2.5 `ExposureBubbles` precedent (`diameter = 40 +
√|exposure|·11`, CSS layout, no d3) and honours the design doc's "reduce to pure
math" guidance.

**Rejected:**
- *Headless `d3-force` in RN* — faithful to the web but pulls `d3-force` + a per-tick
  loop into the app for placement that carries no information (radius already encodes
  exposure).
- *Shared neutral force util* — cleanest in theory, but `@rtc/domain` and
  `@rtc/client-core` may depend on **rxjs only**, so `d3-force` cannot live there; a
  hand-rolled shared version would force a web refactor + re-baselining for no Phase-4
  benefit. The layout is a pure **view** concern → it lives in the RN app.

The web `PositionBubbles` is **untouched** this phase.

## 7. Testing

Existing jest-expo island (`preset: jest-expo`, `testMatch **/*.test.tsx`,
`moduleNameMapper @rtc/* → dist`). `.test.ts` → vitest, `.test.tsx` → jest-expo. RN
`test` script already runs `vitest run --passWithNoTests && jest`.

- **`buildChart.test.ts`** (vitest): `<2` points → `path === ""`; `≥2` points →
  path starts `M`, has `length-1` `L` segments; `zeroY` null when 0 outside range,
  numeric when inside.
- **`bubbleLayout.test.ts`** (vitest): empty → `[]`; determinism (same input → same
  output); every circle within bounds; no two circles overlap (centre distance ≥ sum
  of radii, or documented clamp fallback).
- **`*.test.tsx`** (jest-expo, RNTL, reusing the Phase 2/3 fake-ViewModel harness):
  `AnalyticsScreen` renders loading when `useAnalytics()===null`, panel + three
  sections when populated, dimmed when stale; `PnlChart` renders a path for ≥2 points
  and none for <2; `PnlValue` sign styling; `PairPnlBars` one row per position;
  `ExposureBubbles` one circle per aggregated currency.

## 8. Global constraints (verbatim)

- **One new dependency only:** `react-native-svg`, added via `expo install` (Expo-Go
  bundled). Verify latest *acceptable* version (`pnpm outdated -r`; respect Renovate
  24h cooldown). **No** `d3-*`, **no** `motion`.
- **Zero new code** in `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`.
- Node 26. Never `node-linker=hoisted`.
- **Biome** zero findings, **no inline disables**. CI also runs ESLint (plain
  `eslint .` + typed `eslint . --config eslint.config.typed.mjs`) + stylelint on top of
  Biome — **Biome-clean ≠ CI-clean**; the gate must run both ESLint configs.
- `expo export` must still succeed (module graph builds).
- Expo-Go-pure: no custom native modules.
- **Live-WS smoke is never a CI gate.**
- **x86-CI trap (Phase 3):** RN component tests can pass on arm64 local yet
  hang/segfault on x86 CI; push and read real CI (`gh run list --branch <b>
  --workflow CI --json status,conclusion,headSha` matched on HEAD `headSha`) — never
  trust turbo-cached local green.

## 9. Shipping

Isolated in worktree `rn-expo-phase4` off `origin/main`. Ship via PR → CI green →
`gh pr merge --merge` (never squash/rebase/ff). Merging to `main` requires explicit
user authorization.
