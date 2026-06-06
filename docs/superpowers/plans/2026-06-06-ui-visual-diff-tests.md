# UI Visual-Diff Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, framework-portable visual-regression test tier that screenshots `@rtc/client` React components and pages rendered against injected fake data, so the same baselines can later gate a SolidJS reimplementation of the UI layer.

**Architecture:** The UI layer reads *all* its data through one seam — the `AppHooks` object supplied by `HooksProvider` (`packages/client/src/ui/hooks/`). We exploit that seam: a framework-neutral `AppData` fixture is turned into a fake `AppHooks` by a thin React adapter, components/pages are mounted with `<ThemeProvider><HooksProvider hooks={fake}>…`, and Playwright Component Testing screenshots the result. The fixtures, the scenario manifest, and the golden PNGs are kept in a React-free `visual/shared/` folder (the portable core); only the adapter, the component registry, and the mount wrapper are framework-specific. Porting to SolidJS later = reimplement those three small files against the same `visual/shared/` artifacts.

**Tech Stack:** Playwright Component Testing (`@playwright/experimental-ct-react`), Vite + `@vitejs/plugin-react` (already a client dep), React 19, RxJS (for no-op command stubs), TypeScript.

---

## Why this tier is neither e2e nor integration

- **e2e** (`tests/` package `test:browser:*`) drives the whole deployed app in a browser against a simulated server.
- **integration** (`tests/` package `test:presenter:*`) wires real presenters + `createApp` + simulator ports and asserts on stream output.
- **this tier** mounts only `src/ui/**` components with *injected fake hooks*. The dependency graph stops at the `HooksProvider` boundary — no presenters, no domain use cases, no server, no live streams, no timers. It tests rendering only, which is exactly the layer a SolidJS port would replace.

## Determinism notes (verified against current code)

- `useStaleDetection` (`src/ui/shell/stale/useStaleDetection.ts`) only flips to stale on a CONNECTED-after-DISCONNECTED transition. With a single static `connectionStatus`, it never flips and uses no timer. Safe.
- No `setInterval`/`requestAnimationFrame`/`Math.random`/`Date.now` in the render path except the RFQ flow (`TileRfq.tsx`, `useRfqState.ts`). All scenarios in this plan keep RFQ inactive (notional below RFQ threshold), so that code path never runs.
- The Tile's only animation is `transition: opacity 0.3s`. Playwright's `animations: 'disabled'` forces transitions to their end state, so this is handled.
- Theme is applied as CSS custom properties on `document.documentElement` by `ThemeProvider` (there is **no** global stylesheet). Every mount must therefore be wrapped in `ThemeProvider`, and the wrapper paints a `var(--bg-primary)` backdrop so component-level shots aren't on default-white.

## File structure

Portable core (React-free — this is what moves to a shared package when SolidJS arrives):
- `packages/client/visual/shared/appData.ts` — `AppData` type + `defaultAppData`.
- `packages/client/visual/shared/fixtures.ts` — named fixture data.
- `packages/client/visual/shared/scenarios.ts` — scenario manifest (`name → { componentKey, fixtureKey }`).

React-specific harness:
- `packages/client/visual/react/buildFakeHooks.ts` — `AppData → AppHooks`.
- `packages/client/visual/react/registry.tsx` — `componentKey → React element`.
- `packages/client/visual/react/VisualScenario.tsx` — looks up component + fixture by scenario name, wraps in providers.

Playwright CT scaffolding + specs:
- `packages/client/playwright-ct.config.ts`
- `packages/client/playwright/index.html`
- `packages/client/playwright/index.tsx`
- `packages/client/visual/*.spec.tsx` — thin specs (one `toHaveScreenshot` per scenario).
- `packages/client/visual/__screenshots__/` — golden PNGs (committed).

Wiring:
- `packages/client/package.json` — `test:visual` scripts + dep.
- `README.md` / `docs/` — porting recipe.

---

## Task 1: Scaffold Playwright Component Testing in `@rtc/client`

**Files:**
- Modify: `packages/client/package.json`
- Create: `packages/client/playwright-ct.config.ts`
- Create: `packages/client/playwright/index.html`
- Create: `packages/client/playwright/index.tsx`
- Create: `packages/client/.gitignore` (append) or modify existing

- [ ] **Step 1: Add the CT dependency and scripts**

Edit `packages/client/package.json`. Add to `devDependencies` (match the Playwright version used in the `tests/` package, `^1.50`):

```json
"@playwright/experimental-ct-react": "^1.50"
```

Add to `scripts`:

