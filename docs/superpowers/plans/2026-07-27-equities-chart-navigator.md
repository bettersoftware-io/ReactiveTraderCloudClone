# Equities Chart Navigator (Mini-Map / Range Brush) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-history overview strip under the equities chart with a draggable/resizable window brush that IS the viewport, in both web clients (React + Solid) at parity.

**Architecture:** The navigator is a second renderer of — and second writer to — the one existing `ChartViewport` value owned by the plot-gesture hook (`useChartGestures` / `createChartGestures`). All math is pure in `@rtc/motion-core` (`navigatorVm`, `resizeViewportEdge`, `centerViewportAt`; body-drag reuses `panBy`); each client adds one thin brush shell and a presentational `NavigatorStrip` inside `ChartPlot`.

**Tech Stack:** TypeScript, React 19 (React Compiler, no manual memo), SolidJS, vitest, @testing-library, Playwright, CSS Modules.

Spec: [../specs/2026-07-27-equities-chart-navigator-design.md](../specs/2026-07-27-equities-chart-navigator-design.md)

## Global Constraints

- **Zero new effects / zero new state cells in the brush shells** (spec §3.2, a review gate): no `useEffect`/`onMount`, no `useState`/`createSignal` — synthetic pointer handlers + pointer capture + ONE drag-origin ref only. No wheel handling on the strip.
- `@rtc/motion-core` stays zero-dependency; vm emits **numbers and `ChartVarStyle` objects only, never markup strings** — shells own attribute strings.
- Handler naming: a concrete handler is named for its **effect** (`docs/handler-naming.md`, `rtc/name-functions-by-effect`); function-typed props/slots stay `onX`.
- Inline `style={{…}}` is banned (ESLint AST rule) — positional styles flow as vm-built `ChartVarStyle` objects (the `chartVm` pattern).
- Mandatory braces on all control statements (Biome `useBlockStatements`); `#/` subpath-alias imports; no `@rtc/*` package imports inside `ui-contract` specs beyond what's already there.
- Solid `*.module.css` files are byte-identical copies of the React ones.
- Strip a11y: `role="group"`, `aria-label="Chart navigator"`, NOT in the tab order (no `tabIndex`).
- Testids (exact): `chart-navigator`, `navigator-window`, `navigator-handle-left`, `navigator-handle-right`.
- `MIN_VIEWPORT_SPAN` (5) is the resize floor; handles can never cross.
- Strip hidden entirely at `seriesLen === 0`.
- Run every test command from the repo root of the worktree with `pnpm --filter <pkg> test -- <path>` forms shown per task.

## File Structure (whole feature)

```
packages/motion-core/src/
  chartViewport.ts            MODIFY  + resizeViewportEdge, centerViewportAt, ViewportEdge
  chartViewport.test.ts       MODIFY  + tests for both ops
  navigatorVm.ts              CREATE  navigatorVm + NavigatorVm
  navigatorVm.test.ts         CREATE
  index.ts                    MODIFY  + exports
packages/client-react/src/ui/equities/chart/
  useChartGestures.ts         MODIFY  + applyViewport
  useChartGestures.test.ts    MODIFY  + applyViewport test
  useNavigatorBrush.ts        CREATE  the React brush shell
  useNavigatorBrush.test.ts   CREATE
  NavigatorStrip.tsx          CREATE  presentational leaf
  NavigatorStrip.module.css   CREATE
  ChartPlot.tsx               MODIFY  + nav / navProps props, render NavigatorStrip
  CandleChart.tsx             MODIFY  join navigatorVm + brush hook
packages/client-solid/src/ui/equities/chart/
  createChartGestures.ts      MODIFY  + applyViewport
  createChartGestures.test.ts MODIFY  + applyViewport test
  createNavigatorBrush.ts     CREATE  the Solid brush shell
  createNavigatorBrush.test.ts CREATE
  NavigatorStrip.tsx          CREATE
  NavigatorStrip.module.css   CREATE  byte-identical to React's
  ChartPlot.tsx               MODIFY
  CandleChart.tsx             MODIFY
packages/client-react/tests/ui/visual/react/EquitiesChartInteractive.visual.tsx   MODIFY (ForcedChart passes nav)
packages/client-solid/tests/ui/visual/solid/EquitiesChartInteractive.visual.tsx   MODIFY
packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts           MODIFY (+ brush drivers)
packages/ui-contract/src/specs/equities/chart/ChartNavigator.contract.spec.ts     CREATE
tests/browser/page-objects/contracts/testids.ts        MODIFY (+ navigator ids)
tests/browser/page-objects/contracts/EquitiesChart.ts  MODIFY (+ brush methods)
tests/browser/page-objects/playwright/EquitiesChart.ts MODIFY
tests/browser/scenarios/equitiesChart.ts               MODIFY
tests/browser/playwright/equitiesChart.spec.ts         MODIFY (+ navigator test)
packages/ui-contract/goldens/…                         REGENERATED (react-local arm64)
docs/architecture/17-web-client-up-close.md            MODIFY (§17.6 extension)
docs/STATUS.md                                         MODIFY (delete navigator entry; append observations)
```

---

### Task 1: motion-core viewport ops — `resizeViewportEdge` + `centerViewportAt`

**Files:**
- Modify: `packages/motion-core/src/chartViewport.ts`
- Modify: `packages/motion-core/src/chartViewport.test.ts`
- Modify: `packages/motion-core/src/index.ts`

**Interfaces:**
- Consumes: existing `ChartViewport`, `MIN_VIEWPORT_SPAN`, `clampViewport`.
- Produces: `type ViewportEdge = "start" | "end"`; `resizeViewportEdge(edge: ViewportEdge, vp: ChartViewport, dCandles: number, seriesLen: number): ChartViewport`; `centerViewportAt(idx: number, vp: ChartViewport, seriesLen: number): ChartViewport` — Tasks 3/5 call these; Task 2 is independent.

**Why `resizeViewportEdge` must NOT call `clampViewport`:** `clampViewport` preserves span by moving the *opposite* edge (`{start:-10,end:60}`, len 300 → `{0,70}`: end moved 60→70). Correct for pan/centre; wrong for a resize, where the non-dragged edge must stay fixed. Clamp the moving edge directly instead.

- [ ] **Step 1: Write the failing tests** — append to `chartViewport.test.ts` (it already imports from `./chartViewport`; extend the import list with `centerViewportAt, resizeViewportEdge`):

```ts
describe("resizeViewportEdge", () => {
  it("moves only the dragged edge", () => {
    expect(resizeViewportEdge("start", { start: 100, end: 160 }, -20, 300)).toEqual({ start: 80, end: 160 });
    expect(resizeViewportEdge("end", { start: 100, end: 160 }, 20, 300)).toEqual({ start: 100, end: 180 });
  });

  it("floors the span at MIN_VIEWPORT_SPAN instead of letting edges cross", () => {
    expect(resizeViewportEdge("start", { start: 100, end: 160 }, 200, 300)).toEqual({ start: 155, end: 160 });
    expect(resizeViewportEdge("end", { start: 100, end: 160 }, -200, 300)).toEqual({ start: 100, end: 105 });
  });

  it("clamps the moving edge at the series bounds WITHOUT moving the fixed edge", () => {
    // clampViewport would return {0, 70} here (span-preserving); the resize must pin end at 60.
    expect(resizeViewportEdge("start", { start: 10, end: 60 }, -50, 300)).toEqual({ start: 0, end: 60 });
    expect(resizeViewportEdge("end", { start: 240, end: 290 }, 50, 300)).toEqual({ start: 240, end: 300 });
  });

  it("stays sane when the whole series is shorter than MIN_VIEWPORT_SPAN", () => {
    expect(resizeViewportEdge("start", { start: 0, end: 3 }, 2, 3)).toEqual({ start: 0, end: 3 });
    expect(resizeViewportEdge("end", { start: 0, end: 3 }, -2, 3)).toEqual({ start: 0, end: 3 });
  });
});

describe("centerViewportAt", () => {
  it("re-centres the window on the index, span preserved", () => {
    expect(centerViewportAt(150, { start: 240, end: 300 }, 300)).toEqual({ start: 120, end: 180 });
  });

  it("clamps at both boundaries, span preserved", () => {
    expect(centerViewportAt(0, { start: 240, end: 300 }, 300)).toEqual({ start: 0, end: 60 });
    expect(centerViewportAt(300, { start: 100, end: 160 }, 300)).toEqual({ start: 240, end: 300 });
  });

  it("is a no-op when the index is already the centre", () => {
    expect(centerViewportAt(270, { start: 240, end: 300 }, 300)).toEqual({ start: 240, end: 300 });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/motion-core test -- src/chartViewport.test.ts` → FAIL: `resizeViewportEdge` is not exported.

