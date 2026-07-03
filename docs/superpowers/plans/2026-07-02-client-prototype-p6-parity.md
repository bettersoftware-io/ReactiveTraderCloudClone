# Client-Prototype P6 — Parity Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every catalogued + freshly-audited visual/behavior gap between `@rtc/client-prototype` and the canonical HTML prototype, then run a final compliance sweep.

**Architecture:** Three change layers — (1) shared infrastructure (fonts, `useFlip` tuning, a `Panel` single-head-bar contract), (2) shell lifecycle (persistent `AppShell` with Boot/Lock overlays, boot wordmark/fade, `appReveal`), (3) per-screen behavior fixes (FX, Credit, Equities, Admin). Purely corrective; no new features.

**Tech Stack:** React 19 + Vite, CSS Modules, native WAAPI, Vitest + React Testing Library (jsdom). `#/` subpath imports.

**Spec:** `docs/superpowers/specs/2026-07-02-client-prototype-p6-parity.md`
**Canonical target:** `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html` + `support.js`

## Global Constraints

- **Self-contained package:** no `@rtc/domain`/`@rtc/shared`, no RxJS/machines, no ViewModel seam, no React Compiler. Full CSS Modules — zero inline `style={{}}` except the sanctioned named-const `--custom-property` escape hatch (`style={x as CSSProperties}` setting only `--foo` vars, with an `// eslint-disable-next-line no-restricted-syntax` comment).
- **Colour taxonomy:** static → class; semantic colour state → `data-*` (booleans as `String(bool)`), colour applied in CSS; runtime geometry → `--custom-property`. CSS `fill`/`stroke`/`color: none` FAILS stylelint `declaration-strict-value` → use `transparent`. `background: none` is allowed.
- **TS/lint (the real config, not disables):** named `XxxProps`/interfaces, NO inline object-literal param types; `arrow-body-style: always` (block + explicit return on EVERY arrow, including inline callbacks); module-level `function` declarations; explicit return types (`useExplicitType`); `useUniqueElementIds` (logical ids via a module const, never a literal). `rtc/component-newspaper` is NOT enforced on client-prototype.
- **Render purity (StrictMode):** RNG frozen in a ref; seed via render-body ref-lazy-init (never in a `useState`/`useMemo` initializer, both double-invoked); per-tick RNG inside a `setState` updater IS the house pattern; timers tracked in a ref and cleared on unmount.
- **Tests:** Vitest + RTL; use `fireEvent.*`; add explicit `cleanup()` in `afterEach`; `#/` imports; helpers/types/`vi.mock` go BELOW the `test()` calls (rtc/newspaper-order lints tests too). Components that call `usePreferences()` throw without a provider → wrap render in `<PreferencesProvider>`.
- **knip (CI-only, not in the per-task gate):** do NOT leave a type `export`ed if it is referenced only within its own module. A new export with no consumer yet is tolerable on intermediate commits (knip is green only at the final task) but must have a consumer by branch end.
- **Per-task gate (ALL green before commit):** `pnpm --filter @rtc/client-prototype typecheck` · `test` · `pnpm exec eslint packages/client-prototype` · `pnpm exec stylelint "packages/client-prototype/src/**/*.css"` · `pnpm exec biome ci packages/client-prototype`. Auto-fix format+lint: `pnpm exec biome check --write packages/client-prototype`.
- **Repo-wide CI-only gates (final task + pre-ship only):** `pnpm lint:dead` (knip) · `pnpm check:deps` · `pnpm check:versions` · `pnpm test:rules`.

## Accepted-as-is deviations (do NOT "fix" — reviewers must not flag)

Theme persistence (`ThemeProvider` `rt_skin`/`rt_mode` — kept as an improvement), fixed lock-screen `SESSION_ID` (test stability), Rajdhani as a mock preference-option label only (canonical never loads it), and the pre-existing P2–P5 deviations (FX stable vol / live-only PnL / JPY pip-block decimal; Equities stable vol + render-overlay last candle + 400ms flash ticker; Admin seeded-once latency jitter + synthetic `EVENT_POOL` + static service health; Credit self-contained duplicated formatters + outer-head region labels + no-maximize form).

## Task Map & Ordering

Dependencies: **Task 3 (Panel contract) must land before every head-collapse task** (FX-1, Credit pills, Equities panels). Within FX the `RateTile` edits are sequential (T7→T8→T9). Within Credit the `liveCount` format lands before the pill relocation. Within Equities `useRankGlide` lands before the Watchlist change, and each panel's `EquitiesScreen` wiring is co-located with its split (else typecheck breaks).

| # | Task | Layer |
|---|---|---|
| 1 | Load display fonts (Google Fonts `<link>`) | Shared |
| 2 | FLIP glide tuning — 440ms + 0.5px threshold | Shared |
| 3 | Panel head contract — single combined bar (headControls + pill + ⛶/⧉) | Shared |
| 4 | FX — collapse double head-bar (Live Rates / Blotter → headControls) | FX |
| 5 | FX — blotter `N trades` count label | FX |
| 6 | FX — down-move pip sign (`Math.abs`) | FX |
| 7 | FX — `bookPulse` glow on book | FX |
| 8 | FX — tile border strengthens during overlay | FX |
| 9 | FX — pip flash colored by tick direction | FX |
| 10 | FX — ActivityView collision-proof key | FX |
| 11 | Credit — `LIVE (n)` / `LIVE` count format | Credit |
| 12 | Credit — relocate RFQ filter pills to headControls | Credit |
| 13 | Credit — auto-exit fade for resolved live RFQ (`cardExitIds`) | Credit |
| 14 | Credit — tab-switch stagger cascade (`tabRecent`) | Credit |
| 15 | Credit — deterministic dealer-price jitter for seeded closed RFQs | Credit |
| 16 | Credit — drop dropdown open-state border | Credit |
| 17 | Equities — ChartPanel split + screen wire | Equities |
| 18 | Equities — EqBlotterPanel split + screen wire | Equities |
| 19 | Equities — `useRankGlide` hook | Equities |
| 20 | Equities — Watchlist split (rank-glide + `⊕` padding) + screen wire | Equities |
| 21 | Admin — service-health bar neon glow | Admin |
| 22 | Boot wordmark + subtitle | Shell |
| 23 | App overlay rework — persistent AppShell, Boot/Lock overlays | Shell |
| 24 | Boot fade-out (`bootFading`) + `appReveal` entrance | Shell |
| 25 | Final compliance sweep + live browser side-by-side | Verify |

The full task bodies for the shared/shell tasks (1, 2, 3, 22, 23, 24) and the per-screen tasks (4–21) and the final verification task (25) follow. Every task ends with the per-task gate green + a commit.

---

### Task 1: Load display fonts (Google Fonts <link>)

**Files:**
- Modify: `packages/client-prototype/index.html:2-7` (`<head>`)
- Test: `packages/client-prototype/tests/fonts.test.ts` (Create)

**Interfaces:** Produces nothing consumed by later tasks (global asset load).

- [ ] **Step 1: Write the failing test**
```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("index.html preconnects to Google Fonts and loads the five display families", () => {
  expect(HTML).toContain('rel="preconnect" href="https://fonts.googleapis.com"');
  expect(HTML).toContain('href="https://fonts.gstatic.com" crossorigin');
  for (const family of [
    "Chakra+Petch",
    "JetBrains+Mono",
    "IBM+Plex+Sans",
    "IBM+Plex+Mono",
    "Orbitron",
  ]) {
    expect(HTML).toContain(family);
  }
  expect(HTML).toContain("display=swap");
});
```

- [ ] **Step 2: Run — expect FAIL** (`vitest run tests/fonts.test.ts`) — no font link yet.

- [ ] **Step 3: Add the canonical `<helmet>` links to `index.html` `<head>`** (verbatim from `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html:21-23`):
```html
    <title>Reactive Trader — Prototype</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=Orbitron:wght@500;700;900&display=swap"
      rel="stylesheet"
    />
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(client-prototype): P6 — load display fonts via Google Fonts link`

---

### Task 2: FLIP glide tuning — 440ms + 0.5px suppression threshold

**Files:**
- Modify: `packages/client-prototype/src/motion/useFlip.ts:20,55-57`
- Test: `packages/client-prototype/tests/fx-flip.test.ts` (add a case)

**Interfaces:** Produces `useFlip` (unchanged signature); `DEFAULT_DUR_MS` now 440.

- [ ] **Step 1: Add the failing test case** to the existing `describe("useFlip")` block:
```ts
  test("suppresses a glide when a node moved less than 0.5px, plays it above the threshold", () => {
    const container = document.createElement("div");
    const node = document.createElement("div");
    node.setAttribute("data-flip-key", "a");
    container.append(node);
    document.body.append(container);
    if (typeof Element.prototype.animate !== "function") {
      Element.prototype.animate = stubAnimate;
    }
    const animateSpy = vi.spyOn(Element.prototype, "animate");

    // First measurement at left:0. Then move sub-threshold (0.3px) — no glide.
    let left = 0;
    node.getBoundingClientRect = () => {
      return { left, top: 0 } as DOMRect;
    };
    const rootRef = { current: container };
    const { rerender } = renderHook(
      (props: HarnessProps) => {
        useFlip(rootRef, props.filterKey, {});
      },
      { initialProps: { filterKey: "All" } },
    );
    left = 0.3;
    act(() => {
      rerender({ filterKey: "EUR" });
    });
    expect(animateSpy).not.toHaveBeenCalled();

    // Now move above threshold (2px) — glide plays.
    left = 2.3;
    act(() => {
      rerender({ filterKey: "GBP" });
    });
    expect(animateSpy).toHaveBeenCalled();
    container.remove();
  });
```

- [ ] **Step 2: Run — expect FAIL** (0.3px currently triggers a glide, since the guard is only `dx===0 && dy===0`).

- [ ] **Step 3: Edit `useFlip.ts`.** Change `const DEFAULT_DUR_MS = 480;` → `const DEFAULT_DUR_MS = 440;`. Replace the zero-guard in `playGlide`:
```ts
    const rect = node.getBoundingClientRect();
    const dx = prev.left - rect.left;
    const dy = prev.top - rect.top;

    // PROTO suppresses sub-pixel glides so a re-render that barely nudges a
    // node doesn't flicker; only move it if it travelled at least ~0.5px.
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      continue;
    }
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(client-prototype): P6 — FLIP 440ms + 0.5px suppression threshold`

---

### Task 3: Panel head contract — single combined bar (glyph + headControls + pill label)

**Files:**
- Modify: `packages/client-prototype/src/layout/Panel.tsx`
- Modify: `packages/client-prototype/src/layout/Panel.module.css`
- Test: `packages/client-prototype/tests/fx-panel.test.tsx` (add cases)

**Interfaces:**
- Produces: `PanelProps` gains `headControls?: ReactNode`. Panel wraps `head` in
  `<span class={styles.label}>` and renders, in one `.head` bar:
  label · `headControls` (in `.controls`, right-aligned) · `headAccessory` · maximize
  button (glyph `⛶` expand / `⧉` restore). Consumed by FX / Credit / Equities head-collapse tasks.

- [ ] **Step 1: Add failing tests** to `describe("Panel")`:
```tsx
  test("renders headControls inside the single head bar and uses the canonical maximize glyph", () => {
    const { container, getByText, getByRole } = render(
      <Panel
        id={TILES_ID}
        head={<span>TILES</span>}
        headControls={<button type="button">RATES</button>}
        maxPanel={null}
        onToggleMax={vi.fn()}
      >
        <div>body</div>
      </Panel>,
    );
    const head = container.querySelector('[class*="head"]');
    // both the label and the controls live in the ONE head bar
    expect(head?.textContent).toContain("TILES");
    expect(getByText("RATES")).toBeTruthy();
    expect(getByRole("button", { name: /maximize/i }).textContent).toBe("⛶");
  });

  test("maximize glyph flips to restore when this panel is maximized", () => {
    const { getByRole } = render(
      <Panel id={TILES_ID} head={<span>T</span>} maxPanel={TILES_ID} onToggleMax={vi.fn()}>
        <div>b</div>
      </Panel>,
    );
    expect(getByRole("button", { name: /maximize/i }).textContent).toBe("⧉");
  });
```

- [ ] **Step 2: Run — expect FAIL** (no `headControls` prop; glyph is `⤢`/`⤡`).

- [ ] **Step 3: Rewrite `Panel.tsx`:**
```tsx
import type { ReactElement, ReactNode } from "react";

import styles from "#/layout/Panel.module.css";

export interface PanelProps {
  id: string;
  head: ReactElement;
  children: ReactNode;
  maxPanel: string | null;
  onToggleMax(id: string): void;
  headControls?: ReactNode;
  headAccessory?: ReactNode;
  maximizable?: boolean;
}

export function Panel(props: PanelProps): ReactElement {
  const {
    id,
    head,
    children,
    maxPanel,
    onToggleMax,
    headControls,
    headAccessory,
    maximizable = true,
  } = props;
  const isMax = maxPanel === id;

  function handleMaxClick(): void {
    onToggleMax(id);
  }

  return (
    <div className={styles.panel} data-max={String(isMax)}>
      <div className={styles.head}>
        <span className={styles.label}>{head}</span>
        {headControls != null ? (
          <div className={styles.controls}>{headControls}</div>
        ) : null}
        {headAccessory != null ? (
          <span className={styles.accessory} aria-hidden="true">
            {headAccessory}
          </span>
        ) : null}
        {maximizable ? (
          <button
            type="button"
            className={styles.maxBtn}
            aria-label="Maximize"
            title="Maximize"
            onClick={handleMaxClick}
          >
            {isMax ? "⧉" : "⛶"}
          </button>
        ) : null}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Edit `Panel.module.css`** — add `.label` (pill) and `.controls`, keep the rest:
```css
.label {
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding: 0 14px;
  background: var(--panel);
  border-bottom: 2px solid var(--accent);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--text);
}

.controls {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
```
(The pill uses `height:100%; padding:0 14px` rather than canonical's `padding:9px 14px` so it fills the fixed 38px bar without overflowing; visually equivalent.)

- [ ] **Step 5: Run — expect PASS** (and the two pre-existing Panel tests still pass: `head={<span>TILES</span>}` still yields "TILES" text; the maximize `aria-label` is unchanged).
- [ ] **Step 6: Commit** `feat(client-prototype): P6 — Panel single head bar (headControls + pill label + ⛶/⧉ glyph)`

---

### Task 4 (FX-1): Collapse the double head-bar — move Live Rates/FX Blotter tab rows into `Panel.headControls`

**Precondition:** depends on the Panel P6 contract task (`PanelProps.headControls?: ReactNode`, rendered as a right-aligned `.controls` row between `head` and `headAccessory`/maximize) landing first. Written against that contract.

**Files:**
- Modify `packages/client-prototype/src/fx/LiveRates/LiveRatesPanel.tsx` (whole file: imports through the `LiveRatesPanel` function, lines 1-113; `TileCell`/`useNowTick`/`priceUnit`/`Move`/`computeMove`/`buildWatchRow`/`buildTileVm` at lines 115-277 are untouched)
- Modify `packages/client-prototype/src/fx/LiveRates/LiveRatesPanel.module.css` (remove `.panel`, `.head`; keep `.tab`, `.spacer`, `.chartsBtn`, `.body`, `.grid`, `.cell`, `.overlayHost`)
- Modify `packages/client-prototype/src/fx/Blotter/FxBlotterPanel.tsx` (whole file, lines 1-86)
- Modify `packages/client-prototype/src/fx/Blotter/FxBlotterPanel.module.css` (remove `.panel`, `.head`; keep `.tab`, `.spacer`, `.tools`, `.count`, `.filter`, `.csvBtn`, `.body`)
- Modify `packages/client-prototype/src/fx/FxScreen.tsx` (imports lines 1-16; the two `Panel` blocks lines 93-133)
- Modify `packages/client-prototype/tests/fx-activity.test.tsx` (drop the now-removed `onView` prop + unused `vi` import)
- Create `packages/client-prototype/tests/fx-liverates-head.test.tsx`
- Create `packages/client-prototype/tests/fx-blotter-head.test.tsx`

**Before** (`LiveRatesPanel.tsx`, lines 1-113):
```tsx
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { META, ORDER, parseNotional, RFQ_THRESHOLD } from "#/fx/fxData";
import type { Filter } from "#/fx/LiveRates/FilterChips";
import { FilterChips } from "#/fx/LiveRates/FilterChips";
import styles from "#/fx/LiveRates/LiveRatesPanel.module.css";
import type { TileVm } from "#/fx/LiveRates/RateTile";
import { RateTile } from "#/fx/LiveRates/RateTile";
import { TileExecOverlay } from "#/fx/LiveRates/TileExecOverlay";
import type { WatchRow } from "#/fx/LiveRates/WatchlistView";
import { WatchlistView } from "#/fx/LiveRates/WatchlistView";
import type { PairMeta, Sym, TileState } from "#/fx/types";
import type { RatesApi } from "#/fx/useFxRates";
import { useFlip } from "#/motion/useFlip";
import { usePreferences } from "#/shell/Preferences/usePreferences";

export interface LiveRatesPanelProps {
  rates: RatesApi;
  filter: Filter;
  onFilter(f: Filter): void;
  view: "rates" | "watch";
  onView(v: "rates" | "watch"): void;
  showCharts: boolean;
  onToggleCharts(): void;
}

const NOW_TICK_MS = 250;
// Mirrors useFxRates' internal MAX_NOTIONAL (not exported) — a tile's
// notional is invalid past this cap regardless of what the rates api ends up
// doing with it (PROTO 1266: `invalid=Number.isNaN(n)||n>1e9`).
const MAX_NOTIONAL_CAP = 1e9;
// PROTO 1256: `fl&&(S.now-fl.ts<650)` — a rate flash stays "on" for 650ms.
const FLASH_WINDOW_MS = 650;

export function LiveRatesPanel(props: LiveRatesPanelProps): ReactElement {
  const { rates, filter, onFilter, view, onView, showCharts, onToggleCharts } =
    props;
  const { prefs } = usePreferences();
  const now = useNowTick();
  const gridRef = useRef<HTMLDivElement | null>(null);
  useFlip(gridRef, filter, { reduce: prefs.reduceMotion });

  const syms = ORDER.filter((sym) => {
    return filter === "All" || sym.includes(filter);
  });

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.tab}
          data-active={String(view === "rates")}
          onClick={() => {
            onView("rates");
          }}
        >
          ◧ Live Rates
        </button>
        <button
          type="button"
          className={styles.tab}
          data-active={String(view === "watch")}
          onClick={() => {
            onView("watch");
          }}
        >
          ☰ Watchlist
        </button>
        <div className={styles.spacer} />
        <button
          type="button"
          className={styles.chartsBtn}
          data-active={String(showCharts)}
          onClick={onToggleCharts}
        >
          CHARTS
        </button>
      </div>

      <div className={styles.body}>
        <FilterChips value={filter} onChange={onFilter} />

        {view === "rates" ? (
          <div className={styles.grid} ref={gridRef}>
            {syms.map((sym) => {
              return (
                <TileCell
                  key={sym}
                  sym={sym}
                  vm={buildTileVm(sym, rates, showCharts, now)}
                  tile={rates.tiles[sym]}
                  meta={META[sym]}
                  now={now}
                  onDismiss={() => {
                    rates.onDismiss(sym);
                  }}
                />
              );
            })}
          </div>
        ) : (
          <WatchlistView
            rows={syms.map((sym) => {
              return buildWatchRow(sym, rates);
            })}
          />
        )}
      </div>
    </div>
  );
}
```

**After** (`LiveRatesPanel.tsx`, lines 1-113 — `TileCell` onward at line 115 is unchanged, see FX-4):
```tsx
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { META, ORDER, parseNotional, RFQ_THRESHOLD } from "#/fx/fxData";
import type { Filter } from "#/fx/LiveRates/FilterChips";
import { FilterChips } from "#/fx/LiveRates/FilterChips";
import styles from "#/fx/LiveRates/LiveRatesPanel.module.css";
import type { TileVm } from "#/fx/LiveRates/RateTile";
import { RateTile } from "#/fx/LiveRates/RateTile";
import { TileExecOverlay } from "#/fx/LiveRates/TileExecOverlay";
import type { WatchRow } from "#/fx/LiveRates/WatchlistView";
import { WatchlistView } from "#/fx/LiveRates/WatchlistView";
import type { PairMeta, Sym, TileState } from "#/fx/types";
import type { RatesApi } from "#/fx/useFxRates";
import { useFlip } from "#/motion/useFlip";
import { usePreferences } from "#/shell/Preferences/usePreferences";