```json
"test:visual": "playwright test -c playwright-ct.config.ts",
"test:visual:update": "playwright test -c playwright-ct.config.ts --update-snapshots",
"test:visual:ui": "playwright test -c playwright-ct.config.ts --ui"
```

- [ ] **Step 2: Install and fetch the browser**

Run:
```bash
cd packages/client && pnpm install && pnpm exec playwright install chromium
```
Expected: install completes; Chromium downloaded.

- [ ] **Step 3: Write the CT config**

Create `packages/client/playwright-ct.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";

export default defineConfig({
  testDir: "./visual",
  testMatch: "**/*.spec.tsx",
  snapshotDir: "./visual/__screenshots__",
  // Identical golden filename on every OS/arch so baselines are portable
  // across machines and (later) across the React/Solid harnesses.
  snapshotPathTemplate: "{snapshotDir}/{testFileName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    viewport: { width: 1280, height: 800 },
    ctViteConfig: { plugins: [react()] },
    ctPort: 3100,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

- [ ] **Step 4: Write the CT index files**

Create `packages/client/playwright/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

Create `packages/client/playwright/index.tsx` (no global providers here — providers are per-scenario; just normalize the body so screenshots are stable):

```tsx
// Component-test runtime entry. Providers are applied per-scenario inside
// VisualScenario, so this file only normalizes the page chrome.
const style = document.createElement("style");
style.textContent = "html,body{margin:0;padding:0;}";
document.head.appendChild(style);
```

- [ ] **Step 5: Ignore Playwright output**

Append to `packages/client/.gitignore` (create if absent):

```
playwright-report/
test-results/
visual/__screenshots__/**/*-actual.png
visual/__screenshots__/**/*-diff.png
```

(Golden `*.png` ARE committed; only `-actual`/`-diff` artifacts are ignored.)

- [ ] **Step 6: Commit**

```bash
git add packages/client/package.json packages/client/pnpm-lock.yaml packages/client/playwright-ct.config.ts packages/client/playwright packages/client/.gitignore ../../pnpm-lock.yaml
git commit -m "chore(client): scaffold Playwright component testing for visual diffs"
```

(If the lockfile is at the repo root only, adjust the `git add` paths accordingly; run `git status` first.)

---

## Task 2: Define the framework-neutral data contract

**Files:**
- Create: `packages/client/visual/shared/appData.ts`

This file must import only `@rtc/domain` types — **no React, no client internals.** It is the portable core.

- [ ] **Step 1: Write `AppData` and `defaultAppData`**

Create `packages/client/visual/shared/appData.ts`:

```ts
// Framework-neutral snapshot of everything the UI reads through AppHooks.
// No React/Solid imports — this file (and the rest of visual/shared) is the
// portable core shared by every UI implementation.
import {
  ConnectionStatus,
  type CurrencyPair, type Price, type PriceTick, type Trade,
  type Rfq, type Quote, type PositionUpdates,
  type Instrument, type Dealer,
} from "@rtc/domain";

export interface AppData {
  prices: Record<string, Price | null>;
  priceHistory: Record<string, readonly PriceTick[]>;
  trades: readonly Trade[];
  analytics: PositionUpdates | null;
  rfqs: readonly Rfq[];
  quotesForRfq: Record<number, readonly Quote[]>;
  allQuotes: ReadonlyMap<number, Quote>;
  currencyPairs: readonly CurrencyPair[];
  instruments: readonly Instrument[];
  dealers: readonly Dealer[];
  connectionStatus: ConnectionStatus;
}

/** A fully-populated empty baseline; fixtures override only what they exercise. */
export const defaultAppData: AppData = {
  prices: {},
  priceHistory: {},
  trades: [],
  analytics: null,
  rfqs: [],
  quotesForRfq: {},
  allQuotes: new Map(),
  currencyPairs: [],
  instruments: [],
  dealers: [],
  connectionStatus: ConnectionStatus.CONNECTED,
};

/** Shallow-merge a partial fixture over the baseline. */
export function makeAppData(overrides: Partial<AppData>): AppData {
  return { ...defaultAppData, ...overrides };
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
cd packages/client && pnpm exec tsc --noEmit
```
Expected: PASS (no errors from the new file).

- [ ] **Step 3: Commit**

```bash
git add packages/client/visual/shared/appData.ts
git commit -m "feat(visual): add framework-neutral AppData contract"
```

---

## Task 3: React adapter — `AppData` → `AppHooks`

**Files:**
- Create: `packages/client/visual/react/buildFakeHooks.ts`

- [ ] **Step 1: Write the adapter**

