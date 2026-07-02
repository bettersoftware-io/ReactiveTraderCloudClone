# Phase 4 — React Native Analytics / P&L — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the FX analytics / P&L feature to `@rtc/client-react-native` — a third "Analytics" tab showing P&L value, a P&L-over-time chart, per-pair P&L bars, and position-exposure bubbles — reusing the existing neutral presenter and pure `@rtc/domain` math, with the d3-force straggler reduced to a pure deterministic layout.

**Architecture:** The analytics data is already bound into the shared ViewModel (`useAnalytics()`, `useAnalyticsStaleFlag()`) and all numeric shaping is pure `@rtc/domain`. This phase adds only RN leaf components (`react-native-svg` for the chart + bubbles, plain `View`s for bars), two pure view-layer utilities (`buildChart`, `bubbleLayout`), and Expo Router tab wiring. No new code in `domain` / `client-core` / `react-bindings`.

**Tech Stack:** React Native 0.83 + Expo SDK 55 (Expo Go), Expo Router tabs, `react-native-svg`, `@rtc/react-bindings` ViewModel hooks, `@rtc/domain` pure helpers, jest-expo + RNTL (`.test.tsx`), vitest (`.test.ts`).

**Spec:** `docs/superpowers/specs/2026-07-02-phase4-rn-analytics-pnl-design.md`

## Global Constraints

- **One new dependency only:** `react-native-svg`, added via `pnpm --filter @rtc/client-react-native exec expo install react-native-svg` (Expo-Go bundled). No `d3-*`, no `motion`.
- **`react-native-svg` MUST be added to the jest `transformIgnorePatterns` allowlist** in `packages/client-react-native/jest.config.js` — the repo overrides the jest-expo default list, and svg ships untranspiled ESM that jest cannot parse otherwise.
- **Zero new code** in `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`. Only consume their existing exports.
- Node 26. Never `node-linker=hoisted`.
- **Biome** zero findings, **no inline disables**. CI also runs ESLint (`eslint .` + `eslint . --config eslint.config.typed.mjs`) + stylelint on top of Biome — **Biome-clean ≠ CI-clean**; run both ESLint configs before declaring done.
- Component return type is `JSX.Element` (import `type { JSX } from "react"`); use `StyleSheet.create`; label queryable nodes with `testID`. Match the Phase 3 leaf idiom exactly.
- Pure math lives in `.ts` files tested by **vitest**; RN components live in `.tsx` files tested by **jest-expo**. The RN `test` script runs `vitest run --passWithNoTests && jest`.
- `expo export` must still succeed.
- Expo-Go-pure: no custom native modules. **Live-WS smoke is never a CI gate.**
- **x86-CI trap (Phase 3):** RN component tests can pass on arm64 local yet hang/segfault on x86 CI. Push and read real CI (`gh run list --branch <b> --workflow CI --json status,conclusion,headSha` matched on HEAD `headSha`) — never trust turbo-cached local green.

## Reused exports (do not reimplement)

From `@rtc/react-bindings` `useViewModel()`:
```ts
useAnalytics(): PositionUpdates | null   // null until first emission
useAnalyticsStaleFlag(): boolean
```
From `@rtc/domain`:
```ts
interface CurrencyPairPosition { symbol: string; basePnl: number; baseTradedAmount: number; counterTradedAmount: number }
interface HistoricPosition { timestamp: string; usdPnl: number }
interface PositionUpdates { currentPositions: readonly CurrencyPairPosition[]; history: readonly HistoricPosition[] }
interface CurrencyPositionNode { currency: string; tradedAmount: number; radius: number; sign: "pos" | "neg"; text: string }
function aggregatePositionsByCurrency(positions: readonly CurrencyPairPosition[]): readonly CurrencyPositionNode[]
function formatPnlValue(value: number): string     // "+1,000" / "-500" / "+0"
function formatWithScale(value: number): string     // 12345678 -> "12m"
```

## File Structure

```
packages/client-react-native/
  package.json                        MODIFY  + react-native-svg
  jest.config.js                      MODIFY  + react-native-svg in transformIgnorePatterns
  src/ui/analytics/
    buildChart.ts        + .test.ts   NEW  pure SVG-path math (vitest)          [Task 1]
    PnlChart.tsx         + .test.tsx  NEW  react-native-svg line chart          [Task 1]
    PnlValue.tsx         + .test.tsx  NEW  latest P&L figure                     [Task 1]
    PairPnlBars.tsx      + .test.tsx  NEW  per-pair horizontal bars (Views)      [Task 2]
    bubbleLayout.ts      + .test.ts   NEW  pure deterministic shelf packing      [Task 3]
    ExposureBubbles.tsx  + .test.tsx  NEW  react-native-svg exposure bubbles     [Task 3]
    AnalyticsScreen.tsx  + .test.tsx  NEW  composition + loading + stale          [Task 4]
  app/
    analytics.tsx                     NEW  route -> <AnalyticsScreen/>            [Task 4]
    _layout.tsx                       MODIFY  + third <Tabs.Screen name="analytics"> [Task 4]
```