- [ ] **Step 3: Implement** — append to `chartViewport.ts`:

```ts
export type ViewportEdge = "start" | "end";

/** Moves ONE edge by dCandles (a navigator-handle resize); the other edge
 * stays fixed. The moving edge clamps into [0, end − MIN] / [start + MIN,
 * seriesLen] directly — deliberately NOT via `clampViewport`, whose
 * span-preserving clamp would move the fixed edge at a series boundary. */
export function resizeViewportEdge(
  edge: ViewportEdge,
  vp: ChartViewport,
  dCandles: number,
  seriesLen: number,
): ChartViewport {
  if (edge === "start") {
    const maxStart = Math.max(0, vp.end - MIN_VIEWPORT_SPAN);
    const start = Math.min(Math.max(vp.start + dCandles, 0), maxStart);
    return { start, end: vp.end };
  }

  const minEnd = Math.min(seriesLen, vp.start + MIN_VIEWPORT_SPAN);
  const end = Math.max(Math.min(vp.end + dCandles, seriesLen), minEnd);
  return { start: vp.start, end };
}

/** Re-centres the window on a series index (a navigator track click), span
 * preserved; `clampViewport`'s span-preserving clamp is exactly right here. */
export function centerViewportAt(
  idx: number,
  vp: ChartViewport,
  seriesLen: number,
): ChartViewport {
  const span = vp.end - vp.start;
  const start = idx - span / 2;
  return clampViewport({ start, end: start + span }, seriesLen);
}
```

Add to `index.ts`, inside the existing `chartViewport.js` export block (keep alphabetical order — Biome enforces sorted members): `centerViewportAt`, `resizeViewportEdge`, and `export type { ChartViewport, ViewportEdge } ...`.

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @rtc/motion-core test -- src/chartViewport.test.ts` → PASS (all pre-existing tests too).

- [ ] **Step 5: Commit**

```bash
git add packages/motion-core/src/chartViewport.ts packages/motion-core/src/chartViewport.test.ts packages/motion-core/src/index.ts
git commit -m "feat(motion-core): resizeViewportEdge + centerViewportAt for the navigator brush"
```

---

### Task 2: motion-core `navigatorVm`

**Files:**
- Create: `packages/motion-core/src/navigatorVm.ts`
- Create: `packages/motion-core/src/navigatorVm.test.ts`
- Modify: `packages/motion-core/src/index.ts`

**Interfaces:**
- Consumes: `ChartViewport` (`./chartViewport.js`), `ChartPoint`, `ChartVarStyle` (`./chartVm.js`).
- Produces: `interface NavigatorVm { linePoints: readonly ChartPoint[]; windowStyle: ChartVarStyle }` and `navigatorVm(series: readonly NavigatorCandle[], viewport: ChartViewport): NavigatorVm` where `interface NavigatorCandle { readonly close: number }` (structural — domain `Candle` satisfies it). Tasks 4/6/7 consume.

`windowStyle` carries `--nav-left` and `--nav-w` percentages (the `chartVm`
CSS-custom-property pattern — vm builds the style object, never the shell).
Y-mapping uses the strip's own padding constants `NAV_Y_TOP = 10`,
`NAV_Y_SPAN = 80` (not the plot's `Y_TOP`/`Y_SPAN` — different box). X spreads
candle indices across the full width (`i / (len − 1) × 100`; a single-candle
series pins x = 50), while the window rect maps candle-slot boundaries
(`start / len`, `end / len`) — documented in the file.

- [ ] **Step 1: Write the failing tests** — `navigatorVm.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { navigatorVm } from "./navigatorVm";

function closes(values: readonly number[]): { close: number }[] {
  return values.map((close) => {
    return { close };
  });
}