Create `packages/client/visual/react/buildFakeHooks.ts`. It returns the exact `AppHooks` shape from `src/ui/hooks/createAppHooks.ts`; commands are no-ops (never invoked during a static screenshot):

```ts
import { EMPTY, type Observable } from "rxjs";
import {
  type CurrencyPair, type Quote,
  type ExecuteTradeInput, type ExecuteTradeResult, type CreateRfqInput,
  type RfqQuoteResult, type QuoteRequest,
} from "@rtc/domain";
import type { AppHooks } from "../../src/ui/hooks/createAppHooks";
import type { AppData } from "../shared/appData";

export function buildFakeHooks(data: AppData): AppHooks {
  return {
    usePrice: (pair: CurrencyPair) => data.prices[pair.symbol] ?? null,
    usePriceHistory: (symbol: string) => data.priceHistory[symbol] ?? [],
    useTrades: () => data.trades,
    useAnalytics: () => data.analytics,
    useRfqs: () => data.rfqs,
    useQuotesForRfq: (rfqId: number) => data.quotesForRfq[rfqId] ?? [],
    useAllQuotes: () => data.allQuotes,
    useCurrencyPairs: () => data.currencyPairs,
    useInstruments: () => data.instruments,
    useDealers: () => data.dealers,
    useConnectionStatus: () => data.connectionStatus,
    // Commands: no-op observables. Not exercised by static screenshots.
    useExecuteTrade: () => (_input: ExecuteTradeInput) =>
      EMPTY as Observable<ExecuteTradeResult>,
    useCreateRfq: () => (_input: CreateRfqInput) => EMPTY as Observable<number>,
    useAcceptQuote: () => (_quoteId: number) => EMPTY as Observable<void>,
    useCancelRfq: () => (_rfqId: number) => EMPTY as Observable<void>,
    usePassQuote: () => (_quoteId: number) => EMPTY as Observable<void>,
    useQuoteRfq: () => (_request: QuoteRequest) => EMPTY as Observable<void>,
    useRequestRfqQuote: () => (_symbol: string, _pipsPosition: number) =>
      EMPTY as Observable<RfqQuoteResult>,
  };
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
cd packages/client && pnpm exec tsc --noEmit
```
Expected: PASS. If a member is missing/renamed, TypeScript will flag the mismatch against `AppHooks` — fix to match `createAppHooks.ts` exactly.

- [ ] **Step 3: Commit**

```bash
git add packages/client/visual/react/buildFakeHooks.ts
git commit -m "feat(visual): add React AppData->AppHooks adapter"
```

---

## Task 4: First fixture, scenario manifest, registry, and mount wrapper (connection status)

Start with the simplest component (`ConnectionStatusBar`) to prove the whole pipeline end-to-end before adding richer scenarios.

**Files:**
- Create: `packages/client/visual/shared/fixtures.ts`
- Create: `packages/client/visual/shared/scenarios.ts`
- Create: `packages/client/visual/react/registry.tsx`
- Create: `packages/client/visual/react/VisualScenario.tsx`

- [ ] **Step 1: Write the first fixtures**

Create `packages/client/visual/shared/fixtures.ts`:

```ts
import { ConnectionStatus } from "@rtc/domain";
import { type AppData, makeAppData } from "./appData";

export const fixtures: Record<string, AppData> = {
  "connection-connected": makeAppData({
    connectionStatus: ConnectionStatus.CONNECTED,
  }),
  "connection-disconnected": makeAppData({
    connectionStatus: ConnectionStatus.DISCONNECTED,
  }),
};
```

- [ ] **Step 2: Write the scenario manifest**

Create `packages/client/visual/shared/scenarios.ts`:

```ts
// Neutral manifest: a scenario name maps to a component key (resolved per
// framework by registry.tsx) and a fixture key (resolved from fixtures.ts).
export interface Scenario {
  readonly componentKey: string;
  readonly fixtureKey: string;
}

export const scenarios: Record<string, Scenario> = {
  "connection-status/connected": {
    componentKey: "ConnectionStatusBar",
    fixtureKey: "connection-connected",
  },
  "connection-status/disconnected": {
    componentKey: "ConnectionStatusBar",
    fixtureKey: "connection-disconnected",
  },
};
```

- [ ] **Step 3: Write the React component registry**

Create `packages/client/visual/react/registry.tsx`:

```tsx
import type { ReactElement } from "react";
import { ConnectionStatusBar } from "../../src/ui/shell/connection/ConnectionStatusBar";

// Maps a neutral componentKey to a concrete React element. The SolidJS port
// supplies its own registry with the same keys.
export const registry: Record<string, () => ReactElement> = {
  ConnectionStatusBar: () => <ConnectionStatusBar />,
};
```