export interface LiveRatesPanelProps {
  rates: RatesApi;
  filter: Filter;
  onFilter(f: Filter): void;
  view: "rates" | "watch";
  showCharts: boolean;
}

export interface LiveRatesHeadControlsProps {
  view: "rates" | "watch";
  onView(v: "rates" | "watch"): void;
  showCharts: boolean;
  onToggleCharts(): void;
}

const NOW_TICK_MS = 250;
// Mirrors useFxRates' internal MAX_NOTIONAL (not exported) — a tile's
// notional is invalid past this cap regardless of what the rates api ends up
// doing with it (PROTO 1266: `invalid=Number.isNaN(n)||n>1e9`).
const MAX_NOTIONAL_CAP = 1e9;
// PROTO 1256: `fl&&(S.now-fl.ts<650)` — a rate flash stays "on" for 650ms.
const FLASH_WINDOW_MS = 650;

// PROTO 349-356 (panTiles head): the Live Rates/Watchlist view toggle and the
// CHARTS switch. Rendered as Panel's `headControls` (one 38px bar shared
// with the region label and maximize button) instead of a second head bar
// inside this panel's own body.
export function LiveRatesHeadControls(
  props: LiveRatesHeadControlsProps,
): ReactElement {
  const { view, onView, showCharts, onToggleCharts } = props;

  return (
    <>
      <button
        type="button"
        className={styles.tab}
        data-active={String(view === "rates")}
        onClick={() => {
          onView("rates");
        }}
      >
        ◧ Live Rates
      </button>
      <button
        type="button"
        className={styles.tab}
        data-active={String(view === "watch")}
        onClick={() => {
          onView("watch");
        }}
      >
        ☰ Watchlist
      </button>
      <div className={styles.spacer} />
      <button
        type="button"
        className={styles.chartsBtn}
        data-active={String(showCharts)}
        onClick={onToggleCharts}
      >
        CHARTS
      </button>
    </>
  );
}

export function LiveRatesPanel(props: LiveRatesPanelProps): ReactElement {
  const { rates, filter, onFilter, view, showCharts } = props;
  const { prefs } = usePreferences();
  const now = useNowTick();
  const gridRef = useRef<HTMLDivElement | null>(null);
  useFlip(gridRef, filter, { reduce: prefs.reduceMotion });

  const syms = ORDER.filter((sym) => {
    return filter === "All" || sym.includes(filter);
  });

  return (
    <div className={styles.body}>
      <FilterChips value={filter} onChange={onFilter} />

      {view === "rates" ? (
        <div className={styles.grid} ref={gridRef}>
          {syms.map((sym) => {
            return (
              <TileCell
                key={sym}
                sym={sym}
                vm={buildTileVm(sym, rates, showCharts, now)}
                tile={rates.tiles[sym]}
                meta={META[sym]}
                now={now}
                onDismiss={() => {
                  rates.onDismiss(sym);
                }}
              />
            );
          })}
        </div>
      ) : (
        <WatchlistView
          rows={syms.map((sym) => {
            return buildWatchRow(sym, rates);
          })}
        />
      )}
    </div>
  );
}
```

**Before** (`LiveRatesPanel.module.css`, lines 1-24):
```css
.panel {
  position: relative;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: var(--panel-shadow, none);
}

.head {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  min-height: 38px;
  flex-shrink: 0;
  background: var(--panel-head);
  border-bottom: 1px solid var(--border);
}

