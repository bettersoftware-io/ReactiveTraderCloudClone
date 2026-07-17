# Live FPS + MEM Readouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two static cosmetic footer readouts (`FPS "60"`, `MEM "248MB"`) with real, react-scan-style live measurements in both web clients, without breaking any golden or contract test.

**Architecture:** ADR-005 §② split — three pure functions in `@rtc/motion-core` (`computeFps`, `fpsTone`, `formatHeapMb`) + a per-framework `useLiveMetrics` shell that runs a single `requestAnimationFrame` loop, publishes once per second (throttle time-gated inside the loop, never `setInterval`), and reads `performance.memory`. A framework context (`LiveMetricsContext`) injects a frozen seed under the visual + contract harnesses so committed goldens stay byte-identical; production has no provider and runs live.

**Tech Stack:** TypeScript, `@rtc/motion-core` (zero-dep pure math), React 19 (client-react), SolidJS (client-solid), Vitest, Playwright (visual, post-merge/non-gating).

## Global Constraints

- **No `setTimeout`/`setInterval` anywhere in `src/ui`** (grep-gates 29 React / 37 Solid). `requestAnimationFrame` IS allowed there (BootSequence uses it). The publish throttle must be time-gated inside the rAF loop via `performance.now()`.
- **No `import.meta.env` / `fetch` / `localStorage` / rxjs imports in `src/ui`** (grep-gates 26–28, 34–36). The freeze arrives via context, never an env check.
- **`StatusBar.module.css` is byte-identical between client-react and client-solid today** — keep it identical (add the same rows to both).
- **motion-core is a zero-runtime-dependency leaf.** New code imports nothing but TS. Intra-package imports use the `.js` extension (`"./frameRate.js"`); tests are colocated `*.test.ts`.
- **Frozen seed reproduces today's appearance exactly:** `{ fps: 60, fpsTone: "dim", mem: "248MB" }` — the FPS cell keeps its current `dim` tone in goldens (the live traffic-light is verified in-browser, not in goldens).
- **Both web clients at parity.** The UI-contract `StatusBar.contract.spec` runs against both the react and solid registries; both must render `CosmeticMetrics` under the frozen provider. `client-react-native` has no `CosmeticMetrics` and is untouched.
- **Run gates from the worktree**, and in this shared checkout use worktree-absolute paths for all edits.

---

### Task 1: motion-core — `computeFps`, `fpsTone`, `formatHeapMb`

**Files:**
- Create: `packages/motion-core/src/frameRate.ts`
- Create: `packages/motion-core/src/frameRate.test.ts`
- Modify: `packages/motion-core/src/index.ts` (add re-exports)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type MetricTone = "positive" | "aware" | "negative"`
  - `computeFps(frameCount: number, elapsedMs: number): number`
  - `fpsTone(fps: number): MetricTone`
  - `formatHeapMb(usedBytes: number): string`
  - `const FPS_GOOD = 55`, `const FPS_WARN = 30`

- [ ] **Step 1: Write the failing test**

Create `packages/motion-core/src/frameRate.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  computeFps,
  FPS_GOOD,
  FPS_WARN,
  formatHeapMb,
  fpsTone,
} from "./frameRate.js";

describe("computeFps", () => {
  it("counts frames over the elapsed window as an integer fps", () => {
    expect(computeFps(60, 1000)).toBe(60);
    expect(computeFps(30, 500)).toBe(60);
    expect(computeFps(45, 1000)).toBe(45);
  });

  it("rounds to the nearest whole frame", () => {
    expect(computeFps(59, 1000)).toBe(59);
    expect(computeFps(1, 900)).toBe(1);
  });

  it("returns 0 for a non-positive window (guards divide-by-zero)", () => {
    expect(computeFps(10, 0)).toBe(0);
    expect(computeFps(10, -5)).toBe(0);
  });
});

describe("fpsTone", () => {
  it("is positive at/above the good threshold", () => {
    expect(fpsTone(FPS_GOOD)).toBe("positive");
    expect(fpsTone(60)).toBe("positive");
  });

  it("is aware between the warn and good thresholds", () => {
    expect(fpsTone(FPS_WARN)).toBe("aware");
    expect(fpsTone(FPS_GOOD - 1)).toBe("aware");
  });

  it("is negative below the warn threshold", () => {
    expect(fpsTone(FPS_WARN - 1)).toBe("negative");
    expect(fpsTone(0)).toBe("negative");
  });
});