- [ ] **Step 4: Write the mount wrapper**

Create `packages/client/visual/react/VisualScenario.tsx`:

```tsx
import { ThemeProvider } from "../../src/ui/shell/theme/ThemeProvider";
import { HooksProvider } from "../../src/ui/hooks/HooksProvider";
import { scenarios } from "../shared/scenarios";
import { fixtures } from "../shared/fixtures";
import { buildFakeHooks } from "./buildFakeHooks";
import { registry } from "./registry";

export function VisualScenario({ name }: { name: string }) {
  const scenario = scenarios[name];
  if (!scenario) throw new Error(`Unknown visual scenario: ${name}`);
  const data = fixtures[scenario.fixtureKey];
  if (!data) throw new Error(`Unknown fixture: ${scenario.fixtureKey}`);
  const render = registry[scenario.componentKey];
  if (!render) throw new Error(`Unknown component: ${scenario.componentKey}`);

  return (
    <ThemeProvider>
      <HooksProvider hooks={buildFakeHooks(data)}>
        <div
          style={{
            // ThemeProvider sets CSS vars on <html>; paint a real backdrop so
            // component-level shots aren't on default white.
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            padding: 24,
            display: "inline-block",
          }}
        >
          {render()}
        </div>
      </HooksProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 5: Write the first spec**

Create `packages/client/visual/connection.spec.tsx`:

```tsx
import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "./react/VisualScenario";

test("connection-status/connected", async ({ mount }) => {
  const c = await mount(<VisualScenario name="connection-status/connected" />);
  await expect(c).toHaveScreenshot("connected.png", { animations: "disabled" });
});

test("connection-status/disconnected", async ({ mount }) => {
  const c = await mount(<VisualScenario name="connection-status/disconnected" />);
  await expect(c).toHaveScreenshot("disconnected.png", { animations: "disabled" });
});
```

- [ ] **Step 6: Run WITHOUT baselines to confirm the harness drives the component (expected "missing snapshot" failure)**

Run:
```bash
cd packages/client && pnpm test:visual
```
Expected: tests run and FAIL with `A snapshot doesn't exist ... writing actual.` This proves mount + render + screenshot work (the failure is only the missing golden). If instead it fails with a render error (e.g. "useHooks must be used within HooksProvider", missing CSS var, bundling error), fix the harness before generating baselines.

- [ ] **Step 7: Generate and visually inspect baselines**

Run:
```bash
cd packages/client && pnpm test:visual:update
```
Expected: PASS; golden PNGs written under `visual/__screenshots__/connection.spec.tsx/`. **Open both PNGs** and confirm: dark background, a coloured status dot, and the label ("Connected" / "Disconnected"). If they look wrong (e.g. unstyled/white), the ThemeProvider wrap is not taking effect — fix and regenerate.

- [ ] **Step 8: Re-run to confirm green against committed baselines**

Run:
```bash
cd packages/client && pnpm test:visual
```
Expected: PASS (2 passed).

- [ ] **Step 9: Commit**

```bash
git add packages/client/visual
git commit -m "feat(visual): visual-diff harness with connection-status scenarios"
```

---

## Task 5: Add Tile component scenarios (price tile + loading)

**Files:**
- Modify: `packages/client/visual/shared/fixtures.ts`
- Modify: `packages/client/visual/shared/scenarios.ts`
- Modify: `packages/client/visual/react/registry.tsx`
- Create: `packages/client/visual/tile.spec.tsx`

- [ ] **Step 1: Add Tile fixtures**

Append to `fixtures` in `packages/client/visual/shared/fixtures.ts` (add imports `CurrencyPair`, `Price`, `PriceMovementType` from `@rtc/domain`):

```ts
const eurusd: CurrencyPair = {
  symbol: "EURUSD", ratePrecision: 5, pipsPosition: 4,
  base: "EUR", terms: "USD", defaultNotional: 1_000_000,
};

const eurusdPrice: Price = {
  symbol: "EURUSD",
  bid: 1.09213, ask: 1.09227, mid: 1.0922,
  valueDate: "2026-06-08", creationTimestamp: 1_750_000_000_000,
  movementType: PriceMovementType.UP,
  spread: "1.4",
};
```

Then add entries to the `fixtures` object:

```ts
  "tile-eurusd-up": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: eurusdPrice },
  }),
  "tile-loading": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: null },
  }),
```

- [ ] **Step 2: Register the Tile component**