.tab {
```

**After** (`LiveRatesPanel.module.css`, lines 1-24 removed — file now starts at `.tab`):
```css
.tab {
```

**Before** (`FxBlotterPanel.tsx`, whole file):
```tsx
import type { ChangeEvent, ReactElement } from "react";

import { ActivityView } from "#/fx/Blotter/ActivityView";
import styles from "#/fx/Blotter/FxBlotterPanel.module.css";
import { TradesBlotter } from "#/fx/Blotter/TradesBlotter";
import type { ActivityEvent } from "#/fx/types";
import type { BlotterApi } from "#/fx/useFxBlotter";

export interface FxBlotterPanelProps {
  api: BlotterApi;
  activity: ActivityEvent[];
  view: "blotter" | "activity";
  onView(v: "blotter" | "activity"): void;
  newRowId?: number | null;
}

// PROTO 469-497 (panBlot): the FX Blotter/Activity panel — Blotter/Activity
// tabs, and (PROTO 474-479, blotter view only) the row count, a filter
// input, and a CSV export button — over a body that swaps between the
// sortable trades table and the activity feed.
export function FxBlotterPanel(props: FxBlotterPanelProps): ReactElement {
  const { api, activity, view, onView, newRowId } = props;

  function handleQuery(e: ChangeEvent<HTMLInputElement>): void {
    api.onQuery(e.target.value);
  }

  function showBlotter(): void {
    onView("blotter");
  }

  function showActivity(): void {
    onView("activity");
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.tab}
          data-active={String(view === "blotter")}
          onClick={showBlotter}
        >
          ▤ FX Blotter
        </button>
        <button
          type="button"
          className={styles.tab}
          data-active={String(view === "activity")}
          onClick={showActivity}
        >
          ⚡ Activity
        </button>
        <div className={styles.spacer} />
        {view === "blotter" ? (
          <div className={styles.tools}>
            <span className={styles.count}>{api.count}</span>
            <input
              className={styles.filter}
              value={api.query}
              onChange={handleQuery}
              placeholder="Filter…"
            />
            <button
              type="button"
              className={styles.csvBtn}
              onClick={api.onExport}
            >
              ⤓ CSV
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.body}>
        {view === "blotter" ? (
          <TradesBlotter api={api} newRowId={newRowId} />
        ) : (
          <ActivityView events={activity} />
        )}
      </div>
    </div>
  );
}
```

**After** (`FxBlotterPanel.tsx`, whole file):
```tsx
import type { ChangeEvent, ReactElement } from "react";

import { ActivityView } from "#/fx/Blotter/ActivityView";
import styles from "#/fx/Blotter/FxBlotterPanel.module.css";
import { TradesBlotter } from "#/fx/Blotter/TradesBlotter";
import type { ActivityEvent } from "#/fx/types";
import type { BlotterApi } from "#/fx/useFxBlotter";

export interface FxBlotterPanelProps {
  api: BlotterApi;
  activity: ActivityEvent[];
  view: "blotter" | "activity";
  newRowId?: number | null;
}

export interface FxBlotterHeadControlsProps {
  api: BlotterApi;
  view: "blotter" | "activity";
  onView(v: "blotter" | "activity"): void;
}

// PROTO 469-479 (panBlot head): the Blotter/Activity tabs, plus (blotter
// view only) the row count, a filter input, and a CSV export button.
// Rendered as Panel's `headControls` instead of a second head bar.
export function FxBlotterHeadControls(
  props: FxBlotterHeadControlsProps,
): ReactElement {
  const { api, view, onView } = props;

  function handleQuery(e: ChangeEvent<HTMLInputElement>): void {
    api.onQuery(e.target.value);
  }

  function showBlotter(): void {
    onView("blotter");
  }

  function showActivity(): void {
    onView("activity");
  }

  return (
    <>
      <button
        type="button"
        className={styles.tab}
        data-active={String(view === "blotter")}
        onClick={showBlotter}
      >
        ▤ FX Blotter
      </button>
      <button
        type="button"
        className={styles.tab}
        data-active={String(view === "activity")}
        onClick={showActivity}
      >
        ⚡ Activity
      </button>
      <div className={styles.spacer} />
      {view === "blotter" ? (
        <div className={styles.tools}>
          <span className={styles.count}>{api.count}</span>
          <input
            className={styles.filter}
            value={api.query}
            onChange={handleQuery}
            placeholder="Filter…"
          />
          <button
            type="button"
            className={styles.csvBtn}
            onClick={api.onExport}
          >
            ⤓ CSV
          </button>
        </div>
      ) : null}
    </>
  );
}

// PROTO 469-497 (panBlot body): swaps between the sortable trades table and
// the activity feed.
export function FxBlotterPanel(props: FxBlotterPanelProps): ReactElement {
  const { api, activity, view, newRowId } = props;

  return (
    <div className={styles.body}>
      {view === "blotter" ? (
        <TradesBlotter api={api} newRowId={newRowId} />
      ) : (
        <ActivityView events={activity} />
      )}
    </div>
  );
}
```

**Before** (`FxBlotterPanel.module.css`, lines 1-24 — same shape as LiveRatesPanel's):
```css
.panel {
  position: relative;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: var(--panel-shadow, none);
}

.head {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  min-height: 38px;
  flex-shrink: 0;
  background: var(--panel-head);
  border-bottom: 1px solid var(--border);
}

.tab {
```

**After:** identical removal — file now starts at `.tab {`.

**Before** (`FxScreen.tsx`, lines 1-16):
```tsx
import type { CSSProperties, ReactElement } from "react";
import { useRef, useState } from "react";

import { AnalyticsView } from "#/fx/Analytics/AnalyticsView";
import { FxBlotterPanel } from "#/fx/Blotter/FxBlotterPanel";
import styles from "#/fx/FxScreen.module.css";
import type { Filter } from "#/fx/LiveRates/FilterChips";
import { LiveRatesPanel } from "#/fx/LiveRates/LiveRatesPanel";
import type { PanelId } from "#/fx/layout/useDockState";
import { useDockState } from "#/fx/layout/useDockState";
import { PositionsView } from "#/fx/Positions/PositionsView";
import { useFxBlotter } from "#/fx/useFxBlotter";
import { useFxRates } from "#/fx/useFxRates";
import { Panel } from "#/layout/Panel";
import { SplitHandle } from "#/layout/SplitHandle";
import { useSplit } from "#/layout/useSplit";
```

**After** (`FxScreen.tsx`, lines 1-17):
```tsx
import type { CSSProperties, ReactElement } from "react";
import { useRef, useState } from "react";

import { AnalyticsView } from "#/fx/Analytics/AnalyticsView";
import {
  FxBlotterHeadControls,
  FxBlotterPanel,
} from "#/fx/Blotter/FxBlotterPanel";
import styles from "#/fx/FxScreen.module.css";
import type { Filter } from "#/fx/LiveRates/FilterChips";
import {
  LiveRatesHeadControls,
  LiveRatesPanel,
} from "#/fx/LiveRates/LiveRatesPanel";
import type { PanelId } from "#/fx/layout/useDockState";
import { useDockState } from "#/fx/layout/useDockState";
import { PositionsView } from "#/fx/Positions/PositionsView";
import { useFxBlotter } from "#/fx/useFxBlotter";
import { useFxRates } from "#/fx/useFxRates";
import { Panel } from "#/layout/Panel";
import { SplitHandle } from "#/layout/SplitHandle";
import { useSplit } from "#/layout/useSplit";
```

**Before** (`FxScreen.tsx`, lines 93-133):
```tsx
      <div className={styles.leftCol} ref={leftColRef}>
        <div className={styles.tilesRegion}>
          <Panel
            id={TILES_PANEL}
            head={<span className={styles.regionLabel}>Live Rates</span>}
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <LiveRatesPanel
              rates={rates}
              filter={filter}
              onFilter={setFilter}
              view={view}
              onView={setView}
              showCharts={showCharts}
              onToggleCharts={toggleCharts}
            />
          </Panel>
        </div>

        <div className={styles.leftHandle}>
          <SplitHandle api={leftSplit} />
        </div>

        <div className={styles.blotterRegion}>
          <Panel
            id={FXBLOT_PANEL}
            head={<span className={styles.regionLabel}>FX Blotter</span>}
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <FxBlotterPanel
              api={blotter}
              activity={rates.activity}
              view={blotView}
              onView={setBlotView}
              newRowId={rates.newRowId}
            />
          </Panel>
        </div>
      </div>
```

**After** (`FxScreen.tsx`, lines 93-135):
```tsx
      <div className={styles.leftCol} ref={leftColRef}>
        <div className={styles.tilesRegion}>
          <Panel
            id={TILES_PANEL}
            head={<span className={styles.regionLabel}>Live Rates</span>}
            headControls={
              <LiveRatesHeadControls
                view={view}
                onView={setView}
                showCharts={showCharts}
                onToggleCharts={toggleCharts}
              />
            }
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <LiveRatesPanel
              rates={rates}
              filter={filter}
              onFilter={setFilter}
              view={view}
              showCharts={showCharts}
            />
          </Panel>
        </div>

        <div className={styles.leftHandle}>
          <SplitHandle api={leftSplit} />
        </div>

        <div className={styles.blotterRegion}>
          <Panel
            id={FXBLOT_PANEL}
            head={<span className={styles.regionLabel}>FX Blotter</span>}
            headControls={
              <FxBlotterHeadControls
                api={blotter}
                view={blotView}
                onView={setBlotView}
              />
            }
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <FxBlotterPanel
              api={blotter}
              activity={rates.activity}
              view={blotView}
              newRowId={rates.newRowId}
            />
          </Panel>
        </div>
      </div>
```

**Before** (`tests/fx-activity.test.tsx`, lines 1-2 and 34-41):
```tsx
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
```
```tsx
    const { getByText, queryAllByText } = render(
      <FxBlotterPanel
        api={result.current}
        activity={[makeEvent({})]}
        view="activity"
        onView={vi.fn()}
      />,
    );
```

**After:**
```tsx
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
```
```tsx
    const { getByText, queryAllByText } = render(
      <FxBlotterPanel
        api={result.current}
        activity={[makeEvent({})]}
        view="activity"
      />,
    );
```

**Test** (`packages/client-prototype/tests/fx-liverates-head.test.tsx`, new):
```tsx
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  LiveRatesHeadControls,
  LiveRatesPanel,
} from "#/fx/LiveRates/LiveRatesPanel";
import { useFxRates } from "#/fx/useFxRates";

afterEach(cleanup);

describe("LiveRatesHeadControls", () => {
  test("renders the view tabs and CHARTS switch, and reports clicks", () => {
    const onView = vi.fn();
    const onToggleCharts = vi.fn();
    const { getByText } = render(
      <LiveRatesHeadControls
        view="rates"
        onView={onView}
        showCharts={false}
        onToggleCharts={onToggleCharts}
      />,
    );

    getByText("☰ Watchlist").click();
    expect(onView).toHaveBeenCalledWith("watch");

    getByText("CHARTS").click();
    expect(onToggleCharts).toHaveBeenCalled();
  });
});

describe("LiveRatesPanel", () => {
  test("no longer renders its own view tabs — that's Panel's headControls now", () => {
    const { result } = renderHook(() => {
      return useFxRates();
    });
    const { queryByText } = render(
      <LiveRatesPanel
        rates={result.current}
        filter="All"
        onFilter={vi.fn()}
        view="rates"
        showCharts={false}
      />,
    );

    expect(queryByText("◧ Live Rates")).toBeNull();
    expect(queryByText("☰ Watchlist")).toBeNull();
    expect(queryByText("CHARTS")).toBeNull();
  });
});
```

**Test** (`packages/client-prototype/tests/fx-blotter-head.test.tsx`, new):
```tsx
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  FxBlotterHeadControls,
  FxBlotterPanel,
} from "#/fx/Blotter/FxBlotterPanel";
import { SEED_TRADES } from "#/fx/fxData";
import { useFxBlotter } from "#/fx/useFxBlotter";

afterEach(cleanup);

describe("FxBlotterHeadControls", () => {
  test("renders the view tabs and, in blotter view, the filter/CSV tools", () => {
    const { result } = renderHook(() => {
      return useFxBlotter(SEED_TRADES);
    });
    const onView = vi.fn();
    const { getByText, getByPlaceholderText } = render(
      <FxBlotterHeadControls
        api={result.current}
        view="blotter"
        onView={onView}
      />,
    );

    expect(getByPlaceholderText("Filter…")).toBeTruthy();
    expect(getByText("⤓ CSV")).toBeTruthy();

    getByText("⚡ Activity").click();
    expect(onView).toHaveBeenCalledWith("activity");
  });

  test("hides the blotter-only tools in activity view", () => {
    const { result } = renderHook(() => {
      return useFxBlotter(SEED_TRADES);
    });
    const { queryByPlaceholderText } = render(
      <FxBlotterHeadControls
        api={result.current}
        view="activity"
        onView={vi.fn()}
      />,
    );

    expect(queryByPlaceholderText("Filter…")).toBeNull();
  });
});

describe("FxBlotterPanel", () => {
  test("no longer renders its own tabs — that's Panel's headControls now", () => {
    const { result } = renderHook(() => {
      return useFxBlotter(SEED_TRADES);
    });
    const { queryByText } = render(
      <FxBlotterPanel
        api={result.current}
        activity={[]}
        view="blotter"
        newRowId={null}
      />,
    );

    expect(queryByText("▤ FX Blotter")).toBeNull();
    expect(queryByText("⚡ Activity")).toBeNull();
  });
});
```

Run:
```
pnpm --filter @rtc/client-prototype exec vitest run tests/fx-liverates-head.test.tsx tests/fx-blotter-head.test.tsx tests/fx-activity.test.tsx tests/fx-screen.test.tsx
```
Expected: FAIL before the fix (`queryByText("◧ Live Rates")` etc. are non-null since the old panels still render their own tabs; `FxBlotterPanel` called without `onView` also fails to typecheck against the old required prop). PASS after.

---

### Task 5 (FX-2): Blotter count label — render `"N trades"`, matching canonical `fxCount`

Depends on Task FX-1 (edits the `FxBlotterHeadControls` component it introduces).

**Files:**
- Modify `packages/client-prototype/src/fx/Blotter/FxBlotterPanel.tsx` (the `count` span inside `FxBlotterHeadControls`)
- Test: append to `packages/client-prototype/tests/fx-blotter-head.test.tsx`

**Before:**
```tsx
        <div className={styles.tools}>
          <span className={styles.count}>{api.count}</span>
```

**After:**
```tsx
        <div className={styles.tools}>
          <span className={styles.count}>{api.count} trades</span>
```

**Test** (append inside `describe("FxBlotterHeadControls", ...)` in `fx-blotter-head.test.tsx`):
```tsx
  test("labels the trade count as 'N trades', matching canonical fxCount", () => {
    const { result } = renderHook(() => {
      return useFxBlotter(SEED_TRADES);
    });
    const { getByText } = render(
      <FxBlotterHeadControls
        api={result.current}
        view="blotter"
        onView={vi.fn()}
      />,
    );

    expect(getByText(`${SEED_TRADES.length} trades`)).toBeTruthy();
  });
```

Run:
```
pnpm --filter @rtc/client-prototype exec vitest run tests/fx-blotter-head.test.tsx
```
Expected: FAIL before the fix (`getByText("10 trades")` finds nothing — only the bare `"10"` renders). PASS after.

---

### Task 6 (FX-3): Down-move pip sign — always show the absolute pip count

**Files:**
- Modify `packages/client-prototype/src/fx/LiveRates/RateTile.tsx` (lines 56-61)
- Modify `packages/client-prototype/src/fx/LiveRates/WatchlistView.tsx` (lines 53-61)
- Test: append to `packages/client-prototype/tests/fx-tile.test.tsx` and `packages/client-prototype/tests/fx-watchlist.test.tsx`

**Before** (`RateTile.tsx`, lines 56-61):
```tsx
      <div className={styles.header}>
        <span className={styles.pair}>{vm.meta.pair}</span>
        <span className={styles.move} style={moveColor}>
          {vm.moveUp ? "▲" : "▼"} {vm.movePips} pip
        </span>
      </div>
```

**After:**
```tsx
      <div className={styles.header}>
        <span className={styles.pair}>{vm.meta.pair}</span>
        <span className={styles.move} style={moveColor}>
          {vm.moveUp ? "▲" : "▼"} {Math.abs(vm.movePips)} pip
        </span>
      </div>
```

**Before** (`WatchlistView.tsx`, lines 53-61):
```tsx
  return (
    <div data-tile-sym={row.sym} className={styles.row}>
      <span className={styles.pair}>{row.sym}</span>
      <span className={styles.mid} style={moveColor}>
        {row.mid}
      </span>
      <span className={styles.move} style={moveColor}>
        {row.moveUp ? "▲" : "▼"} {row.movePips}
      </span>
```

**After:**
```tsx
  return (
    <div data-tile-sym={row.sym} className={styles.row}>
      <span className={styles.pair}>{row.sym}</span>
      <span className={styles.mid} style={moveColor}>
        {row.mid}
      </span>
      <span className={styles.move} style={moveColor}>
        {row.moveUp ? "▲" : "▼"} {Math.abs(row.movePips)}
      </span>
```

**Test** (append inside `describe("RateTile", ...)` in `fx-tile.test.tsx`):
```tsx
  test("shows the absolute pip count even on a down move", () => {
    const { getByText } = render(
      <RateTile vm={makeVm({ movePips: -7, moveUp: false })} overlay={null} />,
    );
    expect(getByText("▼ 7 pip")).toBeTruthy();
  });
```

**Test** (append inside `describe("WatchlistView", ...)` in `fx-watchlist.test.tsx`):
```tsx
  test("shows the absolute pip count even on a down move", () => {
    const { getByText } = render(
      <WatchlistView rows={[makeRow({ movePips: -7, moveUp: false })]} />,
    );
    expect(getByText("▼ 7")).toBeTruthy();
  });
```

Run:
```
pnpm --filter @rtc/client-prototype exec vitest run tests/fx-tile.test.tsx tests/fx-watchlist.test.tsx
```
Expected: FAIL before the fix (`getByText("▼ 7 pip")`/`getByText("▼ 7")` find nothing — the DOM shows `"▼ -7 pip"`/`"▼ -7"`). PASS after.

---

### Task 7 (FX-4): `bookPulse` glow on the tile when a trade books

Note: `@keyframes bookPulse` already exists, unused, in `packages/client-prototype/src/styles/global.css:153` — no new keyframes needed, just reference it.

**Files:**
- Modify `packages/client-prototype/src/fx/LiveRates/RateTile.tsx` (props/imports lines 1-14, 32-35, and the `tile` div at line 54-55)
- Modify `packages/client-prototype/src/fx/LiveRates/LiveRatesPanel.tsx` (the `<RateTile>` call inside `TileCell`, line ~172-179)
- Modify `packages/client-prototype/src/fx/LiveRates/RateTile.module.css` (append after `.tile`)
- Test: modify + append in `packages/client-prototype/tests/fx-tile.test.tsx`

**Before** (`RateTile.tsx`, lines 1-14):
```tsx
import type {
  ChangeEvent,
  CSSProperties,
  FocusEvent,
  ReactElement,
} from "react";

import { fmtShort } from "#/fx/fxData";
import styles from "#/fx/LiveRates/RateTile.module.css";
import { Sparkline } from "#/fx/LiveRates/Sparkline";
import { TilePrice } from "#/fx/LiveRates/TilePrice";
import type { PairMeta, Sym } from "#/fx/types";
```

**After:**
```tsx
import type {
  ChangeEvent,
  CSSProperties,
  FocusEvent,
  ReactElement,
} from "react";

import { fmtShort } from "#/fx/fxData";
import styles from "#/fx/LiveRates/RateTile.module.css";
import { Sparkline } from "#/fx/LiveRates/Sparkline";
import { TilePrice } from "#/fx/LiveRates/TilePrice";
import type { PairMeta, Sym, TileState } from "#/fx/types";
```

**Before** (`RateTile.tsx`, lines 32-55):
```tsx
export interface RateTileProps {
  vm: TileVm;
  overlay?: ReactElement | null;
}

const SPOT_OFFSET_DAYS = 2;

export function RateTile(props: RateTileProps): ReactElement {
  const { vm, overlay } = props;

  function handleNotionalChange(e: ChangeEvent<HTMLInputElement>): void {
    vm.onNotional(e.target.value);
  }

  function handleNotionalFocus(e: FocusEvent<HTMLInputElement>): void {
    e.target.select();
  }

  const moveColor = {
    "--move-color": vm.moveUp ? "var(--buy)" : "var(--sell)",
  } as CSSProperties;

  return (
    <div className={styles.tile} data-tile-sym={vm.sym}>
```

**After:**
```tsx
export interface RateTileProps {
  vm: TileVm;
  stage: TileState["stage"];
  overlay?: ReactElement | null;
}

const SPOT_OFFSET_DAYS = 2;

export function RateTile(props: RateTileProps): ReactElement {
  const { vm, stage, overlay } = props;

  function handleNotionalChange(e: ChangeEvent<HTMLInputElement>): void {
    vm.onNotional(e.target.value);
  }

  function handleNotionalFocus(e: FocusEvent<HTMLInputElement>): void {
    e.target.select();
  }

  const moveColor = {
    "--move-color": vm.moveUp ? "var(--buy)" : "var(--sell)",
  } as CSSProperties;

  return (
    <div
      className={styles.tile}
      data-tile-sym={vm.sym}
      data-booked={String(stage === "success")}
    >
```

**Before** (`LiveRatesPanel.tsx`, `TileCell`, current call site):
```tsx
  return (
    <div data-flip-key={sym} className={styles.cell}>
      <RateTile
        vm={vm}
        overlay={
          <div ref={overlayHostRef} className={styles.overlayHost}>
            <TileExecOverlay tile={tile} meta={meta} now={now} />
          </div>
        }
      />
    </div>
  );
```

**After:**
```tsx
  return (
    <div data-flip-key={sym} className={styles.cell}>
      <RateTile
        vm={vm}
        stage={tile.stage}
        overlay={
          <div ref={overlayHostRef} className={styles.overlayHost}>
            <TileExecOverlay tile={tile} meta={meta} now={now} />
          </div>
        }
      />
    </div>
  );
```

**Before** (`RateTile.module.css`, lines 1-9):
```css
.tile {
  position: relative;
  background: var(--tile, var(--bg2));
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 13px 14px 11px;
  overflow: hidden;
  box-shadow: var(--tile-shadow, none);
}
```

**After:**
```css
.tile {
  position: relative;
  background: var(--tile, var(--bg2));
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 13px 14px 11px;
  overflow: hidden;
  box-shadow: var(--tile-shadow, none);
}

.tile[data-booked="true"] {
  animation: bookPulse 1s ease;
}
```

**Before** (`fx-tile.test.tsx`, two existing `render` calls):
```tsx
    const { getByText, getAllByText, container } = render(
      <RateTile vm={makeVm({})} overlay={null} />,
    );
```
```tsx
    const { getAllByText, getByText } = render(
      <RateTile
        vm={makeVm({ isRfq: true, notionalInvalid: true })}
        overlay={null}
      />,
    );
```

**After:**
```tsx
    const { getByText, getAllByText, container } = render(
      <RateTile vm={makeVm({})} stage="idle" overlay={null} />,
    );
```
```tsx
    const { getAllByText, getByText } = render(
      <RateTile
        vm={makeVm({ isRfq: true, notionalInvalid: true })}
        stage="idle"
        overlay={null}
      />,
    );
```

Also add `stage="idle"` to the FX-3 test added above:
```tsx
  test("shows the absolute pip count even on a down move", () => {
    const { getByText } = render(
      <RateTile
        vm={makeVm({ movePips: -7, moveUp: false })}
        stage="idle"
        overlay={null}
      />,
    );
    expect(getByText("▼ 7 pip")).toBeTruthy();
  });
```

**Test** (append inside `describe("RateTile", ...)`):
```tsx
  test("carries data-booked only while the tile's stage is success", () => {
    const { container, rerender } = render(
      <RateTile vm={makeVm({})} stage="idle" overlay={null} />,
    );
    expect(
      container
        .querySelector('[data-tile-sym="EURUSD"]')
        ?.getAttribute("data-booked"),
    ).toBe("false");

    rerender(<RateTile vm={makeVm({})} stage="success" overlay={null} />);
    expect(
      container
        .querySelector('[data-tile-sym="EURUSD"]')
        ?.getAttribute("data-booked"),
    ).toBe("true");
  });
```

Run:
```
pnpm --filter @rtc/client-prototype exec vitest run tests/fx-tile.test.tsx
```
Expected: FAIL before the fix (`stage` prop doesn't exist / `data-booked` is never rendered, `getAttribute` returns `null` not `"true"`). PASS after.

---

### Task 8 (FX-5): Tile border strengthens while any exec/RFQ/done overlay is active

Depends on Task FX-4 (`stage` prop already threaded through `RateTile`).

**Files:**
- Modify `packages/client-prototype/src/fx/LiveRates/RateTile.tsx` (the `tile` div, post-FX-4 state)
- Modify `packages/client-prototype/src/fx/LiveRates/RateTile.module.css` (append)
- Test: append to `packages/client-prototype/tests/fx-tile.test.tsx`

**Before** (`RateTile.tsx`, post-FX-4):
```tsx
    <div
      className={styles.tile}
      data-tile-sym={vm.sym}
      data-booked={String(stage === "success")}
    >
```

**After:**
```tsx
    <div
      className={styles.tile}
      data-tile-sym={vm.sym}
      data-booked={String(stage === "success")}
      data-overlay-active={String(stage !== "idle")}
    >
```

**Before** (`RateTile.module.css`, post-FX-4):
```css
.tile[data-booked="true"] {
  animation: bookPulse 1s ease;
}
```

**After:**
```css
.tile[data-booked="true"] {
  animation: bookPulse 1s ease;
}

.tile[data-overlay-active="true"] {
  border-color: var(--border-strong);
}
```

**Test** (append inside `describe("RateTile", ...)`):
```tsx
  test("strengthens the border while any exec/RFQ/done overlay is active", () => {
    const { container, rerender } = render(
      <RateTile vm={makeVm({})} stage="idle" overlay={null} />,
    );
    expect(
      container
        .querySelector('[data-tile-sym="EURUSD"]')
        ?.getAttribute("data-overlay-active"),
    ).toBe("false");

    rerender(<RateTile vm={makeVm({})} stage="executing" overlay={null} />);
    expect(
      container
        .querySelector('[data-tile-sym="EURUSD"]')
        ?.getAttribute("data-overlay-active"),
    ).toBe("true");
  });
```

Run:
```
pnpm --filter @rtc/client-prototype exec vitest run tests/fx-tile.test.tsx
```
Expected: FAIL before the fix (`data-overlay-active` is never rendered). PASS after.

---

### Task 9 (FX-6): Pip flash colored by the triggering tick's own direction, not the daily move

**Files:**
- Modify `packages/client-prototype/src/fx/LiveRates/RateTile.tsx` (`TileVm` interface + both `TilePrice` calls, post-FX-5 state)
- Modify `packages/client-prototype/src/fx/LiveRates/LiveRatesPanel.tsx` (`buildTileVm`, lines ~236-277)
- Modify `packages/client-prototype/src/fx/LiveRates/TilePrice.tsx` (whole file)
- Modify `packages/client-prototype/src/fx/LiveRates/TilePrice.module.css` (lines 62-66)
- Test: modify + append in `packages/client-prototype/tests/fx-tile.test.tsx`

**Before** (`RateTile.tsx`, `TileVm` interface, lines 14-30):
```tsx
export interface TileVm {
  sym: Sym;
  meta: PairMeta;
  rate: number;
  movePips: number;
  moveUp: boolean;
  flashOn: boolean;
  hist: number[];
  notional: string;
  notionalInvalid: boolean;
  isRfq: boolean;
  showCharts: boolean;
  onNotional(v: string): void;
  onReset(): void;
  onSell(): void;
  onBuy(): void;
}
```

**After:**
```tsx
export interface TileVm {
  sym: Sym;
  meta: PairMeta;
  rate: number;
  movePips: number;
  moveUp: boolean;
  flashOn: boolean;
  flashUp: boolean;
  hist: number[];
  notional: string;
  notionalInvalid: boolean;
  isRfq: boolean;
  showCharts: boolean;
  onNotional(v: string): void;
  onReset(): void;
  onSell(): void;
  onBuy(): void;
}
```

**Before** (`RateTile.tsx`, `priceRow`, lines 90-122):
```tsx
      <div className={styles.priceRow}>
        <button
          type="button"
          className={styles.priceBtn}
          data-side="sell"
          onClick={vm.onSell}
        >
          <TilePrice
            side="Sell"
            rate={vm.rate}
            meta={vm.meta}
            moveUp={vm.moveUp}
            flashOn={vm.flashOn}
            isRfq={vm.isRfq}
          />
        </button>
        <div className={styles.spreadLabel}>{vm.meta.spread}</div>
        <button
          type="button"
          className={styles.priceBtn}
          data-side="buy"
          onClick={vm.onBuy}
        >
          <TilePrice
            side="Buy"
            rate={vm.rate}
            meta={vm.meta}
            moveUp={vm.moveUp}
            flashOn={vm.flashOn}
            isRfq={vm.isRfq}
          />
        </button>
      </div>
```

**After:**
```tsx
      <div className={styles.priceRow}>
        <button
          type="button"
          className={styles.priceBtn}
          data-side="sell"
          onClick={vm.onSell}
        >
          <TilePrice
            side="Sell"
            rate={vm.rate}
            meta={vm.meta}
            moveUp={vm.moveUp}
            flashOn={vm.flashOn}
            flashUp={vm.flashUp}
            isRfq={vm.isRfq}
          />
        </button>
        <div className={styles.spreadLabel}>{vm.meta.spread}</div>
        <button
          type="button"
          className={styles.priceBtn}
          data-side="buy"
          onClick={vm.onBuy}
        >
          <TilePrice
            side="Buy"
            rate={vm.rate}
            meta={vm.meta}
            moveUp={vm.moveUp}
            flashOn={vm.flashOn}
            flashUp={vm.flashUp}
            isRfq={vm.isRfq}
          />
        </button>
      </div>
```

**Before** (`LiveRatesPanel.tsx`, `buildTileVm`):
```tsx
function buildTileVm(
  sym: Sym,
  rates: RatesApi,
  showCharts: boolean,
  now: number,
): TileVm {
  const meta = META[sym];
  const rate = rates.rates[sym];
  const { movePips, moveUp } = computeMove(sym, rates);
  const flashEvent = rates.flash[sym];
  const flashOn = flashEvent != null && now - flashEvent.ts < FLASH_WINDOW_MS;
  const notional = rates.notionals[sym];
  const parsed = parseNotional(notional);
  const notionalInvalid = Number.isNaN(parsed) || parsed > MAX_NOTIONAL_CAP;
  const isRfq = !notionalInvalid && parsed > RFQ_THRESHOLD;

  return {
    sym,
    meta,
    rate,
    movePips,
    moveUp,
    flashOn,
    hist: rates.hist[sym],
    notional,
    notionalInvalid,
    isRfq,
    showCharts,
    onNotional: (v: string) => {
      rates.onNotional(sym, v);
    },
    onReset: () => {
      rates.onReset(sym);
    },
    onSell: () => {
      rates.onSell(sym);
    },
    onBuy: () => {
      rates.onBuy(sym);
    },
  };
}
```

**After:**
```tsx
function buildTileVm(
  sym: Sym,
  rates: RatesApi,
  showCharts: boolean,
  now: number,
): TileVm {
  const meta = META[sym];
  const rate = rates.rates[sym];
  const { movePips, moveUp } = computeMove(sym, rates);
  const flashEvent = rates.flash[sym];
  const flashOn = flashEvent != null && now - flashEvent.ts < FLASH_WINDOW_MS;
  // PROTO 1268: `flashCol=fl&&fl.dir>0?'var(--buy)':'var(--sell)'` — the
  // flash color follows the triggering tick's own direction, independent of
  // `moveUp` (the daily move used for the base pip color).
  const flashUp = flashEvent != null && flashEvent.dir > 0;
  const notional = rates.notionals[sym];
  const parsed = parseNotional(notional);
  const notionalInvalid = Number.isNaN(parsed) || parsed > MAX_NOTIONAL_CAP;
  const isRfq = !notionalInvalid && parsed > RFQ_THRESHOLD;

  return {
    sym,
    meta,
    rate,
    movePips,
    moveUp,
    flashOn,
    flashUp,
    hist: rates.hist[sym],
    notional,
    notionalInvalid,
    isRfq,
    showCharts,
    onNotional: (v: string) => {
      rates.onNotional(sym, v);
    },
    onReset: () => {
      rates.onReset(sym);
    },
    onSell: () => {
      rates.onSell(sym);
    },
    onBuy: () => {
      rates.onBuy(sym);
    },
  };
}
```

**Before** (`TilePrice.tsx`, whole file):
```tsx
import type { CSSProperties, ReactElement } from "react";

import { splitPrice } from "#/fx/fxData";
import styles from "#/fx/LiveRates/TilePrice.module.css";
import type { PairMeta } from "#/fx/types";

export interface TilePriceProps {
  side: "Sell" | "Buy";
  rate: number;
  meta: PairMeta;
  moveUp: boolean;
  flashOn: boolean;
  isRfq: boolean;
}

export function TilePrice(props: TilePriceProps): ReactElement {
  const { side, rate, meta, moveUp, flashOn, isRfq } = props;
  const sideAttr = side === "Sell" ? "sell" : "buy";
  const pu = meta.d === 3 ? 0.01 : 0.0001;
  const half = (parseFloat(meta.spread) / 2) * pu;
  const price = side === "Sell" ? rate - half : rate + half;
  const split = splitPrice(price, meta);
  const moveColor = {
    "--move-color": moveUp ? "var(--buy)" : "var(--sell)",
  } as CSSProperties;

  return (
    <>
      <div className={styles.labelRow}>
        {side === "Sell" ? (
          <span className={styles.sideLabel} data-side="sell">
            SELL
          </span>
        ) : null}
        {isRfq ? <span className={styles.rfqBadge}>RFQ</span> : null}
        {side === "Buy" ? (
          <span className={styles.sideLabel} data-side="buy">
            BUY
          </span>
        ) : null}
      </div>
      <div className={styles.priceRow} data-side={sideAttr}>
        <span className={styles.big}>{split.big}</span>
        <span
          className={styles.pips}
          data-flash={String(flashOn)}
          style={moveColor}
        >
          {split.pips}
        </span>
        <span className={styles.frac}>{split.frac}</span>
      </div>
    </>
  );
}
```

**After** (`TilePrice.tsx`, whole file):
```tsx
import type { CSSProperties, ReactElement } from "react";

import { splitPrice } from "#/fx/fxData";
import styles from "#/fx/LiveRates/TilePrice.module.css";
import type { PairMeta } from "#/fx/types";

export interface TilePriceProps {
  side: "Sell" | "Buy";
  rate: number;
  meta: PairMeta;
  moveUp: boolean;
  flashOn: boolean;
  flashUp: boolean;
  isRfq: boolean;
}

export function TilePrice(props: TilePriceProps): ReactElement {
  const { side, rate, meta, moveUp, flashOn, flashUp, isRfq } = props;
  const sideAttr = side === "Sell" ? "sell" : "buy";
  const pu = meta.d === 3 ? 0.01 : 0.0001;
  const half = (parseFloat(meta.spread) / 2) * pu;
  const price = side === "Sell" ? rate - half : rate + half;
  const split = splitPrice(price, meta);
  // PROTO 1268/1281: the pips span carries two independent colors — the
  // daily-move color at rest (`--move-color`) and the triggering tick's own
  // direction for the flash background (`--flash-color`).
  const moveColor = {
    "--move-color": moveUp ? "var(--buy)" : "var(--sell)",
    "--flash-color": flashUp ? "var(--buy)" : "var(--sell)",
  } as CSSProperties;

  return (
    <>
      <div className={styles.labelRow}>
        {side === "Sell" ? (
          <span className={styles.sideLabel} data-side="sell">
            SELL
          </span>
        ) : null}
        {isRfq ? <span className={styles.rfqBadge}>RFQ</span> : null}
        {side === "Buy" ? (
          <span className={styles.sideLabel} data-side="buy">
            BUY
          </span>
        ) : null}
      </div>
      <div className={styles.priceRow} data-side={sideAttr}>
        <span className={styles.big}>{split.big}</span>
        <span
          className={styles.pips}
          data-flash={String(flashOn)}
          style={moveColor}
        >
          {split.pips}
        </span>
        <span className={styles.frac}>{split.frac}</span>
      </div>
    </>
  );
}
```

**Before** (`TilePrice.module.css`, lines 62-66):
```css
.pips[data-flash="true"] {
  color: var(--bg);
  background: var(--move-color);
  padding: 0 2px;
}
```

**After:**
```css
.pips[data-flash="true"] {
  color: var(--bg);
  background: var(--flash-color);
  padding: 0 2px;
}
```

**Before** (`fx-tile.test.tsx`, `makeVm` helper, bottom of file):
```tsx
function makeVm(overrides: Partial<TileVm>): TileVm {
  return {
    sym: "EURUSD",
    meta: META.EURUSD,
    rate: 1.09213,
    movePips: 4,
    moveUp: true,
    flashOn: false,
    hist: Array.from({ length: 30 }, (_v, i) => {
      return 1.09 + i * 1e-4;
    }),
    notional: "1,000,000",
    notionalInvalid: false,
    isRfq: false,
    showCharts: true,
    onNotional: vi.fn(),
    onReset: vi.fn(),
    onSell: vi.fn(),
    onBuy: vi.fn(),
    ...overrides,
  };
}
```

**After:**
```tsx
function makeVm(overrides: Partial<TileVm>): TileVm {
  return {
    sym: "EURUSD",
    meta: META.EURUSD,
    rate: 1.09213,
    movePips: 4,
    moveUp: true,
    flashOn: false,
    flashUp: false,
    hist: Array.from({ length: 30 }, (_v, i) => {
      return 1.09 + i * 1e-4;
    }),
    notional: "1,000,000",
    notionalInvalid: false,
    isRfq: false,
    showCharts: true,
    onNotional: vi.fn(),
    onReset: vi.fn(),
    onSell: vi.fn(),
    onBuy: vi.fn(),
    ...overrides,
  };
}
```

**Test** (append inside `describe("RateTile", ...)`):
```tsx
  test("colors the flash background by the tick's own direction, independent of the daily move", () => {
    const { container } = render(
      <RateTile
        vm={makeVm({ moveUp: true, flashOn: true, flashUp: false })}
        stage="idle"
        overlay={null}
      />,
    );
    const flashed = container.querySelector(
      '[data-flash="true"]',
    ) as HTMLElement | null;

    expect(flashed).toBeTruthy();
    expect(flashed?.style.getPropertyValue("--flash-color")).toBe(
      "var(--sell)",
    );
    expect(flashed?.style.getPropertyValue("--move-color")).toBe(
      "var(--buy)",
    );
  });
```

Run:
```
pnpm --filter @rtc/client-prototype exec vitest run tests/fx-tile.test.tsx
```
Expected: FAIL before the fix (`--flash-color` is never set on the element — `getPropertyValue` returns `""`, and the pre-fix background actually reuses `--move-color`, i.e. `var(--buy)` not `var(--sell)`). PASS after.

---

### Task 10 (FX-7): `ActivityView` React key — make it collision-proof

**Files:**
- Modify `packages/client-prototype/src/fx/Blotter/ActivityView.tsx` (lines 22-33)
- Test: append to `packages/client-prototype/tests/fx-activity.test.tsx`

**Before** (`ActivityView.tsx`, lines 22-33):
```tsx
  return (
    <div>
      {events.map((event) => {
        return (
          <ActivityRow
            key={`${event.t}-${event.tag}-${event.msg}`}
            event={event}
          />
        );
      })}
    </div>
  );
```

**After:**
```tsx
  return (
    <div>
      {events.map((event, index) => {
        return (
          <ActivityRow
            key={`${event.t}-${event.tag}-${event.msg}-${index}`}
            event={event}
          />
        );
      })}
    </div>
  );
```

**Test** (append inside `describe("ActivityView", ...)` in `fx-activity.test.tsx`):
```tsx
  test("does not warn about duplicate keys when two events share the same t/tag/msg", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow — asserted on below
    });
    const dup = makeEvent({});

    render(<ActivityView events={[dup, { ...dup }]} />);

    const sameKeyWarning = spy.mock.calls.some((args) => {
      return String(args[0]).includes("same key");
    });
    expect(sameKeyWarning).toBe(false);

    spy.mockRestore();
  });
```

Run:
```
pnpm --filter @rtc/client-prototype exec vitest run tests/fx-activity.test.tsx
```
Expected: FAIL before the fix (React logs `Warning: Encountered two children with the same key, ...` via `console.error` since both events produce the identical key `"09:41:02-EXEC-EURUSD 1M bought @ 1.09213"`). PASS after (index makes the two keys distinct).

---

### Task 11 (CR-2): LIVE pill count format `(n)` / empty

**Files**
- `packages/client-prototype/src/credit/useCreditRfqs.ts`
- `packages/client-prototype/tests/credit-rfqs.test.ts`

**Before** (interface, line 54)
```ts
  liveCount: number;
```

**After**
```ts
  liveCount: string;
```

**Before** (lines 388-390)
```ts
  const liveCount: number = rfqs.filter((r) => {
    return r.state === "Open";
  }).length;
```

**After**
```ts
  const liveRfqs = rfqs.filter((r) => {
    return r.state === "Open";
  });
  const liveCount = liveRfqs.length ? `(${liveRfqs.length})` : "";
```

**Test** — add to `packages/client-prototype/tests/credit-rfqs.test.ts` (append inside the existing `describe("useCreditRfqs", ...)` block, after the `"seeds two RFQs..."` test):
```ts
  test("liveCount is '' with no Open RFQs, and '(n)' once one is live (PROTO L1325 format)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    expect(result.current.liveCount).toBe("");

    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    expect(result.current.liveCount).toBe("(1)");
  });
```
Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/credit-rfqs.test.ts tests/credit-rfqs-panel.test.tsx` — expect all passed (the panel test's `"LIVE"` click assertion from CR-1 depends on this format change).

---

### Task 12 (CR-1): Move RFQs filter pills into `Panel.headControls`

Depends on the finalized shared Panel P6 contract (`PanelProps.headControls?: ReactNode`) landing first — this task only consumes it.

**Files**
- `packages/client-prototype/src/credit/Rfqs/RfqsPanel.tsx`
- `packages/client-prototype/src/credit/Rfqs/RfqsPanel.module.css`
- `packages/client-prototype/src/credit/CreditScreen.tsx`
- `packages/client-prototype/tests/credit-rfqs-panel.test.tsx`

**Before** (`RfqsPanel.tsx`, full file)
```tsx
import type { ReactElement } from "react";
import { useRef } from "react";

import { EmptyRfqs } from "#/credit/Rfqs/EmptyRfqs";
import { RfqCard } from "#/credit/Rfqs/RfqCard";
import styles from "#/credit/Rfqs/RfqsPanel.module.css";
import { rfqCardVm } from "#/credit/rfqCardVm";
import type { Rfq } from "#/credit/types";
import type { CreditRfqsApi } from "#/credit/useCreditRfqs";
import { useFlip } from "#/motion/useFlip";
import { usePreferences } from "#/shell/Preferences/usePreferences";

export interface RfqsPanelProps {
  rfqs: CreditRfqsApi;
}

// PROTO L563-582: the RFQs panel — a LIVE/CLOSED/ALL filter-pill head and a
// FLIP-glided grid of RfqCards (or the empty state when the active filter
// matches nothing). The "◳ RFQs" region label lives in the outer dock
// <Panel head> (CreditScreen), mirroring FX's region-label-in-Panel model.
// The useFlip wiring mirrors
// LiveRatesPanel's exactly: a ref over the grid, keyed on the shown ids plus
// the active tab, so a filter switch (or a card entering/leaving) glides the
// survivors instead of jumping.
export function RfqsPanel(props: RfqsPanelProps): ReactElement {
  const { rfqs } = props;
  const { prefs } = usePreferences();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const shownIds = rfqs.shownRfqs
    .map((r) => {
      return r.id;
    })
    .join(",");
  useFlip(gridRef, `${rfqs.creditTab}:${shownIds}`, {
    reduce: prefs.reduceMotion,
  });

  function handleTab(tab: CreditRfqsApi["creditTab"]): void {
    rfqs.onTab(tab);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.filters}>
          <button
            type="button"
            className={styles.pill}
            data-active={String(rfqs.creditTab === "live")}
            onClick={() => {
              handleTab("live");
            }}
          >
            LIVE {rfqs.liveCount}
          </button>
          <button
            type="button"
            className={styles.pill}
            data-active={String(rfqs.creditTab === "closed")}
            onClick={() => {
              handleTab("closed");
            }}
          >
            CLOSED
          </button>
          <button
            type="button"
            className={styles.pill}
            data-active={String(rfqs.creditTab === "all")}
            onClick={() => {
              handleTab("all");
            }}
          >
            ALL
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {rfqs.noRfqs ? (
          <EmptyRfqs />
        ) : (
          <div className={styles.grid} ref={gridRef}>
            {rfqs.shownRfqs.map((rfq) => {
              return <RfqCardCell key={rfq.id} rfq={rfq} rfqs={rfqs} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface RfqCardCellProps {
  rfq: Rfq;
  rfqs: CreditRfqsApi;
}

function RfqCardCell(props: RfqCardCellProps): ReactElement {
  const { rfq, rfqs } = props;
  const vm = rfqCardVm(rfq, rfqs.now);

  function handleAccept(dealerId: number): void {
    rfqs.acceptQuote(rfq.id, dealerId);
  }

  function handleCancel(): void {
    rfqs.cancelRfq(rfq.id);
  }

  function handleRemove(): void {
    rfqs.removeRfq(rfq.id);
  }

  return (
    <div data-flip-key={rfq.id} data-rfq-id={rfq.id} className={styles.cell}>
      <RfqCard
        vm={vm}
        isNew={rfq.id === rfqs.newRfqId}
        isExiting={rfqs.exitingRfqs.includes(rfq.id)}
        onAccept={handleAccept}
        onCancel={handleCancel}
        onRemove={handleRemove}
      />
    </div>
  );
}
```

**After** (`RfqsPanel.tsx`, full file)
```tsx
import type { ReactElement } from "react";
import { useRef } from "react";

import { EmptyRfqs } from "#/credit/Rfqs/EmptyRfqs";
import { RfqCard } from "#/credit/Rfqs/RfqCard";
import styles from "#/credit/Rfqs/RfqsPanel.module.css";
import { rfqCardVm } from "#/credit/rfqCardVm";
import type { Rfq } from "#/credit/types";
import type { CreditRfqsApi } from "#/credit/useCreditRfqs";
import { useFlip } from "#/motion/useFlip";
import { usePreferences } from "#/shell/Preferences/usePreferences";

export interface RfqsPanelProps {
  rfqs: CreditRfqsApi;
}

// PROTO L563-582: the RFQs panel — a FLIP-glided grid of RfqCards (or the
// empty state when the active filter matches nothing). The "◳ RFQs" region
// label AND the LIVE/CLOSED/ALL filter pills (RfqFilterPills, below) both
// live in the outer dock <Panel head/headControls> (CreditScreen) — P6:
// Panel owns the single 38px head bar, so this component no longer draws
// its own bar underneath it. The useFlip wiring mirrors LiveRatesPanel's
// exactly: a ref over the grid, keyed on the shown ids plus the active tab,
// so a filter switch (or a card entering/leaving) glides the survivors
// instead of jumping.
export function RfqsPanel(props: RfqsPanelProps): ReactElement {
  const { rfqs } = props;
  const { prefs } = usePreferences();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const shownIds = rfqs.shownRfqs
    .map((r) => {
      return r.id;
    })
    .join(",");
  useFlip(gridRef, `${rfqs.creditTab}:${shownIds}`, {
    reduce: prefs.reduceMotion,
  });

  return (
    <div className={styles.panel}>
      <div className={styles.body}>
        {rfqs.noRfqs ? (
          <EmptyRfqs />
        ) : (
          <div className={styles.grid} ref={gridRef}>
            {rfqs.shownRfqs.map((rfq) => {
              return <RfqCardCell key={rfq.id} rfq={rfq} rfqs={rfqs} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export interface RfqFilterPillsProps {
  creditTab: CreditRfqsApi["creditTab"];
  liveCount: CreditRfqsApi["liveCount"];
  onTab: CreditRfqsApi["onTab"];
}

// PROTO L564/L1325: the LIVE/CLOSED/ALL filter pills. P6: rendered as the
// RFQs Panel's `headControls` (CreditScreen) — not a second bar under the
// Panel head.
export function RfqFilterPills(props: RfqFilterPillsProps): ReactElement {
  const { creditTab, liveCount, onTab } = props;

  return (
    <div className={styles.filters}>
      <button
        type="button"
        className={styles.pill}
        data-active={String(creditTab === "live")}
        onClick={() => {
          onTab("live");
        }}
      >
        LIVE {liveCount}
      </button>
      <button
        type="button"
        className={styles.pill}
        data-active={String(creditTab === "closed")}
        onClick={() => {
          onTab("closed");
        }}
      >
        CLOSED
      </button>
      <button
        type="button"
        className={styles.pill}
        data-active={String(creditTab === "all")}
        onClick={() => {
          onTab("all");
        }}
      >
        ALL
      </button>
    </div>
  );
}

interface RfqCardCellProps {
  rfq: Rfq;
  rfqs: CreditRfqsApi;
}

function RfqCardCell(props: RfqCardCellProps): ReactElement {
  const { rfq, rfqs } = props;
  const vm = rfqCardVm(rfq, rfqs.now);

  function handleAccept(dealerId: number): void {
    rfqs.acceptQuote(rfq.id, dealerId);
  }

  function handleCancel(): void {
    rfqs.cancelRfq(rfq.id);
  }

  function handleRemove(): void {
    rfqs.removeRfq(rfq.id);
  }

  return (
    <div data-flip-key={rfq.id} data-rfq-id={rfq.id} className={styles.cell}>
      <RfqCard
        vm={vm}
        isNew={rfq.id === rfqs.newRfqId}
        isExiting={rfqs.exitingRfqs.includes(rfq.id)}
        onAccept={handleAccept}
        onCancel={handleCancel}
        onRemove={handleRemove}
      />
    </div>
  );
}
```
> Note: Tasks 13 (CR-3) and 14 (CR-4) add `cardExitIds`/`tabRecent`/`index` and rewire `RfqCardCell` — this task deliberately keeps the current `exitingRfqs`/no-index shape so it is green standalone.

**Before** (`RfqsPanel.module.css`, lines 15-30)
```css
.head {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  min-height: 38px;
  flex-shrink: 0;
  background: var(--panel-head);
  border-bottom: 1px solid var(--border);
}

.filters {
  display: flex;
  gap: 6px;
  margin-right: 4px;
}
```

**After**
```css
.filters {
  display: flex;
  gap: 6px;
  margin-right: 4px;
}
```

**Before** (`CreditScreen.tsx`, line 7)
```tsx
import { RfqsPanel } from "#/credit/Rfqs/RfqsPanel";
```

**After**
```tsx
import { RfqFilterPills, RfqsPanel } from "#/credit/Rfqs/RfqsPanel";
```

**Before** (`CreditScreen.tsx`, lines 99-106)
```tsx
          <Panel
            id={RFQS_PANEL}
            head={<span className={styles.regionLabel}>◳ RFQs</span>}
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <RfqsPanel rfqs={rfqs} />
          </Panel>
```

**After**
```tsx
          <Panel
            id={RFQS_PANEL}
            head={<span className={styles.regionLabel}>◳ RFQs</span>}
            headControls={
              <RfqFilterPills
                creditTab={rfqs.creditTab}
                liveCount={rfqs.liveCount}
                onTab={rfqs.onTab}
              />
            }
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <RfqsPanel rfqs={rfqs} />
          </Panel>
```

**Test** — replace `packages/client-prototype/tests/credit-rfqs-panel.test.tsx` in full:
```tsx
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RfqFilterPills, RfqsPanel } from "#/credit/Rfqs/RfqsPanel";
import { useCreditRfqs } from "#/credit/useCreditRfqs";
import { mulberry32 } from "#/mock/rng";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RfqsPanel", () => {
  test("renders both seed cards on the 'all' tab; the LIVE pill (rendered externally, P6 headControls) empties them", () => {
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    const view = render(
      <PreferencesProvider>
        <RfqFilterPills
          creditTab={result.current.creditTab}
          liveCount={result.current.liveCount}
          onTab={result.current.onTab}
        />
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    expect(view.queryByText("No RFQs to show")).toBeNull();
    expect(view.getByText("ACCEPTED")).toBeTruthy();
    expect(view.getByText("CANCELLED")).toBeTruthy();

    fireEvent.click(view.getByText("LIVE"));
    view.rerender(
      <PreferencesProvider>
        <RfqFilterPills
          creditTab={result.current.creditTab}
          liveCount={result.current.liveCount}
          onTab={result.current.onTab}
        />
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    expect(result.current.creditTab).toBe("live");
    expect(view.getByText("No RFQs to show")).toBeTruthy();
  });

  test("RfqsPanel no longer renders its own filter bar (P6: pills live only in Panel.headControls)", () => {
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    const view = render(
      <PreferencesProvider>
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    expect(view.queryByText("CLOSED")).toBeNull();
    expect(view.queryByText("ALL")).toBeNull();
  });
});
```
Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/credit-rfqs-panel.test.tsx` — expect 2 passed.

---

### Task 13 (CR-3): Auto-exit fade for a resolved live RFQ (`cardExitIds`)

> Note: this task also changes `RfqCardCell`'s `isExiting={rfqs.exitingRfqs.includes(rfq.id)}` (from Task 12) to `isExiting={rfqs.cardExitIds.includes(rfq.id)}`.

**Files**
- `packages/client-prototype/src/credit/useCreditRfqs.ts`
- `packages/client-prototype/src/credit/Rfqs/RfqsPanel.tsx`
- `packages/client-prototype/tests/credit-rfqs.test.ts`

**Before** (interface — after CR-2, `exitingRfqs` line)
```ts
  exitingRfqs: number[];
  onTab(tab: CreditTab): void;
```

**After**
```ts
  exitingRfqs: number[];
  cardExitIds: number[];
  onTab(tab: CreditTab): void;
```

**Before** (bottom derived block, lines 375-391 original — `shownRfqs`/`liveCount` computed here; shown post-CR-2)
```ts
  // PROTO L1327: shown = matches the active tab, plus anything mid
  // remove-animation, plus anything that just left "live" (accepted/expired)
  // so its card can animate out before vanishing.
  const shownRfqs = rfqs.filter((r) => {
    return (
      rfqMatch(r, creditTab) ||
      exitingRfqs.includes(r.id) ||
      (creditTab === "live" &&
        r.state !== "Open" &&
        r.exitAt != null &&
        now - r.exitAt < EXITING_RETAIN_MS)
    );
  });
  const liveRfqs = rfqs.filter((r) => {
    return r.state === "Open";
  });
  const liveCount = liveRfqs.length ? `(${liveRfqs.length})` : "";
  const noRfqs: boolean = shownRfqs.length === 0;
```

**After**
```ts
  // PROTO L1327/L1330: shown = matches the active tab, plus anything mid
  // remove-animation, plus anything that just left "live" (accepted/
  // cancelled/expired) so its card can animate out before vanishing.
  // cardExitIds is the union RfqCard's isExiting reads from — a manual
  // trash-click exit (exitingRfqs) or this auto-exit (still inside its
  // EXITING_RETAIN_MS grace window) both play the same cardOut fade.
  const autoExitRfqIds = rfqs
    .filter((r) => {
      return (
        creditTab === "live" &&
        r.state !== "Open" &&
        r.exitAt != null &&
        now - r.exitAt < EXITING_RETAIN_MS
      );
    })
    .map((r) => {
      return r.id;
    });
  const cardExitIds = Array.from(new Set([...exitingRfqs, ...autoExitRfqIds]));
  const shownRfqs = rfqs.filter((r) => {
    return (
      rfqMatch(r, creditTab) ||
      exitingRfqs.includes(r.id) ||
      autoExitRfqIds.includes(r.id)
    );
  });
  const liveRfqs = rfqs.filter((r) => {
    return r.state === "Open";
  });
  const liveCount = liveRfqs.length ? `(${liveRfqs.length})` : "";
  const noRfqs: boolean = shownRfqs.length === 0;
```

**Before** (return statement, `exitingRfqs,` line)
```ts
    exitingRfqs,
    onTab,
```

**After**
```ts
    exitingRfqs,
    cardExitIds,
    onTab,
```

**Before** (`RfqsPanel.tsx`, `RfqCardCell`, from CR-1's After)
```tsx
        isExiting={rfqs.cardExitIds.includes(rfq.id)}
```
(No further change needed here — CR-1's After already reads `cardExitIds`; this task is what makes that field exist. If CR-1 was applied with the fallback `rfqs.exitingRfqs.includes(rfq.id)`, change it to `rfqs.cardExitIds.includes(rfq.id)` now.)

**Test** — add to `packages/client-prototype/tests/credit-rfqs.test.ts` (append after the `"cancelRfq marks an Open RFQ Cancelled"` test):
```ts
  test("cardExitIds marks an RFQ that resolves while on the live tab, then clears after the next 400ms sweep", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    act(() => {
      result.current.cancelRfq(700);
    });
    expect(result.current.creditTab).toBe("live");
    expect(result.current.rfqs[0].state).toBe("Cancelled");
    expect(result.current.cardExitIds).toContain(700);
    expect(
      result.current.shownRfqs.some((r) => {
        return r.id === 700;
      }),
    ).toBe(true);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.cardExitIds).not.toContain(700);
  });
```
Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/credit-rfqs.test.ts` — expect all passed.

---

### Task 14 (CR-4): Tab-switch stagger cascade (`tabRecent` + per-index `--card-delay`)

**Files**
- `packages/client-prototype/src/credit/useCreditRfqs.ts`
- `packages/client-prototype/src/credit/Rfqs/RfqCard.tsx`
- `packages/client-prototype/src/credit/Rfqs/RfqCard.module.css`
- `packages/client-prototype/tests/credit-rfqs.test.ts`
- `packages/client-prototype/tests/credit-rfqs-panel.test.tsx`

**Before** (`useCreditRfqs.ts`, constants, lines 27-29)
```ts
const NOW_INTERVAL_MS = 400;
const TRADE_CAP = 40;
```

**After**
```ts
const NOW_INTERVAL_MS = 400;
const TRADE_CAP = 40;
// PROTO L1330: tabRecent = a switch triggered its cascade within this window.
const TAB_RECENT_MS = 480;
```

**Before** (interface, `cardExitIds` line from CR-3)
```ts
  exitingRfqs: number[];
  cardExitIds: number[];
  onTab(tab: CreditTab): void;
```

**After**
```ts
  exitingRfqs: number[];
  cardExitIds: number[];
  tabRecent: boolean;
  onTab(tab: CreditTab): void;
```

**Before** (state block, lines 121-123)
```ts
  const [newRfqId, setNewRfqId] = useState<number | null>(null);
  const [newCreditId, setNewCreditId] = useState<number | null>(null);
  const [exitingRfqs, setExitingRfqs] = useState<number[]>([]);
```

**After**
```ts
  const [newRfqId, setNewRfqId] = useState<number | null>(null);
  const [newCreditId, setNewCreditId] = useState<number | null>(null);
  const [exitingRfqs, setExitingRfqs] = useState<number[]>([]);
  const [tabChangedAt, setTabChangedAt] = useState(0);
```

**Before** (`onTab`, lines 151-153)
```ts
  function onTab(tab: CreditTab): void {
    setCreditTab(tab);
  }
```

**After**
```ts
  // PROTO L1325: a no-op click on the already-active tab doesn't restart
  // the cascade window.
  function onTab(tab: CreditTab): void {
    if (tab === creditTab) {
      return;
    }

    setCreditTab(tab);
    setTabChangedAt(Date.now());
  }
```

**Before** (bottom, `noRfqs`/return — after CR-3's After)
```ts
  const noRfqs: boolean = shownRfqs.length === 0;

  return {
    rfqs,
    creditTab,
    creditTrades,
    now,
    liveCount,
    shownRfqs,
    noRfqs,
    newRfqId,
    newCreditId,
    exitingRfqs,
    cardExitIds,
    onTab,
```

**After**
```ts
  const noRfqs: boolean = shownRfqs.length === 0;
  const tabRecent = now - tabChangedAt < TAB_RECENT_MS;

  return {
    rfqs,
    creditTab,
    creditTrades,
    now,
    liveCount,
    shownRfqs,
    noRfqs,
    newRfqId,
    newCreditId,
    exitingRfqs,
    cardExitIds,
    tabRecent,
    onTab,
```

**Before** (`RfqCard.tsx`, full file)
```tsx
import type { CSSProperties, ReactElement } from "react";

import { QuoteRow } from "#/credit/Rfqs/QuoteRow";
import styles from "#/credit/Rfqs/RfqCard.module.css";
import type { RfqCardVm } from "#/credit/rfqCardVm";

export interface RfqCardProps {
  vm: RfqCardVm;
  isNew: boolean;
  isExiting: boolean;
  onAccept(dealerId: number): void;
  onCancel(): void;
  onRemove(): void;
}

type CardState = "live" | "accepted" | "terminated";
type CardAnim = "enter" | "exit" | "none";

// PROTO L568-580: one streaming RFQ card — header (dir chip, ticker, state
// label), the dealer quote list, and a footer that switches on the RFQ's
// lifecycle (live countdown+cancel, accepted confirmation, or
// terminated+remove). data-anim/data-parity pick the entrance/exit keyframe
// pair from global.css (cardInA/B, cardOut). PROTO's extra "flash on
// accept" branch keys off a card that is BOTH terminated AND the
// just-accepted id, which can never both be true here (acceptQuote only
// ever produces a Closed, not terminated, rfq) — it is dead in the
// reference and is not ported.
export function RfqCard(props: RfqCardProps): ReactElement {
  const { vm, isNew, isExiting, onAccept, onCancel, onRemove } = props;
  const state = cardState(vm);
  const anim = cardAnim(isNew, isExiting);
  const barStyle = { "--bar-pct": `${vm.pct}%` } as CSSProperties;

  return (
    <div
      className={styles.card}
      data-state={state}
      data-anim={anim}
      data-parity={vm.rid % 2 ? "b" : "a"}
    >
      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <span className={styles.dirChip} data-dir={vm.dir.toLowerCase()}>
              {vm.dir.toUpperCase()}
            </span>
            <span className={styles.ticker}>{vm.ticker}</span>
          </div>
          <div className={styles.subline}>
            {vm.cusip} · QTY {vm.qty}
          </div>
        </div>
        <span className={styles.stateLabel} data-state={state}>
          {vm.stateLabel}
        </span>
      </div>

      <div className={styles.quotes}>
        {vm.quotes.map((q) => {
          return (
            <QuoteRow
              key={q.dealerId}
              vm={q}
              onAccept={() => {
                onAccept(q.dealerId);
              }}
            />
          );
        })}
      </div>

      <div className={styles.footer}>
        {vm.live ? (
          <div className={styles.liveRow}>
            <span className={styles.secs}>{vm.secs} secs</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={barStyle} />
            </div>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onCancel}
            >
              CANCEL
            </button>
          </div>
        ) : null}

        {vm.accepted ? (
          <div className={styles.acceptedRow}>
            <span className={styles.checkGlyph}>✓</span>
            <span className={styles.acceptedText}>
              You traded with {vm.acceptedDealer}
            </span>
          </div>
        ) : null}

        {vm.terminated ? (
          <button type="button" className={styles.removeRow} onClick={onRemove}>
            <span className={styles.binGlyph}>🗑</span>
            <span className={styles.removeText}>{vm.stateLabel} · remove</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function cardState(vm: RfqCardVm): CardState {
  if (vm.live) {
    return "live";
  }

  if (vm.accepted) {
    return "accepted";
  }

  return "terminated";
}

function cardAnim(isNew: boolean, isExiting: boolean): CardAnim {
  if (isExiting) {
    return "exit";
  }

  if (isNew) {
    return "enter";
  }

  return "none";
}
```

**After** (full file)
```tsx
import type { CSSProperties, ReactElement } from "react";

import { QuoteRow } from "#/credit/Rfqs/QuoteRow";
import styles from "#/credit/Rfqs/RfqCard.module.css";
import type { RfqCardVm } from "#/credit/rfqCardVm";

export interface RfqCardProps {
  vm: RfqCardVm;
  isNew: boolean;
  isExiting: boolean;
  isTabRecent: boolean;
  index: number;
  onAccept(dealerId: number): void;
  onCancel(): void;
  onRemove(): void;
}

type CardState = "live" | "accepted" | "terminated";
type CardAnim = "enter" | "exit" | "none";

// PROTO L1330: a tab-switch cascade staggers every surviving card's entrance
// by this many ms per grid index; a lone new-RFQ arrival plays immediately
// (no stagger).
const STAGGER_STEP_MS = 45;

// PROTO L568-580: one streaming RFQ card — header (dir chip, ticker, state
// label), the dealer quote list, and a footer that switches on the RFQ's
// lifecycle (live countdown+cancel, accepted confirmation, or
// terminated+remove). data-anim/data-parity pick the entrance/exit keyframe
// pair from global.css (cardInA/B, cardOut). PROTO's extra "flash on
// accept" branch keys off a card that is BOTH terminated AND the
// just-accepted id, which can never both be true here (acceptQuote only
// ever produces a Closed, not terminated, rfq) — it is dead in the
// reference and is not ported.
export function RfqCard(props: RfqCardProps): ReactElement {
  const {
    vm,
    isNew,
    isExiting,
    isTabRecent,
    index,
    onAccept,
    onCancel,
    onRemove,
  } = props;
  const state = cardState(vm);
  const anim = cardAnim(isNew, isExiting, isTabRecent);
  const delayMs = cardDelayMs(anim, isNew, isTabRecent, index);
  const barStyle = { "--bar-pct": `${vm.pct}%` } as CSSProperties;
  const cardDelayStyle = { "--card-delay": `${delayMs}ms` } as CSSProperties;

  return (
    <div
      className={styles.card}
      data-state={state}
      data-anim={anim}
      data-parity={vm.rid % 2 ? "b" : "a"}
      style={cardDelayStyle}
    >
      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <span className={styles.dirChip} data-dir={vm.dir.toLowerCase()}>
              {vm.dir.toUpperCase()}
            </span>
            <span className={styles.ticker}>{vm.ticker}</span>
          </div>
          <div className={styles.subline}>
            {vm.cusip} · QTY {vm.qty}
          </div>
        </div>
        <span className={styles.stateLabel} data-state={state}>
          {vm.stateLabel}
        </span>
      </div>

      <div className={styles.quotes}>
        {vm.quotes.map((q) => {
          return (
            <QuoteRow
              key={q.dealerId}
              vm={q}
              onAccept={() => {
                onAccept(q.dealerId);
              }}
            />
          );
        })}
      </div>

      <div className={styles.footer}>
        {vm.live ? (
          <div className={styles.liveRow}>
            <span className={styles.secs}>{vm.secs} secs</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={barStyle} />
            </div>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onCancel}
            >
              CANCEL
            </button>
          </div>
        ) : null}

        {vm.accepted ? (
          <div className={styles.acceptedRow}>
            <span className={styles.checkGlyph}>✓</span>
            <span className={styles.acceptedText}>
              You traded with {vm.acceptedDealer}
            </span>
          </div>
        ) : null}

        {vm.terminated ? (
          <button type="button" className={styles.removeRow} onClick={onRemove}>
            <span className={styles.binGlyph}>🗑</span>
            <span className={styles.removeText}>{vm.stateLabel} · remove</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function cardState(vm: RfqCardVm): CardState {
  if (vm.live) {
    return "live";
  }

  if (vm.accepted) {
    return "accepted";
  }

  return "terminated";
}

function cardAnim(
  isNew: boolean,
  isExiting: boolean,
  isTabRecent: boolean,
): CardAnim {
  if (isExiting) {
    return "exit";
  }

  if (isNew || isTabRecent) {
    return "enter";
  }

  return "none";
}

function cardDelayMs(
  anim: CardAnim,
  isNew: boolean,
  isTabRecent: boolean,
  index: number,
): number {
  if (anim === "enter" && !isNew && isTabRecent) {
    return index * STAGGER_STEP_MS;
  }

  return 0;
}
```

**Before** (`RfqCard.module.css`, lines 14-23)
```css
.card[data-anim="enter"][data-parity="a"] {
  animation: cardInA 0.46s cubic-bezier(0.2, 0.8, 0.3, 1);
}

.card[data-anim="enter"][data-parity="b"] {
  animation: cardInB 0.46s cubic-bezier(0.2, 0.8, 0.3, 1);
}

.card[data-anim="exit"] {
  animation: cardOut 0.34s cubic-bezier(0.4, 0, 0.7, 1) forwards;
}
```

**After**
```css
.card[data-anim="enter"][data-parity="a"] {
  animation: cardInA 0.46s cubic-bezier(0.2, 0.8, 0.3, 1) var(--card-delay, 0ms)
    both;
}

.card[data-anim="enter"][data-parity="b"] {
  animation: cardInB 0.46s cubic-bezier(0.2, 0.8, 0.3, 1) var(--card-delay, 0ms)
    both;
}

.card[data-anim="exit"] {
  animation: cardOut 0.34s cubic-bezier(0.4, 0, 0.7, 1) forwards;
}
```

**Test** — hook-level, append to `packages/client-prototype/tests/credit-rfqs.test.ts`:
```ts
  test("tabRecent flags a real tab switch for ~480ms, then decays", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    expect(result.current.tabRecent).toBe(false);

    act(() => {
      result.current.onTab("live");
    });
    expect(result.current.creditTab).toBe("live");
    expect(result.current.tabRecent).toBe(true);

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current.tabRecent).toBe(false);
  });
```

DOM-level, append to `packages/client-prototype/tests/credit-rfqs-panel.test.tsx` (inside `describe("RfqsPanel", ...)`, needs `act` added to the RTL import):
```tsx
  test("switching tabs staggers the surviving cards' entrance via --card-delay (PROTO L1330 ci*45ms)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    const view = render(
      <PreferencesProvider>
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    act(() => {
      result.current.onTab("closed");
    });
    view.rerender(
      <PreferencesProvider>
        <RfqsPanel rfqs={result.current} />
      </PreferencesProvider>,
    );

    const cards = view.container.querySelectorAll('[data-anim="enter"]');
    expect(cards).toHaveLength(2);
    expect(
      (cards[0] as HTMLElement).style.getPropertyValue("--card-delay"),
    ).toBe("0ms");
    expect(
      (cards[1] as HTMLElement).style.getPropertyValue("--card-delay"),
    ).toBe("45ms");
  });
```
Add `act` to the existing import line: `import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";`

Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/credit-rfqs.test.ts tests/credit-rfqs-panel.test.tsx` — expect all passed.

---

### Task 15 (CR-5): Deterministic dealer-price jitter for seeded closed RFQs

**Files**
- `packages/client-prototype/src/credit/creditData.ts`
- `packages/client-prototype/tests/credit-data.test.ts`

**Before** (imports, lines 1-7)
```ts
import type {
  CreditTrade,
  Dealer,
  Instrument,
  Quote,
  Rfq,
} from "#/credit/types";
```

**After**
```ts
import type {
  CreditTrade,
  Dealer,
  Instrument,
  Quote,
  Rfq,
} from "#/credit/types";
import { mulberry32 } from "#/mock/rng";
```

**Before** (lines 133-152)
```ts
// PROTO L835 _seedRfq, simplified to a static shape: a Closed RFQ (accepted at
// 99.80 by Citi) and a Cancelled RFQ. Static prices — no RNG at module load.
function seedQuotes(
  dealerIds: number[],
  acceptedId: number | null,
  price: number | null,
  ref: number,
): Quote[] {
  return dealerIds.map((did) => {
    if (did === acceptedId) {
      return { dealerId: did, state: "accepted", price };
    }

    return {
      dealerId: did,
      state: acceptedId == null ? "passed" : "priced",
      price: price ?? ref,
    };
  });
}
```

**After**
```ts
// PROTO L835 _seedRfq: a Closed RFQ (accepted at 99.80 by Citi) and a
// Cancelled RFQ. The accepted price is static; every losing dealer's price
// gets a small jitter off the base (price if given, else ref) — canonical
// draws that jitter from Math.random(), but a module-scope RNG must stay
// deterministic across StrictMode double-invoke and reloads, so this seeds
// mulberry32 once instead of calling Math.random() at module scope.
const SEED_JITTER_SEED = 238; // fixed — same id as the Closed seed, for traceability
const seedJitterRng = mulberry32(SEED_JITTER_SEED);

function seedQuotes(
  dealerIds: number[],
  acceptedId: number | null,
  price: number | null,
  ref: number,
): Quote[] {
  const base = price ?? ref;

  return dealerIds.map((did) => {
    if (did === acceptedId) {
      return { dealerId: did, state: "accepted", price };
    }

    return {
      dealerId: did,
      state: acceptedId == null ? "passed" : "priced",
      price: +(base + (seedJitterRng() - 0.5)).toFixed(2),
    };
  });
}
```

**Test** — append to `packages/client-prototype/tests/credit-data.test.ts`:
```ts
  test("seedQuotes jitters losing dealers deterministically around the base price (not identical to it)", () => {
    const closed = SEED_RFQS[0];
    const losingClosed = closed.quotes.filter((q) => {
      return q.dealerId !== closed.acceptedDealerId;
    });
    expect(losingClosed).toHaveLength(3);
    for (const q of losingClosed) {
      expect(q.price).not.toBeNull();
      expect(q.price).not.toBe(99.8);
      expect(Math.abs((q.price as number) - 99.8)).toBeLessThanOrEqual(0.5);
    }
    expect(
      new Set(
        losingClosed.map((q) => {
          return q.price;
        }),
      ).size,
    ).toBe(3);

    const cancelled = SEED_RFQS[1];
    for (const q of cancelled.quotes) {
      expect(q.price).not.toBe(100.6);
      expect(Math.abs((q.price as number) - 100.6)).toBeLessThanOrEqual(0.5);
    }
  });
```
Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/credit-data.test.ts` — expect all passed (deterministic: same fixed seed produces the same jittered prices on every run).

---

### Task 16 (CR-6): Drop the dropdown open-state border override

**Files**
- `packages/client-prototype/src/credit/NewRfq/InstrumentSelect.module.css`
- `packages/client-prototype/tests/credit-instrument-select.test.ts` (new)

**Before** (lines 21-27)
```css
.label[data-selected="true"] {
  color: var(--text);
}

.label[data-open="true"] {
  border-color: var(--border-strong);
}
```

**After**
```css
.label[data-selected="true"] {
  color: var(--text);
}
```

**Test** — new file `packages/client-prototype/tests/credit-instrument-select.test.ts` (a static-content check: jsdom doesn't apply CSS Modules stylesheets, so the dropdown-open border regressing is only observable by reading the source, mirroring this repo's existing inline-style grep-gate convention):
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

describe("InstrumentSelect.module.css", () => {
  test("the dropdown label has no open-state border override (PROTO's border is the fixed 1px solid var(--border) at every state)", () => {
    const cssPath = fileURLToPath(
      new URL(
        "../src/credit/NewRfq/InstrumentSelect.module.css",
        import.meta.url,
      ),
    );
    const css = readFileSync(cssPath, "utf-8");

    expect(css).not.toContain('[data-open="true"]');
  });
});
```
Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/credit-instrument-select.test.ts` — expect 1 passed.

---

### Task 17 (EQ-1): ChartPanel — split control row into `ChartPanelControls`, feed via `Panel.headControls`

**Files**
- `packages/client-prototype/src/equities/Chart/ChartPanel.tsx`
- `packages/client-prototype/src/equities/Chart/ChartPanel.module.css`
- `packages/client-prototype/tests/eq-chart.test.tsx`

**Before** (`ChartPanel.tsx`)
```tsx
import type { ReactElement } from "react";

import { CandleChart } from "#/equities/Chart/CandleChart";
import styles from "#/equities/Chart/ChartPanel.module.css";
import { InstrumentHeader } from "#/equities/Chart/InstrumentHeader";
import { InstrumentTabs } from "#/equities/Chart/InstrumentTabs";
import { TimeframePills } from "#/equities/Chart/TimeframePills";
import { chartVm } from "#/equities/chartVm";
import type { EqSym } from "#/equities/types";
import type { EqChartApi } from "#/equities/useEqChart";
import type { FlashEvent } from "#/equities/useEquities";

const FLASH_MS = 650;

export interface ChartPanelProps {
  chart: EqChartApi;
  rates: Record<EqSym, number>;
  prev: Record<EqSym, number>;
  flash: Record<EqSym, FlashEvent>;
  vol: Record<EqSym, string>;
  now: number;
}

// PROTO L599-624: the chart panel body — a control sub-head (instrument tabs +
// timeframe pills; the outer dock Panel from Task 9 owns the maximize glyph),
// then the live instrument header over the candlestick plot.
export function ChartPanel(props: ChartPanelProps): ReactElement {
  const { chart, rates, prev, flash, vol, now } = props;
  const sel = chart.sel;
  const last = rates[sel];
  const fl = flash[sel];
  const flashOn = fl != null && now - fl.ts < FLASH_MS;
  const seriesHigh = Math.max(
    ...chart.series.map((c) => {
      return c.h;
    }),
  );
  const seriesLow = Math.min(
    ...chart.series.map((c) => {
      return c.l;
    }),
  );
  const vm = chartVm(chart.series, last, flashOn);

  return (
    <div className={styles.body}>
      <div className={styles.controls}>
        <InstrumentTabs
          tabs={chart.openTabs}
          sel={sel}
          onSelect={chart.selectEq}
          onClose={chart.closeTab}
        />
        <div className={styles.spacer} />
        <TimeframePills tf={chart.tf} onSet={chart.setTf} />
      </div>
      <div className={styles.chartArea}>
        <InstrumentHeader
          sym={sel}
          last={last}
          prev={prev[sel]}
          flashOn={flashOn}
          flashDir={fl?.dir ?? 1}
          seriesHigh={seriesHigh}
          seriesLow={seriesLow}
          vol={vol[sel]}
        />
        <CandleChart vm={vm} />
      </div>
    </div>
  );
}
```

**After** (`ChartPanel.tsx`, full file)
```tsx
import type { ReactElement } from "react";

import { CandleChart } from "#/equities/Chart/CandleChart";
import styles from "#/equities/Chart/ChartPanel.module.css";
import { InstrumentHeader } from "#/equities/Chart/InstrumentHeader";
import { InstrumentTabs } from "#/equities/Chart/InstrumentTabs";
import { TimeframePills } from "#/equities/Chart/TimeframePills";
import { chartVm } from "#/equities/chartVm";
import type { EqSym } from "#/equities/types";
import type { EqChartApi } from "#/equities/useEqChart";
import type { FlashEvent } from "#/equities/useEquities";

const FLASH_MS = 650;

export interface ChartPanelControlsProps {
  chart: EqChartApi;
}

// PROTO L601-603: the chart panel's control row — instrument tabs + timeframe
// pills — hoisted out of the body so the dock Panel's headControls renders it
// inline in the single 38px head bar instead of a second strip.
export function ChartPanelControls(
  props: ChartPanelControlsProps,
): ReactElement {
  const { chart } = props;

  return (
    <div className={styles.controls}>
      <InstrumentTabs
        tabs={chart.openTabs}
        sel={chart.sel}
        onSelect={chart.selectEq}
        onClose={chart.closeTab}
      />
      <TimeframePills tf={chart.tf} onSet={chart.setTf} />
    </div>
  );
}

export interface ChartPanelProps {
  chart: EqChartApi;
  rates: Record<EqSym, number>;
  prev: Record<EqSym, number>;
  flash: Record<EqSym, FlashEvent>;
  vol: Record<EqSym, string>;
  now: number;
}

// PROTO L599-624: the chart panel body — the live instrument header over the
// candlestick plot. (The control row is ChartPanelControls, rendered by the
// dock Panel's headControls; the outer dock Panel owns the maximize glyph.)
export function ChartPanel(props: ChartPanelProps): ReactElement {
  const { chart, rates, prev, flash, vol, now } = props;
  const sel = chart.sel;
  const last = rates[sel];
  const fl = flash[sel];
  const flashOn = fl != null && now - fl.ts < FLASH_MS;
  const seriesHigh = Math.max(
    ...chart.series.map((c) => {
      return c.h;
    }),
  );
  const seriesLow = Math.min(
    ...chart.series.map((c) => {
      return c.l;
    }),
  );
  const vm = chartVm(chart.series, last, flashOn);

  return (
    <div className={styles.body}>
      <div className={styles.chartArea}>
        <InstrumentHeader
          sym={sel}
          last={last}
          prev={prev[sel]}
          flashOn={flashOn}
          flashDir={fl?.dir ?? 1}
          seriesHigh={seriesHigh}
          seriesLow={seriesLow}
          vol={vol[sel]}
        />
        <CandleChart vm={vm} />
      </div>
    </div>
  );
}
```

**Before** (`ChartPanel.module.css`)
```css
.body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.spacer {
  flex: 1;
}

.chartArea {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 12px;
}
```

**After** (`ChartPanel.module.css`, full file)
```css
.body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.chartArea {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 12px;
}
```

**Test** (`tests/eq-chart.test.tsx`, full file — replaces existing)
```tsx
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ChartPanel, ChartPanelControls } from "#/equities/Chart/ChartPanel";
import { useEqChart } from "#/equities/useEqChart";
import { useEquities } from "#/equities/useEquities";
import { mulberry32 } from "#/mock/rng";

afterEach(cleanup);

describe("ChartPanel", () => {
  test("renders the selected symbol and 40 candles", () => {
    const { container, getAllByText } = renderChart();
    expect(getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-candle]")).toHaveLength(40);
  });
});

describe("ChartPanelControls", () => {
  test("renders one instrument tab and 4 timeframe pills", () => {
    const { container, getAllByText } = renderChartControls();
    expect(getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-tf]")).toHaveLength(4);
  });
});

function renderChart(): ReturnType<typeof render> {
  const chart = renderHook(() => {
    return useEqChart({ rng: mulberry32(1) });
  }).result.current;
  const eng = renderHook(() => {
    return useEquities({ rng: mulberry32(1) });
  }).result.current;

  return render(
    <ChartPanel
      chart={chart}
      rates={eng.rates}
      prev={eng.prev}
      flash={eng.flash}
      vol={eng.vol}
      now={0}
    />,
  );
}

function renderChartControls(): ReturnType<typeof render> {
  const chart = renderHook(() => {
    return useEqChart({ rng: mulberry32(1) });
  }).result.current;

  return render(<ChartPanelControls chart={chart} />);
}
```

Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/eq-chart.test.tsx` — expected: 2 tests pass (ChartPanel candles/symbol; ChartPanelControls tab/pills).

**Screen wiring** (`EquitiesScreen.tsx`) — co-located so typecheck stays green on this commit. Add `ChartPanelControls` to the ChartPanel import:
```tsx
import { ChartPanel, ChartPanelControls } from "#/equities/Chart/ChartPanel";
```
and add `headControls={<ChartPanelControls chart={chart} />}` to the chart `Panel`:
```tsx
          <Panel
            id={CHART_PANEL}
            head={<span className={styles.regionLabel}>◈ Chart</span>}
            headControls={<ChartPanelControls chart={chart} />}
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <ChartPanel
              chart={chart}
              rates={eng.rates}
              prev={eng.prev}
              flash={eng.flash}
              vol={eng.vol}
              now={now}
            />
          </Panel>
```
ChartPanel's own props are unchanged. Note: the other three panels are wired in Tasks 18/20; this task touches only the chart Panel.

---

### Task 18 (EQ-2): EqBlotterPanel — split control row into `EqBlotterPanelControls`, feed via `Panel.headControls`

**Files**
- `packages/client-prototype/src/equities/Blotter/EqBlotterPanel.tsx`
- `packages/client-prototype/src/equities/Blotter/EqBlotterPanel.module.css`
- `packages/client-prototype/tests/eq-blotter.test.tsx`

**Before** (`EqBlotterPanel.tsx`)
```tsx
import type { ReactElement } from "react";

import styles from "#/equities/Blotter/EqBlotterPanel.module.css";
import { OrdersTable } from "#/equities/Blotter/OrdersTable";
import { PositionsTable } from "#/equities/Blotter/PositionsTable";
import type { EqOrder, EqPosition } from "#/equities/types";

export type EqBlotView = "orders" | "positions";

export interface EqBlotterPanelProps {
  orders: EqOrder[];
  positions: EqPosition[];
  view: EqBlotView;
  onView(view: EqBlotView): void;
  newOrderId: number | null;
}

// PROTO L626-638: the equities blotter body — an Orders/Positions tab sub-head
// with a count, then the active table. (The outer dock Panel owns maximize.)
export function EqBlotterPanel(props: EqBlotterPanelProps): ReactElement {
  const { orders, positions, view, onView, newOrderId } = props;
  const count =
    view === "orders"
      ? `${orders.length} orders`
      : `${positions.length} positions`;

  function showOrders(): void {
    onView("orders");
  }

  function showPositions(): void {
    onView("positions");
  }

  return (
    <div className={styles.body}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={styles.tab}
          data-active={String(view === "orders")}
          onClick={showOrders}
        >
          ▤ Orders
        </button>
        <button
          type="button"
          className={styles.tab}
          data-active={String(view === "positions")}
          onClick={showPositions}
        >
          ◴ Positions
        </button>
        <span className={styles.spacer} />
        <span className={styles.count}>{count}</span>
      </div>
      {view === "orders" ? (
        <OrdersTable orders={orders} newOrderId={newOrderId} />
      ) : (
        <PositionsTable positions={positions} />
      )}
    </div>
  );
}
```

**After** (`EqBlotterPanel.tsx`, full file)
```tsx
import type { ReactElement } from "react";

import styles from "#/equities/Blotter/EqBlotterPanel.module.css";
import { OrdersTable } from "#/equities/Blotter/OrdersTable";
import { PositionsTable } from "#/equities/Blotter/PositionsTable";
import type { EqOrder, EqPosition } from "#/equities/types";

export type EqBlotView = "orders" | "positions";

export interface EqBlotterPanelControlsProps {
  view: EqBlotView;
  onView(view: EqBlotView): void;
  ordersCount: number;
  positionsCount: number;
}

// PROTO L626-638: the equities blotter's control row — the Orders/Positions
// tab toggle + a live count — hoisted out of the body so the dock Panel's
// headControls renders it inline in the single head bar.
export function EqBlotterPanelControls(
  props: EqBlotterPanelControlsProps,
): ReactElement {
  const { view, onView, ordersCount, positionsCount } = props;
  const count =
    view === "orders"
      ? `${ordersCount} orders`
      : `${positionsCount} positions`;

  function showOrders(): void {
    onView("orders");
  }

  function showPositions(): void {
    onView("positions");
  }

  return (
    <div className={styles.tabs}>
      <button
        type="button"
        className={styles.tab}
        data-active={String(view === "orders")}
        onClick={showOrders}
      >
        ▤ Orders
      </button>
      <button
        type="button"
        className={styles.tab}
        data-active={String(view === "positions")}
        onClick={showPositions}
      >
        ◴ Positions
      </button>
      <span className={styles.count}>{count}</span>
    </div>
  );
}

export interface EqBlotterPanelProps {
  orders: EqOrder[];
  positions: EqPosition[];
  view: EqBlotView;
  newOrderId: number | null;
}

// PROTO L626-638: the equities blotter body — the active table. (The control
// row is EqBlotterPanelControls, rendered by the dock Panel's headControls;
// the outer dock Panel owns maximize.)
export function EqBlotterPanel(props: EqBlotterPanelProps): ReactElement {
  const { orders, positions, view, newOrderId } = props;

  return (
    <div className={styles.body}>
      {view === "orders" ? (
        <OrdersTable orders={orders} newOrderId={newOrderId} />
      ) : (
        <PositionsTable positions={positions} />
      )}
    </div>
  );
}
```

**Before** (`EqBlotterPanel.module.css`)
```css
.body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.tab {
  padding: 9px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--dim);
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.tab[data-active="true"] {
  color: var(--accent);
  background: var(--panel);
  border-bottom-color: var(--accent);
}

.spacer {
  flex: 1;
}

.count {
  margin-right: 8px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
  color: var(--faint);
}
```

**After** (`EqBlotterPanel.module.css`, full file)
```css
.body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.tab {
  padding: 9px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--dim);
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.tab[data-active="true"] {
  color: var(--accent);
  background: var(--panel);
  border-bottom-color: var(--accent);
}

.count {
  margin-left: 8px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
  color: var(--faint);
}
```

**Test** (`tests/eq-blotter.test.tsx`, full file — replaces existing)
```tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { EqBlotView } from "#/equities/Blotter/EqBlotterPanel";
import {
  EqBlotterPanel,
  EqBlotterPanelControls,
} from "#/equities/Blotter/EqBlotterPanel";
import type { EqOrder } from "#/equities/types";

afterEach(cleanup);

const ORDERS: EqOrder[] = [
  {
    id: 5001,
    time: "09:30:01",
    sym: "AAPL",
    side: "Buy",
    type: "Market",
    qty: 100,
    price: 230,
    status: "Filled",
  },
];

describe("EqBlotterPanel", () => {
  test("shows the orders empty state, then a row, and the 7 order headers", () => {
    const { container, getByText, rerender } = render(
      <EqBlotterPanel
        orders={[]}
        positions={[]}
        view="orders"
        newOrderId={null}
      />,
    );
    expect(getByText(/No orders/)).toBeTruthy();

    rerender(
      <EqBlotterPanel
        orders={ORDERS}
        positions={[]}
        view="orders"
        newOrderId={5001}
      />,
    );
    expect(container.querySelector('[data-order-id="5001"]')).toBeTruthy();

    for (const label of [
      "Time",
      "Symbol",
      "Side",
      "Type",
      "Qty",
      "Price",
      "Status",
    ]) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  test("the positions view shows its empty state", () => {
    const { getByText } = render(
      <EqBlotterPanel
        orders={[]}
        positions={[]}
        view="positions"
        newOrderId={null}
      />,
    );
    expect(getByText(/No open positions/)).toBeTruthy();
  });
});

describe("EqBlotterPanelControls", () => {
  test("shows the live count and calls onView when a tab is clicked", () => {
    let view: EqBlotView = "orders";

    function handleView(next: EqBlotView): void {
      view = next;
    }

    const { getByText, rerender } = render(
      <EqBlotterPanelControls
        view={view}
        onView={handleView}
        ordersCount={3}
        positionsCount={2}
      />,
    );
    expect(getByText("3 orders")).toBeTruthy();

    fireEvent.click(getByText(/Positions/));
    expect(view).toBe("positions");

    rerender(
      <EqBlotterPanelControls
        view={view}
        onView={handleView}
        ordersCount={3}
        positionsCount={2}
      />,
    );
    expect(getByText("2 positions")).toBeTruthy();
  });
});
```

Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/eq-blotter.test.tsx` — expected: 3 tests pass.

**Screen wiring** (`EquitiesScreen.tsx`) — same-commit requirement: EqBlotterPanel dropped `onView`, so the screen must stop passing it or typecheck fails. Import `EqBlotterPanelControls`:
```tsx
import {
  EqBlotterPanel,
  EqBlotterPanelControls,
} from "#/equities/Blotter/EqBlotterPanel";
```
Add `headControls` to the blotter `Panel` and remove the `onView` prop from the `<EqBlotterPanel>` call:
```tsx
          <Panel
            id={EBLOT_PANEL}
            head={
              <span className={styles.regionLabel}>▤ Orders / Positions</span>
            }
            headControls={
              <EqBlotterPanelControls
                view={blotView}
                onView={setBlotView}
                ordersCount={ticket.orders.length}
                positionsCount={positions.length}
              />
            }
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <EqBlotterPanel
              orders={ticket.orders}
              positions={positions}
              view={blotView}
              newOrderId={ticket.newOrderId}
            />
          </Panel>
```

---

### Task 19 (EQ-4): `useRankGlide` — watchlist-only rank-delta glide with direction-colored highlight

> Note: knip is CI-only (not in the per-task gate), so this new hook with no consumer yet is fine on this commit; Task 20 adds its consumer.

Canonical `componentDidUpdate` (dc.html ~L879-892) plays a bouncy `translateY` glide (560ms, `cubic-bezier(.34,1.28,.5,1)`) **and** a separate direction-colored `box-shadow` highlight pulse (820ms, `ease-out`, offsets 0/0.3/1; green `rgba(43,255,179,.95)` if the row rose in rank, red `rgba(255,93,115,.95)` if it fell) whenever a watchlist row's rank changes. The generic `useFlip` (translate-only, `cubic-bezier(.22,.85,.3,1)`, 480ms, no highlight) doesn't cover this, so this is a small dedicated hook rather than widening `useFlip`.

**Files**
- `packages/client-prototype/src/equities/Watchlist/useRankGlide.ts` (new)
- `packages/client-prototype/tests/eq-rank-glide.test.ts` (new)

**Before**: no file exists.

**After** (`useRankGlide.ts`, full file)
```ts
import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";

// Watchlist-only rank glide (PROTO dc.html ~879-892): unlike the generic FLIP
// glide in useFlip.ts (translate only, keyed on DOM position deltas), a
// re-sorted watchlist row also plays a direction-colored highlight pulse —
// green if the row rose in rank, red if it fell. Rows recycle by index while
// the *data* reorders, so the glide has to be driven from rank deltas (index
// in `order` vs the previous render's index) rather than measured positions.

export type RankDirection = "rose" | "fell" | "unchanged";

const GLIDE_DUR_MS = 560;
const GLIDE_EASING = "cubic-bezier(.34,1.28,.5,1)";
const HIGHLIGHT_DUR_MS = 820;
const HIGHLIGHT_EASING = "ease-out";
const ROSE_COLOR = "rgba(43,255,179,.95)";
const FELL_COLOR = "rgba(255,93,115,.95)";
const FALLBACK_ROW_HEIGHT = 52;

// Pure so it can be exercised directly (jsdom lacks Element.animate, so the
// per-row direction — not whether WAAPI ran — is what tests pin down).
export function computeRankDirections(
  prevRank: Record<string, number> | undefined,
  order: string[],
): Record<string, RankDirection> {
  const directions: Record<string, RankDirection> = {};

  order.forEach((sym, index) => {
    const oldIndex = prevRank?.[sym];

    if (oldIndex === undefined || oldIndex === index) {
      directions[sym] = "unchanged";
    } else {
      directions[sym] = oldIndex > index ? "rose" : "fell";
    }
  });

  return directions;
}

function rowHeight(nodes: HTMLElement[]): number {
  if (nodes.length < 2) {
    return FALLBACK_ROW_HEIGHT;
  }

  const delta =
    nodes[1].getBoundingClientRect().top - nodes[0].getBoundingClientRect().top;

  return delta || FALLBACK_ROW_HEIGHT;
}

function playGlide(node: HTMLElement, dy: number): void {
  try {
    node.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: GLIDE_DUR_MS, easing: GLIDE_EASING },
    );
  } catch {
    // jsdom doesn't implement Element.animate — skip the glide (PROTO 887).
  }
}

function playHighlight(node: HTMLElement, direction: RankDirection): void {
  const color = direction === "rose" ? ROSE_COLOR : FELL_COLOR;

  try {
    node.animate(
      [
        { boxShadow: `inset 3px 0 0 ${color},0 0 0 0 ${color}`, offset: 0 },
        {
          boxShadow: `inset 3px 0 0 ${color},0 0 16px -3px ${color}`,
          offset: 0.3,
        },
        {
          boxShadow: "inset 0 0 0 0 transparent,0 0 0 0 transparent",
          offset: 1,
        },
      ],
      { duration: HIGHLIGHT_DUR_MS, easing: HIGHLIGHT_EASING },
    );
  } catch {
    // jsdom doesn't implement Element.animate — skip the highlight (PROTO 888).
  }
}

export function useRankGlide(
  rootRef: RefObject<HTMLElement | null>,
  order: string[],
  reduce = false,
): void {
  const prevRankRef = useRef<Record<string, number> | undefined>(undefined);

  useLayoutEffect(() => {
    const root = rootRef.current;

    if (root != null) {
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>("[data-watch-sym]"),
      );

      if (!reduce && prevRankRef.current != null && nodes.length > 0) {
        const directions = computeRankDirections(prevRankRef.current, order);
        const rowH = rowHeight(nodes);

        nodes.forEach((node, index) => {
          const sym = node.getAttribute("data-watch-sym");
          const oldIndex = sym == null ? undefined : prevRankRef.current?.[sym];

          if (sym != null && oldIndex !== undefined && oldIndex !== index) {
            const dy = (oldIndex - index) * rowH;
            playGlide(node, dy);
            playHighlight(node, directions[sym]);
          }
        });
      }

      const nextRank: Record<string, number> = {};
      order.forEach((sym, index) => {
        nextRank[sym] = index;
      });
      prevRankRef.current = nextRank;
    }
  });
}
```

**Test** (`eq-rank-glide.test.ts`, full file, new)
```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  computeRankDirections,
  useRankGlide,
} from "#/equities/Watchlist/useRankGlide";

afterEach(cleanup);

describe("computeRankDirections", () => {
  test("marks every row unchanged when there is no previous rank", () => {
    const directions = computeRankDirections(undefined, ["AAPL", "MSFT"]);
    expect(directions).toEqual({ AAPL: "unchanged", MSFT: "unchanged" });
  });

  test("marks a row that moved to a smaller index as rose, a larger index as fell", () => {
    const prevRank = { AAPL: 1, MSFT: 0 };
    const directions = computeRankDirections(prevRank, ["AAPL", "MSFT"]);
    expect(directions).toEqual({ AAPL: "rose", MSFT: "fell" });
  });

  test("marks a row at the same index as unchanged", () => {
    const prevRank = { AAPL: 0, MSFT: 1 };
    const directions = computeRankDirections(prevRank, ["AAPL", "MSFT"]);
    expect(directions).toEqual({ AAPL: "unchanged", MSFT: "unchanged" });
  });
});

describe("useRankGlide", () => {
  test("plays a glide + highlight pair per re-ranked row, and skips entirely under reduce", () => {
    const container = document.createElement("div");
    const nodeA = document.createElement("button");
    nodeA.setAttribute("data-watch-sym", "AAPL");
    const nodeB = document.createElement("button");
    nodeB.setAttribute("data-watch-sym", "MSFT");
    container.append(nodeA, nodeB);
    document.body.append(container);

    // jsdom doesn't implement Element.animate — stub it so vi.spyOn has a
    // real method to wrap (the hook's try/catch means it works either way).
    if (typeof Element.prototype.animate !== "function") {
      Element.prototype.animate = stubAnimate;
    }

    const animateSpy = vi.spyOn(Element.prototype, "animate");
    const rootRef = { current: container };

    const { rerender } = renderHook(
      (props: HarnessProps) => {
        useRankGlide(rootRef, props.order, props.reduce);
      },
      { initialProps: { order: ["AAPL", "MSFT"], reduce: false } },
    );

    act(() => {
      rerender({ order: ["MSFT", "AAPL"], reduce: false });
    });
    // two rows re-ranked * (glide + highlight) = 4 animate calls.
    expect(animateSpy).toHaveBeenCalledTimes(4);

    animateSpy.mockClear();
    act(() => {
      rerender({ order: ["AAPL", "MSFT"], reduce: true });
    });
    expect(animateSpy).not.toHaveBeenCalled();

    container.remove();
  });
});

interface HarnessProps {
  order: string[];
  reduce: boolean;
}

function stubAnimate(): Animation {
  return {} as unknown as Animation;
}
```

Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/eq-rank-glide.test.ts` — expected: 4 tests pass.

---

### Task 20 (EQ-3): WatchlistPanel — split control row into `WatchlistPanelControls`, fix `⊕` padding, switch to rank-glide

**Files**
- `packages/client-prototype/src/equities/Watchlist/WatchlistPanel.tsx`
- `packages/client-prototype/src/equities/Watchlist/WatchlistPanel.module.css`
- `packages/client-prototype/tests/eq-watchlist.test.tsx`

**Before** (`WatchlistPanel.tsx`, full file)
```tsx
import type { ReactElement } from "react";
import { useRef } from "react";

import type { EqSym, WlSort } from "#/equities/types";
import styles from "#/equities/Watchlist/WatchlistPanel.module.css";
import { WatchlistRow } from "#/equities/Watchlist/WatchlistRow";
import type { WatchRowVm } from "#/equities/watchlistVm";
import { useFlip } from "#/motion/useFlip";
import { usePreferences } from "#/shell/Preferences/usePreferences";

const SORT_LABEL: Record<WlSort, string> = {
  sym: "A–Z",
  chg: "% CHG",
  price: "PRICE",
};

export interface WatchlistPanelProps {
  rows: WatchRowVm[];
  wlSort: WlSort;
  onSelect(sym: EqSym): void;
  onCycleSort(): void;
}

// PROTO L670-674: the watchlist body — a control sub-head (sort-cycle + a
// decorative ⊕; the outer dock Panel owns the maximize glyph), then the rows.
// Rows glide by rank delta on re-sort (FLIP keyed on data-watch-sym), matching
// the FX live-rates / credit RFQ glide; disabled under reduced motion.
export function WatchlistPanel(props: WatchlistPanelProps): ReactElement {
  const { rows, wlSort, onSelect, onCycleSort } = props;
  const { prefs } = usePreferences();
  const listRef = useRef<HTMLDivElement | null>(null);
  const flipKey = rows
    .map((r) => {
      return r.sym;
    })
    .join(",");

  useFlip(listRef, flipKey, { reduce: prefs.reduceMotion });

  return (
    <div className={styles.body}>
      <div className={styles.controls}>
        <button type="button" className={styles.sortBtn} onClick={onCycleSort}>
          <span aria-hidden="true">⇅ </span>
          <span>{SORT_LABEL[wlSort]}</span>
        </button>
        <span className={styles.add} aria-hidden="true">
          ⊕
        </span>
      </div>
      <div className={styles.list} ref={listRef}>
        {rows.map((row) => {
          return (
            <div key={row.sym} data-flip-key={row.sym}>
              <WatchlistRow row={row} onSelect={onSelect} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**After** (`WatchlistPanel.tsx`, full file)
```tsx
import type { ReactElement } from "react";
import { useRef } from "react";

import type { EqSym, WlSort } from "#/equities/types";
import { useRankGlide } from "#/equities/Watchlist/useRankGlide";
import styles from "#/equities/Watchlist/WatchlistPanel.module.css";
import { WatchlistRow } from "#/equities/Watchlist/WatchlistRow";
import type { WatchRowVm } from "#/equities/watchlistVm";
import { usePreferences } from "#/shell/Preferences/usePreferences";

const SORT_LABEL: Record<WlSort, string> = {
  sym: "A–Z",
  chg: "% CHG",
  price: "PRICE",
};

export interface WatchlistPanelControlsProps {
  wlSort: WlSort;
  onCycleSort(): void;
}

// PROTO L670-671: the watchlist's control row — sort-cycle + a decorative ⊕
// — hoisted out of the body so the dock Panel's headControls renders it
// inline in the single head bar.
export function WatchlistPanelControls(
  props: WatchlistPanelControlsProps,
): ReactElement {
  const { wlSort, onCycleSort } = props;

  return (
    <div className={styles.controls}>
      <button type="button" className={styles.sortBtn} onClick={onCycleSort}>
        <span aria-hidden="true">⇅ </span>
        <span>{SORT_LABEL[wlSort]}</span>
      </button>
      <span className={styles.add} aria-hidden="true">
        ⊕
      </span>
    </div>
  );
}

export interface WatchlistPanelProps {
  rows: WatchRowVm[];
  onSelect(sym: EqSym): void;
}

// PROTO L672-674, L879-892: the watchlist body — the rows. (The control row
// is WatchlistPanelControls, rendered by the dock Panel's headControls.) Rows
// glide by RANK delta on re-sort with a direction-colored highlight pulse
// (green rose / red fell) — see useRankGlide; disabled under reduced motion.
export function WatchlistPanel(props: WatchlistPanelProps): ReactElement {
  const { rows, onSelect } = props;
  const { prefs } = usePreferences();
  const listRef = useRef<HTMLDivElement | null>(null);
  const order = rows.map((r) => {
    return r.sym;
  });

  useRankGlide(listRef, order, prefs.reduceMotion);

  return (
    <div className={styles.body}>
      <div className={styles.list} ref={listRef}>
        {rows.map((row) => {
          return <WatchlistRow key={row.sym} row={row} onSelect={onSelect} />;
        })}
      </div>
    </div>
  );
}
```

**Before** (`WatchlistPanel.module.css`, full file)
```css
.body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 6px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.sortBtn {
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--chip);
  color: var(--accent);
  font-family: var(--font-m, monospace);
  font-size: 8.5px;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.add {
  color: var(--faint);
  font-size: 15px;
}

.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px;
}
```

**After** (`WatchlistPanel.module.css`, full file)
```css
.body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.sortBtn {
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--chip);
  color: var(--accent);
  font-family: var(--font-m, monospace);
  font-size: 8.5px;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.add {
  padding: 0 8px;
  color: var(--faint);
  font-size: 15px;
}

.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px;
}
```

**Test** (`tests/eq-watchlist.test.tsx`, full file — replaces existing)
```tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  WatchlistPanel,
  WatchlistPanelControls,
} from "#/equities/Watchlist/WatchlistPanel";
import type { WatchRowVm } from "#/equities/watchlistVm";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(cleanup);

const ROWS: WatchRowVm[] = [
  {
    sym: "AAPL",
    name: "Apple Inc",
    last: "229.35",
    chg: "+0.50%",
    up: true,
    selected: true,
    flashOn: false,
  },
  {
    sym: "MSFT",
    name: "Microsoft Corp",
    last: "467.12",
    chg: "-0.20%",
    up: false,
    selected: false,
    flashOn: false,
  },
];

describe("WatchlistPanel", () => {
  test("renders a row per symbol and marks the selected one", () => {
    const { container } = render(
      <PreferencesProvider>
        <WatchlistPanel rows={ROWS} onSelect={noop} />
      </PreferencesProvider>,
    );
    expect(container.querySelectorAll("[data-watch-sym]")).toHaveLength(2);
    expect(
      container
        .querySelector('[data-watch-sym="AAPL"]')
        ?.getAttribute("data-selected"),
    ).toBe("true");
  });
});

describe("WatchlistPanelControls", () => {
  test("shows the sort label and cycles sort on click", () => {
    let clicks = 0;

    function handleCycle(): void {
      clicks += 1;
    }

    const { getByText } = render(
      <WatchlistPanelControls wlSort="chg" onCycleSort={handleCycle} />,
    );
    expect(getByText("% CHG")).toBeTruthy();

    fireEvent.click(getByText("% CHG"));
    expect(clicks).toBe(1);
  });
});

function noop(): void {}
```

Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/eq-watchlist.test.tsx` — expected: 2 tests pass.

**Screen wiring** (`EquitiesScreen.tsx`) — same-commit requirement: WatchlistPanel dropped `wlSort`/`onCycleSort`. Import `WatchlistPanelControls`:
```tsx
import {
  WatchlistPanel,
  WatchlistPanelControls,
} from "#/equities/Watchlist/WatchlistPanel";
```
Add `headControls` to the watchlist `Panel` and simplify the `<WatchlistPanel>` call to exactly `<WatchlistPanel rows={rows} onSelect={chart.selectEq} />`:
```tsx
              <Panel
                id={WATCH_PANEL}
                head={<span className={styles.regionLabel}>☰ Watchlist</span>}
                headControls={
                  <WatchlistPanelControls
                    wlSort={chart.wlSort}
                    onCycleSort={chart.cycleWlSort}
                  />
                }
                maxPanel={dock.maxPanel}
                onToggleMax={dock.toggleMax}
              >
                <WatchlistPanel rows={rows} onSelect={chart.selectEq} />
              </Panel>
```

**Test** (`tests/equities-screen.test.tsx`, full file — folds in EQ-5's head-count regression test, with a robust maximize-button assertion in place of the fragile `[class*="head"]` count):
```tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EquitiesScreen } from "#/equities/EquitiesScreen";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe("EquitiesScreen", () => {
  test("composes the four panels", () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId("equities-screen")).toBeTruthy();
  });

  test("submitting from the ticket books an order row", () => {
    const { container, getByText } = renderScreen();
    fireEvent.click(getByText(/BUY AAPL/));
    expect(container.querySelector('[data-order-id="5001"]')).toBeTruthy();
  });

  test("each dock panel renders exactly one head bar, with its controls inline", () => {
    const { getAllByRole, getByText } = renderScreen();
    // four panels ⇒ four maximize buttons ⇒ one head bar each.
    expect(getAllByRole("button", { name: /maximize/i })).toHaveLength(4);
    // the watchlist sort control now lives in that single bar.
    fireEvent.click(getByText("% CHG"));
    expect(getByText("PRICE")).toBeTruthy();
  });
});

function renderScreen(): ReturnType<typeof render> {
  return render(
    <PreferencesProvider>
      <EquitiesScreen />
    </PreferencesProvider>,
  );
}
```

Run: `pnpm --filter @rtc/client-prototype exec vitest run tests/equities-screen.test.tsx` — expected: 3 tests pass.

---

### Task 21 (AD-1): Add neon glow to service-health utilization bars

**Files**
- `packages/client-prototype/src/admin/Services/ServiceHealth.module.css` (edit)
- `packages/client-prototype/tests/admin-services.test.tsx` (edit — add test)

No `.tsx` changes needed: `ServiceRow.tsx` already puts `data-status={service.status}` on `.row` and renders `.fill` as its descendant (`.row > .track > .fill`), so the existing `.row[data-status="..."] .fill { ... }` descendant selectors already reach the fill element — the fix is CSS-only.

**Before** (`packages/client-prototype/src/admin/Services/ServiceHealth.module.css`, lines 67-93)
```css
.row[data-status="ONLINE"] .dot,
.row[data-status="ONLINE"] .fill,
.row[data-status="ONLINE"] .up {
  color: var(--buy);
  background: var(--buy);
}

.row[data-status="DEGRADED"] .dot,
.row[data-status="DEGRADED"] .fill,
.row[data-status="DEGRADED"] .up {
  color: var(--accent);
  background: var(--accent);
}

.row[data-status="ONLINE"] .dot {
  box-shadow: 0 0 8px var(--buy);
}

.row[data-status="DEGRADED"] .dot {
  box-shadow: 0 0 8px var(--accent);
}

.row[data-status="ONLINE"] .up,
.row[data-status="DEGRADED"] .up {
  background: none;
}
```

**After**
```css
.row[data-status="ONLINE"] .dot,
.row[data-status="ONLINE"] .fill,
.row[data-status="ONLINE"] .up {
  color: var(--buy);
  background: var(--buy);
}

.row[data-status="DEGRADED"] .dot,
.row[data-status="DEGRADED"] .fill,
.row[data-status="DEGRADED"] .up {
  color: var(--accent);
  background: var(--accent);
}

.row[data-status="ONLINE"] .dot,
.row[data-status="ONLINE"] .fill {
  box-shadow: 0 0 8px var(--buy);
}

.row[data-status="DEGRADED"] .dot,
.row[data-status="DEGRADED"] .fill {
  box-shadow: 0 0 8px var(--accent);
}

.row[data-status="ONLINE"] .up,
.row[data-status="DEGRADED"] .up {
  background: none;
}
```

Rationale: mirrors dc.html ~L1384 `services[].barStyle` (`boxShadow:'0 0 8px '+color`, ONLINE=`var(--buy)`, DEGRADED=`var(--accent)`) — the fill's own box-shadow, not just the dot's, matching every other utilisation/throughput/latency bar in the app.

**Test** — extend the existing sibling admin test with a data-attr wiring assertion (box-shadow itself is jsdom-invisible; the actual glow is confirmed by the opus paint-review + a live browser check, not this test).

Full file `packages/client-prototype/tests/admin-services.test.tsx`:
```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ServiceHealth } from "#/admin/Services/ServiceHealth";
import type { Service } from "#/admin/types";

afterEach(cleanup);

const SERVICES: Service[] = [
  {
    name: "PRICING ENGINE",
    status: "ONLINE",
    up: "99.99%",
    lat: "8ms",
    barPct: 13.3,
  },
  {
    name: "REFERENCE DATA",
    status: "DEGRADED",
    up: "99.40%",
    lat: "48ms",
    barPct: 80,
  },
];

describe("ServiceHealth", () => {
  test("renders the heading and a row per service with status data attribute", () => {
    const { getByText, container } = render(
      <ServiceHealth services={SERVICES} />,
    );
    expect(getByText("SERVICE HEALTH")).toBeTruthy();
    expect(getByText("REFERENCE DATA")).toBeTruthy();
    expect(container.querySelector('[data-status="DEGRADED"]')).toBeTruthy();
    expect(container.querySelectorAll("[data-status]")).toHaveLength(2);
  });

  test("nests each row's utilisation fill under the row's status data attribute so the CSS glow rule can target it", () => {
    // The box-shadow glow itself is a paint property jsdom cannot observe;
    // this pins the data-attr wiring the `.row[data-status="..."] .fill`
    // descendant selectors depend on. Actual glow: opus paint-review + live browser.
    const { container } = render(<ServiceHealth services={SERVICES} />);

    const onlineRow = container.querySelector('[data-status="ONLINE"]');
    const degradedRow = container.querySelector('[data-status="DEGRADED"]');

    const onlineFill = onlineRow?.querySelector('[style*="--bar-pct"]');
    const degradedFill = degradedRow?.querySelector('[style*="--bar-pct"]');

    expect(onlineFill).toBeTruthy();
    expect(degradedFill).toBeTruthy();
  });
});
```

Run:
```
pnpm --filter @rtc/client-prototype exec vitest run tests/admin-services.test.tsx
```
Expected: `admin-services.test.tsx` — 2 passed, 0 failed.

---

### Task 22: Boot wordmark + subtitle (apply existing bootGlitch)

**Files:**
- Modify: `packages/client-prototype/src/shell/Boot/BootSequence.tsx`
- Modify: `packages/client-prototype/src/shell/Boot/BootSequence.module.css`
- Test: `packages/client-prototype/tests/boot.test.tsx` (add a case)

**Interfaces:** none consumed downstream. Reuses `@keyframes bootGlitch` (already in `global.css:175`).

- [ ] **Step 1: Add failing test:**
```tsx
test("Boot shows the branded wordmark and subtitle", () => {
  render(
    <ThemeProvider>
      <BootSequence onDone={vi.fn()} />
    </ThemeProvider>,
  );
  expect(screen.getByText("REACTIVE TRADER")).toBeTruthy();
  expect(
    screen.getByText("TACTICAL TRADING OPERATING SYSTEM · v4.0"),
  ).toBeTruthy();
});
```
(add `cleanup` in an `afterEach` if not already present in this file — boot.test.tsx currently has none, so add `import { afterEach } from "vitest"` + `afterEach(cleanup)`.)

- [ ] **Step 2: Run — expect FAIL** (no wordmark).

- [ ] **Step 3: Add the wordmark block above the canvas in `BootSequence.tsx`** (inside `.boot`, before `<canvas>`):
```tsx
      <div className={styles.brand}>
        <div className={styles.wordmark}>REACTIVE TRADER</div>
        <div className={styles.subtitle}>
          TACTICAL TRADING OPERATING SYSTEM · v4.0
        </div>
      </div>
```

- [ ] **Step 4: Add CSS to `BootSequence.module.css`** (mirrors dc.html:69-70):
```css
.brand {
  text-align: center;
  margin-bottom: 22px;
}

.wordmark {
  font-family: "Orbitron", sans-serif;
  font-weight: 900;
  font-size: 30px;
  letter-spacing: 0.42em;
  color: var(--accent);
  text-shadow: 0 0 26px var(--accent);
  animation: bootGlitch 2.4s infinite;
}

.subtitle {
  margin-top: 10px;
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  letter-spacing: 0.6em;
  color: var(--dim);
}
```

- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Commit** `feat(client-prototype): P6 — boot wordmark + subtitle`

---

### Task 23: App overlay rework — persistent AppShell, Boot/Lock overlays (state preserved)

**Files:**
- Modify: `packages/client-prototype/src/App.tsx`
- Test: `packages/client-prototype/tests/app.test.tsx` (add a case)

**Interfaces:** Consumes `AppShell` (unchanged props), `BootSequence`, `LockScreen`.
Produces: `AppShell` stays mounted for the whole session; Boot/Lock render as overlays on top.

- [ ] **Step 1: Add failing test** (state-preservation proof — AppShell is not unmounted during reboot):
```tsx
test("reboot overlays the boot screen without unmounting the shell", () => {
  render(<App />);
  fireEvent.click(screen.getByTestId("boot-skip"));
  expect(screen.getByTestId("app-shell")).toBeDefined();

  fireEvent.click(screen.getByLabelText("Reboot HUD"));
  // boot overlay is back AND the shell is still mounted underneath
  expect(screen.getByTestId("boot-skip")).toBeDefined();
  expect(screen.getByTestId("app-shell")).toBeDefined();
});
```
(Confirm the Header's reboot control's accessible name during implementation — `Header.tsx`; adjust the label matcher to the real one. If it is an icon button, use its `aria-label`/`title`.)

- [ ] **Step 2: Run — expect FAIL** (current App unmounts AppShell when `!booted`).

- [ ] **Step 3: Rewrite `App.tsx`** so AppShell is always rendered and Boot/Lock overlay it:
```tsx
import type { ReactElement } from "react";
import { useState } from "react";

import { AppShell } from "#/shell/AppShell";
import { BootSequence } from "#/shell/Boot/BootSequence";
import type { Tab } from "#/shell/Header/useMenus";
import { LockScreen } from "#/shell/LockScreen/LockScreen";
import { PreferencesModal } from "#/shell/Preferences/PreferencesModal";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";
import { ThemeProvider } from "#/theme/ThemeProvider";

export function App(): ReactElement {
  const [booted, setBooted] = useState(false);
  const [tab, setTab] = useState<Tab>("fx");
  const [lang, setLang] = useState("EN");
  const [loggedOut, setLoggedOut] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  return (
    <ThemeProvider>
      <PreferencesProvider>
        <AppShell
          tab={tab}
          onSelectTab={setTab}
          lang={lang}
          onSelectLang={setLang}
          onOpenPrefs={() => {
            setPrefsOpen(true);
          }}
          onReboot={() => {
            setBooted(false);
          }}
          onLogout={() => {
            setLoggedOut(true);
          }}
        />
        {prefsOpen ? (
          <PreferencesModal
            onClose={() => {
              setPrefsOpen(false);
            }}
          />
        ) : null}
        {loggedOut ? (
          <LockScreen
            onAuthenticate={() => {
              setLoggedOut(false);
            }}
          />
        ) : null}
        {!booted ? (
          <BootSequence
            onDone={() => {
              setBooted(true);
            }}
          />
        ) : null}
      </PreferencesProvider>
    </ThemeProvider>
  );
}
```
Notes: `BootSequence` (`.boot`) and `LockScreen` are already `position:fixed` with a high `z-index`, so they overlay the shell without extra layout. `ThemeProvider`/`PreferencesProvider` now wrap the whole session (previously boot rendered under a bare `ThemeProvider` — theme still applies during boot). Screen-local state in FX/Credit/Equities/Admin now survives reboot and sign-out because `AppShell` never unmounts.

- [ ] **Step 4: Run — expect PASS** (app.test.tsx existing cases still pass: boot overlay is present at mount, skip removes it, shell reachable).
- [ ] **Step 5: Commit** `feat(client-prototype): P6 — overlay Boot/Lock over a persistent AppShell (preserve screen state)`

---

### Task 24: Boot fade-out + appReveal entrance

**Files:**
- Modify: `packages/client-prototype/src/shell/Boot/useBootSequence.ts`
- Modify: `packages/client-prototype/src/shell/Boot/BootSequence.tsx`
- Modify: `packages/client-prototype/src/shell/Boot/BootSequence.module.css`
- Modify: `packages/client-prototype/src/shell/AppShell.module.css`
- Test: `packages/client-prototype/tests/boot.test.tsx` (add a case, fake timers)

**Interfaces:** Consumes `BootState` (adds `fading: boolean`). Reuses `@keyframes appReveal` (already in `global.css:237`).

- [ ] **Step 1: Add failing test** (onDone deferred by the fade, not fired instantly on 100%/skip):
```tsx
test("Skip triggers the fade then fires onDone after the fade window", () => {
  vi.useFakeTimers();
  const onDone = vi.fn();
  render(
    <ThemeProvider>
      <BootSequence onDone={onDone} />
    </ThemeProvider>,
  );
  act(() => {
    screen.getByTestId("boot-skip").click();
  });
  // fade started, onDone NOT yet called
  expect(onDone).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(900);
  });
  expect(onDone).toHaveBeenCalledOnce();
  vi.useRealTimers();
});
```
(Update the existing "fires onDone when skipped" test to advance timers, since onDone is now deferred — or fold both into this one.)

- [ ] **Step 2: Run — expect FAIL** (onDone currently fires synchronously on skip).

- [ ] **Step 3: Edit `useBootSequence.ts`** — add a `fading` state; `finish()` sets `fading` then defers `onDone` by ~800ms; expose `fading`:
```ts
export interface BootState {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  pct: number;
  lines: string[];
  variant: BootVariant;
  fading: boolean;
  skip(): void;
}
```
In the hook body add `const [fading, setFading] = useState(false);` and a fade-timer ref `const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);`. Rework `finish`:
```ts
  const finish = useCallback(() => {
    if (doneRef.current) {
      return;
    }
    doneRef.current = true;
    setPct(100);
    setFading(true);
    fadeTimerRef.current = setTimeout(() => {
      onDone();
    }, 800);
  }, [onDone]);
```
Clear the fade timer in the effect cleanup (`return () => { cancelAnimationFrame(raf); if (fadeTimerRef.current != null) clearTimeout(fadeTimerRef.current); };`). Return `fading` in the state object. (The reduced-motion branch also calls `finish()`, so it fades too; keep it.)

- [ ] **Step 4: Edit `BootSequence.tsx`** — apply a `data-fading` attribute to `.boot`:
```tsx
  return (
    <div className={styles.boot} data-fading={String(boot.fading)}>
```

- [ ] **Step 5: Edit `BootSequence.module.css`** — add the fade transition (mirrors dc.html:1203):
```css
.boot {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  z-index: 100;
  transition:
    opacity 0.72s ease,
    transform 0.72s ease,
    filter 0.72s ease;
}

.boot[data-fading="true"] {
  opacity: 0;
  transform: scale(1.05);
  filter: blur(7px);
  pointer-events: none;
}
```

- [ ] **Step 6: Edit `AppShell.module.css`** — apply `appReveal` to `.shell`:
```css
.shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-d, sans-serif);
  isolation: isolate;
  animation: appReveal 0.8s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
```

- [ ] **Step 7: Run — expect PASS.**
- [ ] **Step 8: Commit** `feat(client-prototype): P6 — boot fade-out (bootFading) + appReveal entrance`

---

### Task 25: Final compliance sweep + live browser side-by-side

**Files:** none (verification + optional knip cleanup commit only).

- [ ] Run the full per-task gate across the package: `pnpm --filter @rtc/client-prototype typecheck` · `test` · `pnpm exec eslint packages/client-prototype` · `pnpm exec stylelint "packages/client-prototype/src/**/*.css"` · `pnpm exec biome ci packages/client-prototype`. All green.
- [ ] Run the repo-wide CI-only gates: `pnpm lint:dead` (knip) · `pnpm check:deps` · `pnpm check:versions` · `pnpm test:rules`. Fix any knip dead-export findings by dropping `export` on any type introduced this phase that is referenced only within its own module (e.g. check `RankDirection`, `EqBlotView`, and the new `*ControlsProps` interfaces). Re-run until green.
- [ ] Run the full suite: `pnpm --filter @rtc/client-prototype test` — all green.
- [ ] **Live browser side-by-side** (manual, phase-scoped — the package has no permanent visual-golden tier): `pnpm --filter @rtc/client-prototype dev`, then across at least two themes (e.g. Holo dark + Neon) visually confirm against `docs/design/v2/dev-handoff/prototype/Reactive Trader.html`:
  - [ ] (a) display fonts actually render — Orbitron wordmark, Chakra Petch headings, JetBrains Mono numerals (not system fallback);
  - [ ] (b) boot wordmark + glitch, boot→app fade, and the `appReveal` entrance;
  - [ ] (c) exactly one head bar per panel, with a pill label + `⛶`/`⧉` maximize glyph;
  - [ ] (d) FX: `bookPulse` glow on a booked tile, pip-flash colour follows the tick, no negative pip sign, `N trades` count;
  - [ ] (e) Credit: a live RFQ fades out on resolve, tab-switch stagger cascade, `LIVE (n)`;
  - [ ] (f) Equities: watchlist rank-glide coloured highlight;
  - [ ] (g) Admin: service-health bars glow.
- [ ] Commit **only if** knip fixes were needed: `git add <exact files> && git commit -m "chore(client-prototype): P6 — final compliance sweep (knip)"`. Otherwise no commit.