---

### Task 1: P&L section — `react-native-svg` dep, `buildChart`, `PnlChart`, `PnlValue`

Introduces `react-native-svg` and proves the jest transform end-to-end via the `PnlChart` render test. Delivers the whole "Profit & Loss" section (value + chart).

**Files:**
- Modify: `packages/client-react-native/package.json` (add `react-native-svg`)
- Modify: `packages/client-react-native/jest.config.js` (transformIgnorePatterns)
- Create: `packages/client-react-native/src/ui/analytics/buildChart.ts`
- Test: `packages/client-react-native/src/ui/analytics/buildChart.test.ts`
- Create: `packages/client-react-native/src/ui/analytics/PnlChart.tsx`
- Test: `packages/client-react-native/src/ui/analytics/PnlChart.test.tsx`
- Create: `packages/client-react-native/src/ui/analytics/PnlValue.tsx`
- Test: `packages/client-react-native/src/ui/analytics/PnlValue.test.tsx`

**Interfaces:**
- Consumes: `HistoricPosition`, `formatPnlValue` from `@rtc/domain`.
- Produces:
  - `buildChart(history: readonly HistoricPosition[]): { path: string; zeroY: number | null }` from `#/ui/analytics/buildChart` (also exports `CHART_WIDTH = 400`, `CHART_HEIGHT = 120`).
  - `PnlChart({ history }: { history: readonly HistoricPosition[] }): JSX.Element` from `#/ui/analytics/PnlChart`.
  - `PnlValue({ value }: { value: number }): JSX.Element` from `#/ui/analytics/PnlValue`.

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @rtc/client-react-native exec expo install react-native-svg`
Expected: `package.json` gains `react-native-svg` at the SDK-55-compatible version; lockfile updates. Then verify freshness: `pnpm outdated -r | grep react-native-svg || echo "at acceptable version"`.

- [ ] **Step 2: Allowlist react-native-svg for jest transform**

In `packages/client-react-native/jest.config.js`, add `react-native-svg` to the `transformIgnorePatterns` alternation (it currently ends `...|@react-rxjs/.*|@rx-state/.*))`):

```js
  transformIgnorePatterns: [
    "node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@testing-library/react-native|@react-rxjs/.*|@rx-state/.*|react-native-svg))",
  ],
```

- [ ] **Step 3: Write the failing `buildChart` test**

Create `packages/client-react-native/src/ui/analytics/buildChart.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { HistoricPosition } from "@rtc/domain";

import { buildChart } from "#/ui/analytics/buildChart";

function h(usdPnl: number): HistoricPosition {
  return { timestamp: `t${usdPnl}`, usdPnl };
}