In `packages/client/visual/react/registry.tsx`, add the import and a registry entry. The Tile needs a `pair` prop; read it from the fixture's first currency pair so the registry entry stays data-driven:

```tsx
import { Tile } from "../../src/ui/fx/liveRates/tile/Tile";
import { fixtures } from "../shared/fixtures";
```

Change the registry signature to receive the fixture key so prop-bearing components can pull props from data. Replace the registry definition with:

```tsx
export const registry: Record<string, (fixtureKey: string) => ReactElement> = {
  ConnectionStatusBar: () => <ConnectionStatusBar />,
  Tile: (fixtureKey) => {
    const pair = fixtures[fixtureKey].currencyPairs[0];
    return <Tile pair={pair} showChart={false} />;
  },
};
```

- [ ] **Step 3: Update `VisualScenario` to pass the fixture key into the registry**

In `packages/client/visual/react/VisualScenario.tsx`, change the render call from `render()` to `render(scenario.fixtureKey)`.

- [ ] **Step 4: Write the Tile spec**

Create `packages/client/visual/tile.spec.tsx`:

```tsx
import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "./react/VisualScenario";

test("tile/eurusd-up", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/eurusd-up" />);
  await expect(c).toHaveScreenshot("eurusd-up.png", { animations: "disabled" });
});

test("tile/loading", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/loading" />);
  await expect(c).toHaveScreenshot("loading.png", { animations: "disabled" });
});
```

- [ ] **Step 5: Add the scenarios to the manifest**

Append to `scenarios` in `packages/client/visual/shared/scenarios.ts`:

```ts
  "tile/eurusd-up": { componentKey: "Tile", fixtureKey: "tile-eurusd-up" },
  "tile/loading": { componentKey: "Tile", fixtureKey: "tile-loading" },
```

- [ ] **Step 6: Generate, inspect, verify**

Run:
```bash
cd packages/client && pnpm test:visual:update
```
Expected: PASS. Open `visual/__screenshots__/tile.spec.tsx/eurusd-up.png` — a price tile with EUR/USD header, bid/ask, spread. Open `loading.png` — a tile showing "Loading...". Then run `pnpm test:visual` and confirm all (connection + tile) pass.

- [ ] **Step 7: Commit**

```bash
git add packages/client/visual
git commit -m "feat(visual): add Tile price + loading scenarios"
```

---

## Task 6: Add AnalyticsPanel scenarios (populated + loading)

**Files:**
- Modify: `packages/client/visual/shared/fixtures.ts`
- Modify: `packages/client/visual/shared/scenarios.ts`
- Modify: `packages/client/visual/react/registry.tsx`
- Create: `packages/client/visual/analytics.spec.tsx`

- [ ] **Step 1: Add analytics fixtures**

In `packages/client/visual/shared/fixtures.ts` add a `PositionUpdates` import from `@rtc/domain`, then define data and entries:

```ts
const analyticsData: PositionUpdates = {
  currentPositions: [
    { symbol: "EURUSD", basePnl: 12500, baseTradedAmount: 3_000_000, counterTradedAmount: -3_276_600 },
    { symbol: "USDJPY", basePnl: -4200, baseTradedAmount: -1_000_000, counterTradedAmount: 151_200_000 },
    { symbol: "GBPUSD", basePnl: 8800, baseTradedAmount: 2_000_000, counterTradedAmount: -2_534_000 },
  ],
  history: [
    { timestamp: "2026-06-06T09:00:00Z", usdPnl: 0 },
    { timestamp: "2026-06-06T10:00:00Z", usdPnl: 5400 },
    { timestamp: "2026-06-06T11:00:00Z", usdPnl: 3100 },
    { timestamp: "2026-06-06T12:00:00Z", usdPnl: 9200 },
    { timestamp: "2026-06-06T13:00:00Z", usdPnl: 17100 },
  ],
};
```

Add to `fixtures`:

```ts
  "analytics-populated": makeAppData({ analytics: analyticsData }),
  "analytics-loading": makeAppData({ analytics: null }),
```

- [ ] **Step 2: Register the component**

In `registry.tsx` add:

```tsx
import { AnalyticsPanel } from "../../src/ui/fx/analytics/AnalyticsPanel";
```
and the registry entry:
```tsx
  AnalyticsPanel: () => <AnalyticsPanel />,
```

- [ ] **Step 3: Add scenarios**

Append to `scenarios.ts`:

```ts
  "analytics/populated": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-populated" },
  "analytics/loading": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-loading" },
```

- [ ] **Step 4: Write the spec**