describe("navigatorVm", () => {
  it("returns an empty vm for an empty series", () => {
    expect(navigatorVm([], { start: 0, end: 0 })).toEqual({
      linePoints: [],
      windowStyle: { "--nav-left": "0%", "--nav-w": "100%" },
    });
  });

  it("spreads the full series across x 0..100 and maps close min/max to the padded y band", () => {
    const vm = navigatorVm(closes([10, 30, 20]), { start: 0, end: 3 });

    expect(vm.linePoints).toEqual([
      { x: 0, y: 90 },   // min close → NAV_Y_TOP + NAV_Y_SPAN
      { x: 50, y: 10 },  // max close → NAV_Y_TOP
      { x: 100, y: 50 }, // midpoint
    ]);
  });

  it("pins a single-candle series at x=50 and mid-band y", () => {
    expect(navigatorVm(closes([42]), { start: 0, end: 1 }).linePoints).toEqual([
      { x: 50, y: 50 },
    ]);
  });

  it("maps the viewport to window percentages of the series length", () => {
    const series = closes(Array.from({ length: 300 }, (_, i) => i));

    expect(navigatorVm(series, { start: 240, end: 300 }).windowStyle).toEqual({
      "--nav-left": "80%",
      "--nav-w": "20%",
    });
    expect(navigatorVm(series, { start: 120, end: 180 }).windowStyle).toEqual({
      "--nav-left": "40%",
      "--nav-w": "20%",
    });
  });

  it("y stays mid-band when every close is identical (zero range)", () => {
    const vm = navigatorVm(closes([5, 5, 5]), { start: 0, end: 3 });

    for (const p of vm.linePoints) {
      expect(p.y).toBe(50);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/motion-core test -- src/navigatorVm.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `navigatorVm.ts`:

```ts
import type { ChartViewport } from "./chartViewport.js";
import type { ChartPoint, ChartVarStyle } from "./chartVm.js";

/** The candle fields navigatorVm reads — a structural subset of
 * @rtc/domain's `Candle` (motion-core is zero-dependency); only the close
 * matters for the overview line. */
export interface NavigatorCandle {
  readonly close: number;
}

export interface NavigatorVm {
  /** Full-series close polyline on the 0–100 grid: x spreads indices across
   * the whole strip (`i / (len − 1) × 100`), y maps [min, max] close into
   * the padded band, inverted (high at the top). */
  readonly linePoints: readonly ChartPoint[];
  /** The viewport window as strip CSS vars: `--nav-left` / `--nav-w`,
   * percentages of the series length in candle-slot space (`start / len`,
   * `(end − start) / len`) — slot boundaries, not candle centres, so the
   * shade covers exactly the candles the plot shows. */
  readonly windowStyle: ChartVarStyle;
}

/** Strip-local y padding (the plot's Y_TOP/Y_SPAN belong to its own box). */
const NAV_Y_TOP = 10;
const NAV_Y_SPAN = 80;

export function navigatorVm(
  series: readonly NavigatorCandle[],
  viewport: ChartViewport,
): NavigatorVm {
  const len = series.length;

  if (len === 0) {
    return {
      linePoints: [],
      windowStyle: { "--nav-left": "0%", "--nav-w": "100%" } as ChartVarStyle,
    };
  }

  const closes = series.map((c) => {
    return c.close;
  });
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const rng = max - min || 1;

  // A flat series (every close identical — includes the single-candle
  // case) has no meaningful vertical position: pin y to the band midpoint
  // rather than letting (max − close)/rng collapse everything to the top.
  const flat = max === min;

  const linePoints: ChartPoint[] = closes.map((close, i) => {
    return {
      x: len === 1 ? 50 : (i / (len - 1)) * 100,
      y: flat
        ? NAV_Y_TOP + NAV_Y_SPAN / 2
        : ((max - close) / rng) * NAV_Y_SPAN + NAV_Y_TOP,
    };
  });

  const leftPct = Math.min(100, Math.max(0, (viewport.start / len) * 100));
  const rightPct = Math.min(100, Math.max(0, (viewport.end / len) * 100));
  const windowStyle = {
    "--nav-left": `${leftPct}%`,
    "--nav-w": `${rightPct - leftPct}%`,
  } as ChartVarStyle;

  return { linePoints, windowStyle };
}
```

Add to `index.ts` (alphabetical within the file's export list):

```ts
export type { NavigatorCandle, NavigatorVm } from "./navigatorVm.js";
export { navigatorVm } from "./navigatorVm.js";
```

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @rtc/motion-core test -- src/navigatorVm.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/motion-core/src/navigatorVm.ts packages/motion-core/src/navigatorVm.test.ts packages/motion-core/src/index.ts
git commit -m "feat(motion-core): navigatorVm — overview polyline + viewport window style"
```

---

### Task 3: React — `applyViewport` command + `useNavigatorBrush`

**Files:**
- Modify: `packages/client-react/src/ui/equities/chart/useChartGestures.ts`
- Modify: `packages/client-react/src/ui/equities/chart/useChartGestures.test.ts`
- Create: `packages/client-react/src/ui/equities/chart/useNavigatorBrush.ts`
- Create: `packages/client-react/src/ui/equities/chart/useNavigatorBrush.test.ts`

**Interfaces:**
- Consumes: Task 1's `resizeViewportEdge`, `centerViewportAt`, plus existing `panBy`, `clampViewport` — all from `@rtc/motion-core`.
- Produces: `ChartGestures` gains `readonly applyViewport: (vp: ChartViewport) => void`. New `useNavigatorBrush(viewport: ChartViewport, applyViewport: (vp: ChartViewport) => void, seriesLen: number): NavigatorBrush` with `interface NavigatorBrush { readonly stripProps: NavigatorStripProps }` where `NavigatorStripProps` = `{ onPointerDown/onPointerMove/onPointerUp/onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void }`. Task 4 consumes both.

**Prerequisite for imports to resolve:** run `pnpm --filter @rtc/motion-core build` once after Tasks 1–2 (tsc-built lib; or have `pnpm dev:watch` running).

- [ ] **Step 1: Failing test for `applyViewport`** — append to `useChartGestures.test.ts` inside the existing describe:

```ts
  it("applyViewport sets the viewport (clamped), the navigator brush's write path", () => {
    const { result } = renderHook(() => {
      return useChartGestures(SERIES_LEN, DEFAULT_VISIBLE);
    });

    act(() => {
      result.current.applyViewport({ start: 100, end: 150 });
    });
    expect(result.current.viewport).toEqual({ start: 100, end: 150 });
    expect(result.current.atLiveEdge).toBe(false);

    // Out-of-bounds input clamps rather than escaping the series.
    act(() => {
      result.current.applyViewport({ start: -10, end: 40 });
    });
    expect(result.current.viewport).toEqual({ start: 0, end: 50 });
  });
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/client-react test -- src/ui/equities/chart/useChartGestures.test.ts` → FAIL (`applyViewport` undefined).

- [ ] **Step 3: Implement `applyViewport`** — in `useChartGestures.ts`: add to the `ChartGestures` interface after `resetToLive`:

```ts
  /** Sets the viewport directly (clamped) — the navigator brush's write
   * path into the plot's one viewport cell. */
  readonly applyViewport: (vp: ChartViewport) => void;
```

add the function next to `resetToLive`:

```ts
  function applyViewport(vp: ChartViewport): void {
    setViewport(clampViewport(vp, seriesLen));
  }
```

and add `applyViewport,` to the returned object. Run the Step-1 test → PASS.

- [ ] **Step 4: Failing tests for the brush hook** — `useNavigatorBrush.test.ts`. The event/DOM stubbing mirrors `useChartGestures.test.ts`'s `pointerEvent` helper, extended with a `target` whose `closest()` answers the hit-test selectors:

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChartViewport } from "@rtc/motion-core";

import { useNavigatorBrush } from "./useNavigatorBrush";

const SERIES_LEN = 300;
const VIEWPORT: ChartViewport = { start: 240, end: 300 };
const STRIP_RECT = { left: 0, top: 0, width: 500, height: 32 } as DOMRect;

afterEach(() => {
  cleanup();
});

/** What the pointerdown landed on: the window body, a handle, or the bare
 * track — expressed through the `closest()` answers the hook's hit-test
 * makes (`[data-nav-edge]` first, then the window testid). */
type HitTarget = "window" | "handle-left" | "handle-right" | "track";

function hitTargetEl(hit: HitTarget): { closest: (sel: string) => unknown } {
  return {
    closest: (sel: string): unknown => {
      if (sel === "[data-nav-edge]") {
        if (hit === "handle-left") {
          return { getAttribute: (): string => "start" };
        }

        if (hit === "handle-right") {
          return { getAttribute: (): string => "end" };
        }

        return null;
      }

      if (sel === '[data-testid="navigator-window"]') {
        return hit === "window" ? {} : null;
      }

      return null;
    },
  };
}

function brushEvent(
  hit: HitTarget,
  clientX: number,
): ReactPointerEvent<HTMLDivElement> {
  return {
    pointerId: 1,
    clientX,
    target: hitTargetEl(hit),
    currentTarget: {
      setPointerCapture: vi.fn(),
      hasPointerCapture: (): boolean => {
        return true;
      },
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: (): DOMRect => {
        return STRIP_RECT;
      },
    } as unknown as HTMLDivElement,
  } as unknown as ReactPointerEvent<HTMLDivElement>;
}

function moveEvent(clientX: number): ReactPointerEvent<HTMLDivElement> {
  return brushEvent("track", clientX);
}

describe("useNavigatorBrush", () => {
  it("dragging the window body pans the viewport WITH the pointer", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("window", 450));
    });
    act(() => {
      // dx −50px of 500 → −0.1 × 300 = −30 candles, window follows the pointer left
      result.current.stripProps.onPointerMove(moveEvent(400));
    });

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 210, end: 270 });
  });

  it("dragging the right handle resizes only the end edge", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("handle-right", 500));
    });
    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(450));
    });

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 240, end: 270 });
  });

  it("dragging the left handle resizes only the start edge", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("handle-left", 400));
    });
    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(350));
    });

    expect(applyViewport).toHaveBeenLastCalledWith({ start: 210, end: 300 });
  });

  it("a track pointerdown recentres the window immediately, then keeps dragging it", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      // 250 / 500 → idx 150 → centred {120, 180}
      result.current.stripProps.onPointerDown(brushEvent("track", 250));
    });
    expect(applyViewport).toHaveBeenLastCalledWith({ start: 120, end: 180 });

    act(() => {
      // +50px → +30 candles from the RECENTRED origin
      result.current.stripProps.onPointerMove(moveEvent(300));
    });
    expect(applyViewport).toHaveBeenLastCalledWith({ start: 150, end: 210 });
  });

  it("moves recompute from the fixed drag origin, not cumulatively", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("window", 450));
    });
    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(400));
    });
    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(425));
    });

    // −25px total from origin → −15 candles, NOT −30 −15.
    expect(applyViewport).toHaveBeenLastCalledWith({ start: 225, end: 285 });
  });

  it("pointer moves without a prior pointerdown are ignored", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(400));
    });

    expect(applyViewport).not.toHaveBeenCalled();
  });

  it("pointerup ends the drag; pointercancel does the same (no phantom drag)", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });

    act(() => {
      result.current.stripProps.onPointerDown(brushEvent("window", 450));
    });
    act(() => {
      result.current.stripProps.onPointerCancel(brushEvent("window", 450));
    });
    applyViewport.mockClear();

    act(() => {
      result.current.stripProps.onPointerMove(moveEvent(100));
    });

    expect(applyViewport).not.toHaveBeenCalled();
  });

  it("captures the pointer on pointerdown", () => {
    const applyViewport = vi.fn();
    const { result } = renderHook(() => {
      return useNavigatorBrush(VIEWPORT, applyViewport, SERIES_LEN);
    });
    const event = brushEvent("window", 450);

    act(() => {
      result.current.stripProps.onPointerDown(event);
    });

    expect(event.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 5: Run to verify failure** — `pnpm --filter @rtc/client-react test -- src/ui/equities/chart/useNavigatorBrush.test.ts` → FAIL (module not found).

- [ ] **Step 6: Implement** — `useNavigatorBrush.ts`:

```ts
import { type PointerEvent as ReactPointerEvent, useRef } from "react";

import {
  centerViewportAt,
  type ChartViewport,
  panBy,
  resizeViewportEdge,
  type ViewportEdge,
} from "@rtc/motion-core";

/** The hit-test attribute the strip's handle divs carry ("start" | "end"). */
const NAV_EDGE_SELECTOR = "[data-nav-edge]";
const NAV_WINDOW_SELECTOR = '[data-testid="navigator-window"]';

type BrushMode = ViewportEdge | "move";

/** Event handlers to spread onto the navigator strip div. */
export interface NavigatorStripProps {
  readonly onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

export interface NavigatorBrush {
  readonly stripProps: NavigatorStripProps;
}

/** The brush drag's bookkeeping cached at pointerdown: mode (window-body
 * move vs. a single-edge resize) and the viewport the drag started from, so
 * every move recomputes from that fixed origin (the plot drag's DragOrigin
 * pattern — never accumulate onto a moving viewport). */
interface BrushOrigin {
  readonly mode: BrushMode;
  readonly pointerId: number;
  readonly startX: number;
  readonly rectWidth: number;
  readonly startViewport: ChartViewport;
}

/**
 * The navigator strip's brush shell (ADR-005, spec §3.2): translates strip
 * pointer gestures into the pure @rtc/motion-core viewport ops and writes
 * the result back through `applyViewport` — the SECOND writer to
 * useChartGestures' one viewport cell. Deliberately zero effects and zero
 * state cells: synthetic pointer handlers + pointer capture + this one
 * drag-origin ref are the whole surface.
 */
export function useNavigatorBrush(
  viewport: ChartViewport,
  applyViewport: (vp: ChartViewport) => void,
  seriesLen: number,
): NavigatorBrush {
  const originRef = useRef<BrushOrigin | null>(null);

  function startBrush(e: ReactPointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const target = e.target as HTMLElement | null;
    const edge = target
      ?.closest(NAV_EDGE_SELECTOR)
      ?.getAttribute("data-nav-edge");

    let mode: BrushMode;
    let startViewport = viewport;

    if (edge === "start" || edge === "end") {
      mode = edge;
    } else if (target?.closest(NAV_WINDOW_SELECTOR)) {
      mode = "move";
    } else {
      // Track hit: recentre the window on the clicked index immediately,
      // then let the same gesture continue as a body drag from there.
      const clickFrac = (e.clientX - rect.left) / rect.width;
      startViewport = centerViewportAt(
        clickFrac * seriesLen,
        viewport,
        seriesLen,
      );
      applyViewport(startViewport);
      mode = "move";
    }

    originRef.current = {
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      rectWidth: rect.width,
      startViewport,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function dragBrush(e: ReactPointerEvent<HTMLDivElement>): void {
    const origin = originRef.current;

    if (!origin || origin.pointerId !== e.pointerId) {
      return;
    }

    // The window follows the pointer: +dx drags the window (and so the
    // viewport) toward the series end — the OPPOSITE sign to the plot drag,
    // where +dx pulls earlier candles into view.
    const dCandles =
      ((e.clientX - origin.startX) / origin.rectWidth) * seriesLen;

    if (origin.mode === "move") {
      applyViewport(panBy(origin.startViewport, dCandles, seriesLen));
      return;
    }

    applyViewport(
      resizeViewportEdge(origin.mode, origin.startViewport, dCandles, seriesLen),
    );
  }

  function endBrush(e: ReactPointerEvent<HTMLDivElement>): void {
    if (originRef.current?.pointerId !== e.pointerId) {
      return;
    }

    originRef.current = null;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return {
    stripProps: {
      onPointerDown: startBrush,
      onPointerMove: dragBrush,
      onPointerUp: endBrush,
      // A pointercancel never fires pointerup — without this, the next hover
      // (same stable pointerId for a mouse) would resume a phantom drag.
      onPointerCancel: endBrush,
    },
  };
}
```

- [ ] **Step 7: Run to verify pass** — `pnpm --filter @rtc/client-react test -- src/ui/equities/chart/useNavigatorBrush.test.ts src/ui/equities/chart/useChartGestures.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/client-react/src/ui/equities/chart/useChartGestures.ts packages/client-react/src/ui/equities/chart/useChartGestures.test.ts packages/client-react/src/ui/equities/chart/useNavigatorBrush.ts packages/client-react/src/ui/equities/chart/useNavigatorBrush.test.ts
git commit -m "feat(react): applyViewport command + useNavigatorBrush shell"
```

---

### Task 4: React — `NavigatorStrip` + `ChartPlot`/`CandleChart` wiring + visual wrapper

**Files:**
- Create: `packages/client-react/src/ui/equities/chart/NavigatorStrip.tsx`
- Create: `packages/client-react/src/ui/equities/chart/NavigatorStrip.module.css`
- Modify: `packages/client-react/src/ui/equities/chart/ChartPlot.tsx`
- Modify: `packages/client-react/src/ui/equities/chart/CandleChart.tsx`
- Modify: `packages/client-react/tests/ui/visual/react/EquitiesChartInteractive.visual.tsx`

**Interfaces:**
- Consumes: Task 2's `navigatorVm`/`NavigatorVm`, Task 3's `useNavigatorBrush`/`NavigatorStripProps`.
- Produces: `ChartPlotProps` gains `readonly nav: NavigatorVm` (required) and `readonly navProps?: NavigatorStripProps` (optional — omitted → static mount, the `plotProps` convention). Task 7's page objects rely on the testids; Task 6 mirrors this file structure.

There is no isolated unit test for the strip — it is a pure-props leaf whose
behaviour lands in Task 7's shared contract spec (which runs against BOTH
clients); this task's verification is the existing suites staying green plus
a compile-clean wiring.

- [ ] **Step 1: `NavigatorStrip.module.css`** (both clients get this exact file; tokens match `CandleChart.module.css`/`VolumePane.module.css`):

```css
.strip {
  position: relative;
  flex: none;
  height: 32px;
  margin-top: 4px;
  overflow: hidden;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 3px;
  /* The brush lives here — stop the browser's own touch scroll/zoom from
     fighting the pointer drag. */
  touch-action: none;
}

.mini {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.45;
}

.line {
  stroke: var(--text-muted);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

/* Positioning host for the window + handles: the vm's --nav-left/--nav-w
   land here so all three children share them. Hit-testing is per-child
   (the host itself must not swallow track clicks). */
.overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.window {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--nav-left);
  width: var(--nav-w);
  background: var(--accent-primary);
  opacity: 0.15;
  pointer-events: auto;
  cursor: grab;
}

.window:active {
  cursor: grabbing;
}

.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  background: var(--accent-primary);
  opacity: 0.7;
  pointer-events: auto;
  cursor: ew-resize;
}

.handleStart {
  left: calc(var(--nav-left) - 3px);
}

.handleEnd {
  left: calc(var(--nav-left) + var(--nav-w) - 3px);
}
```

- [ ] **Step 2: `NavigatorStrip.tsx`**:

```tsx
import type { ReactElement } from "react";

import type { NavigatorVm } from "@rtc/motion-core";

import type { NavigatorStripProps as BrushProps } from "./useNavigatorBrush";

import styles from "./NavigatorStrip.module.css";

/**
 * The chart navigator (mini-map / range brush): the full candle history as
 * one dimmed polyline with a shaded, draggable window marking exactly where
 * the plot's viewport sits. Pure presentational leaf — the vm owns every
 * number (motion-core `navigatorVm`), the brush hook owns every gesture;
 * omitting `brushProps` yields a static mount (the visual tier's
 * forced-state wrappers). Renders nothing for an empty series (the
 * react-rxjs placeholder before the first candle emission).
 */
export function NavigatorStrip({
  nav,
  brushProps,
}: NavigatorStripComponentProps): ReactElement | null {
  if (nav.linePoints.length === 0) {
    return null;
  }

  const pointsAttr = nav.linePoints
    .map((p) => {
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <div
      className={styles.strip}
      data-testid="chart-navigator"
      role="group"
      aria-label="Chart navigator"
      {...brushProps}
    >
      <svg
        className={styles.mini}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline className={styles.line} fill="none" points={pointsAttr} />
      </svg>
      <div className={styles.overlay} style={nav.windowStyle}>
        <div className={styles.window} data-testid="navigator-window" />
        <div
          className={`${styles.handle} ${styles.handleStart}`}
          data-nav-edge="start"
          data-testid="navigator-handle-left"
        />
        <div
          className={`${styles.handle} ${styles.handleEnd}`}
          data-nav-edge="end"
          data-testid="navigator-handle-right"
        />
      </div>
    </div>
  );
}

export interface NavigatorStripComponentProps {
  readonly nav: NavigatorVm;
  /** Omit for a static/brush-free mount — see the component doc above. */
  readonly brushProps?: BrushProps;
}
```

- [ ] **Step 3: Wire `ChartPlot`** — add imports (`NavigatorStrip`, `NavigatorVm` type, `NavigatorStripProps` type), render `<NavigatorStrip nav={nav} brushProps={navProps} />` as the LAST child of `styles.wrap` (after `<TimeAxis …/>`), and extend the props interface:

```ts
  readonly nav: NavigatorVm;
  /** Omit for a static/brush-free navigator — same convention as plotProps. */
  readonly navProps?: NavigatorStripProps;
```

- [ ] **Step 4: Wire `CandleChart`** — destructure `applyViewport` from `useChartGestures`; add:

```ts
  const brush = useNavigatorBrush(viewport, applyViewport, candles.length);
  const nav = navigatorVm(candles, viewport);
```

(`navigatorVm` joins the existing `@rtc/motion-core` import list) and pass `nav={nav}` `navProps={brush.stripProps}` to `<ChartPlot …>`.

- [ ] **Step 5: Update the visual wrapper** — in `EquitiesChartInteractive.visual.tsx`, add `navigatorVm` to the `@rtc/motion-core` import and give `ForcedChart`'s `<ChartPlot …>` the new prop: `nav={navigatorVm(CANDLES, viewport)}` (no `navProps` — static mount). The four real-`CandleChart` scenarios need no change.

- [ ] **Step 6: Verify** — `pnpm --filter @rtc/client-react test` → PASS (existing chart suites unaffected: the strip adds no `[data-candle]`/label/testid the old assertions count). `pnpm --filter @rtc/client-react typecheck` (or `pnpm typecheck`) → clean; this catches any wrapper/plot prop miss.

- [ ] **Step 7: Commit**

```bash
git add packages/client-react/src/ui/equities/chart/ packages/client-react/tests/ui/visual/react/EquitiesChartInteractive.visual.tsx
git commit -m "feat(react): NavigatorStrip mini-map wired into ChartPlot/CandleChart"
```

---

### Task 5: Solid — `applyViewport` + `createNavigatorBrush`

**Files:**
- Modify: `packages/client-solid/src/ui/equities/chart/createChartGestures.ts`
- Modify: `packages/client-solid/src/ui/equities/chart/createChartGestures.test.ts`
- Create: `packages/client-solid/src/ui/equities/chart/createNavigatorBrush.ts`
- Create: `packages/client-solid/src/ui/equities/chart/createNavigatorBrush.test.ts`

**Interfaces:**
- Consumes: Task 1's motion-core ops (same imports as React).
- Produces: Solid `ChartGestures` gains `readonly applyViewport: (vp: ChartViewport) => void`. `createNavigatorBrush(viewport: Accessor<ChartViewport>, applyViewport: (vp: ChartViewport) => void, seriesLen: Accessor<number>): NavigatorBrush` — same `NavigatorBrush`/`NavigatorStripProps` shape as React but with plain-DOM `PointerEvent` types (the Solid `plotProps` convention). Task 6 consumes.

The port rules (established by `createChartGestures`): props become
`Accessor`s and are called fresh inside handlers; the drag origin is a plain
`let` module variable inside the factory (no ref object); handler bodies are
otherwise line-for-line the React ones. **Zero `onMount`/`createEffect`/
`createSignal` in the brush factory** — same global constraint.

- [ ] **Step 1: Failing test for `applyViewport`** — append to `createChartGestures.test.ts` (use its existing harness/patterns — it already renders the factory inside a `createRoot`):

```ts
  it("applyViewport sets the viewport (clamped), the navigator brush's write path", () => {
    createRoot((dispose) => {
      const g = createChartGestures(
        () => {
          return 200;
        },
        () => {
          return 50;
        },
      );

      g.applyViewport({ start: 100, end: 150 });
      expect(g.viewport()).toEqual({ start: 100, end: 150 });
      expect(g.atLiveEdge()).toBe(false);

      g.applyViewport({ start: -10, end: 40 });
      expect(g.viewport()).toEqual({ start: 0, end: 50 });

      dispose();
    });
  });
```

(If the file's existing tests wrap differently — e.g. a shared `withGestures`
helper — follow that local pattern instead; the assertions are what matter.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/client-solid test -- src/ui/equities/chart/createChartGestures.test.ts` → FAIL.

- [ ] **Step 3: Implement `applyViewport`** in `createChartGestures.ts` — interface member (same doc comment as React), function:

```ts
  function applyViewport(vp: ChartViewport): void {
    setViewport(clampViewport(vp, seriesLen()));
  }
```

plus `applyViewport,` in the returned object. Step-1 test → PASS.

- [ ] **Step 4: Failing tests for `createNavigatorBrush`** — `createNavigatorBrush.test.ts`: port Task 3's `useNavigatorBrush.test.ts` cases one-for-one (same seven behaviours, same numbers), with the Solid mechanics: build the brush inside `createRoot`, pass `() => VIEWPORT` and `() => 300` accessors, events are plain objects cast `as unknown as PointerEvent` with the same `target`/`currentTarget` stubs (drop the React event-type imports). Every expectation (`{start: 210, end: 270}` for the −50px body drag, the recentre-then-drag pair, the fixed-origin recompute, ignored move without down, cancel clearing the drag, capture called with pointerId 1) is identical — the pure ops guarantee it.

- [ ] **Step 5: Run to verify failure** — `pnpm --filter @rtc/client-solid test -- src/ui/equities/chart/createNavigatorBrush.test.ts` → FAIL (module not found).

- [ ] **Step 6: Implement** — `createNavigatorBrush.ts`: port Task 3's `useNavigatorBrush.ts` with the Solid conventions:

```ts
import type { Accessor } from "solid-js";

import {
  centerViewportAt,
  type ChartViewport,
  panBy,
  resizeViewportEdge,
  type ViewportEdge,
} from "@rtc/motion-core";
```

- `viewport`/`seriesLen` are `Accessor`s — call them inside `startBrush`/`dragBrush` (`viewport()`, `seriesLen()`).
- `let brushOrigin: BrushOrigin | null = null;` replaces the ref.
- Handlers take plain `PointerEvent`; `e.currentTarget as HTMLDivElement` for capture/rect (the `createChartGestures` pattern).
- Same `BrushMode`/`BrushOrigin`/`NavigatorStripProps`/`NavigatorBrush` declarations, same handler names (`startBrush`/`dragBrush`/`endBrush`), same doc comments including the sign-flip note, same `onPointerCancel: endBrush` wiring.

- [ ] **Step 7: Run to verify pass** — `pnpm --filter @rtc/client-solid test -- src/ui/equities/chart/createNavigatorBrush.test.ts src/ui/equities/chart/createChartGestures.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/client-solid/src/ui/equities/chart/createChartGestures.ts packages/client-solid/src/ui/equities/chart/createChartGestures.test.ts packages/client-solid/src/ui/equities/chart/createNavigatorBrush.ts packages/client-solid/src/ui/equities/chart/createNavigatorBrush.test.ts
git commit -m "feat(solid): applyViewport command + createNavigatorBrush shell"
```

---

### Task 6: Solid — `NavigatorStrip` + wiring + visual wrapper

**Files:**
- Create: `packages/client-solid/src/ui/equities/chart/NavigatorStrip.tsx`
- Create: `packages/client-solid/src/ui/equities/chart/NavigatorStrip.module.css` (byte-identical copy of React's — `cp` it, then `diff` to prove)
- Modify: `packages/client-solid/src/ui/equities/chart/ChartPlot.tsx`
- Modify: `packages/client-solid/src/ui/equities/chart/CandleChart.tsx`
- Modify: `packages/client-solid/tests/ui/visual/solid/EquitiesChartInteractive.visual.tsx`

**Interfaces:**
- Consumes: Task 2's `navigatorVm`, Task 5's `createNavigatorBrush`.
- Produces: Solid `ChartPlotProps` gains the same `nav` (required) / `navProps?` members as React's.

- [ ] **Step 1: Port `NavigatorStrip.tsx`** — Solid conventions: `props.` access (no destructuring — it kills reactivity), `class=` not `className=`, `Show` for the empty-series guard, computed points inside the JSX via a small `const pointsAttr = () => …` accessor. Handler spread: like Solid's `ChartPlot` does for `plotProps`, bind each handler explicitly with the established eslint-disable line:

```tsx
import { type JSX, Show } from "solid-js";

import type { NavigatorVm } from "@rtc/motion-core";

import type { NavigatorStripProps as BrushProps } from "./createNavigatorBrush";

import styles from "./NavigatorStrip.module.css";

/** (same doc comment as the React file, s/react-rxjs/solid-bindings/) */
export function NavigatorStrip(props: NavigatorStripComponentProps): JSX.Element {
  const pointsAttr = (): string => {
    return props.nav.linePoints
      .map((p) => {
        return `${p.x},${p.y}`;
      })
      .join(" ");
  };

  return (
    <Show when={props.nav.linePoints.length > 0}>
      <div
        class={styles.strip}
        data-testid="chart-navigator"
        role="group"
        aria-label="Chart navigator"
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerDown={props.brushProps?.onPointerDown}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerMove={props.brushProps?.onPointerMove}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerUp={props.brushProps?.onPointerUp}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerCancel={props.brushProps?.onPointerCancel}
      >
        <svg
          class={styles.mini}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline class={styles.line} fill="none" points={pointsAttr()} />
        </svg>
        <div class={styles.overlay} style={props.nav.windowStyle}>
          <div class={styles.window} data-testid="navigator-window" />
          <div
            class={`${styles.handle} ${styles.handleStart}`}
            data-nav-edge="start"
            data-testid="navigator-handle-left"
          />
          <div
            class={`${styles.handle} ${styles.handleEnd}`}
            data-nav-edge="end"
            data-testid="navigator-handle-right"
          />
        </div>
      </div>
    </Show>
  );
}

export interface NavigatorStripComponentProps {
  readonly nav: NavigatorVm;
  /** Omit for a static/brush-free mount — see the component doc above. */
  readonly brushProps?: BrushProps;
}
```

- [ ] **Step 2: Wire Solid `ChartPlot`** — render `<NavigatorStrip nav={props.nav} brushProps={props.navProps} />` after `<TimeAxis …/>`; extend `ChartPlotProps` with `nav`/`navProps?`.

- [ ] **Step 3: Wire Solid `CandleChart`** — `const brush = createNavigatorBrush(g.viewport, g.applyViewport, () => props.candles.length);` next to the existing gestures factory call, `navigatorVm(props.candles, g.viewport())` where the other vms are computed (follow the file's existing memo/inline-JSX pattern for `chartVm` — if `vm` is a `createMemo`, make `nav` one too), pass both to `<ChartPlot>`.

- [ ] **Step 4: Update the Solid visual wrapper** — mirror Task 4 Step 5 in `packages/client-solid/tests/ui/visual/solid/EquitiesChartInteractive.visual.tsx`.

- [ ] **Step 5: Verify** — `diff packages/client-react/src/ui/equities/chart/NavigatorStrip.module.css packages/client-solid/src/ui/equities/chart/NavigatorStrip.module.css` → empty. `pnpm --filter @rtc/client-solid test` → PASS. `pnpm typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add packages/client-solid/src/ui/equities/chart/ packages/client-solid/tests/ui/visual/solid/EquitiesChartInteractive.visual.tsx
git commit -m "feat(solid): NavigatorStrip mini-map wired into ChartPlot/CandleChart"
```

---

### Task 7: ui-contract — page-object brush drivers + `ChartNavigator.contract.spec.ts`

**Files:**
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts`
- Create: `packages/ui-contract/src/specs/equities/chart/ChartNavigator.contract.spec.ts`

**Interfaces:**
- Consumes: the mounted `CandleChart` component (both clients via the swap-trio), testids from Tasks 4/6, `candleFixture.ts`'s `generateCandles`/`candleAt`.
- Produces: `CandleChartPage` methods `hasNavigator(): boolean`, `dragNavigatorWindow(fromXFrac: number, toXFrac: number): void`, `dragNavigatorHandle(side: "left" | "right", toXFrac: number): void`, `pressNavigatorTrack(xFrac: number): void`.

**jsdom gaps to stub in the page object (NOT in the spec — specs stay
DOM-mechanism-free):** `getBoundingClientRect` (all-zeros in jsdom — reuse a
500-wide strip rect so fractions map to concrete clientX) AND the pointer-
capture trio — jsdom doesn't implement `setPointerCapture`/`hasPointerCapture`/
`releasePointerCapture`, and the brush calls all three. Same stub-the-DOM-hole
approach as the existing `STUB_RECT`.

- [ ] **Step 1: Page-object drivers** — add to `CandleChartPage.ts`:

```ts
const NAVIGATOR_TESTID = "chart-navigator";
const NAVIGATOR_WINDOW_TESTID = "navigator-window";

/** 500×32-at-the-origin strip rect — same jsdom stand-in idea as STUB_RECT. */
const STRIP_RECT: DOMRect = {
  left: 0,
  top: 0,
  width: 500,
  height: 32,
  right: 500,
  bottom: 32,
  x: 0,
  y: 0,
  toJSON: (): unknown => {
    return {};
  },
} as DOMRect;
```

and the methods:

```ts
  hasNavigator(): boolean {
    return (
      this.root.querySelector(`[data-testid="${NAVIGATOR_TESTID}"]`) !== null
    );
  }

  /** Drags the shaded window body from one strip-width fraction to another
   * (down on the window, move + up on the strip — the handlers live on the
   * strip and hit-test via the event target). */
  dragNavigatorWindow(fromXFrac: number, toXFrac: number): void {
    const window = within(this.root).getByTestId(NAVIGATOR_WINDOW_TESTID);
    this.brushDrag(window, fromXFrac, toXFrac);
  }

  /** Drags one edge handle between strip-width fractions (a resize/zoom).
   * `fromXFrac` must be the handle's CURRENT fraction (the caller computes
   * it from the viewport it set up) — only the delta `to − from` matters,
   * since hit-testing is by target element, not coordinates. */
  dragNavigatorHandle(
    side: "left" | "right",
    fromXFrac: number,
    toXFrac: number,
  ): void {
    const handle = within(this.root).getByTestId(
      side === "left" ? "navigator-handle-left" : "navigator-handle-right",
    );
    this.brushDrag(handle, fromXFrac, toXFrac);
  }

  /** Presses the empty track at a strip-width fraction (recentres the
   * window) and releases without moving. */
  pressNavigatorTrack(xFrac: number): void {
    const strip = this.navigatorStrip();
    fireEvent.pointerDown(strip, {
      pointerId: 1,
      clientX: STRIP_RECT.left + xFrac * STRIP_RECT.width,
      clientY: 16,
    });
    fireEvent.pointerUp(strip, { pointerId: 1 });
    this.setProps({});
  }

  /** down on `target` → move + up on the strip, in strip-width fractions.
   * fromXFrac only anchors the delta (hit-testing is by target, not
   * coordinates). */
  private brushDrag(
    target: HTMLElement,
    fromXFrac: number,
    toXFrac: number,
  ): void {
    const strip = this.navigatorStrip();
    fireEvent.pointerDown(target, {
      pointerId: 1,
      clientX: STRIP_RECT.left + fromXFrac * STRIP_RECT.width,
      clientY: 16,
    });
    fireEvent.pointerMove(strip, {
      pointerId: 1,
      clientX: STRIP_RECT.left + toXFrac * STRIP_RECT.width,
      clientY: 16,
    });
    fireEvent.pointerUp(strip, { pointerId: 1 });
    this.setProps({});
  }

  /** The strip element with jsdom's holes stubbed: a concrete bounding rect
   * plus the pointer-capture trio jsdom doesn't implement. */
  private navigatorStrip(): HTMLElement {
    const el = within(this.root).getByTestId(NAVIGATOR_TESTID);

    el.getBoundingClientRect = (): DOMRect => {
      return STRIP_RECT;
    };
    el.setPointerCapture = (): void => {};
    el.hasPointerCapture = (): boolean => {
      return false;
    };
    el.releasePointerCapture = (): void => {};

    return el;
  }
```

**Gotcha the implementer must respect:** `brushDrag`'s pointerDOWN fires on
the *target* (window/handle) but the DOWN handler runs on the strip via
bubbling, and reads `e.currentTarget.getBoundingClientRect()` — which IS the
strip — so `navigatorStrip()` must be called (stubbing applied) BEFORE the
down event. Order inside `brushDrag` above already guarantees it via the
`strip` const. `hasPointerCapture` returning `false` simply skips the release
call — fine.

- [ ] **Step 2: The failing spec** — `ChartNavigator.contract.spec.ts`. Numbers assume `STRIP_RECT.width = 500`, 300 candles, default viewport `{240, 300}` (60 visible):

```ts
import { CandleChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { candleAt, generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

const CANDLES = generateCandles(300);
const DEFAULT_VISIBLE = 60;
const LAST = candleAt(299);

function mountChart(candles = CANDLES) {
  return mount(CandleChart, {
    props: {
      candles,
      liveRate: LAST.close,
      flashOn: false,
      kind: "candles" as const,
      indicators: [],
      defaultVisible: DEFAULT_VISIBLE,
    },
  });
}

describe("CandleChart — navigator brush", () => {
  it("renders the navigator with the window; hides it entirely on an empty series", () => {
    const chart = mountChart();
    expect(chart.hasNavigator()).toBe(true);

    const empty = mountChart([]);
    expect(empty.hasNavigator()).toBe(false);
  });

  it("dragging the window body left pans away from the live edge and shifts the time window", () => {
    const chart = mountChart();
    const before = chart.timeLabels();

    // −0.1 of the strip = −30 candles: {240,300} → {210,270}.
    chart.dragNavigatorWindow(0.9, 0.8);

    expect(chart.candleCount()).toBe(60);
    expect(chart.backToLive().visible).toBe(true);
    expect(chart.timeLabels()).not.toEqual(before);
  });

  it("dragging the right handle left zooms in on the window's end edge", () => {
    const chart = mountChart();

    // end 300 → 270: {240,270} = 30 candles, no longer at the live edge.
    chart.dragNavigatorHandle("right", 1, 0.9);

    expect(chart.candleCount()).toBe(30);
    expect(chart.backToLive().visible).toBe(true);
  });

  it("dragging the left handle left widens the window WITHOUT leaving the live edge", () => {
    const chart = mountChart();

    // start 240 → 210: {210,300} = 90 candles, end untouched → still live.
    chart.dragNavigatorHandle("left", 0.8, 0.7);

    expect(chart.candleCount()).toBe(90);
    expect(chart.backToLive().visible).toBe(false);
  });

  it("the right handle can never resize the window below MIN_VIEWPORT_SPAN", () => {
    const chart = mountChart();

    chart.dragNavigatorHandle("right", 1, 0);

    expect(chart.candleCount()).toBe(5);
    expect(chart.backToLive().visible).toBe(true);
  });

  it("pressing the empty track recentres the window on the pressed index", () => {
    const chart = mountChart();

    // 0.5 × 300 = idx 150 → {120, 180}: span preserved, live edge left,
    // the real last candle (299) far out of view.
    chart.pressNavigatorTrack(0.5);

    expect(chart.candleCount()).toBe(60);
    expect(chart.backToLive().visible).toBe(true);
    expect(chart.lastCandleUp()).toBeNull();
  });

  it("dragging the window back to the right edge re-enters live-follow", () => {
    const chart = mountChart();

    chart.dragNavigatorWindow(0.9, 0.5);
    expect(chart.backToLive().visible).toBe(true);

    chart.dragNavigatorWindow(0.5, 1);

    expect(chart.backToLive().visible).toBe(false);
    expect(chart.lastCandleUp()).toBe(LAST.close >= LAST.open);
  });
});
```

Fraction arithmetic the spec's comments rely on (strip width 500, 300
candles, default viewport `{240, 300}`): a handle drag of −0.1 strip-width =
−30 candles, so right-handle `1 → 0.9` gives end 300→270; left-handle
`0.8 → 0.7` gives start 240→210; right-handle `1 → 0` is −300 candles, and
`resizeViewportEdge` floors end at start + 5 = 245 (span 5).

- [ ] **Step 3: Run against React** — `pnpm --filter @rtc/client-react test -- ChartNavigator` → PASS (7 specs).
- [ ] **Step 4: Run against Solid** — `pnpm --filter @rtc/client-solid test -- ChartNavigator` → PASS (same 7 — parity witnessed).
- [ ] **Step 5: Coverage gates** — `pnpm --filter @rtc/client-react test:ui:contract:coverage` and `pnpm --filter @rtc/client-solid test:ui:contract:coverage` → both ≥95% (the new NavigatorStrip/useNavigatorBrush/createNavigatorBrush files are inside the gated tree; the spec above plus Task 3/5's unit tests must cover them — check the per-file table in the output, not just the aggregate).
- [ ] **Step 6: Commit**

```bash
git add packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts packages/ui-contract/src/specs/equities/chart/ChartNavigator.contract.spec.ts
git commit -m "test(ui-contract): ChartNavigator brush spec + CandleChartPage drivers"
```

---

### Task 8: e2e — navigator lifecycle in a real browser

**Files:**
- Modify: `tests/browser/page-objects/contracts/testids.ts` (add under `equities.chart`: `navigator: "chart-navigator"`, `navigatorWindow: "navigator-window"`, `navigatorHandleRight: "navigator-handle-right"`)
- Modify: `tests/browser/page-objects/contracts/EquitiesChart.ts`
- Modify: `tests/browser/page-objects/playwright/EquitiesChart.ts`
- Modify: `tests/browser/scenarios/equitiesChart.ts`
- Modify: `tests/browser/playwright/equitiesChart.spec.ts`

**Interfaces:**
- Consumes: Tasks 4/6's rendered strip (either client — the suite runs against the configured one), existing `common.waitSeconds`, the recorded-time-labels helpers.
- Produces: nothing downstream.

Real-browser value: pointer-capture retargeting (jsdom-invisible — the exact
bug class that bit BACK TO LIVE last time) plus real layout geometry.

- [ ] **Step 1: PO contract additions** — `EquitiesChartPO` gains:

```ts
  waitNavigatorVisible(timeoutMs: number): Promise<void>;
  /** Drags the navigator window body by a fraction of the strip's width
   * (negative = toward older candles). */
  dragNavigatorWindowBy(stripWidthFrac: number): Promise<void>;
  /** Drags the right handle to the strip's right edge — re-enters
   * live-follow. */
  dragNavigatorRightHandleToLiveEdge(): Promise<void>;
```

- [ ] **Step 2: Playwright implementation** — in `page-objects/playwright/EquitiesChart.ts`:

```ts
  private navigator(): Locator {
    return this.page.getByTestId(TESTIDS.equities.chart.navigator);
  }

  async waitNavigatorVisible(timeoutMs: number): Promise<void> {
    await expect(this.navigator()).toBeVisible({ timeout: timeoutMs });
  }

  async dragNavigatorWindowBy(stripWidthFrac: number): Promise<void> {
    const strip = await this.navigator().boundingBox();
    const windowBox = await this.page
      .getByTestId(TESTIDS.equities.chart.navigatorWindow)
      .boundingBox();

    if (!strip || !windowBox) {
      throw new Error("navigator strip/window not laid out");
    }

    const fromX = windowBox.x + windowBox.width / 2;
    const y = strip.y + strip.height / 2;
    await this.page.mouse.move(fromX, y);
    await this.page.mouse.down();
    await this.page.mouse.move(fromX + stripWidthFrac * strip.width, y, {
      steps: 5,
    });
    await this.page.mouse.up();
  }

  async dragNavigatorRightHandleToLiveEdge(): Promise<void> {
    const strip = await this.navigator().boundingBox();
    const handle = await this.page
      .getByTestId(TESTIDS.equities.chart.navigatorHandleRight)
      .boundingBox();

    if (!strip || !handle) {
      throw new Error("navigator strip/handle not laid out");
    }

    const y = strip.y + strip.height / 2;
    await this.page.mouse.move(handle.x + handle.width / 2, y);
    await this.page.mouse.down();
    await this.page.mouse.move(strip.x + strip.width - 1, y, { steps: 5 });
    await this.page.mouse.up();
  }
```

- [ ] **Step 3: Scenario helpers** — `scenarios/equitiesChart.ts`:

```ts
export async function expectNavigatorVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitNavigatorVisible(seconds * 1_000);
}

export async function dragNavigatorWindowBy(
  ctx: TestContext,
  stripWidthFrac: number,
): Promise<void> {
  await ctx.po.equitiesChart.dragNavigatorWindowBy(stripWidthFrac);
}

export async function dragNavigatorRightHandleToLiveEdge(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.equitiesChart.dragNavigatorRightHandleToLiveEdge();
}
```

- [ ] **Step 4: The test** — append to `playwright/equitiesChart.spec.ts` inside the describe:

```ts
  test("navigator brush pans away; dragging its right handle to the edge resumes live", async ({
    ctx,
  }) => {
    await equitiesChart.openEquitiesWorkspace(ctx);
    await equitiesChart.expectPlotVisibleWithin(ctx, 5);
    await equitiesChart.expectNavigatorVisibleWithin(ctx, 3);

    await equitiesChart.dragNavigatorWindowBy(ctx, -0.2);
    await equitiesChart.expectBackToLiveVisibleWithin(ctx, 3);

    await equitiesChart.recordTimeLabels(ctx, "brushed");
    await common.waitSeconds(ctx, 1.5); // live ticks continue in the background
    await equitiesChart.expectTimeLabelsMatch(ctx, "brushed");

    await equitiesChart.dragNavigatorRightHandleToLiveEdge(ctx);
    await equitiesChart.expectBackToLiveHiddenWithin(ctx, 3);
  });
```

(Note: dragging the right handle to the live edge re-enters follow but keeps
the widened/narrowed span — `isAtLiveEdge` is edge-based, not span-based;
the assertion is only the pill hiding, deliberately.)

- [ ] **Step 5: Run** — `pnpm test:e2e` (or the single suite if the runner's filter supports it — check `tests/browser/run-all.ts` before inventing flags; the suites run in parallel on `RTC_DEV_PORT` 3001+). Expect the whole equities suite green, including the pre-existing test.

- [ ] **Step 6: Commit**

```bash
git add tests/browser/
git commit -m "test(e2e): navigator brush pan + right-handle return-to-live lifecycle"
```

---

### Task 9: Visual goldens — regenerate the arm64 local sets

**Files:**
- Regenerated PNGs under `packages/ui-contract/goldens/playwright/__screenshots__/react-local/…` (every scenario whose tree contains the equities chart: the 7 `equities/chart-*` interactive scenarios, `equities/chart-panel`, `app/equities` — both themes)
- No new scenarios, no wrapper changes (done in Tasks 4/6).

The navigator renders inside `ChartPlot`, so every chart-bearing golden's
pixels change — this is expected and the whole diff. Solid asserts against
the shared goldens (react writes / solid asserts, the dual-set doctrine —
solid owns none of its own).

- [ ] **Step 1: Build everything first** — `pnpm build` (visual runs need built libs; from a worktree, install+build FIRST and start vite by direct binary path if the harness needs it — see the repo's visual-tier-from-worktree notes).
- [ ] **Step 2: Regenerate the react-local set** — `pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update` (the `--update-snapshots` script). **Trap:** a byte-identical golden after `--update-snapshots` is NOT proof of regeneration — playwright skips the rewrite on pass, and a stale reused vite server (:3200) can serve old code; kill any vite already listening on the visual port first, and verify `git status` shows the expected chart scenarios changed.
- [ ] **Step 3: Assert with Solid** — `pnpm --filter @rtc/client-solid test:ui:visual` (NO update flag) → PASS against the regenerated set.
- [ ] **Step 4: Sanity-check the diff scope** — `git status --short packages/ui-contract/goldens/ | wc -l`: expect changes confined to chart-bearing scenarios × 2 themes; any OTHER scenario changing is a red flag — stop and diagnose.
- [ ] **Step 5: Commit**

```bash
git add packages/ui-contract/goldens/
git commit -m "test(visual): regenerate arm64 goldens — navigator strip in every chart-bearing scenario"
```

(The canonical x86 `react/` set is NOT regenerable on this machine: after the
implementation PR merges, dispatch `update-visual-goldens.yml`, download the
artifact, and ship the sync as its own mechanical PR — the controller's job,
not this task's.)

---

### Task 10: Docs + STATUS + full gauntlet

**Files:**
- Modify: `docs/architecture/17-web-client-up-close.md` (§17.6)
- Modify: `docs/STATUS.md`

- [ ] **Step 1: §17.6 extension** — append a short subsection to the equities-chart interaction-core section: the navigator as a *second writer to the same viewport* (`applyViewport` the one new command; `navigatorVm` + `resizeViewportEdge`/`centerViewportAt` pure in motion-core; `panBy` reused for the body drag; the window derived from the shared viewport value so `followLive` slides it for free; the zero-effects brush-shell constraint). Match the section's existing voice and depth; run `pnpm check:doc-links`.
- [ ] **Step 2: STATUS.md** — two edits, bump the `**Last updated:**` line: (1) DELETE the 🔴 "Equities chart navigator (mini-map / range brush)" entry (the work is done — pending-only page); (2) APPEND to the "React vs Solid: which web client is actually more performant?" entry a sub-observation recording the brush-shell comparison per spec §5: primitives used (React: 1 ref, 0 effects, 0 state cells; Solid: 1 `let`, 0 effects, 0 signals — fill in the real numbers from Tasks 3/5), line counts of the two shells, and the update-path difference under a continuous drag (React re-renders the chart subtree per move with Compiler memoization; Solid re-runs only the bindings reading `viewport`). Also put the same observations in the implementation PR's description at ship time.
- [ ] **Step 3: Full gauntlet** — run `/rtc:gauntlet full` equivalents (the fast 14 + typecheck, unit, both coverage gates, type-aware ESLint, lint-warnings ledger, build, devtools-dist). Every gate green before the branch is handed back.
- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: navigator in §17.6; STATUS close-out + React-vs-Solid brush observations"
```

---

## Execution notes for the controller

- Tasks 1–2 are independent of each other; 3–4 (React) and 5–6 (Solid) both depend on 1–2; 7 depends on 4+6; 8 depends on 4+6; 9 depends on 4+6; 10 last. Implementers run sequentially per SDD anyway — order as numbered.
- After Tasks 1–2, run `pnpm --filter @rtc/motion-core build` once so the client packages resolve the new exports (or keep `pnpm dev:watch` running).
- Task 7's Step 5 per-file coverage check is the gate that catches a dead branch in the brush shells — read the per-file table, never just the aggregate.