describe("formatHeapMb", () => {
  it("formats used heap bytes as integer MB with a MB suffix", () => {
    expect(formatHeapMb(260 * 1024 * 1024)).toBe("260MB");
    expect(formatHeapMb(0)).toBe("0MB");
  });

  it("rounds to the nearest MB", () => {
    expect(formatHeapMb(1.6 * 1024 * 1024)).toBe("2MB");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/motion-core test -- frameRate`
Expected: FAIL — `Failed to resolve import "./frameRate.js"` / module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/motion-core/src/frameRate.ts`:

```ts
// Pure frame-rate + heap math for the HUD status-bar readouts (react-scan-style
// FPS meter). Zero-dependency, DOM-free: the caller/shell holds the frame
// counters and injects the elapsed window + heap bytes. See ADR-005 §②.

/** Traffic-light tone for a live FPS reading — maps 1:1 to the status-bar CSS
 *  accent vars `--accent-positive` / `--accent-aware` / `--accent-negative`. */
export type MetricTone = "positive" | "aware" | "negative";

/** Frames-per-second thresholds, react-scan-style: green ≥55, amber ≥30, red below. */
export const FPS_GOOD = 55;
export const FPS_WARN = 30;

/** Integer fps = frames counted over the elapsed window (react-scan's 1s bucket).
 *  Guards a non-positive window by returning 0. */
export function computeFps(frameCount: number, elapsedMs: number): number {
  if (elapsedMs <= 0) {
    return 0;
  }
  return Math.round((frameCount * 1000) / elapsedMs);
}

/** Traffic-light tone for an fps value. */
export function fpsTone(fps: number): MetricTone {
  if (fps >= FPS_GOOD) {
    return "positive";
  }
  if (fps >= FPS_WARN) {
    return "aware";
  }
  return "negative";
}

const BYTES_PER_MB = 1024 * 1024;

/** Used JS-heap bytes → the footer's "248MB" value shape (integer MB). */
export function formatHeapMb(usedBytes: number): string {
  return `${Math.round(usedBytes / BYTES_PER_MB)}MB`;
}
```

- [ ] **Step 4: Add the re-exports to the package index**

Modify `packages/motion-core/src/index.ts` — append after the existing `reducedMotion` export:

```ts
export type { MetricTone } from "./frameRate.js";
export {
  computeFps,
  FPS_GOOD,
  FPS_WARN,
  formatHeapMb,
  fpsTone,
} from "./frameRate.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/motion-core test -- frameRate`
Expected: PASS (3 describe blocks green).

- [ ] **Step 6: Typecheck the package**

Run: `pnpm --filter @rtc/motion-core typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/motion-core/src/frameRate.ts packages/motion-core/src/frameRate.test.ts packages/motion-core/src/index.ts
git commit -m "feat(motion-core): pure computeFps/fpsTone/formatHeapMb for the live HUD meter"
```

---

### Task 2: client-react — `LiveMetricsContext` + `useLiveMetrics` hook

**Files:**
- Create: `packages/client-react/src/ui/shell/status/LiveMetricsContext.ts`
- Create: `packages/client-react/src/ui/shell/status/useLiveMetrics.ts`
- Create: `packages/client-react/src/ui/shell/status/useLiveMetrics.test.tsx`

**Interfaces:**
- Consumes (from Task 1): `computeFps`, `fpsTone`, `formatHeapMb`, `MetricTone` from `@rtc/motion-core`.
- Produces:
  - `interface LiveMetrics { fps: number | null; fpsTone: MetricTone | "dim"; mem: string | null }`
  - `const LiveMetricsContext: Context<LiveMetrics | null>` (default `null` → live)
  - `const FROZEN_LIVE_METRICS: LiveMetrics` = `{ fps: 60, fpsTone: "dim", mem: "248MB" }`
  - `function useLiveMetrics(): LiveMetrics`

- [ ] **Step 1: Write the context + frozen seed**

Create `packages/client-react/src/ui/shell/status/LiveMetricsContext.ts`:

```ts
import { createContext } from "react";

import type { MetricTone } from "@rtc/motion-core";

/** The live HUD readouts consumed by CosmeticMetrics. `fps`/`mem` are null until
 *  the first sample (or where `performance.memory` is unavailable); `fpsTone`
 *  carries the traffic-light tone, falling back to "dim" (the default cell
 *  colour) when there is no reading yet. */
export interface LiveMetrics {
  fps: number | null;
  fpsTone: MetricTone | "dim";
  mem: string | null;
}

/** Freeze seam. Default `null` → `useLiveMetrics` runs the live rAF loop
 *  (production). When a provider supplies a value, the hook returns it verbatim
 *  and starts no loop — used by the visual + contract harnesses for
 *  determinism. Mirrors ThemeContext's split-context pattern. */
export const LiveMetricsContext = createContext<LiveMetrics | null>(null);

/** The seed the harnesses inject: reproduces the footer's pre-change static
 *  appearance exactly (FPS "60" in its original `dim` tone, MEM "248MB"), so
 *  every committed golden stays byte-identical. The live traffic-light is
 *  verified in-browser, not in goldens. */
export const FROZEN_LIVE_METRICS: LiveMetrics = {
  fps: 60,
  fpsTone: "dim",
  mem: "248MB",
};
```

- [ ] **Step 2: Write the failing hook test**

Create `packages/client-react/src/ui/shell/status/useLiveMetrics.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FROZEN_LIVE_METRICS,
  LiveMetricsContext,
} from "./LiveMetricsContext";
import { useLiveMetrics } from "./useLiveMetrics";

describe("useLiveMetrics", () => {
  let rafCb: FrameRequestCallback | null;

  beforeEach(() => {
    rafCb = null;
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCb = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(performance, "memory");
  });

  // Drive one frame: the mock captured the pending callback; call it with the
  // frame's timestamp, then let the hook re-arm rAF (captures the next callback).
  function frame(ts: number): void {
    const cb = rafCb;
    rafCb = null;
    act(() => {
      cb?.(ts);
    });
  }

  it("returns the frozen value and never starts a loop when a provider is present", () => {
    const wrapper = ({ children }: { children: ReactNode }) => {
      return (
        <LiveMetricsContext.Provider value={FROZEN_LIVE_METRICS}>
          {children}
        </LiveMetricsContext.Provider>
      );
    };
    const { result } = renderHook(() => useLiveMetrics(), { wrapper });

    expect(result.current).toEqual(FROZEN_LIVE_METRICS);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("starts null, then publishes fps + tone counted over the ~1s window", () => {
    const { result } = renderHook(() => useLiveMetrics());

    expect(result.current.fps).toBeNull();
    expect(result.current.fpsTone).toBe("dim");

    // 59 frames inside the window (elapsed < 1000ms) → no publish yet.
    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }
    expect(result.current.fps).toBeNull();

    // 60th frame lands the window at exactly 1000ms → publish 60fps.
    frame(1000);
    expect(result.current.fps).toBe(60);
    expect(result.current.fpsTone).toBe("positive");
  });

  it("reports formatted memory when performance.memory is present", () => {
    Object.defineProperty(performance, "memory", {
      configurable: true,
      value: { usedJSHeapSize: 260 * 1024 * 1024 },
    });
    const { result } = renderHook(() => useLiveMetrics());

    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }
    frame(1000);

    expect(result.current.mem).toBe("260MB");
  });

  it("reports null memory when performance.memory is unavailable", () => {
    const { result } = renderHook(() => useLiveMetrics());

    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }
    frame(1000);

    expect(result.current.mem).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react exec vitest run src/ui/shell/status/useLiveMetrics.test.tsx`
Expected: FAIL — cannot resolve `./useLiveMetrics`.

- [ ] **Step 4: Write the hook**

Create `packages/client-react/src/ui/shell/status/useLiveMetrics.ts`:

```ts
import { useContext, useEffect, useState } from "react";

import { computeFps, formatHeapMb, fpsTone } from "@rtc/motion-core";

import { type LiveMetrics, LiveMetricsContext } from "./LiveMetricsContext";

/** Publish cadence — one 1-second rolling window (react-scan). Also the
 *  re-render cadence: at most one small commit per second. */
const PUBLISH_MS = 1000;

const INITIAL: LiveMetrics = { fps: null, fpsTone: "dim", mem: null };

/** `performance.memory` is a non-standard Chromium-only field — not in the DOM
 *  lib types. Read it through a narrow guard; return null everywhere else. */
interface MemoryInfo {
  readonly usedJSHeapSize: number;
}

function readHeapBytes(): number | null {
  const perf = performance as Performance & { memory?: MemoryInfo };
  return perf.memory ? perf.memory.usedJSHeapSize : null;
}

/**
 * Live FPS + MEM for the HUD status bar. Runs a single rAF loop that counts
 * frames and, once ~1s has elapsed, publishes `{ fps, fpsTone, mem }` (throttle
 * time-gated inside the loop via `performance.now()` — no setInterval, per
 * grep-gate 29). When `LiveMetricsContext` supplies a frozen value (harnesses),
 * the loop never starts and the frozen value is returned — see ADR-005 §②.
 */
export function useLiveMetrics(): LiveMetrics {
  const frozen = useContext(LiveMetricsContext);
  const [live, setLive] = useState<LiveMetrics>(INITIAL);

  useEffect(() => {
    if (frozen) {
      return;
    }
    let raf = 0;
    let frames = 0;
    let windowStart = performance.now();

    const loop = (now: number): void => {
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed >= PUBLISH_MS) {
        const fps = computeFps(frames, elapsed);
        const heap = readHeapBytes();
        setLive({
          fps,
          fpsTone: fpsTone(fps),
          mem: heap === null ? null : formatHeapMb(heap),
        });
        frames = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [frozen]);

  return frozen ?? live;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react exec vitest run src/ui/shell/status/useLiveMetrics.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Verify the grep-gates stay green (no banned timers/env in src/ui)**

Run: `pnpm --filter @rtc/tests exec tsx scripts/grep-gates.ts` (or the repo's `pnpm gates` / grep-gates entry — see `tests/scripts/grep-gates.ts`).
Expected: gates 26–29 PASS — confirms `useLiveMetrics.ts` uses no `setTimeout`/`setInterval`/`import.meta.env` (only `requestAnimationFrame`, which is allowed).

- [ ] **Step 7: Commit**

```bash
git add packages/client-react/src/ui/shell/status/LiveMetricsContext.ts packages/client-react/src/ui/shell/status/useLiveMetrics.ts packages/client-react/src/ui/shell/status/useLiveMetrics.test.tsx
git commit -m "feat(client-react): useLiveMetrics rAF shell + freeze context for the HUD meter"
```

---

### Task 3: client-react — wire `CosmeticMetrics` + traffic-light CSS

**Files:**
- Modify: `packages/client-react/src/ui/shell/status/CosmeticMetrics.tsx`
- Modify: `packages/client-react/src/ui/shell/status/StatusBar.module.css`

**Interfaces:**
- Consumes (from Task 2): `useLiveMetrics` and `LiveMetrics` from `./useLiveMetrics` / `./LiveMetricsContext`.
- Produces: no new exports (component signature unchanged — still `CosmeticMetrics(): ReactElement`, no props).

- [ ] **Step 1: Add the two traffic-light tone rows to the CSS**

Modify `packages/client-react/src/ui/shell/status/StatusBar.module.css` — immediately after the existing `.metricValue[data-tone="positive"]` block (around line 50), add:

```css
.metricValue[data-tone="aware"] {
  color: var(--accent-aware);
}

.metricValue[data-tone="negative"] {
  color: var(--accent-negative);
}
```

(`data-tone="dim"` intentionally has no rule — it falls through to `.metricValue`'s default `--text-secondary`, exactly as the static cells do today.)

- [ ] **Step 2: Wire the live values into CosmeticMetrics**

Replace the body of `packages/client-react/src/ui/shell/status/CosmeticMetrics.tsx` with:

```tsx
// The GW/LAT/TPUT/POS/P&L/SES cells, build tag, and clock are decorative static
// chrome (see the comment on the static rows below). FPS + MEM are LIVE — real
// measurements from useLiveMetrics (react-scan-style rAF meter). Under the
// visual/contract harnesses a frozen provider reproduces the pre-change footer
// so goldens stay byte-identical; production has no provider and runs live.
import type { ReactElement } from "react";

import { useLiveMetrics } from "./useLiveMetrics";

import styles from "./StatusBar.module.css";

export function CosmeticMetrics(): ReactElement {
  const { fps, fpsTone, mem } = useLiveMetrics();

  // Ordered exactly as the prototype footer (GW, LAT, TPUT, FPS, MEM, POS, P&L,
  // SES); the two live cells are substituted in place.
  const metrics = [
    { label: "GW", value: "eu-west-1", tone: "dim" },
    { label: "LAT", value: "12ms", tone: "positive" },
    { label: "TPUT", value: "1.24k/s", tone: "dim" },
    { label: "FPS", value: fps === null ? "—" : String(fps), tone: fpsTone },
    { label: "MEM", value: mem ?? "—", tone: "dim" },
    { label: "POS", value: "8", tone: "dim" },
    { label: "P&L", value: "+$17.1k", tone: "positive" },
    { label: "SES", value: "1284", tone: "dim" },
  ];

  return (
    <div data-testid="cosmetic-metrics" className={styles.metrics}>
      {metrics.map((m) => {
        return (
          <span key={m.label} className={styles.metric}>
            <span className={styles.metricSep}>│</span>
            <span className={styles.metricLabel}>{m.label}</span>
            <span className={styles.metricValue} data-tone={m.tone}>
              {m.value}
            </span>
          </span>
        );
      })}
      <span className={styles.spacer} />
      <span className={styles.build}>{BUILD}</span>
      <span className={styles.metricSep}>│</span>
      <span className={styles.clock}>{CLOCK} UTC</span>
    </div>
  );
}

/** Static status-bar readouts (prototype footer, Reactive Trader.dc.html:732+):
 *  GW/LAT/TPUT/POS/P&L/SES are fixed seeded values, and the clock is a static
 *  seeded string (no ticking timer) so the view stays gate-clean and
 *  golden-stable. FPS + MEM are now live (see useLiveMetrics). */
const CLOCK = "09:47:03";
const BUILD = "BUILD v4.0.1";
```

- [ ] **Step 3: Verify `--accent-aware` resolves in the theme**

Run: `grep -rn "accent-aware" packages/client-react/src --include="*.css"`
Expected: at least one `--accent-aware:` declaration (a theme token) exists — confirms the new tone rows reference a real var. (If a skin lacks it, add `--accent-aware` alongside that skin's `--accent-positive`/`--accent-negative` — but the token already appears in the theme; see the grep in the design's §3a discovery.)

- [ ] **Step 4: Run the existing StatusBar contract spec against the react registry**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- StatusBar`
Expected: PASS — the spec only asserts `hasCosmeticMetrics()` (container exists); it renders under the frozen provider once Task 5 lands, but even without it the container is present. (If the harness provider isn't wired yet, the live loop is harmless in jsdom; the spec still passes.)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/shell/status/CosmeticMetrics.tsx packages/client-react/src/ui/shell/status/StatusBar.module.css
git commit -m "feat(client-react): wire live FPS+MEM into CosmeticMetrics + traffic-light tones"
```

---

### Task 4: client-react — freeze-seam harness wiring + golden verification

**Files:**
- Modify: `packages/client-react/tests/ui/contract/react/render.tsx`
- Modify: `packages/client-react/tests/ui/visual/react/VisualScenario.tsx`

**Interfaces:**
- Consumes (from Task 2): `FROZEN_LIVE_METRICS`, `LiveMetricsContext` from `#/ui/shell/status/LiveMetricsContext`.
- Produces: nothing (test harness only).

- [ ] **Step 1: Wrap the contract render stack in the frozen provider**

Modify `packages/client-react/tests/ui/contract/react/render.tsx`:

Add the import after line 17 (`import { ThemeProvider } ...`):

```tsx
import {
  FROZEN_LIVE_METRICS,
  LiveMetricsContext,
} from "#/ui/shell/status/LiveMetricsContext";
```

Wrap the existing provider tree — change the `rtlRender(...)` argument so `LiveMetricsContext.Provider` sits just inside `ViewModelProvider`:

```tsx
      <ViewModelProvider viewModel={hooks}>
        <LiveMetricsContext.Provider value={FROZEN_LIVE_METRICS}>
          <ThemeProvider>
            <FxViewProvider>
              <CreditViewProvider>
                <PropsHost subject={propsSubject} build={build} />
              </CreditViewProvider>
            </FxViewProvider>
          </ThemeProvider>
        </LiveMetricsContext.Provider>
      </ViewModelProvider>
```

- [ ] **Step 2: Wrap both VisualScenario return trees in the frozen provider**

Modify `packages/client-react/tests/ui/visual/react/VisualScenario.tsx`:

Add the import after line 8 (`import { ThemeProvider } ...`):

```tsx
import {
  FROZEN_LIVE_METRICS,
  LiveMetricsContext,
} from "#/ui/shell/status/LiveMetricsContext";
```

In **both** `return (...)` branches (the `FULL_BLEED` branch and the default branch), insert `<LiveMetricsContext.Provider value={FROZEN_LIVE_METRICS}>` immediately inside `<ViewModelProvider ...>` and close it immediately before `</ViewModelProvider>`. For the FULL_BLEED branch:

```tsx
      <ViewModelProvider viewModel={buildFakeViewModel(data)}>
        <LiveMetricsContext.Provider value={FROZEN_LIVE_METRICS}>
          <ThemeProvider>
            <FxViewProvider>
              <CreditViewProvider>{render(scenario.fixtureKey)}</CreditViewProvider>
            </FxViewProvider>
          </ThemeProvider>
        </LiveMetricsContext.Provider>
      </ViewModelProvider>
```

Apply the identical wrapping to the default (non-full-bleed) branch, around its `<ThemeProvider>…</ThemeProvider>` subtree.

- [ ] **Step 3: Confirm the frozen hook short-circuits (no rAF) under the harness**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- StatusBar`
Expected: PASS. The `status/bar` mount now reads `FROZEN_LIVE_METRICS`; no rAF loop runs in jsdom.

- [ ] **Step 4: Verify the `status/bar` golden is byte-identical**

Run: `pnpm --filter @rtc/client-react test:ui:visual:react`
Expected: PASS with **no** screenshot diffs for `status/bar` or any `app/*` scenario. The frozen seed reproduces the prior footer (FPS "60" dim, MEM "248MB"), so pixels are unchanged.

If — and only if — a diff appears, inspect it: it must be limited to the FPS/MEM cells. Do NOT blanket `--update-snapshots`. A diff here means the frozen seed doesn't match the prior static values; fix the seed, don't repaint the golden.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react/tests/ui/contract/react/render.tsx packages/client-react/tests/ui/visual/react/VisualScenario.tsx
git commit -m "test(client-react): inject frozen LiveMetrics under contract+visual harnesses"
```

---

### Task 5: client-solid — mirror the shell, wiring, CSS, and freeze seam

**Files:**
- Create: `packages/client-solid/src/ui/shell/status/LiveMetricsContext.ts`
- Create: `packages/client-solid/src/ui/shell/status/useLiveMetrics.ts`
- Create: `packages/client-solid/src/ui/shell/status/useLiveMetrics.test.tsx`
- Modify: `packages/client-solid/src/ui/shell/status/CosmeticMetrics.tsx`
- Modify: `packages/client-solid/src/ui/shell/status/StatusBar.module.css`
- Modify: `packages/client-solid/tests/ui/contract/solid/render.tsx`

**Interfaces:**
- Consumes (from Task 1): `computeFps`, `fpsTone`, `formatHeapMb`, `MetricTone` from `@rtc/motion-core`.
- Produces (Solid-shaped):
  - `interface LiveMetrics { fps: number | null; fpsTone: MetricTone | "dim"; mem: string | null }` (identical shape to the React one)
  - `const LiveMetricsContext = createContext<LiveMetrics | null>(null)`
  - `const FROZEN_LIVE_METRICS: LiveMetrics = { fps: 60, fpsTone: "dim", mem: "248MB" }`
  - `function useLiveMetrics(): Accessor<LiveMetrics>`

- [ ] **Step 1: Write the Solid context + frozen seed**

Create `packages/client-solid/src/ui/shell/status/LiveMetricsContext.ts`:

```ts
import { createContext } from "solid-js";

import type { MetricTone } from "@rtc/motion-core";

/** Solid counterpart of the react LiveMetricsContext — identical value shape. */
export interface LiveMetrics {
  fps: number | null;
  fpsTone: MetricTone | "dim";
  mem: string | null;
}

/** Freeze seam. Default `null` → live rAF loop (production). A provider value
 *  makes `useLiveMetrics` return it verbatim with no loop (harnesses). */
export const LiveMetricsContext = createContext<LiveMetrics | null>(null);

/** Reproduces the footer's pre-change static appearance so goldens stay stable. */
export const FROZEN_LIVE_METRICS: LiveMetrics = {
  fps: 60,
  fpsTone: "dim",
  mem: "248MB",
};
```

- [ ] **Step 2: Write the failing Solid hook test**

Create `packages/client-solid/src/ui/shell/status/useLiveMetrics.test.tsx`:

```tsx
import { renderHook } from "@solidjs/testing-library";
import { createComponent } from "solid-js";
import type { JSX } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FROZEN_LIVE_METRICS,
  LiveMetricsContext,
} from "./LiveMetricsContext";
import { useLiveMetrics } from "./useLiveMetrics";

describe("useLiveMetrics (solid)", () => {
  let rafCb: FrameRequestCallback | null;

  beforeEach(() => {
    rafCb = null;
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCb = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(performance, "memory");
  });

  function frame(ts: number): void {
    const cb = rafCb;
    rafCb = null;
    cb?.(ts);
  }

  it("returns the frozen value and starts no loop under a provider", () => {
    const { result } = renderHook(useLiveMetrics, {
      wrapper: (props: { children: JSX.Element }) => {
        return createComponent(LiveMetricsContext.Provider, {
          value: FROZEN_LIVE_METRICS,
          get children() {
            return props.children;
          },
        });
      },
    });

    expect(result()).toEqual(FROZEN_LIVE_METRICS);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("publishes fps + tone over the ~1s window", () => {
    const { result } = renderHook(useLiveMetrics);

    expect(result().fps).toBeNull();
    for (let i = 1; i <= 59; i += 1) {
      frame(i);
    }
    expect(result().fps).toBeNull();
    frame(1000);
    expect(result().fps).toBe(60);
    expect(result().fpsTone).toBe("positive");
  });
});
```

(`renderHook`'s `result` is the hook's return — here an `Accessor<LiveMetrics>` — so assertions call `result()`. If the installed `@solidjs/testing-library` exposes the value as `result` directly rather than a getter, adjust to match its API; the two assertions on frozen + one live publish are the coverage.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-solid exec vitest run src/ui/shell/status/useLiveMetrics.test.tsx`
Expected: FAIL — cannot resolve `./useLiveMetrics`.

- [ ] **Step 4: Write the Solid hook**

Create `packages/client-solid/src/ui/shell/status/useLiveMetrics.ts`:

```ts
import type { Accessor } from "solid-js";
import { createSignal, onCleanup, useContext } from "solid-js";

import { computeFps, formatHeapMb, fpsTone } from "@rtc/motion-core";

import { type LiveMetrics, LiveMetricsContext } from "./LiveMetricsContext";

const PUBLISH_MS = 1000;

const INITIAL: LiveMetrics = { fps: null, fpsTone: "dim", mem: null };

interface MemoryInfo {
  readonly usedJSHeapSize: number;
}

function readHeapBytes(): number | null {
  const perf = performance as Performance & { memory?: MemoryInfo };
  return perf.memory ? perf.memory.usedJSHeapSize : null;
}

/**
 * Solid counterpart of the react useLiveMetrics: one rAF loop, publishes once
 * per ~1s (throttle time-gated inside the loop — no setInterval, per grep-gate
 * 37). Returns a frozen accessor when LiveMetricsContext supplies a value.
 */
export function useLiveMetrics(): Accessor<LiveMetrics> {
  const frozen = useContext(LiveMetricsContext);
  if (frozen) {
    return () => {
      return frozen;
    };
  }

  const [live, setLive] = createSignal<LiveMetrics>(INITIAL);
  let frames = 0;
  let windowStart = performance.now();

  const loop = (now: number): void => {
    frames += 1;
    const elapsed = now - windowStart;
    if (elapsed >= PUBLISH_MS) {
      const fps = computeFps(frames, elapsed);
      const heap = readHeapBytes();
      setLive({
        fps,
        fpsTone: fpsTone(fps),
        mem: heap === null ? null : formatHeapMb(heap),
      });
      frames = 0;
      windowStart = now;
    }
    raf = requestAnimationFrame(loop);
  };

  let raf = requestAnimationFrame(loop);
  onCleanup(() => {
    cancelAnimationFrame(raf);
  });

  return live;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-solid exec vitest run src/ui/shell/status/useLiveMetrics.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Add the identical CSS tone rows**

Modify `packages/client-solid/src/ui/shell/status/StatusBar.module.css` — add the SAME two rows as Task 3 Step 1 (after `.metricValue[data-tone="positive"]`):

```css
.metricValue[data-tone="aware"] {
  color: var(--accent-aware);
}

.metricValue[data-tone="negative"] {
  color: var(--accent-negative);
}
```

Then confirm parity: `diff packages/client-react/src/ui/shell/status/StatusBar.module.css packages/client-solid/src/ui/shell/status/StatusBar.module.css` → no output (identical).

- [ ] **Step 7: Wire the Solid CosmeticMetrics**

Replace the body of `packages/client-solid/src/ui/shell/status/CosmeticMetrics.tsx`:

```tsx
// FPS + MEM are LIVE (useLiveMetrics, react-scan-style rAF meter); the rest of
// the footer is decorative static chrome. A frozen provider under the harnesses
// keeps goldens byte-identical.
import type { JSX } from "solid-js";
import { For } from "solid-js";

import { useLiveMetrics } from "./useLiveMetrics";

import styles from "./StatusBar.module.css";

export function CosmeticMetrics(): JSX.Element {
  const metrics = useLiveMetrics();

  const cells = (): { label: string; value: string; tone: string }[] => {
    const m = metrics();
    return [
      { label: "GW", value: "eu-west-1", tone: "dim" },
      { label: "LAT", value: "12ms", tone: "positive" },
      { label: "TPUT", value: "1.24k/s", tone: "dim" },
      { label: "FPS", value: m.fps === null ? "—" : String(m.fps), tone: m.fpsTone },
      { label: "MEM", value: m.mem ?? "—", tone: "dim" },
      { label: "POS", value: "8", tone: "dim" },
      { label: "P&L", value: "+$17.1k", tone: "positive" },
      { label: "SES", value: "1284", tone: "dim" },
    ];
  };

  return (
    <div data-testid="cosmetic-metrics" class={styles.metrics}>
      <For each={cells()}>
        {(m) => {
          return (
            <span class={styles.metric}>
              <span class={styles.metricSep}>│</span>
              <span class={styles.metricLabel}>{m.label}</span>
              <span class={styles.metricValue} data-tone={m.tone}>
                {m.value}
              </span>
            </span>
          );
        }}
      </For>
      <span class={styles.spacer} />
      <span class={styles.build}>{BUILD}</span>
      <span class={styles.metricSep}>│</span>
      <span class={styles.clock}>{CLOCK} UTC</span>
    </div>
  );
}

const CLOCK = "09:47:03";
const BUILD = "BUILD v4.0.1";
```

- [ ] **Step 8: Wire the frozen provider into the Solid contract render stack**

Modify `packages/client-solid/tests/ui/contract/solid/render.tsx`:

Add the import after line 17:

```tsx
import {
  FROZEN_LIVE_METRICS,
  LiveMetricsContext,
} from "#/ui/shell/status/LiveMetricsContext";
```

Wrap the provider tree so `LiveMetricsContext.Provider` sits just inside `ViewModelProvider`:

```tsx
        <ViewModelProvider viewModel={viewModel}>
          <LiveMetricsContext.Provider value={FROZEN_LIVE_METRICS}>
            <ThemeProvider>
              <FxViewProvider>
                <CreditViewProvider>
                  <PropsHost subject={propsSubject} build={build} />
                </CreditViewProvider>
              </FxViewProvider>
            </ThemeProvider>
          </LiveMetricsContext.Provider>
        </ViewModelProvider>
```

- [ ] **Step 9: Run the Solid contract StatusBar spec + typecheck**

Run: `pnpm --filter @rtc/client-solid test:ui:contract -- StatusBar`
Then: `pnpm --filter @rtc/client-solid typecheck`
Expected: both PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/client-solid/src/ui/shell/status/ packages/client-solid/tests/ui/contract/solid/render.tsx
git commit -m "feat(client-solid): live FPS+MEM meter at parity (shell, context, wiring, freeze seam)"
```

---

### Task 6: Full gauntlet, in-browser live verification, and STATUS update

**Files:**
- Modify: `docs/STATUS.md` (mark this workstream)

**Interfaces:**
- Consumes: the complete change from Tasks 1–5.
- Produces: nothing (verification + bookkeeping).

- [ ] **Step 1: Run the full local gauntlet**

Run, from the worktree:
```bash
pnpm build && pnpm typecheck && pnpm test && pnpm check:doc-links
pnpm lint            # Biome + ESLint (base+typed) + stylelint — see memory: Biome-clean ≠ CI-clean
pnpm knip
```
Then the UI-contract coverage gate for BOTH frameworks (CI-only gate, runnable locally — per memory, a react-only-looking change must still pass the Solid coverage gate):
```bash
pnpm --filter @rtc/client-react test:ui:coverage
pnpm --filter @rtc/client-solid test:ui:contract:coverage
```
And the grep-gates:
```bash
pnpm --filter @rtc/tests exec tsx scripts/grep-gates.ts
```
Expected: all green. Gates 29/37 confirm no `setInterval`/`setTimeout` reached `src/ui`.

- [ ] **Step 2: Verify the live meter in-browser (React)**

Run: `pnpm dev` (Vite web client). In the browser:
- The footer FPS reads a live integer (≈60 on an idle HUD), MEM tracks the heap (e.g. climbs slightly over time), both updating ~once per second.
- Induce jank (e.g. DevTools CPU throttle 6×, or a busy tab) → FPS drops and its colour steps green → amber → red (`--accent-positive` → `--accent-aware` → `--accent-negative`).
- In a browser without `performance.memory` (Firefox/Safari) MEM reads `—`; FPS still works.

Capture a short before/after note (or GIF) for the PR body.

- [ ] **Step 3: Verify the live meter in-browser (Solid, parity)**

Run: `pnpm dev:solid` (→ http://localhost:5473). Confirm the same live FPS behaviour in the Solid client's footer.

- [ ] **Step 4: Update `docs/STATUS.md`**

Add/adjust the entry for this workstream (live FPS + MEM meter) — mark it Implemented with the spec + plan paths. Follow the file's existing format. (This is also handled by the `tracking-workstream-status` skill at merge time.)

- [ ] **Step 5: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): live FPS+MEM HUD meter implemented"
```

- [ ] **Step 6: Push, open the PR, and follow shipping-repo-changes**

Per the `shipping-repo-changes` skill: push the branch, open the PR (`--base main`), poll `gh run list --workflow CI --json status,conclusion,headSha` until the run for HEAD is `completed`/`success`, triage catch-up risk, then `gh pr merge <n> --merge`. Note: `visual.yml` is post-merge and non-gating; the goldens are unchanged by this work, so no golden reconcile is needed.

---

## Notes for the implementer

- **Do not** reach for `setInterval`/`setTimeout` in any `src/ui` file — the throttle lives inside the rAF loop. Grep-gates 29/37 will fail the build otherwise.
- **Do not** `--update-snapshots` the visual goldens. This change is designed to leave them byte-identical; a diff means the frozen seed is wrong, not the golden.
- The frozen seed (`fpsTone: "dim"`) deliberately differs from what the live hook would compute for 60fps (`"positive"`). That is intentional: the seed's contract is "reproduce the prior footer for golden stability", and the live traffic-light is verified in-browser (Task 6 Steps 2–3).
- `performance.memory` is Chromium-only and read-only in real browsers; the `readHeapBytes` guard returns `null` elsewhere and the UI shows `—`.