Create `packages/client/visual/analytics.spec.tsx`:

```tsx
import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "./react/VisualScenario";

test("analytics/populated", async ({ mount }) => {
  const c = await mount(<VisualScenario name="analytics/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});

test("analytics/loading", async ({ mount }) => {
  const c = await mount(<VisualScenario name="analytics/loading" />);
  await expect(c).toHaveScreenshot("loading.png", { animations: "disabled" });
});
```

- [ ] **Step 5: Generate, inspect, verify**

Run:
```bash
cd packages/client && pnpm test:visual:update
```
Open `visual/__screenshots__/analytics.spec.tsx/populated.png` — confirm PnL value, PnL chart, position bubbles, and per-pair bars render with no blank/animating regions. If any sub-chart looks half-drawn, it is animating; check `PnlChart`/`PositionBubbles`/`PairPnlBars` for a mount transition and, if present, add a CSS-disable to the wrapper or assert after `animations: "disabled"` settles (it should already cover CSS transitions). Then `pnpm test:visual` → all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/client/visual
git commit -m "feat(visual): add AnalyticsPanel scenarios"
```

---

## Task 7: Add ConnectionOverlay scenario (offline)

**Files:**
- Modify: `packages/client/visual/shared/fixtures.ts`
- Modify: `packages/client/visual/shared/scenarios.ts`
- Modify: `packages/client/visual/react/registry.tsx`
- Create: `packages/client/visual/overlay.spec.tsx`

- [ ] **Step 1: Add fixture**

In `fixtures.ts` add:

```ts
  "connection-offline": makeAppData({
    connectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED,
  }),
```

- [ ] **Step 2: Register component**

In `registry.tsx` add:

```tsx
import { ConnectionOverlay } from "../../src/ui/shell/connection/ConnectionOverlay";
```
```tsx
  ConnectionOverlay: () => <ConnectionOverlay />,
```

- [ ] **Step 3: Add scenario**

In `scenarios.ts`:

```ts
  "connection-overlay/offline": { componentKey: "ConnectionOverlay", fixtureKey: "connection-offline" },
```

- [ ] **Step 4: Write the spec**

`ConnectionOverlay` renders `position: fixed; inset: 0`, so it covers the viewport, not the `inline-block` wrapper. Screenshot the **page**, not the component locator:

Create `packages/client/visual/overlay.spec.tsx`:

```tsx
import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "./react/VisualScenario";

test("connection-overlay/offline", async ({ mount, page }) => {
  await mount(<VisualScenario name="connection-overlay/offline" />);
  await expect(page).toHaveScreenshot("offline.png", { animations: "disabled" });
});
```

- [ ] **Step 5: Generate, inspect, verify**

Run `cd packages/client && pnpm test:visual:update`. Open `visual/__screenshots__/overlay.spec.tsx/offline.png` — full-viewport dim overlay with the offline message card centred. Then `pnpm test:visual` → pass.

- [ ] **Step 6: Commit**

```bash
git add packages/client/visual
git commit -m "feat(visual): add ConnectionOverlay offline scenario"
```

---

## Task 8: Page-level scenario — LiveRatesPanel

**Files:**
- Modify: `packages/client/visual/shared/fixtures.ts`
- Modify: `packages/client/visual/shared/scenarios.ts`
- Modify: `packages/client/visual/react/registry.tsx`
- Create: `packages/client/visual/liveRates.spec.tsx`

- [ ] **Step 1: Add a multi-pair fixture**

In `fixtures.ts`, define three pairs + prices and a fixture. Reuse `eurusd`/`eurusdPrice` from Task 5; add two more:

```ts
const gbpusd: CurrencyPair = {
  symbol: "GBPUSD", ratePrecision: 5, pipsPosition: 4,
  base: "GBP", terms: "USD", defaultNotional: 1_000_000,
};
const usdjpy: CurrencyPair = {
  symbol: "USDJPY", ratePrecision: 3, pipsPosition: 2,
  base: "USD", terms: "JPY", defaultNotional: 1_000_000,
};
const gbpusdPrice: Price = {
  symbol: "GBPUSD", bid: 1.26410, ask: 1.26428, mid: 1.26419,
  valueDate: "2026-06-08", creationTimestamp: 1_750_000_000_000,
  movementType: PriceMovementType.DOWN, spread: "1.8",
};
const usdjpyPrice: Price = {
  symbol: "USDJPY", bid: 151.203, ask: 151.219, mid: 151.211,
  valueDate: "2026-06-08", creationTimestamp: 1_750_000_000_000,
  movementType: PriceMovementType.UP, spread: "1.6",
};
```

Add to `fixtures`:

```ts
  "live-rates-populated": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
  }),
