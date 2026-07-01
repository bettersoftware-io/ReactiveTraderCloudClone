# Client-Prototype P2.5 — FX Aside (Analytics + Positions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the FX dock's two aside placeholders (Analytics + Positions) with a faithful port of the v2 prototype, and complete the aside's one live element — the running PnL figure.

**Architecture:** Two new feature folders under `src/fx/` — `Analytics/` and `Positions/` — each with small dumb components, co-located static seed data, and CSS Modules, mirroring P2's `LiveRates/`/`Blotter/`. The only live behavior (PnL) is finished in the already-existing `useFxRates` hook (seed + per-tick drift; the per-fill jump already exists). `FxScreen` swaps its two placeholder `<div>`s for the new views. One optional decorative prop is added to the shared `Panel`.

**Tech Stack:** React 19, TypeScript (strict), Vite, Vitest + @testing-library/react (smoke-only), CSS Modules, `#/` subpath imports.

## Global Constraints

- Package `@rtc/client-prototype` only. **No** `@rtc/domain`/`@rtc/shared`, no RxJS/machines, no `ViewModel` seam, no React Compiler.
- Full CSS Modules; **zero** `style={{…}}` object literals. Runtime-varying values use a **named-const** `style={x}` object typed `as CSSProperties` setting a `--custom-property` (the ESLint inline-style ban matches object literals only, not variable refs — no `eslint-disable` needed).
- `#/` subpath imports only; no `../../` (≥2-up) relative imports.
- Test conventions: `@testing-library/react`; explicit `cleanup()` in `afterEach`; `arrow-body-style: always` (every arrow — including `.map`/`.find` callbacks — uses a block body with `return`); named `interface`s (no inline object types in signatures); `rtc/newspaper-order` (in test files, helpers/types sit **below** the `describe`); `rtc/component-newspaper` (a file's exported component is the lede; any private subcomponent sits below it; filename matches the exported component). Prefer `function` declarations over arrow consts for module-level functions (`func-style`).
- All PROTO values (seed arrays, `pnl` constants, formulas, derived sizes) are used **verbatim** as given below.
- Fidelity: PROTO L503–531 / L1296–1300. Only `pnl` is live; the per-pair bars, sparkline shape, and position bubbles are **static seed data** — faithful, not a shortcut.
- Theme tokens are camelCase in TS → kebab CSS vars: `--bg2`, `--accent2`, `--buy`, `--sell`, `--dim`, `--faint`, `--text`, `--border`, `--panel-head`, `--font-m`, `--font-d`. The `spin` keyframe already exists in `src/styles/global.css`.
- Full gate before each commit: `pnpm --filter @rtc/client-prototype typecheck && pnpm --filter @rtc/client-prototype test run && pnpm --filter @rtc/client-prototype lint` (or the repo's documented per-package gate). Never `git add .`; never stage `.superpowers/`, `.idea/`, `.env.local`, or scratch files — stage only the exact files a task names.

---

### Task 1: Live PnL in `useFxRates` (seed + per-tick drift)

**Files:**
- Modify: `packages/client-prototype/src/fx/useFxRates.ts`
- Test: `packages/client-prototype/tests/fx-pnl-live.test.ts`

**Interfaces:**
- Consumes: existing `useFxRates(opts?: UseFxRatesOptions): RatesApi`. `RatesApi` already includes `pnl: number`. `UseFxRatesOptions = { rng?: () => number; intervalMs?: number }`. The hook already holds `const [pnl, setPnl] = useState(0)`, already calls `setPnl` in `book()` (the per-fill jump), and drives a 250ms walk `setInterval` that calls `setWalk`.
- Produces: `pnl` seeds to `17120` and drifts by `Math.round((rng() - 0.42) * 500)` on every walk tick, floored at 0. No signature change.

- [ ] **Step 1: Write the failing test**

Create `packages/client-prototype/tests/fx-pnl-live.test.ts`:

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useFxRates } from "#/fx/useFxRates";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useFxRates pnl", () => {
  test("seeds pnl at 17120 before any tick", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useFxRates({ rng: () => 0, intervalMs: 250 });
    });

    expect(result.current.pnl).toBe(17120);
  });

  test("drifts pnl by round((rng-0.42)*500) on each tick", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useFxRates({ rng: () => 0, intervalMs: 250 });
    });

    act(() => {
      vi.advanceTimersByTime(250);
    });

    // round((0 - 0.42) * 500) = -210
    expect(result.current.pnl).toBe(16910);
  });

  test("floors pnl at 0 under sustained downward drift", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useFxRates({ rng: () => 0, intervalMs: 250 });
    });

    act(() => {
      vi.advanceTimersByTime(250 * 100);
    });

    expect(result.current.pnl).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype test run fx-pnl-live`
Expected: FAIL — first test fails (`pnl` seeds to `0`, not `17120`).

- [ ] **Step 3: Add the seed + tick-drift constants**

In `packages/client-prototype/src/fx/useFxRates.ts`, find the existing PnL constants near the top of the module:

```ts
const REJECT_PROBABILITY = 0.12;
const PNL_SPAN = 800;
const PNL_BIAS = 0.3;
```

Add three constants directly beneath them:

```ts
const REJECT_PROBABILITY = 0.12;
const PNL_SPAN = 800;
const PNL_BIAS = 0.3;
const PNL_SEED = 17120;
const PNL_TICK_SPAN = 500;
const PNL_TICK_BIAS = 0.42;
```

- [ ] **Step 4: Seed pnl**

In the same file, change the PnL state initializer:

```ts
const [pnl, setPnl] = useState(0);
```

to:

```ts
const [pnl, setPnl] = useState(PNL_SEED);
```

- [ ] **Step 5: Drift pnl on each walk tick**

Find the walk `useEffect` (the one with `intervalMs` in its dep array):

```ts
  useEffect(() => {
    const id = setInterval(() => {
      setWalk((prev) => {
        const next = walkTick(prev, rngRef.current);
        ratesRef.current = next.rates;
        return next;
      });
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);
```

Add a `setPnl` drift call inside the interval callback, after `setWalk`:

```ts
  useEffect(() => {
    const id = setInterval(() => {
      setWalk((prev) => {
        const next = walkTick(prev, rngRef.current);
        ratesRef.current = next.rates;
        return next;
      });
      setPnl((prev) => {
        return Math.max(
          0,
          prev + Math.round((rngRef.current() - PNL_TICK_BIAS) * PNL_TICK_SPAN),
        );
      });
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype test run fx-pnl-live`
Expected: PASS (3/3).

- [ ] **Step 7: Run the full package gate**

Run: `pnpm --filter @rtc/client-prototype typecheck && pnpm --filter @rtc/client-prototype test run && pnpm --filter @rtc/client-prototype lint`
Expected: all green (the existing `fx-rates-walk` and `fx-exec` tests still pass — they don't pin `pnl`).

- [ ] **Step 8: Commit**

```bash
git add packages/client-prototype/src/fx/useFxRates.ts packages/client-prototype/tests/fx-pnl-live.test.ts
git commit -m "feat(client-prototype): live PnL in useFxRates (seed 17120 + per-tick drift)"
```

---

### Task 2: `Panel.headAccessory` decorative slot

**Files:**
- Modify: `packages/client-prototype/src/fx/layout/Panel.tsx`
- Modify: `packages/client-prototype/src/fx/layout/Panel.module.css`
- Test: `packages/client-prototype/tests/fx-panel-accessory.test.tsx`

**Interfaces:**
- Consumes: existing `Panel` — `PanelProps = { id: PanelId; head: ReactElement; children: ReactNode; maxPanel: PanelId | null; onToggleMax(id: PanelId): void }`.
- Produces: `PanelProps` gains optional `headAccessory?: ReactNode`, rendered right-aligned immediately before the maximize button. Omitting it leaves existing panels unchanged.

- [ ] **Step 1: Write the failing test**

Create `packages/client-prototype/tests/fx-panel-accessory.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { Panel } from "#/fx/layout/Panel";

afterEach(cleanup);

describe("Panel headAccessory", () => {
  test("renders the accessory node when provided", () => {
    const { getByText, getByLabelText } = render(
      <Panel
        id="ana"
        head={<span>Analytics</span>}
        maxPanel={null}
        onToggleMax={noop}
        headAccessory="⊕"
      >
        <div>body</div>
      </Panel>,
    );
    expect(getByText("⊕")).toBeTruthy();
    expect(getByLabelText("Maximize")).toBeTruthy();
  });

  test("omits the accessory when not provided", () => {
    const { queryByText, getByLabelText } = render(
      <Panel id="ana" head={<span>Analytics</span>} maxPanel={null} onToggleMax={noop}>
        <div>body</div>
      </Panel>,
    );
    expect(queryByText("⊕")).toBeNull();
    expect(getByLabelText("Maximize")).toBeTruthy();
  });
});

// — helpers ————————————————————————————————————————————————————————————————

function noop(): void {
  // no-op toggle handler for the test
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype test run fx-panel-accessory`
Expected: FAIL — `headAccessory` is not a known prop; `⊕` never renders (and TypeScript errors on the unknown prop).

- [ ] **Step 3: Add the prop and render slot**

In `packages/client-prototype/src/fx/layout/Panel.tsx`, extend `PanelProps` and render the accessory. The `import type` line already imports `ReactElement, ReactNode`. Update the interface:

```ts
export interface PanelProps {
  id: PanelId;
  head: ReactElement;
  children: ReactNode;
  maxPanel: PanelId | null;
  onToggleMax(id: PanelId): void;
  headAccessory?: ReactNode;
}
```

Destructure it and render a decorative wrapper before the maximize button:

```tsx
export function Panel(props: PanelProps): ReactElement {
  const { id, head, children, maxPanel, onToggleMax, headAccessory } = props;
  const isMax = maxPanel === id;

  function handleMaxClick(): void {
    onToggleMax(id);
  }

  return (
    <div className={styles.panel} data-max={String(isMax)}>
      <div className={styles.head}>
        {head}
        {headAccessory != null ? (
          <span className={styles.accessory} aria-hidden="true">
            {headAccessory}
          </span>
        ) : null}
        <button
          type="button"
          className={styles.maxBtn}
          aria-label="Maximize"
          title="Maximize"
          onClick={handleMaxClick}
        >
          {isMax ? "⤡" : "⤢"}
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Style the accessory (right-aligned, decorative)**

In `packages/client-prototype/src/fx/layout/Panel.module.css`, add an `.accessory` rule. `margin-left: auto` pushes the accessory and the following maximize button (which has `order: 99`) to the right edge; panels without an accessory are unaffected:

```css
.accessory {
  order: 98;
  margin-left: auto;
  color: var(--faint);
  font-size: 13px;
  line-height: 1;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype test run fx-panel-accessory`
Expected: PASS (2/2).

- [ ] **Step 6: Run the full package gate**

Run: `pnpm --filter @rtc/client-prototype typecheck && pnpm --filter @rtc/client-prototype test run && pnpm --filter @rtc/client-prototype lint`
Expected: all green (existing `fx-panel`/`fx-screen` tests unaffected — they pass no `headAccessory`).

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/fx/layout/Panel.tsx packages/client-prototype/src/fx/layout/Panel.module.css packages/client-prototype/tests/fx-panel-accessory.test.tsx
git commit -m "feat(client-prototype): optional decorative headAccessory slot on Panel"
```

---

### Task 3: Analytics seed data (`analyticsData.ts`)

**Files:**
- Create: `packages/client-prototype/src/fx/Analytics/analyticsData.ts`
- Test: `packages/client-prototype/tests/fx-analytics-data.test.ts`

**Interfaces:**
- Consumes: nothing (leaf data module).
- Produces:
  - `interface PairPnl { pair: string; val: number; width: number; positive: boolean; }`
  - `const PAIR_PNL: PairPnl[]` — 6 rows (PROTO L1300).
  - `const PNL_LINE: string`, `const PNL_AREA: string` — static sparkline geometry (PROTO L1297–1298).
  - `function fmtPnl(pnl: number): string` — `+$17.1k` style (PROTO L1299).
  - `function fmtBarVal(val: number): string` — `+13k` / `-4k` (PROTO L1300).

- [ ] **Step 1: Write the failing test**

Create `packages/client-prototype/tests/fx-analytics-data.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  fmtBarVal,
  fmtPnl,
  PAIR_PNL,
  PNL_AREA,
  PNL_LINE,
} from "#/fx/Analytics/analyticsData";

describe("analyticsData", () => {
  test("fmtPnl formats thousands with a sign and $…k", () => {
    expect(fmtPnl(17120)).toBe("+$17.1k");
    expect(fmtPnl(0)).toBe("+$0.0k");
  });

  test("fmtBarVal signs positive values and leaves negatives bare", () => {
    expect(fmtBarVal(13)).toBe("+13k");
    expect(fmtBarVal(-4)).toBe("-4k");
  });

  test("PAIR_PNL has the six PROTO pairs in order", () => {
    expect(
      PAIR_PNL.map((row) => {
        return row.pair;
      }),
    ).toEqual(["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "USDCAD", "EURJPY"]);
  });

  test("sparkline geometry starts at the first point and closes to the baseline", () => {
    expect(PNL_LINE.startsWith("0,92")).toBe(true);
    expect(PNL_AREA.startsWith("M0,92 ")).toBe(true);
    expect(PNL_AREA.endsWith("L300,100 L0,100 Z")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype test run fx-analytics-data`
Expected: FAIL — module `#/fx/Analytics/analyticsData` does not exist.

- [ ] **Step 3: Write the data module**

Create `packages/client-prototype/src/fx/Analytics/analyticsData.ts`:

```ts
export interface PairPnl {
  pair: string;
  val: number;
  width: number;
  positive: boolean;
}

// PROTO 1297: static PnL sparkline — 11 y-values across a 300-wide viewBox.
const PNL_PTS = [92, 76, 84, 54, 64, 40, 48, 34, 22, 14, 8];
const PNL_N = PNL_PTS.length;

// PROTO 1300 `bars`: [pair, val (thousands), bar width %, positive].
export const PAIR_PNL: PairPnl[] = [
  { pair: "EURUSD", val: 13, width: 78, positive: true },
  { pair: "USDJPY", val: -4, width: 26, positive: false },
  { pair: "GBPUSD", val: 9, width: 58, positive: true },
  { pair: "AUDUSD", val: 6, width: 42, positive: true },
  { pair: "USDCAD", val: -2, width: 16, positive: false },
  { pair: "EURJPY", val: 5, width: 38, positive: true },
];

// PROTO 1297-1298: the polyline points, and the closed area path that drops to
// the 100-tall baseline for the gradient fill.
export const PNL_LINE = PNL_PTS.map((y, i) => {
  return `${Math.round((i / (PNL_N - 1)) * 300)},${y}`;
}).join(" ");

export const PNL_AREA = `M0,${PNL_PTS[0]} ${PNL_LINE} L300,100 L0,100 Z`;

// PROTO 1299: `+$17.1k`. pnl is floored at 0 so the sign is always +.
export function fmtPnl(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "-";
  return `${sign}$${(Math.abs(pnl) / 1000).toFixed(1)}k`;
}

// PROTO 1300: bar value label, e.g. "+13k" / "-4k".
export function fmtBarVal(val: number): string {
  return `${val > 0 ? "+" : ""}${val}k`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype test run fx-analytics-data`
Expected: PASS (4/4).

- [ ] **Step 5: Run the full package gate**

Run: `pnpm --filter @rtc/client-prototype typecheck && pnpm --filter @rtc/client-prototype test run && pnpm --filter @rtc/client-prototype lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/client-prototype/src/fx/Analytics/analyticsData.ts packages/client-prototype/tests/fx-analytics-data.test.ts
git commit -m "feat(client-prototype): FX analytics seed data + PnL formatters"
```

---

### Task 4: Analytics components (`PnlSparkline`, `PnlSummary`, `PairPnlBars`, `AnalyticsView`)

**Files:**
- Create: `packages/client-prototype/src/fx/Analytics/PnlSparkline.tsx`
- Create: `packages/client-prototype/src/fx/Analytics/PnlSummary.tsx`
- Create: `packages/client-prototype/src/fx/Analytics/PnlSummary.module.css`
- Create: `packages/client-prototype/src/fx/Analytics/PairPnlBars.tsx`
- Create: `packages/client-prototype/src/fx/Analytics/PairPnlBars.module.css`
- Create: `packages/client-prototype/src/fx/Analytics/AnalyticsView.tsx`
- Create: `packages/client-prototype/src/fx/Analytics/AnalyticsView.module.css`
- Test: `packages/client-prototype/tests/fx-analytics.test.tsx`

**Interfaces:**
- Consumes: `analyticsData` — `PAIR_PNL`, `PairPnl`, `PNL_LINE`, `PNL_AREA`, `fmtPnl`, `fmtBarVal` (Task 3).
- Produces:
  - `AnalyticsView(props: { pnl: number }): ReactElement` — the aside Analytics panel **body** (no panel chrome; that's `FxScreen`/`Panel`).
  - `PnlSummary(props: { pnl: number }): ReactElement`, `PnlSparkline(): ReactElement`, `PairPnlBars(): ReactElement`.

- [ ] **Step 1: Write the failing test**

Create `packages/client-prototype/tests/fx-analytics.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { AnalyticsView } from "#/fx/Analytics/AnalyticsView";

afterEach(cleanup);

describe("AnalyticsView", () => {
  test("renders the P&L header with a formatted pnl", () => {
    const { getByText } = render(<AnalyticsView pnl={17120} />);
    expect(getByText(/Profit & Loss · Today/)).toBeTruthy();
    expect(getByText("+$17.1k")).toBeTruthy();
  });

  test("renders all six currency-pair bars with values", () => {
    const { getByText } = render(<AnalyticsView pnl={0} />);
    for (const pair of ["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "USDCAD", "EURJPY"]) {
      expect(getByText(pair)).toBeTruthy();
    }
    expect(getByText("+13k")).toBeTruthy();
    expect(getByText("-4k")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype test run fx-analytics`
Expected: FAIL — `#/fx/Analytics/AnalyticsView` does not exist.

- [ ] **Step 3: Write `PnlSparkline` + its styles**

Create `packages/client-prototype/src/fx/Analytics/PnlSparkline.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/fx/Analytics/PnlSummary.module.css";
import { PNL_AREA, PNL_LINE } from "#/fx/Analytics/analyticsData";

// PROTO 509: static area+line PnL chart. The area is filled with a vertical
// accent2 gradient; the line is the buy color with a soft glow.
export function PnlSparkline(): ReactElement {
  return (
    <svg
      className={styles.spark}
      viewBox="0 0 300 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent2)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--accent2)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={PNL_AREA} fill="url(#pnlFill)" />
      <polyline
        className={styles.sparkLine}
        points={PNL_LINE}
        fill="none"
        stroke="var(--buy)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 4: Write `PnlSummary` + its styles**

Create `packages/client-prototype/src/fx/Analytics/PnlSummary.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/fx/Analytics/PnlSummary.module.css";
import { fmtPnl } from "#/fx/Analytics/analyticsData";
import { PnlSparkline } from "#/fx/Analytics/PnlSparkline";

export interface PnlSummaryProps {
  pnl: number;
}

// PROTO 506-509: "Profit & Loss · Today" label, the big glowing figure
// (color by sign), and the static sparkline.
export function PnlSummary(props: PnlSummaryProps): ReactElement {
  const { pnl } = props;
  const sign = pnl >= 0 ? "pos" : "neg";

  return (
    <div>
      <div className={styles.label}>Profit &amp; Loss · Today</div>
      <div className={styles.value} data-sign={sign}>
        {fmtPnl(pnl)}
      </div>
      <PnlSparkline />
    </div>
  );
}
```

Create `packages/client-prototype/src/fx/Analytics/PnlSummary.module.css`:

```css
.label {
  font-family: var(--font-m, monospace);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--faint);
  text-transform: uppercase;
}

.value {
  margin: 3px 0 2px;
  font-family: "Orbitron", sans-serif;
  font-weight: 700;
  font-size: 32px;
  letter-spacing: 0.02em;
  text-shadow: 0 0 18px currentColor;
}

.value[data-sign="pos"] {
  color: var(--buy);
}

.value[data-sign="neg"] {
  color: var(--sell);
}

.spark {
  display: block;
  width: 100%;
  height: 90px;
}

.sparkLine {
  filter: drop-shadow(0 0 5px var(--buy));
}
```

- [ ] **Step 5: Write `PairPnlBars` + its styles**

Create `packages/client-prototype/src/fx/Analytics/PairPnlBars.tsx` (single component — the per-row markup is mapped inline so the `--bar-pct` custom property is computed per iteration):

```tsx
import type { CSSProperties, ReactElement } from "react";

import styles from "#/fx/Analytics/PairPnlBars.module.css";
import { fmtBarVal, PAIR_PNL } from "#/fx/Analytics/analyticsData";

// PROTO 511-513: "PnL per Currency Pair" with one horizontal bar per pair —
// pair label, a track whose fill width is the PROTO width %, and the value.
export function PairPnlBars(): ReactElement {
  return (
    <>
      <div className={styles.heading}>PnL per Currency Pair</div>
      {PAIR_PNL.map((row) => {
        const fillStyle = { "--bar-pct": `${row.width}%` } as CSSProperties;
        const sign = row.positive ? "pos" : "neg";
        return (
          <div className={styles.row} key={row.pair}>
            <span className={styles.pair}>{row.pair}</span>
            <span className={styles.track}>
              <span className={styles.fill} data-sign={sign} style={fillStyle} />
            </span>
            <span className={styles.val} data-sign={sign}>
              {fmtBarVal(row.val)}
            </span>
          </div>
        );
      })}
    </>
  );
}
```

Create `packages/client-prototype/src/fx/Analytics/PairPnlBars.module.css`:

```css
.heading {
  margin: 14px 0 11px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--faint);
  text-transform: uppercase;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 7px;
}

.pair {
  width: 62px;
  font-family: var(--font-m, monospace);
  font-size: 11px;
  color: var(--dim);
}

.track {
  position: relative;
  flex: 1;
  height: 8px;
  overflow: hidden;
  background: var(--bg2);
  border-radius: 2px;
}

.fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--bar-pct);
}

.fill[data-sign="pos"] {
  background: var(--buy);
  box-shadow: 0 0 10px var(--buy);
}

.fill[data-sign="neg"] {
  background: var(--sell);
  box-shadow: 0 0 10px var(--sell);
}

.val {
  width: 38px;
  font-family: var(--font-m, monospace);
  font-size: 11px;
  text-align: right;
}

.val[data-sign="pos"] {
  color: var(--buy);
}

.val[data-sign="neg"] {
  color: var(--sell);
}
```

- [ ] **Step 6: Write `AnalyticsView` + its styles**

Create `packages/client-prototype/src/fx/Analytics/AnalyticsView.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/fx/Analytics/AnalyticsView.module.css";
import { PairPnlBars } from "#/fx/Analytics/PairPnlBars";
import { PnlSummary } from "#/fx/Analytics/PnlSummary";

export interface AnalyticsViewProps {
  pnl: number;
}

// PROTO 505-515: the Analytics panel body — PnL summary over the per-pair bars.
export function AnalyticsView(props: AnalyticsViewProps): ReactElement {
  const { pnl } = props;

  return (
    <div className={styles.body}>
      <PnlSummary pnl={pnl} />
      <PairPnlBars />
    </div>
  );
}
```

Create `packages/client-prototype/src/fx/Analytics/AnalyticsView.module.css` (PROTO `sb16` = scroll body, 16px padding):

```css
.body {
  padding: 16px;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype test run fx-analytics`
Expected: PASS (2/2).

- [ ] **Step 8: Run the full package gate**

Run: `pnpm --filter @rtc/client-prototype typecheck && pnpm --filter @rtc/client-prototype test run && pnpm --filter @rtc/client-prototype lint`
Expected: all green (typecheck, Biome, ESLint inline-style ban, stylelint).

- [ ] **Step 9: Commit**

```bash
git add packages/client-prototype/src/fx/Analytics/PnlSparkline.tsx packages/client-prototype/src/fx/Analytics/PnlSummary.tsx packages/client-prototype/src/fx/Analytics/PnlSummary.module.css packages/client-prototype/src/fx/Analytics/PairPnlBars.tsx packages/client-prototype/src/fx/Analytics/PairPnlBars.module.css packages/client-prototype/src/fx/Analytics/AnalyticsView.tsx packages/client-prototype/src/fx/Analytics/AnalyticsView.module.css packages/client-prototype/tests/fx-analytics.test.tsx
git commit -m "feat(client-prototype): FX Analytics aside (PnL summary + per-pair bars)"
```

---

### Task 5: Positions seed data (`positionsData.ts`)

**Files:**
- Create: `packages/client-prototype/src/fx/Positions/positionsData.ts`
- Test: `packages/client-prototype/tests/fx-positions-data.test.ts`

**Interfaces:**
- Consumes: nothing (leaf data module).
- Produces:
  - `interface Exposure { ccy: string; val: number; positive: boolean; size: number; large: boolean; amt: string; }`
  - `const EXPOSURE: Exposure[]` — 7 currencies with derived `size` (`Math.round(40 + Math.sqrt(Math.abs(val)) * 11)`), `large` (`size > 62`), and `amt` (`+15.2M` / `-22.8M`) (PROTO L1299).

- [ ] **Step 1: Write the failing test**

Create `packages/client-prototype/tests/fx-positions-data.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { EXPOSURE } from "#/fx/Positions/positionsData";

describe("positionsData", () => {
  test("has the seven PROTO currencies in order", () => {
    expect(
      EXPOSURE.map((e) => {
        return e.ccy;
      }),
    ).toEqual(["EUR", "USD", "JPY", "GBP", "AUD", "CAD", "NZD"]);
  });

  test("derives bubble size from sqrt of exposure and flags large bubbles", () => {
    const eur = EXPOSURE.find((e) => {
      return e.ccy === "EUR";
    });
    const nzd = EXPOSURE.find((e) => {
      return e.ccy === "NZD";
    });
    expect(eur?.size).toBe(83);
    expect(eur?.large).toBe(true);
    expect(nzd?.size).toBe(56);
    expect(nzd?.large).toBe(false);
  });

  test("formats the amount with sign and M suffix", () => {
    const usd = EXPOSURE.find((e) => {
      return e.ccy === "USD";
    });
    expect(usd?.amt).toBe("-22.8M");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype test run fx-positions-data`
Expected: FAIL — module `#/fx/Positions/positionsData` does not exist.

- [ ] **Step 3: Write the data module**

Create `packages/client-prototype/src/fx/Positions/positionsData.ts`:

```ts
export interface Exposure {
  ccy: string;
  val: number;
  positive: boolean;
  size: number;
  large: boolean;
  amt: string;
}

// PROTO 1299 `bubData`: [ccy, net exposure (millions), positive].
const EXPOSURE_SEED: Array<[string, number, boolean]> = [
  ["EUR", 15.2, true],
  ["USD", -22.8, false],
  ["JPY", 8.4, true],
  ["GBP", -6.1, false],
  ["AUD", 4.7, true],
  ["CAD", -3.2, false],
  ["NZD", 2.1, true],
];

// PROTO 1299: bubble diameter grows with sqrt(|exposure|); bubbles over 62px
// get the larger 15px label. Amount label is signed with an M suffix.
export const EXPOSURE: Exposure[] = EXPOSURE_SEED.map(([ccy, val, positive]) => {
  const size = Math.round(40 + Math.sqrt(Math.abs(val)) * 11);
  return {
    ccy,
    val,
    positive,
    size,
    large: size > 62,
    amt: `${val > 0 ? "+" : ""}${val}M`,
  };
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype test run fx-positions-data`
Expected: PASS (3/3).

- [ ] **Step 5: Run the full package gate**

Run: `pnpm --filter @rtc/client-prototype typecheck && pnpm --filter @rtc/client-prototype test run && pnpm --filter @rtc/client-prototype lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/client-prototype/src/fx/Positions/positionsData.ts packages/client-prototype/tests/fx-positions-data.test.ts
git commit -m "feat(client-prototype): FX positions seed data (derived bubble sizes)"
```

---

### Task 6: Positions components (`ExposureBubbles`, `ExposureRows`, `PositionsView`)

**Files:**
- Create: `packages/client-prototype/src/fx/Positions/ExposureBubbles.tsx`
- Create: `packages/client-prototype/src/fx/Positions/ExposureBubbles.module.css`
- Create: `packages/client-prototype/src/fx/Positions/ExposureRows.tsx`
- Create: `packages/client-prototype/src/fx/Positions/ExposureRows.module.css`
- Create: `packages/client-prototype/src/fx/Positions/PositionsView.tsx`
- Create: `packages/client-prototype/src/fx/Positions/PositionsView.module.css`
- Test: `packages/client-prototype/tests/fx-positions.test.tsx`

**Interfaces:**
- Consumes: `positionsData` — `EXPOSURE` (Task 5). The `spin` keyframe from `src/styles/global.css`.
- Produces:
  - `PositionsView(): ReactElement` — the aside Positions panel **body**.
  - `ExposureBubbles(): ReactElement`, `ExposureRows(): ReactElement`.

- [ ] **Step 1: Write the failing test**

Create `packages/client-prototype/tests/fx-positions.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { PositionsView } from "#/fx/Positions/PositionsView";

afterEach(cleanup);

describe("PositionsView", () => {
  test("renders the Net Exposure heading", () => {
    const { getByText } = render(<PositionsView />);
    expect(getByText("Net Exposure")).toBeTruthy();
  });

  test("renders a bubble and a row for each of the seven currencies", () => {
    const { getAllByText } = render(<PositionsView />);
    for (const ccy of ["EUR", "USD", "JPY", "GBP", "AUD", "CAD", "NZD"]) {
      // one instance in the bubble cluster, one in the list below
      expect(getAllByText(ccy).length).toBe(2);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype test run fx-positions`
Expected: FAIL — `#/fx/Positions/PositionsView` does not exist.

- [ ] **Step 3: Write `ExposureBubbles` + its styles**

Create `packages/client-prototype/src/fx/Positions/ExposureBubbles.tsx`:

```tsx
import type { CSSProperties, ReactElement } from "react";

import styles from "#/fx/Positions/ExposureBubbles.module.css";
import { EXPOSURE } from "#/fx/Positions/positionsData";

// PROTO 519-521: the net-exposure bubble cluster — one circle per currency,
// diameter by |exposure|, a slowly spinning ring, a radial glow, and the
// ccy/amount label. Sign drives color; large bubbles get a bigger label.
export function ExposureBubbles(): ReactElement {
  return (
    <div className={styles.cluster}>
      {EXPOSURE.map((e) => {
        const sizeStyle = { "--bubble-size": `${e.size}px` } as CSSProperties;
        const sign = e.positive ? "pos" : "neg";
        return (
          <div
            className={styles.bubble}
            key={e.ccy}
            data-sign={sign}
            data-large={e.large ? "true" : "false"}
            style={sizeStyle}
          >
            <span className={styles.ring} data-sign={sign} />
            <span className={styles.glow} data-sign={sign} />
            <span className={styles.inner}>
              <span className={styles.ccy}>{e.ccy}</span>
              <span className={styles.amt}>{e.amt}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

Create `packages/client-prototype/src/fx/Positions/ExposureBubbles.module.css`:

```css
.cluster {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin: 8px 0 14px;
}

.bubble {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--bubble-size);
  height: var(--bubble-size);
  border-radius: 50%;
}

.bubble[data-sign="pos"] {
  background: rgba(43, 255, 179, 0.1);
}

.bubble[data-sign="neg"] {
  background: rgba(255, 93, 115, 0.1);
}

.ring {
  position: absolute;
  inset: 0;
  border: 1px solid;
  border-radius: 50%;
  opacity: 0.5;
  animation: spin 22s linear infinite;
}

.ring[data-sign="pos"] {
  border-color: var(--buy);
}

.ring[data-sign="neg"] {
  border-color: var(--sell);
}

.glow {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.glow[data-sign="pos"] {
  background: radial-gradient(circle at 50% 40%, rgba(43, 255, 179, 0.22) 0%, transparent 70%);
}

.glow[data-sign="neg"] {
  background: radial-gradient(circle at 50% 40%, rgba(255, 93, 115, 0.22) 0%, transparent 70%);
}

.inner {
  position: relative;
  text-align: center;
  line-height: 1.1;
}

.ccy {
  display: block;
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 12px;
}

.bubble[data-large="true"] .ccy {
  font-size: 15px;
}

.bubble[data-sign="pos"] .ccy {
  color: var(--buy);
}

.bubble[data-sign="neg"] .ccy {
  color: var(--sell);
}

.amt {
  display: block;
  font-family: var(--font-m, monospace);
  font-size: 9px;
  color: var(--dim);
}
```

- [ ] **Step 4: Write `ExposureRows` + its styles**

Create `packages/client-prototype/src/fx/Positions/ExposureRows.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/fx/Positions/ExposureRows.module.css";
import { EXPOSURE } from "#/fx/Positions/positionsData";

// PROTO 523: the same exposures listed as ccy | amount rows beneath the cluster.
export function ExposureRows(): ReactElement {
  return (
    <div>
      {EXPOSURE.map((e) => {
        const sign = e.positive ? "pos" : "neg";
        return (
          <div className={styles.row} key={e.ccy}>
            <span className={styles.ccy}>{e.ccy}</span>
            <span className={styles.amt} data-sign={sign}>
              {e.amt}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

Create `packages/client-prototype/src/fx/Positions/ExposureRows.module.css`:

```css
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 2px;
  border-bottom: 1px solid var(--border);
  font-family: var(--font-m, monospace);
  font-size: 12px;
}

.ccy {
  color: var(--text);
  font-weight: 600;
}

.amt[data-sign="pos"] {
  color: var(--buy);
}

.amt[data-sign="neg"] {
  color: var(--sell);
}
```

- [ ] **Step 5: Write `PositionsView` + its styles**

Create `packages/client-prototype/src/fx/Positions/PositionsView.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/fx/Positions/PositionsView.module.css";
import { ExposureBubbles } from "#/fx/Positions/ExposureBubbles";
import { ExposureRows } from "#/fx/Positions/ExposureRows";

// PROTO 518-524: the Positions panel body — "Net Exposure" over the bubble
// cluster and the exposure list.
export function PositionsView(): ReactElement {
  return (
    <div className={styles.body}>
      <div className={styles.label}>Net Exposure</div>
      <ExposureBubbles />
      <ExposureRows />
    </div>
  );
}
```

Create `packages/client-prototype/src/fx/Positions/PositionsView.module.css`:

```css
.body {
  padding: 16px;
}

.label {
  margin-bottom: 6px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--faint);
  text-transform: uppercase;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype test run fx-positions`
Expected: PASS (2/2).

- [ ] **Step 7: Run the full package gate**

Run: `pnpm --filter @rtc/client-prototype typecheck && pnpm --filter @rtc/client-prototype test run && pnpm --filter @rtc/client-prototype lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/client-prototype/src/fx/Positions/ExposureBubbles.tsx packages/client-prototype/src/fx/Positions/ExposureBubbles.module.css packages/client-prototype/src/fx/Positions/ExposureRows.tsx packages/client-prototype/src/fx/Positions/ExposureRows.module.css packages/client-prototype/src/fx/Positions/PositionsView.tsx packages/client-prototype/src/fx/Positions/PositionsView.module.css packages/client-prototype/tests/fx-positions.test.tsx
git commit -m "feat(client-prototype): FX Positions aside (net-exposure bubbles + rows)"
```

---

### Task 7: Wire the aside into `FxScreen`

**Files:**
- Modify: `packages/client-prototype/src/fx/FxScreen.tsx`
- Modify: `packages/client-prototype/src/fx/FxScreen.module.css`
- Modify: `packages/client-prototype/tests/fx-screen.test.tsx`

**Interfaces:**
- Consumes: `AnalyticsView(props: { pnl: number })` (Task 4), `PositionsView()` (Task 6), `Panel`'s `headAccessory` prop (Task 2), `rates.pnl` from `useFxRates` (Task 1, already returned).
- Produces: nothing downstream (top-level screen).

- [ ] **Step 1: Update the smoke test (fails first)**

In `packages/client-prototype/tests/fx-screen.test.tsx`, replace the test title and the two placeholder assertions. Change:

```tsx
  test("renders the FX dock — Live Rates tab and the P2.5 aside placeholders", () => {
    renderFxScreen();

    expect(screen.getByTestId("fx-screen")).toBeDefined();
    expect(screen.getByText("◧ Live Rates")).toBeDefined();
    expect(screen.getByText(/Analytics · P2\.5/)).toBeDefined();
    expect(screen.getByText(/Positions · P2\.5/)).toBeDefined();
  });
```

to:

```tsx
  test("renders the FX dock — Live Rates tab and the Analytics/Positions aside", () => {
    renderFxScreen();

    expect(screen.getByTestId("fx-screen")).toBeDefined();
    expect(screen.getByText("◧ Live Rates")).toBeDefined();
    expect(screen.getByText(/Profit & Loss · Today/)).toBeDefined();
    expect(screen.getByText("Net Exposure")).toBeDefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype test run fx-screen`
Expected: FAIL — the aside still renders the `· P2.5` placeholders, so "Profit & Loss · Today" / "Net Exposure" are not found.

- [ ] **Step 3: Import the two views**

In `packages/client-prototype/src/fx/FxScreen.tsx`, add the imports alongside the existing `#/fx/...` imports (keep them import-sorted — `Analytics`/`Positions` sort before `Blotter`/`LiveRates` under the `#/fx/` prefix; match the file's existing ordering, Biome will confirm):

```tsx
import { AnalyticsView } from "#/fx/Analytics/AnalyticsView";
import { PositionsView } from "#/fx/Positions/PositionsView";
```

- [ ] **Step 4: Replace the Analytics placeholder**

In the same file, find the Analytics `Panel` and swap its `head` for one with the `⊕` accessory and its placeholder body for `<AnalyticsView>`:

```tsx
              <Panel
                id={ANA_PANEL}
                head={<span className={styles.regionLabel}>◉ Analytics</span>}
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <div className={styles.placeholder}>Analytics · P2.5</div>
              </Panel>
```

becomes:

```tsx
              <Panel
                id={ANA_PANEL}
                head={<span className={styles.regionLabel}>◉ Analytics</span>}
                headAccessory="⊕"
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <AnalyticsView pnl={rates.pnl} />
              </Panel>
```

- [ ] **Step 5: Replace the Positions placeholder**

Find the Positions `Panel`:

```tsx
              <Panel
                id={POS_PANEL}
                head={<span className={styles.regionLabel}>◎ Positions</span>}
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <div className={styles.placeholder}>Positions · P2.5</div>
              </Panel>
```

becomes:

```tsx
              <Panel
                id={POS_PANEL}
                head={<span className={styles.regionLabel}>◎ Positions</span>}
                headAccessory="⊕"
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <PositionsView />
              </Panel>
```

- [ ] **Step 6: Remove the now-unused `.placeholder` style**

In `packages/client-prototype/src/fx/FxScreen.module.css`, delete the `.placeholder` rule (both aside bodies now render real components; no other code references it):

```css
.placeholder {
  padding: 16px;
  font-family: var(--font-m, monospace);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--faint);
}
```

- [ ] **Step 7: Run the smoke test to verify it passes**

Run: `pnpm --filter @rtc/client-prototype test run fx-screen`
Expected: PASS — the aside now renders the real Analytics/Positions content (PnL seeds at 17120, so no timer advance is needed).

- [ ] **Step 8: Run the full package gate + build**

Run: `pnpm --filter @rtc/client-prototype typecheck && pnpm --filter @rtc/client-prototype test run && pnpm --filter @rtc/client-prototype lint && pnpm --filter @rtc/client-prototype build`
Expected: all green. Watch stylelint — it fails on an unused/empty rule if `.placeholder` was left behind or a new rule is empty.

- [ ] **Step 9: Commit**

```bash
git add packages/client-prototype/src/fx/FxScreen.tsx packages/client-prototype/src/fx/FxScreen.module.css packages/client-prototype/tests/fx-screen.test.tsx
git commit -m "feat(client-prototype): wire Analytics/Positions into the FX aside"
```

---

## Repo-wide CI gates (run once before opening the PR)

These run in CI beyond the per-package gate and have bitten prior client-prototype phases. Run them from the repo root after Task 7:

- [ ] `pnpm lint:dead` (knip) — no unused exports. Every export added (`PairPnl`, `Exposure`, `PAIR_PNL`, `EXPOSURE`, `PNL_LINE`, `PNL_AREA`, `fmtPnl`, `fmtBarVal`, the components, `headAccessory`) must be reachable. If a **type** is only used structurally (never imported by name), knip flags its `export` — drop the `export` keyword (keep the type). Note: knip may read intermediate-task-only red during SDD; only the final state must be green.
- [ ] `pnpm check:versions` (manypkg + syncpack) — no dependency changes here, expected clean.
- [ ] `pnpm check:deps` (dependency-cruiser) — no `../../` imports, no cross-package leaks.
- [ ] `pnpm test:rules` — custom ESLint rules (`rtc/newspaper-order`, `rtc/component-newspaper`) unaffected but confirm green.

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-01-client-prototype-p2_5-fx-aside.md`):
- §3 Analytics folder → Tasks 3, 4. Positions folder → Tasks 5, 6. ✓
- §3.1 component contracts → Tasks 4, 6 (`AnalyticsViewProps.pnl`, `PositionsView` no props, `Exposure` derived fields). ✓
- §3.2 seed data verbatim → Tasks 3, 5 (`PAIR_PNL`, `PNL_PTS`, `EXPOSURE_SEED`). ✓
- §3.3 formatting → Task 3 (`fmtPnl`, `fmtBarVal`, `PNL_LINE`/`PNL_AREA`). ✓
- §4 live PnL → Task 1 (seed 17120, tick drift, floor). ✓
- §5 CSS taxonomy → Tasks 4, 6 (`--bar-pct`, `--bubble-size` named-const; `data-sign`/`data-large`; `text-shadow currentColor`; static SVG). ✓
- §6 `⊕` via `Panel.headAccessory` → Task 2 (prop) + Task 7 (usage). ✓
- §7 testing → Tasks 1, 4, 6 new tests + Task 7 `fx-screen` update. ✓
- §9 build order → Tasks 1–7 in the specified order. ✓

**Placeholder scan:** no `TBD`/`TODO`; every code step shows complete code. ✓

**Type consistency:** `PairPnl`/`Exposure` field names match between data modules (Tasks 3/5) and consumers (Tasks 4/6); `AnalyticsViewProps.pnl: number` matches `rates.pnl` (Task 1) wired in Task 7; `headAccessory?: ReactNode` (Task 2) matches the `headAccessory="⊕"` usage (Task 7); `data-sign` values `"pos"|"neg"` are consistent across TSX and CSS. ✓