describe("buildChart", () => {
  it("returns an empty path and null baseline for fewer than 2 points", () => {
    expect(buildChart([])).toEqual({ path: "", zeroY: null });
    expect(buildChart([h(5)])).toEqual({ path: "", zeroY: null });
  });

  it("builds an M…L path and a zero baseline inside the value range", () => {
    // min=0 max=10 range=10; w=384 h=104 step=384; PADDING=8
    expect(buildChart([h(0), h(10)])).toEqual({
      path: "M8.0,112.0 L392.0,8.0",
      zeroY: 112,
    });
  });

  it("returns null baseline when zero is outside the value range", () => {
    const { zeroY } = buildChart([h(5), h(10)]);
    expect(zeroY).toBeNull();
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/analytics/buildChart.test.ts`
Expected: FAIL — cannot resolve `#/ui/analytics/buildChart`.

- [ ] **Step 5: Implement `buildChart` (verbatim port of the web pure function)**

Create `packages/client-react-native/src/ui/analytics/buildChart.ts`:

```ts
import type { HistoricPosition } from "@rtc/domain";

export const CHART_WIDTH = 400;
export const CHART_HEIGHT = 120;
const PADDING = 8;

export interface PnlChartShape {
  /** SVG path `d` for the P&L line, or "" when there are too few points. */
  path: string;
  /** Y of the zero baseline, or null when 0 is outside the value range. */
  zeroY: number | null;
}

/** Derive the P&L line path and zero baseline in one pass over the history.
 * Verbatim port of the web `PnlChart.buildChart` (same constants + formulae). */
export function buildChart(history: readonly HistoricPosition[]): PnlChartShape {
  if (history.length < 2) return { path: "", zeroY: null };

  const values = history.map((point) => {
    return point.usdPnl;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = CHART_WIDTH - PADDING * 2;
  const h = CHART_HEIGHT - PADDING * 2;
  const step = w / (values.length - 1);

  const path = values
    .map((v, i) => {
      const x = PADDING + i * step;
      const y = PADDING + h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const zeroY =
    min > 0 || max < 0 ? null : PADDING + h - ((0 - min) / range) * h;

  return { path, zeroY };
}
```

- [ ] **Step 6: Run the `buildChart` test to confirm it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/analytics/buildChart.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Write the failing `PnlChart` test**

Create `packages/client-react-native/src/ui/analytics/PnlChart.test.tsx`:

```tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import type { HistoricPosition } from "@rtc/domain";

import { PnlChart } from "#/ui/analytics/PnlChart";

function h(usdPnl: number): HistoricPosition {
  return { timestamp: `t${usdPnl}`, usdPnl };
}

test("renders a line path when there are at least two points", async () => {
  await render(<PnlChart history={[h(0), h(10)]} />);
  expect(screen.getByTestId("pnl-chart-path")).toBeTruthy();
});

test("renders no line path for fewer than two points", async () => {
  await render(<PnlChart history={[h(5)]} />);
  expect(screen.queryByTestId("pnl-chart-path")).toBeNull();
});
```

- [ ] **Step 8: Run it to confirm it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics/PnlChart.test.tsx`
Expected: FAIL — cannot resolve `#/ui/analytics/PnlChart`.

- [ ] **Step 9: Implement `PnlChart`**

Create `packages/client-react-native/src/ui/analytics/PnlChart.tsx`:

```tsx
import type { JSX } from "react";
import Svg, { Line, Path } from "react-native-svg";

import type { HistoricPosition } from "@rtc/domain";

import { buildChart, CHART_HEIGHT, CHART_WIDTH } from "#/ui/analytics/buildChart";

const POSITIVE = "#3fb68b";
const NEGATIVE = "#e05252";
const BASELINE = "#c8c8c8";

export function PnlChart({ history }: PnlChartProps): JSX.Element {
  const { path, zeroY } = buildChart(history);
  const lastValue = history.length > 0 ? history[history.length - 1].usdPnl : 0;
  const stroke = lastValue >= 0 ? POSITIVE : NEGATIVE;

  return (
    <Svg
      width="100%"
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      testID="pnl-chart"
    >
      {zeroY !== null ? (
        <Line
          x1={8}
          x2={CHART_WIDTH - 8}
          y1={zeroY}
          y2={zeroY}
          stroke={BASELINE}
          strokeWidth={0.5}
          strokeDasharray="4 2"
        />
      ) : null}
      {path !== "" ? (
        <Path
          testID="pnl-chart-path"
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
    </Svg>
  );
}

interface PnlChartProps {
  history: readonly HistoricPosition[];
}
```

- [ ] **Step 10: Run the `PnlChart` test to confirm it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics/PnlChart.test.tsx`
Expected: PASS (2 tests). This also proves `react-native-svg` transforms under jest.

- [ ] **Step 11: Write the failing `PnlValue` test**

Create `packages/client-react-native/src/ui/analytics/PnlValue.test.tsx`:

```tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { PnlValue } from "#/ui/analytics/PnlValue";

test("renders a positive P&L with a leading plus and USD label", async () => {
  await render(<PnlValue value={1000} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("USD +1,000");
});

test("renders a negative P&L", async () => {
  await render(<PnlValue value={-500} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("USD -500");
});
```

- [ ] **Step 12: Run it to confirm it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics/PnlValue.test.tsx`
Expected: FAIL — cannot resolve `#/ui/analytics/PnlValue`.

- [ ] **Step 13: Implement `PnlValue`**

Create `packages/client-react-native/src/ui/analytics/PnlValue.tsx`:

```tsx
import type { JSX } from "react";
import { StyleSheet, Text } from "react-native";

import { formatPnlValue } from "@rtc/domain";

export function PnlValue({ value }: PnlValueProps): JSX.Element {
  const color = value >= 0 ? styles.pos : styles.neg;
  return (
    <Text testID="pnl-value" style={[styles.value, color]}>
      USD {formatPnlValue(value)}
    </Text>
  );
}

interface PnlValueProps {
  value: number;
}

const styles = StyleSheet.create({
  value: { fontSize: 20, fontWeight: "600" },
  pos: { color: "#3fb68b" },
  neg: { color: "#e05252" },
});
```

- [ ] **Step 14: Run the `PnlValue` test to confirm it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics/PnlValue.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 15: Verify gates for this task**

Run: `pnpm --filter @rtc/client-react-native test` → all green.
Run: `pnpm --filter @rtc/client-react-native typecheck` → no errors.
Run: `pnpm exec biome ci packages/client-react-native/src/ui/analytics` → zero findings.
Run: `pnpm lint:eslint` and `pnpm lint:eslint:types` (both configs) → zero errors in the new files.

- [ ] **Step 16: Commit**

```bash
git add packages/client-react-native/package.json packages/client-react-native/jest.config.js \
        packages/client-react-native/src/ui/analytics/buildChart.ts \
        packages/client-react-native/src/ui/analytics/buildChart.test.ts \
        packages/client-react-native/src/ui/analytics/PnlChart.tsx \
        packages/client-react-native/src/ui/analytics/PnlChart.test.tsx \
        packages/client-react-native/src/ui/analytics/PnlValue.tsx \
        packages/client-react-native/src/ui/analytics/PnlValue.test.tsx \
        pnpm-lock.yaml
git commit -m "feat(rn): P&L section — react-native-svg PnlChart + PnlValue off useAnalytics history"
```

---

### Task 2: `PairPnlBars` — per-pair horizontal bars

Renders one row per current position with a centre-anchored bar whose width encodes `basePnl`. Plain RN `View`s (no SVG) — the idiomatic, testable choice on RN. The web's hover→precise-value swap is dropped (no pointer on mobile); the label always shows `formatWithScale`.

**Files:**
- Create: `packages/client-react-native/src/ui/analytics/PairPnlBars.tsx`
- Test: `packages/client-react-native/src/ui/analytics/PairPnlBars.test.tsx`

**Interfaces:**
- Consumes: `CurrencyPairPosition`, `formatWithScale` from `@rtc/domain`.
- Produces: `PairPnlBars({ positions }: { positions: readonly CurrencyPairPosition[] }): JSX.Element` from `#/ui/analytics/PairPnlBars`.

- [ ] **Step 1: Write the failing test**

Create `packages/client-react-native/src/ui/analytics/PairPnlBars.test.tsx`:

```tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { PairPnlBars } from "#/ui/analytics/PairPnlBars";

function pos(symbol: string, basePnl: number): CurrencyPairPosition {
  return { symbol, basePnl, baseTradedAmount: 0, counterTradedAmount: 0 };
}

test("renders one row per position with a scaled label", async () => {
  await render(
    <PairPnlBars positions={[pos("EURUSD", 12000), pos("USDJPY", -3400)]} />,
  );
  expect(screen.getByTestId("pair-pnl-row-EURUSD")).toBeTruthy();
  expect(screen.getByTestId("pair-pnl-row-USDJPY")).toBeTruthy();
  expect(screen.getByText("EURUSD")).toBeTruthy();
  expect(screen.getByText("12k")).toBeTruthy();
});

test("renders nothing but the container when there are no positions", async () => {
  await render(<PairPnlBars positions={[]} />);
  expect(screen.getByTestId("pair-pnl-bars")).toBeTruthy();
  expect(screen.queryByTestId("pair-pnl-row-EURUSD")).toBeNull();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics/PairPnlBars.test.tsx`
Expected: FAIL — cannot resolve `#/ui/analytics/PairPnlBars`.

- [ ] **Step 3: Implement `PairPnlBars`**

Create `packages/client-react-native/src/ui/analytics/PairPnlBars.tsx`:

```tsx
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type CurrencyPairPosition, formatWithScale } from "@rtc/domain";

export function PairPnlBars({ positions }: PairPnlBarsProps): JSX.Element {
  const maxAbsPnl = Math.max(
    ...positions.map((p) => {
      return Math.abs(p.basePnl);
    }),
    1,
  );

  return (
    <View testID="pair-pnl-bars" style={styles.container}>
      {positions.map((pos) => {
        const fraction = Math.abs(pos.basePnl) / maxAbsPnl;
        const positive = pos.basePnl >= 0;
        return (
          <View
            key={pos.symbol}
            testID={`pair-pnl-row-${pos.symbol}`}
            style={styles.row}
          >
            <Text style={styles.symbol}>{pos.symbol}</Text>
            <View style={styles.track}>
              <View style={styles.centerLine} />
              <View
                style={[
                  styles.bar,
                  positive ? styles.barPos : styles.barNeg,
                  { flex: fraction },
                ]}
              />
              <View style={styles.spacer} />
            </View>
            <Text style={positive ? styles.labelPos : styles.labelNeg}>
              {formatWithScale(pos.basePnl)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

interface PairPnlBarsProps {
  positions: readonly CurrencyPairPosition[];
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  symbol: { width: 64, fontSize: 12 },
  track: { flex: 1, flexDirection: "row", alignItems: "center", height: 12 },
  centerLine: { position: "absolute", left: "50%", width: 1, height: 12, backgroundColor: "#c8c8c8" },
  bar: { height: 8 },
  barPos: { backgroundColor: "#3fb68b" },
  barNeg: { backgroundColor: "#e05252" },
  spacer: { flex: 1 },
  labelPos: { width: 56, textAlign: "right", color: "#3fb68b", fontSize: 12 },
  labelNeg: { width: 56, textAlign: "right", color: "#e05252", fontSize: 12 },
});
```

Note: the bar occupies a left-half `flex: fraction` slice with a `flex: 1` spacer to its right, so it grows from the centre line leftward-anchored within the track. Both signs render on the same side (magnitude-encoded); colour carries the sign — a deliberate mobile simplification of the web's two-sided bar.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics/PairPnlBars.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify gates**

Run: `pnpm --filter @rtc/client-react-native typecheck` → clean.
Run: `pnpm lint:eslint && pnpm lint:eslint:types` → no errors in the new file. Run repo `biome ci` → zero findings.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/analytics/PairPnlBars.tsx \
        packages/client-react-native/src/ui/analytics/PairPnlBars.test.tsx
git commit -m "feat(rn): PairPnlBars — per-pair P&L rows off useAnalytics currentPositions"
```

---

### Task 3: Exposure bubbles — `bubbleLayout` (pure) + `ExposureBubbles`

Resolves the d3-force straggler: a pure, deterministic **shelf-packing** layout (largest bubble first, wrap by width) that is provably non-overlapping, rendered with `react-native-svg`. No d3, no physics, no animation.

**Files:**
- Create: `packages/client-react-native/src/ui/analytics/bubbleLayout.ts`
- Test: `packages/client-react-native/src/ui/analytics/bubbleLayout.test.ts`
- Create: `packages/client-react-native/src/ui/analytics/ExposureBubbles.tsx`
- Test: `packages/client-react-native/src/ui/analytics/ExposureBubbles.test.tsx`

**Interfaces:**
- Consumes: `CurrencyPositionNode`, `CurrencyPairPosition`, `aggregatePositionsByCurrency` from `@rtc/domain`.
- Produces:
  - `interface PositionedBubble extends CurrencyPositionNode { x: number; y: number }` and `computeBubbleLayout(nodes: readonly CurrencyPositionNode[], viewport: { width: number }): readonly PositionedBubble[]` from `#/ui/analytics/bubbleLayout`.
  - `ExposureBubbles({ positions }: { positions: readonly CurrencyPairPosition[] }): JSX.Element` from `#/ui/analytics/ExposureBubbles`.

- [ ] **Step 1: Write the failing `bubbleLayout` test**

Create `packages/client-react-native/src/ui/analytics/bubbleLayout.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { CurrencyPositionNode } from "@rtc/domain";

import { computeBubbleLayout } from "#/ui/analytics/bubbleLayout";

function node(currency: string, radius: number): CurrencyPositionNode {
  return { currency, radius, tradedAmount: radius, sign: "pos", text: currency };
}

describe("computeBubbleLayout", () => {
  it("returns an empty array for no nodes", () => {
    expect(computeBubbleLayout([], { width: 320 })).toEqual([]);
  });

  it("keeps every circle within the horizontal bounds", () => {
    const placed = computeBubbleLayout(
      [node("EUR", 60), node("USD", 15), node("JPY", 40)],
      { width: 320 },
    );
    expect(placed).toHaveLength(3);
    for (const b of placed) {
      expect(b.x - b.radius).toBeGreaterThanOrEqual(0);
      expect(b.x + b.radius).toBeLessThanOrEqual(320);
    }
  });

  it("never overlaps two circles", () => {
    const placed = computeBubbleLayout(
      [node("EUR", 60), node("USD", 15), node("JPY", 40), node("GBP", 30)],
      { width: 320 },
    );
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist).toBeGreaterThanOrEqual(a.radius + b.radius);
      }
    }
  });

  it("is deterministic", () => {
    const nodes = [node("EUR", 60), node("USD", 15)];
    expect(computeBubbleLayout(nodes, { width: 320 })).toEqual(
      computeBubbleLayout(nodes, { width: 320 }),
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/analytics/bubbleLayout.test.ts`
Expected: FAIL — cannot resolve `#/ui/analytics/bubbleLayout`.

- [ ] **Step 3: Implement `bubbleLayout`**

Create `packages/client-react-native/src/ui/analytics/bubbleLayout.ts`:

```ts
import type { CurrencyPositionNode } from "@rtc/domain";

const GAP = 8;

export interface PositionedBubble extends CurrencyPositionNode {
  readonly x: number;
  readonly y: number;
}

/**
 * Deterministic shelf packing: largest bubble first, laid left-to-right,
 * wrapping to a new row when the next circle would exceed `width`. Rows are
 * separated by the tallest diameter in the row, so no two circles can overlap
 * (horizontal advance >= sum of radii within a row; vertical gap >= sum of
 * radii across rows). Pure and framework-free — the RN replacement for the
 * web's d3-force layout, which encoded no information beyond the radius.
 */
export function computeBubbleLayout(
  nodes: readonly CurrencyPositionNode[],
  viewport: { width: number },
): readonly PositionedBubble[] {
  const ordered = [...nodes].sort((a, b) => {
    if (b.radius !== a.radius) return b.radius - a.radius;
    return a.currency.localeCompare(b.currency);
  });

  const placed: PositionedBubble[] = [];
  let x = 0;
  let rowTop = 0;
  let rowMaxDiameter = 0;

  for (const node of ordered) {
    const diameter = node.radius * 2;
    if (x > 0 && x + diameter > viewport.width) {
      rowTop += rowMaxDiameter + GAP;
      x = 0;
      rowMaxDiameter = 0;
    }
    placed.push({ ...node, x: x + node.radius, y: rowTop + node.radius });
    x += diameter + GAP;
    rowMaxDiameter = Math.max(rowMaxDiameter, diameter);
  }

  return placed;
}

/** Total height needed to draw a laid-out set of bubbles. */
export function bubblesHeight(placed: readonly PositionedBubble[]): number {
  return placed.reduce((max, b) => {
    return Math.max(max, b.y + b.radius);
  }, 0);
}
```

- [ ] **Step 4: Run the `bubbleLayout` test to confirm it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/analytics/bubbleLayout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing `ExposureBubbles` test**

Create `packages/client-react-native/src/ui/analytics/ExposureBubbles.test.tsx`:

```tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { ExposureBubbles } from "#/ui/analytics/ExposureBubbles";

// EURUSD contributes to EUR (base) and USD (counter); USDJPY to USD and JPY.
const POSITIONS: readonly CurrencyPairPosition[] = [
  { symbol: "EURUSD", basePnl: 0, baseTradedAmount: 1_000_000, counterTradedAmount: -1_100_000 },
  { symbol: "USDJPY", basePnl: 0, baseTradedAmount: 500_000, counterTradedAmount: -55_000_000 },
];

test("renders one bubble per aggregated currency", async () => {
  await render(<ExposureBubbles positions={POSITIONS} />);
  // EUR, USD, JPY -> three currencies with non-zero net traded amounts.
  expect(screen.getByTestId("exposure-bubble-EUR")).toBeTruthy();
  expect(screen.getByTestId("exposure-bubble-USD")).toBeTruthy();
  expect(screen.getByTestId("exposure-bubble-JPY")).toBeTruthy();
});

test("renders an empty svg when there are no positions", async () => {
  await render(<ExposureBubbles positions={[]} />);
  expect(screen.getByTestId("exposure-bubbles")).toBeTruthy();
  expect(screen.queryByTestId("exposure-bubble-EUR")).toBeNull();
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics/ExposureBubbles.test.tsx`
Expected: FAIL — cannot resolve `#/ui/analytics/ExposureBubbles`.

- [ ] **Step 7: Implement `ExposureBubbles`**

Create `packages/client-react-native/src/ui/analytics/ExposureBubbles.tsx`:

```tsx
import type { JSX } from "react";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

import { aggregatePositionsByCurrency, type CurrencyPairPosition } from "@rtc/domain";

import { bubblesHeight, computeBubbleLayout } from "#/ui/analytics/bubbleLayout";

const AREA_WIDTH = 320;
const POSITIVE = "#3fb68b";
const NEGATIVE = "#e05252";

export function ExposureBubbles({ positions }: ExposureBubblesProps): JSX.Element {
  const placed = computeBubbleLayout(aggregatePositionsByCurrency(positions), {
    width: AREA_WIDTH,
  });
  const height = bubblesHeight(placed);

  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 ${AREA_WIDTH} ${height}`}
      preserveAspectRatio="xMidYMin meet"
      testID="exposure-bubbles"
    >
      {placed.map((bubble) => {
        return (
          <Circle
            key={bubble.currency}
            testID={`exposure-bubble-${bubble.currency}`}
            cx={bubble.x}
            cy={bubble.y}
            r={bubble.radius}
            fill={bubble.sign === "pos" ? POSITIVE : NEGATIVE}
            fillOpacity={0.7}
          />
        );
      })}
      {placed.map((bubble) => {
        return (
          <SvgText
            key={`${bubble.currency}-label`}
            x={bubble.x}
            y={bubble.y}
            fontSize={11}
            fill="#ffffff"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {bubble.currency}
          </SvgText>
        );
      })}
    </Svg>
  );
}

interface ExposureBubblesProps {
  positions: readonly CurrencyPairPosition[];
}
```

- [ ] **Step 8: Run the `ExposureBubbles` test to confirm it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics/ExposureBubbles.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Verify gates**

Run: `pnpm --filter @rtc/client-react-native test` → green.
Run: `pnpm --filter @rtc/client-react-native typecheck` → clean.
Run: `pnpm lint:eslint && pnpm lint:eslint:types`; repo `biome ci` → zero findings.

- [ ] **Step 10: Commit**

```bash
git add packages/client-react-native/src/ui/analytics/bubbleLayout.ts \
        packages/client-react-native/src/ui/analytics/bubbleLayout.test.ts \
        packages/client-react-native/src/ui/analytics/ExposureBubbles.tsx \
        packages/client-react-native/src/ui/analytics/ExposureBubbles.test.tsx
git commit -m "feat(rn): ExposureBubbles — pure deterministic bubble layout replacing d3-force"
```

---

### Task 4: `AnalyticsScreen` composition + Analytics tab

Composes the three sections behind `useAnalytics()`, adds loading and stale states, and wires the third Expo Router tab.

**Files:**
- Create: `packages/client-react-native/src/ui/analytics/AnalyticsScreen.tsx`
- Test: `packages/client-react-native/src/ui/analytics/AnalyticsScreen.test.tsx`
- Create: `packages/client-react-native/app/analytics.tsx`
- Modify: `packages/client-react-native/app/_layout.tsx` (add third `Tabs.Screen`)

**Interfaces:**
- Consumes: `useViewModel().useAnalytics()`, `.useAnalyticsStaleFlag()`; `PnlValue`, `PnlChart`, `PairPnlBars`, `ExposureBubbles` from Tasks 1–3; `PositionUpdates` from `@rtc/domain`; `type ViewModel`, `ViewModelProvider` from `@rtc/react-bindings`.
- Produces: `AnalyticsScreen(): JSX.Element` from `#/ui/analytics/AnalyticsScreen`; default-export `AnalyticsScreen` route at `app/analytics.tsx`.

- [ ] **Step 1: Write the failing `AnalyticsScreen` test**

Create `packages/client-react-native/src/ui/analytics/AnalyticsScreen.test.tsx`:

```tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import type { PositionUpdates } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AnalyticsScreen } from "#/ui/analytics/AnalyticsScreen";

const DATA: PositionUpdates = {
  history: [
    { timestamp: "t0", usdPnl: 0 },
    { timestamp: "t1", usdPnl: 1200 },
  ],
  currentPositions: [
    { symbol: "EURUSD", basePnl: 12000, baseTradedAmount: 1_000_000, counterTradedAmount: -1_100_000 },
  ],
};

function fakeViewModel(
  data: PositionUpdates | null,
  stale: boolean,
): ViewModel {
  return {
    useAnalytics: () => {
      return data;
    },
    useAnalyticsStaleFlag: () => {
      return stale;
    },
  } as unknown as ViewModel;
}

test("shows a loading state before the first emission", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel(null, false)}>
      <AnalyticsScreen />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("analytics-loading")).toBeTruthy();
  expect(screen.queryByTestId("analytics-panel")).toBeNull();
});

test("renders the three sections when data has arrived", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel(DATA, false)}>
      <AnalyticsScreen />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("analytics-panel")).toBeTruthy();
  expect(screen.getByTestId("pnl-value")).toBeTruthy();
  expect(screen.getByTestId("pnl-chart")).toBeTruthy();
  expect(screen.getByTestId("pair-pnl-row-EURUSD")).toBeTruthy();
  expect(screen.queryByTestId("analytics-stale")).toBeNull();
});

test("surfaces a stale indicator when the stream is stale", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel(DATA, true)}>
      <AnalyticsScreen />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("analytics-stale")).toBeTruthy();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics/AnalyticsScreen.test.tsx`
Expected: FAIL — cannot resolve `#/ui/analytics/AnalyticsScreen`.

- [ ] **Step 3: Implement `AnalyticsScreen`**

Create `packages/client-react-native/src/ui/analytics/AnalyticsScreen.tsx`:

```tsx
import type { JSX } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { ExposureBubbles } from "#/ui/analytics/ExposureBubbles";
import { PairPnlBars } from "#/ui/analytics/PairPnlBars";
import { PnlChart } from "#/ui/analytics/PnlChart";
import { PnlValue } from "#/ui/analytics/PnlValue";

export function AnalyticsScreen(): JSX.Element {
  const { useAnalytics, useAnalyticsStaleFlag } = useViewModel();
  const data = useAnalytics();
  const stale = useAnalyticsStaleFlag();

  if (data === null) {
    return (
      <Text testID="analytics-loading" style={styles.loading}>
        Loading analytics…
      </Text>
    );
  }

  const latestPnl =
    data.history.length > 0 ? data.history[data.history.length - 1].usdPnl : 0;

  return (
    <ScrollView
      testID="analytics-panel"
      style={[styles.panel, stale ? styles.stale : null]}
      contentContainerStyle={styles.content}
    >
      {stale ? (
        <Text testID="analytics-stale" style={styles.staleBadge}>
          Stale
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Profit &amp; Loss</Text>
        <PnlValue value={latestPnl} />
        <PnlChart history={data.history} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Positions</Text>
        <ExposureBubbles positions={data.currentPositions} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PnL per Currency Pair</Text>
        <PairPnlBars positions={data.currentPositions} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  content: { padding: 16, gap: 20 },
  stale: { opacity: 0.5 },
  staleBadge: { alignSelf: "flex-start", fontSize: 11, color: "#e0a552" },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: "600", opacity: 0.6 },
  loading: { padding: 16, opacity: 0.5 },
});
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/analytics/AnalyticsScreen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the route**

Create `packages/client-react-native/app/analytics.tsx`:

```tsx
import type { JSX } from "react";

import { AnalyticsScreen } from "#/ui/analytics/AnalyticsScreen";

/** The Analytics tab — FX P&L and position exposure. Composition, the
 * simulator toggle and the connection banner live one level up in `_layout`. */
export default function AnalyticsRoute(): JSX.Element {
  return <AnalyticsScreen />;
}
```

- [ ] **Step 6: Add the third tab in `_layout.tsx`**

In `packages/client-react-native/app/_layout.tsx`, add a third `Tabs.Screen` after the blotter screen:

```tsx
        <Tabs screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="index" options={{ title: "Rates" }} />
          <Tabs.Screen name="blotter" options={{ title: "Blotter" }} />
          <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
        </Tabs>
```

- [ ] **Step 7: Verify the export builds (route resolution)**

Run: `pnpm --filter @rtc/client-react-native export`
Expected: `expo export` succeeds; module count grows vs. Phase 3's 1585. No unresolved-module or router errors.

- [ ] **Step 8: Verify full gates**

Run: `pnpm --filter @rtc/client-react-native test` → all analytics + existing suites green.
Run: `pnpm --filter @rtc/client-react-native typecheck` → clean.
Run: `pnpm lint:eslint && pnpm lint:eslint:types` → zero errors. Repo `biome ci` → zero findings.

- [ ] **Step 9: Commit**

```bash
git add packages/client-react-native/src/ui/analytics/AnalyticsScreen.tsx \
        packages/client-react-native/src/ui/analytics/AnalyticsScreen.test.tsx \
        packages/client-react-native/app/analytics.tsx \
        packages/client-react-native/app/_layout.tsx
git commit -m "feat(rn): Analytics tab — AnalyticsScreen composition + third expo-router tab"
```

---

## Final verification (controller, before PR)

Re-run the full gauntlet first-hand with real exit codes (do not trust turbo cache):

```bash
pnpm build && pnpm typecheck && pnpm test
pnpm --filter @rtc/client-react-native test          # vitest + jest island
pnpm --filter @rtc/client-react-native export        # expo module graph
pnpm exec biome ci .                                  # zero findings
pnpm lint:eslint && pnpm lint:eslint:types            # both ESLint configs
pnpm lint:css                                         # stylelint
pnpm check:deps                                       # dependency-cruiser: no app→app / inward violations
pnpm check:versions
pnpm knip                                             # no new unused exports/deps
```

Then ship per `shipping-repo-changes`: push branch, open PR, poll `gh run list --branch <b> --workflow CI --json status,conclusion,headSha` until the run whose `headSha` == HEAD is `completed`/`success`; merge only with explicit user OK via `gh pr merge <n> --merge`.

## Self-Review notes

- **Spec coverage:** four surfaces → Tasks 1 (PnlValue, PnlChart), 2 (PairPnlBars), 3 (ExposureBubbles); loading + stale + tab → Task 4. Straggler resolution → Task 3 (`bubbleLayout`, no d3). `react-native-svg` dep + jest transform → Task 1. Non-goals (equities, drag/tooltip, animation, Maestro/visual) are absent by construction.
- **Type consistency:** `buildChart` returns `{ path, zeroY }` (Task 1) consumed only inside `PnlChart`; `computeBubbleLayout`/`PositionedBubble`/`bubblesHeight` (Task 3) consumed only inside `ExposureBubbles`; `AnalyticsScreen` (Task 4) consumes the four component prop shapes exactly as produced. All `@rtc/domain` / ViewModel signatures are copied verbatim from the spec.
- **Deviations from the web, recorded:** bars are one-sided (colour encodes sign) and drop the hover→precise swap; bubbles use shelf packing (not force) and are static. Both are deliberate mobile simplifications noted in the spec's non-goals.