```

- [ ] **Step 2: Register the panel**

In `registry.tsx`:

```tsx
import { LiveRatesPanel } from "../../src/ui/fx/liveRates/LiveRatesPanel";
```
```tsx
  LiveRatesPanel: () => <LiveRatesPanel />,
```

- [ ] **Step 3: Add scenario**

In `scenarios.ts`:

```ts
  "live-rates/populated": { componentKey: "LiveRatesPanel", fixtureKey: "live-rates-populated" },
```

- [ ] **Step 4: Write the spec**

`LiveRatesPanel` reads `localStorage` for view mode (defaults to "chart" on a fresh CT page). To keep the baseline deterministic regardless of any persisted value, clear storage before mount:

Create `packages/client/visual/liveRates.spec.tsx`:

```tsx
import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "./react/VisualScenario";

test("live-rates/populated", async ({ mount, page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  const c = await mount(<VisualScenario name="live-rates/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});
```

- [ ] **Step 5: Generate, inspect, verify**

Run `cd packages/client && pnpm test:visual:update`. Open `visual/__screenshots__/liveRates.spec.tsx/populated.png` — the currency filter, view toggle, and a grid of three tiles with charts. Then `pnpm test:visual` → pass.

- [ ] **Step 6: Commit**

```bash
git add packages/client/visual
git commit -m "feat(visual): add LiveRatesPanel page scenario"
```

---

## Task 9: Page-level scenario — full App (FX tab)

**Files:**
- Modify: `packages/client/visual/shared/fixtures.ts`
- Modify: `packages/client/visual/shared/scenarios.ts`
- Modify: `packages/client/visual/react/registry.tsx`
- Create: `packages/client/visual/app.spec.tsx`

- [ ] **Step 1: Add an app fixture**

The `<App/>` default tab is "fx", which renders LiveRates + Analytics + Blotter via `Workspace`. Reuse the multi-pair price data plus analytics. In `fixtures.ts`:

```ts
  "app-fx": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    analytics: analyticsData,
    connectionStatus: ConnectionStatus.CONNECTED,
  }),
```

- [ ] **Step 2: Register App**

`App` paints its own full-height container, so it should not sit inside the padded `inline-block` wrapper. Register it and special-case it in `VisualScenario` (next step). In `registry.tsx`:

```tsx
import { App } from "../../src/ui/App";
```
```tsx
  App: () => <App />,
```

- [ ] **Step 3: Let full-page components opt out of the padded wrapper**

In `VisualScenario.tsx`, render full-bleed components without the inline-block padding. Add a set of bleed keys and branch:

```tsx
const FULL_BLEED = new Set(["App"]);
```
and in the return, when `FULL_BLEED.has(scenario.componentKey)` render:

```tsx
<ThemeProvider>
  <HooksProvider hooks={buildFakeHooks(data)}>{render(scenario.fixtureKey)}</HooksProvider>
</ThemeProvider>
```
otherwise keep the padded wrapper branch from Task 4.

- [ ] **Step 4: Add scenario**

In `scenarios.ts`:

```ts
  "app/fx": { componentKey: "App", fixtureKey: "app-fx" },
```

- [ ] **Step 5: Write the spec (full-page screenshot)**

Create `packages/client/visual/app.spec.tsx`:

```tsx
import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "./react/VisualScenario";

test("app/fx", async ({ mount, page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await mount(<VisualScenario name="app/fx" />);
  await expect(page).toHaveScreenshot("fx.png", { animations: "disabled", fullPage: true });
});
```

- [ ] **Step 6: Generate, inspect, verify**

Run `cd packages/client && pnpm test:visual:update`. Open `visual/__screenshots__/app.spec.tsx/fx.png` — header with tabs, FX workspace (live rates + analytics + blotter region), footer with connection status, no overlay (CONNECTED). Then `pnpm test:visual` → all scenarios pass.

- [ ] **Step 7: Commit**

```bash
git add packages/client/visual
git commit -m "feat(visual): add full-App FX page scenario"
```

---

## Task 10: Wire into the monorepo + document the SolidJS porting recipe

**Files:**
- Modify: `turbo.json` (repo root)
- Modify: `README.md` (repo root)
- Create: `packages/client/visual/README.md`

- [ ] **Step 1: Register the task in Turborepo**

In the repo-root `turbo.json`, add a `test:visual` task. Match the style of the existing `test:e2e` entry (snapshots are inputs/outputs; disable caching the same way `test:e2e` is configured). Example entry inside `"tasks"`:

```json
"test:visual": {
  "dependsOn": ["^build"],
  "cache": false
}
```

Run `git show HEAD:turbo.json` first to copy the exact existing conventions (e.g. whether tasks use `dependsOn`, `outputs`, or `cache`).

- [ ] **Step 2: Verify the task runs through turbo**

Run:
```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone && pnpm turbo run test:visual --filter=@rtc/client
```
Expected: the client visual suite runs and passes.

- [ ] **Step 3: Document the tier in the root README**

Add a short subsection under the existing test documentation describing the visual tier: what it is (component/page screenshots against fake hooks), how to run (`pnpm --filter @rtc/client test:visual`), how to update baselines (`test:visual:update`), and that it is neither e2e nor integration.

- [ ] **Step 4: Write the porting recipe**

Create `packages/client/visual/README.md`:

```markdown
# Visual-diff tests

Screenshots of the UI layer rendered against injected fake data. No server,
no presenters, no live streams — the dependency graph stops at HooksProvider.

## Layout

- `shared/` — framework-neutral core. `appData.ts` (data contract),
  `fixtures.ts` (named data), `scenarios.ts` (name -> component+fixture).
  **No React imports.** This folder is what a SolidJS UI reuses verbatim.
- `react/` — the React harness: `buildFakeHooks.ts` (AppData -> AppHooks),
  `registry.tsx` (componentKey -> React element), `VisualScenario.tsx`.
- `*.spec.tsx` — one `toHaveScreenshot` per scenario.
- `__screenshots__/` — committed golden PNGs (the cross-framework contract).

## Running

- `pnpm test:visual` — compare against goldens.
- `pnpm test:visual:update` — (re)generate goldens. Inspect the PNGs before committing.
- `pnpm test:visual:ui` — interactive runner.

## Porting to another UI framework (e.g. SolidJS)

The goal: run the **same** scenarios and match the **same** goldens.

1. Reuse `visual/shared/` unchanged (or extract it to a shared package and
   depend on it from both UI packages).
2. Implement the three framework-specific files for the new framework:
   - a `buildFakeProvider(data)` that feeds `AppData` into that framework's
     equivalent of `HooksProvider` (Solid: a context/store of signals),
   - a `registry` mapping the same `componentKey`s to the new components,
   - a `VisualScenario` wrapper (theme + provider + backdrop).
3. Point that package's Playwright CT config `snapshotPathTemplate` at the
   shared `__screenshots__/` directory so both frameworks compare to one golden.
4. Run `test:visual`. Pixel diffs are the parity report between implementations.

Keep the contract in the data (`shared/`) and the goldens — not in the
React-shaped `AppHooks` interface, which each framework adapts to its own model.
```

- [ ] **Step 5: Final full run**

Run:
```bash
cd packages/client && pnpm test:visual && pnpm exec tsc --noEmit
```
Expected: all visual specs pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add turbo.json README.md packages/client/visual/README.md
git commit -m "docs(visual): wire test:visual into turbo and document Solid porting recipe"
```

---

## Self-review checklist (completed during authoring)

- **Spec coverage:** framework-neutral contract (Task 2), React adapter (Task 3), portable harness + registry + wrapper (Task 4), component-level scenarios — Tile (5), Analytics (6), ConnectionOverlay (7) — page-level scenarios — LiveRatesPanel (8), full App (9) — and monorepo wiring + SolidJS porting recipe (10). The "both layered" requirement (component + page) is covered; the "not e2e/not integration" requirement is structurally enforced by mounting only `src/ui` against fake hooks; the "portable to SolidJS without overdoing it" requirement is met by the three-file framework boundary over a React-free `shared/` core.
- **Determinism:** addressed in the dedicated notes section and applied per-spec (`animations: "disabled"`, fixed viewport, `localStorage.clear()` for storage-reading panels, static timestamps, RFQ path kept inactive, stale-detection proven timer-free).
- **Type consistency:** `AppData`/`makeAppData`/`defaultAppData`, `buildFakeHooks`, `scenarios`/`Scenario`, `fixtures`, `registry(fixtureKey)`, and `VisualScenario({ name })` names are used consistently across tasks. The registry signature change (Task 5: `() => ` becomes `(fixtureKey) => `) is called out explicitly with the matching `VisualScenario` update.

## Deferred (separate change, by user request)

The `tests/` package script/folder rename (`fake` → `fake-timers`; dropping `raw`/`real`/`plain`) is intentionally **out of scope** here and will be planned separately after this tier lands.
```
