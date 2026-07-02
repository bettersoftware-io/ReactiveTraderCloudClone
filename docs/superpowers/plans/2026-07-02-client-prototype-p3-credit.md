# Client-Prototype P3 — Credit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the v2 prototype's Credit screen — New RFQ form, live streaming dealer quotes (accept/cancel/expire, FLIP glide), and a static Credit Blotter with CSV — into `@rtc/client-prototype`, and extract the shared dock primitives P2 deferred.

**Architecture:** Task 1 extracts the generic split/maximize/Panel/CSV primitives out of `fx/layout/` into a shared top-level `src/layout/` (+ `src/csvExport.ts`), consumed by both FX and Credit. Then a new self-contained `src/credit/` feature folder: dumb CSS-Modules components + co-located mock hooks (`useCreditForm`, the `useCreditRfqs` streaming engine, `useCreditDock`) + seed data, mirroring P2's `src/fx/`. `AppShell` swaps the `credit` placeholder for `<CreditScreen />`.

**Tech Stack:** React 19, TypeScript (strict), Vite, Vitest + @testing-library/react (smoke-only), CSS Modules, native WAAPI (`useFlip`), `#/` subpath imports.

**Spec:** `docs/superpowers/specs/2026-07-02-client-prototype-p3-credit.md`
**Prototype source of truth:** `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html` — Credit markup L531–597; logic `sendRfq` L1169, `acceptQuote` L1170, `cancelRfq` L1171, `removeRfq` L1172, `_checkExpiries` L1173, `_seedRfq` L835, credit VM builders L1314–1332, seeds L757–762 / L820–822.

## Global Constraints

- Package `@rtc/client-prototype` only. **No** `@rtc/domain`/`@rtc/shared`, no RxJS/machines, no `ViewModel` seam, no React Compiler.
- **Feature folders never import across each other:** `credit/` must not import from `fx/`, and vice-versa. Shared code lives in `src/layout/`, `src/motion/`, `src/mock/`, or `src/csvExport.ts`.
- Full CSS Modules; **zero** `style={{…}}` object literals. Runtime-varying geometry uses a **named-const** `style={x}` object typed `as CSSProperties` setting only a `--custom-property` (the ESLint inline-style ban matches object literals only, not variable refs — no `eslint-disable` needed). Semantic state → `data-*` attributes (never inline color strings). Static → class.
- `#/` subpath imports only; no `../../` (≥2-up) relative imports.
- Test conventions: `@testing-library/react`; explicit `cleanup()` in `afterEach` (and `vi.useRealTimers()` in `afterEach` when a test used fake timers); `arrow-body-style: always` (every arrow — including `.map`/`.find`/`rng: () => {…}` callbacks — uses a block body with `return`); named `interface`s (no inline object types in signatures); `rtc/newspaper-order` (in test files, helpers/types sit **below** the `describe`); `rtc/component-newspaper` (a file's exported component is the lede; any private subcomponent sits below it; filename matches the exported component). Module-level functions are `function` declarations (`func-style`).
- `useUniqueElementIds`: any real DOM/SVG `id` uses `useId()`; a logical panel-id string literal passed as a prop uses a **named `const`** (not a bare `id="…"` literal) — see the `TILES_PANEL` precedent in `FxScreen.tsx`. `useExplicitType`: a `const` whose initializer is not literal-inferrable (e.g. a `.length` member expression) gets an explicit type annotation.
- All PROTO values (seed arrays, thresholds, delays, formulas) are used **verbatim** as given below.
- **Per-task gate (run ALL, must be green before commit):**
  ```
  pnpm --filter @rtc/client-prototype typecheck
  pnpm --filter @rtc/client-prototype test
  pnpm exec eslint packages/client-prototype
  pnpm exec stylelint "packages/client-prototype/src/**/*.css"
  pnpm exec biome ci packages/client-prototype
  ```
  The **`biome ci`** step (format **+** lint) is mandatory — the P2.5 lesson: eslint alone misses Biome format diffs, `useUniqueElementIds`, and `useExplicitType`. Run `pnpm exec biome check --write packages/client-prototype` to auto-fix format before the gate. Single-file test run: `pnpm --filter @rtc/client-prototype exec vitest run <name>` (the bare `test <name>` form mis-filters to 0 tests).
- CI also runs repo-wide `pnpm lint:dead` (knip), `pnpm check:deps`, `pnpm check:versions`, `pnpm test:rules` — keep every `export` consumed (drop `export` on types used only within their own file), and paths clean.
- **Never `git add .`** — stage only the exact files each task names (never `.superpowers/`, `.idea/`, `.env.local`, or scratch).

---

## File Structure

**Extracted shared (Task 1):**
- `src/layout/useSplit.ts` — moved verbatim from `fx/layout/useSplit.ts`.
- `src/layout/SplitHandle.tsx` + `.module.css` — moved verbatim.
- `src/layout/Panel.tsx` + `.module.css` — moved; `id` typed `string` (generic), keeps `headAccessory`.
- `src/layout/useMaxPanel.ts` — **new** generic maximize toggle + persist.
- `src/csvExport.ts` — moved from `fx/csvExport.ts`.
- `src/fx/layout/useDockState.ts` — keeps `asideCollapsed`; `maxPanel` now delegates to `useMaxPanel`.

**New Credit feature (`src/credit/`, Tasks 2–8):**
- `types.ts` — `Dir`, `QuoteState`, `RfqState`, `CreditTab`, `Instrument`, `Dealer`, `Quote`, `Rfq`, `CreditTrade`.
- `creditData.ts` — `DEALERS`(9), `INSTRUMENTS`(8), `SEED_RFQS`(2), `SEED_TRADES`(2), `RFQ_SEQ_START`, `RFQ_EXPIRY_SECS`, local `fmtNum`/`parseNotional`/`fmtDate`.
- `useCreditForm.ts` — form state + validity + clear.
- `useCreditRfqs.ts` — the streaming engine (state + 400ms `now`/expiry tick + `sendRfq`/`acceptQuote`/`cancelRfq`/`removeRfq`).
- `rfqCardVm.ts` — pure per-card view-model builder (secs/pct, best price, quote display, state label).
- `useCreditDock.ts` — `maxPanel` (via `useMaxPanel`) + derived `leftCollapsed`.
- `CreditScreen.tsx` + `.module.css` — composes the dock.
- `NewRfq/NewRfqPanel.tsx` `InstrumentSelect.tsx` `DealerChecklist.tsx` (+ `.module.css` each).
- `Rfqs/RfqsPanel.tsx` `RfqCard.tsx` `QuoteRow.tsx` `EmptyRfqs.tsx` (+ `.module.css`).
- `Blotter/CreditBlotterPanel.tsx` (+ `.module.css`).

**Shell wiring (Task 9):** `src/shell/AppShell.tsx`.

---

## Task 1: Extract shared dock primitives (`src/layout/` + `src/csvExport.ts`)

Pure move + generalize. **No behavior change** — the deliverable is verified by the *existing* FX + shell suites and typecheck staying green.

**Files:**
- Create (git-move bodies verbatim): `src/layout/useSplit.ts`, `src/layout/SplitHandle.tsx`, `src/layout/SplitHandle.module.css`, `src/layout/Panel.tsx`, `src/layout/Panel.module.css`, `src/csvExport.ts`.
- Create: `src/layout/useMaxPanel.ts`.
- Delete: `src/fx/layout/useSplit.ts`, `src/fx/layout/SplitHandle.tsx` (+ css), `src/fx/layout/Panel.tsx` (+ css), `src/fx/csvExport.ts`.
- Modify: `src/fx/layout/useDockState.ts`, `src/fx/FxScreen.tsx`, `src/fx/useFxBlotter.ts`, `src/fx/Blotter/FxBlotterPanel.tsx` (any `#/fx/layout/…` or `#/fx/csvExport` import), and the moved files' own internal `import styles from "#/fx/layout/…"` lines.
- Test (regression guard, edit import path): `tests/fx-split.test.ts` (`#/fx/layout/useSplit` → `#/layout/useSplit`).

**Interfaces:**
- Produces (unchanged signatures, new paths):
  - `#/layout/useSplit` → `useSplit(opts: UseSplitOptions): SplitApi` (verbatim).
  - `#/layout/SplitHandle` → `SplitHandle(props: { api: SplitApi }): ReactElement`; its `import type { SplitApi }` now from `#/layout/useSplit`.
  - `#/layout/Panel` → `Panel(props: PanelProps): ReactElement` with `PanelProps.id: string` (was `PanelId`). Keeps `head`, `children`, `maxPanel: string | null`, `onToggleMax(id: string): void`, `headAccessory?`.
  - `#/csvExport` → `toCsv(headers, rows): string`, `downloadCsv(filename, csv): void` (verbatim).
  - `#/layout/useMaxPanel` → new (below).
- `#/fx/layout/useDockState` keeps `useDockState(): DockApi` and its `PanelId` union export unchanged; internally it now builds `maxPanel/toggleMax` from `useMaxPanel`.

- [ ] **Step 1: Move the four primitives + csvExport, generalize `Panel`.**

Use `git mv` to preserve history, then fix internal imports:
```bash
cd packages/client-prototype
git mv src/fx/layout/useSplit.ts        src/layout/useSplit.ts
git mv src/fx/layout/SplitHandle.tsx    src/layout/SplitHandle.tsx
git mv src/fx/layout/SplitHandle.module.css src/layout/SplitHandle.module.css
git mv src/fx/layout/Panel.tsx          src/layout/Panel.tsx
git mv src/fx/layout/Panel.module.css   src/layout/Panel.module.css
git mv src/fx/csvExport.ts              src/csvExport.ts
```
Then:
- In `src/layout/SplitHandle.tsx`: `import styles from "#/layout/SplitHandle.module.css";` and `import type { SplitApi } from "#/layout/useSplit";`.
- In `src/layout/Panel.tsx`: `import styles from "#/layout/Panel.module.css";`; **remove** `import type { PanelId } from "#/fx/layout/useDockState";`; change the prop types so `id: string`, `maxPanel: string | null`, `onToggleMax(id: string): void`. The body compares `maxPanel === id` (already string-safe).

- [ ] **Step 2: Add `src/layout/useMaxPanel.ts`.**

```ts
import { useCallback, useEffect, useState } from "react";

// Generic single-panel maximize toggle + localStorage persistence, lifted out
// of FX's useDockState (PROTO 1123 toggleMax) so both the FX and Credit docks
// share one implementation. `valid` is the set of panel ids a given dock
// recognizes — a persisted id outside it is ignored on read.
export interface MaxPanelApi<T extends string> {
  maxPanel: T | null;
  toggleMax(id: T): void;
}

export function useMaxPanel<T extends string>(
  storageKey: string,
  valid: readonly T[],
): MaxPanelApi<T> {
  const [maxPanel, setMaxPanel] = useState<T | null>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored != null && (valid as readonly string[]).includes(stored)
      ? (stored as T)
      : null;
  });

  const toggleMax = useCallback((id: T) => {
    setMaxPanel((prev) => {
      return prev === id ? null : id;
    });
  }, []);

  // Persistence lives outside the updater: StrictMode may run a functional
  // updater twice per commit, and updaters must stay pure.
  useEffect(() => {
    if (maxPanel == null) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, maxPanel);
    }
  }, [maxPanel, storageKey]);

  return { maxPanel, toggleMax };
}
```

- [ ] **Step 3: Slim `src/fx/layout/useDockState.ts` onto `useMaxPanel`.**

Keep the `PanelId` type, the `ASIDE_COLLAPSED_KEY`, `asideCollapsed`/`toggleAside` exactly as they are. Replace the `maxPanel` state + `readMaxPanel` + `toggleMax` + the `maxPanel` persistence effect with:
```ts
import { useCallback, useEffect, useState } from "react";

import { useMaxPanel } from "#/layout/useMaxPanel";

export type PanelId = "tiles" | "fxblot" | "ana" | "pos";

export interface DockApi {
  maxPanel: PanelId | null;
  asideCollapsed: boolean;
  toggleMax(id: PanelId): void;
  toggleAside(): void;
}

const ASIDE_COLLAPSED_KEY = "rt_dock_asideCollapsed";
const PANEL_IDS: readonly PanelId[] = ["tiles", "fxblot", "ana", "pos"];

function readAsideCollapsed(): boolean {
  return localStorage.getItem(ASIDE_COLLAPSED_KEY) === "true";
}

export function useDockState(): DockApi {
  const { maxPanel, toggleMax } = useMaxPanel<PanelId>(
    "rt_dock_maxPanel",
    PANEL_IDS,
  );
  const [asideCollapsed, setAsideCollapsed] =
    useState<boolean>(readAsideCollapsed);

  const toggleAside = useCallback(() => {
    setAsideCollapsed((prev) => {
      return !prev;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(ASIDE_COLLAPSED_KEY, String(asideCollapsed));
  }, [asideCollapsed]);

  return { maxPanel, asideCollapsed, toggleMax, toggleAside };
}
```
(The `MAX_PANEL_KEY` string `"rt_dock_maxPanel"` is preserved so FX's persisted maximize survives.)

- [ ] **Step 4: Repoint FX imports.** In `src/fx/FxScreen.tsx`, `src/fx/useFxBlotter.ts`, `src/fx/Blotter/FxBlotterPanel.tsx` (and any other file grep finds), change:
  - `#/fx/layout/Panel` → `#/layout/Panel`
  - `#/fx/layout/SplitHandle` → `#/layout/SplitHandle`
  - `#/fx/layout/useSplit` → `#/layout/useSplit`
  - `#/fx/csvExport` → `#/csvExport`
  Leave `#/fx/layout/useDockState` imports as-is. Verify with:
  ```bash
  grep -rn "fx/layout/Panel\|fx/layout/SplitHandle\|fx/layout/useSplit\|fx/csvExport" packages/client-prototype/src packages/client-prototype/tests
  ```
  Expected: no matches.

- [ ] **Step 5: Repoint the split test.** In `tests/fx-split.test.ts`, `#/fx/layout/useSplit` → `#/layout/useSplit`.

- [ ] **Step 6: Full gate + whole existing suite.** Run the per-task gate. The **entire existing FX + shell suite must stay green** (the move is behavior-identical; this is the regression proof). Also run `pnpm --filter @rtc/client-prototype exec knip` if available, else rely on CI. Expected: all green, no unused-export or dep-cruise warnings from the moved files.

- [ ] **Step 7: Commit** — `refactor(client-prototype): extract shared dock primitives to src/layout` (stage the moved files, `src/layout/useMaxPanel.ts`, `src/csvExport.ts`, edited fx files, and `tests/fx-split.test.ts`).

---

## Task 2: Credit types + seed data

**Files:**
- Create: `src/credit/types.ts`, `src/credit/creditData.ts`
- Test: `tests/credit-data.test.ts`

**Interfaces:**
- Produces `#/credit/types`:
  ```ts
  export type Dir = "Buy" | "Sell";
  export type QuoteState = "pending" | "priced" | "passed" | "accepted";
  export type RfqState = "Open" | "Closed" | "Cancelled" | "Expired";
  export type CreditTab = "live" | "closed" | "all";
  export interface Instrument { id: number; ticker: string; name: string; cusip: string; ref: number; }
  export interface Dealer { id: number; name: string; }
  export interface Quote { dealerId: number; state: QuoteState; price: number | null; }
  export interface Rfq {
    id: number; state: RfqState; dir: Dir; instrumentId: number; qty: number;
    dealerIds: number[]; quotes: Quote[]; acceptedDealerId: number | null;
    createdAt: number; expirySecs: number; exitAt?: number;
  }
  export interface CreditTrade {
    id: number; status: string; date: string; dir: Dir; cp: string;
    cusip: string; sec: string; qty: string; ot: string; price: string;
  }
  ```
- Produces `#/credit/creditData`: `DEALERS`, `INSTRUMENTS`, `SEED_RFQS`, `SEED_TRADES`, `RFQ_SEQ_START = 700`, `RFQ_EXPIRY_SECS = 120`, `fmtNum(n): string`, `parseNotional(s): number`, `fmtDate(offsetDays): string`.

- [ ] **Step 1: Write the failing test** — `tests/credit-data.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  DEALERS,
  fmtNum,
  INSTRUMENTS,
  parseNotional,
  RFQ_SEQ_START,
  SEED_RFQS,
  SEED_TRADES,
} from "#/credit/creditData";

describe("creditData seeds", () => {
  test("9 dealers, house dealer id 1 is Adaptive Bank", () => {
    expect(DEALERS).toHaveLength(9);
    expect(DEALERS[0]).toEqual({ id: 1, name: "Adaptive Bank" });
  });

  test("8 instruments with cusip + ref price", () => {
    expect(INSTRUMENTS).toHaveLength(8);
    const msft = INSTRUMENTS.find((i) => {
      return i.ticker === "MSFT 3.3 02/27";
    });
    expect(msft?.cusip).toBe("594918BV5");
    expect(msft?.ref).toBe(99.8);
  });

  test("seeds two RFQs (Closed 238, Cancelled 237) and two trades", () => {
    expect(SEED_RFQS.map((r) => {
      return r.state;
    })).toEqual(["Closed", "Cancelled"]);
    expect(SEED_RFQS[0].id).toBe(238);
    expect(SEED_TRADES).toHaveLength(2);
    expect(RFQ_SEQ_START).toBe(700);
  });

  test("fmtNum groups thousands; parseNotional handles suffixes", () => {
    expect(fmtNum(3500000)).toBe("3,500,000");
    expect(parseNotional("3.5m")).toBe(3_500_000);
    expect(parseNotional("250")).toBe(250);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/client-prototype exec vitest run credit-data`. Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/credit/types.ts`** (the block above).

- [ ] **Step 4: Write `src/credit/creditData.ts`.**

```ts
import type { CreditTrade, Dealer, Instrument, Quote, Rfq } from "#/credit/types";

export const RFQ_SEQ_START = 700;
export const RFQ_EXPIRY_SECS = 120;

// PROTO L757: the 9 seeded dealers; id 1 "Adaptive Bank" is the house dealer.
export const DEALERS: Dealer[] = [
  { id: 1, name: "Adaptive Bank" },
  { id: 2, name: "Citi" },
  { id: 3, name: "JP Morgan" },
  { id: 4, name: "Goldman Sachs" },
  { id: 5, name: "Morgan Stanley" },
  { id: 6, name: "Barclays" },
  { id: 7, name: "RBC" },
  { id: 8, name: "HSBC" },
  { id: 9, name: "Deutsche Bank" },
];

// PROTO L758-762: the 8 seeded corporate/treasury bonds.
export const INSTRUMENTS: Instrument[] = [
  { id: 1, ticker: "AAPL 2.4 08/30", name: "Apple Inc", cusip: "037833DX5", ref: 98.4 },
  { id: 2, ticker: "MSFT 3.3 02/27", name: "Microsoft Corp", cusip: "594918BV5", ref: 99.8 },
  { id: 3, ticker: "AMZN 4.05 08/47", name: "Amazon.com Inc", cusip: "023135BW5", ref: 96.2 },
  { id: 4, ticker: "GOOGL 1.1 08/30", name: "Alphabet Inc", cusip: "02079KAC1", ref: 91.5 },
  { id: 5, ticker: "TSLA 5.3 08/25", name: "Tesla Inc", cusip: "88160RAG6", ref: 100.6 },
  { id: 6, ticker: "UST 4.0 11/34", name: "US Treasury 10Y", cusip: "91282CFP1", ref: 98.9 },
  { id: 7, ticker: "VZ 4.5 08/33", name: "Verizon Comms", cusip: "92343VGE9", ref: 97.3 },
  { id: 8, ticker: "KO 1.45 06/27", name: "Coca-Cola Co", cusip: "191216DA5", ref: 93.7 },
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Local formatters (Credit stays self-contained — no import from fx/; the spec
// defers a shared format module as YAGNI). Bodies match fxData verbatim.
export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function parseNotional(str: string | null): number {
  if (str == null) {
    return Number.NaN;
  }

  let s = String(str).trim().toLowerCase().replace(/,/g, "");
  let m = 1;

  if (s.endsWith("m")) {
    m = 1e6;
    s = s.slice(0, -1);
  } else if (s.endsWith("k")) {
    m = 1e3;
    s = s.slice(0, -1);
  }

  const n = Number.parseFloat(s);
  return Number.isNaN(n) ? Number.NaN : Math.round(n * m);
}

export function fmtDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

// PROTO L835 _seedRfq, simplified to a static shape: a Closed RFQ (accepted at
// 99.80 by Citi) and a Cancelled RFQ. Static prices — no RNG at module load.
function seedQuotes(dealerIds: number[], acceptedId: number | null, price: number | null, ref: number): Quote[] {
  return dealerIds.map((did) => {
    if (did === acceptedId) {
      return { dealerId: did, state: "accepted", price };
    }
    return { dealerId: did, state: acceptedId == null ? "passed" : "priced", price: price ?? ref };
  });
}

// PROTO L820: rfqs seed — #238 Closed (Buy MSFT id 2, accepted by dealer 2 @ 99.80),
// #237 Cancelled (Sell Morgan Stanley id 5). createdAt is far in the past so the
// live countdown never applies; dealer set is the first four.
const CLOSED_DEALERS = [1, 2, 3, 4];
export const SEED_RFQS: Rfq[] = [
  {
    id: 238, state: "Closed", dir: "Buy", instrumentId: 2, qty: 3_500_000,
    dealerIds: CLOSED_DEALERS, quotes: seedQuotes(CLOSED_DEALERS, 2, 99.8, 99.8),
    acceptedDealerId: 2, createdAt: 0, expirySecs: RFQ_EXPIRY_SECS,
  },
  {
    id: 237, state: "Cancelled", dir: "Sell", instrumentId: 5, qty: 2_000_000,
    dealerIds: CLOSED_DEALERS, quotes: seedQuotes(CLOSED_DEALERS, null, null, 100.6),
    acceptedDealerId: null, createdAt: 0, expirySecs: RFQ_EXPIRY_SECS,
  },
];

// PROTO L821: two seeded credit trades in the blotter.
export const SEED_TRADES: CreditTrade[] = [
  { id: 238, status: "Done", date: fmtDate(-2), dir: "Buy", cp: "Citi", cusip: "594918BV5", sec: "MSFT 3.3 02/27", qty: "3,500,000", ot: "AON", price: "$99.8" },
  { id: 235, status: "Done", date: fmtDate(-6), dir: "Sell", cp: "Goldman Sachs", cusip: "037833DX5", sec: "AAPL 2.4 08/30", qty: "2,000,000", ot: "AON", price: "$101.2" },
];
```

- [ ] **Step 5: Run to verify it passes** — `pnpm --filter @rtc/client-prototype exec vitest run credit-data`. Expected: PASS.

- [ ] **Step 6: Full gate.** Green. (Note: `SEED_RFQS`/`SEED_TRADES`/`INSTRUMENTS`/`DEALERS` become consumed by Tasks 3–8, so knip stays quiet at the end of the branch; if the per-task knip flags them as unused now, that is the expected transient — record it and move on.)

- [ ] **Step 7: Commit** — `feat(client-prototype): P3 Credit types + seed data`.

---

## Task 3: `useCreditForm` — New RFQ form state

**Files:**
- Create: `src/credit/useCreditForm.ts`
- Test: `tests/credit-form-hook.test.ts`

**Interfaces:**
- Consumes: `Dir` (`#/credit/types`); `DEALERS`, `INSTRUMENTS`, `parseNotional` (`#/credit/creditData`).
- Produces:
  ```ts
  export interface RfqFormValue { dir: Dir; instrumentId: number | null; qty: string; dealerIds: number[]; }
  export interface CreditFormApi {
    value: RfqFormValue;
    showInstr: boolean;
    valid: boolean;
    allDealers: boolean;
    setDir(dir: Dir): void;
    selectInstrument(id: number): void;   // also closes the dropdown
    toggleInstr(): void;
    setQty(qty: string): void;
    toggleDealer(id: number): void;
    toggleAllDealers(): void;
    clear(): void;
  }
  export function useCreditForm(): CreditFormApi;
  ```
  `valid` = instrument set **and** `parseNotional(qty) > 0` **and** `dealerIds.length > 0` (PROTO L1314 `validRfq`). `allDealers` = `dealerIds.length === DEALERS.length`. `clear()` resets to `{ dir:"Buy", instrumentId:null, qty:"", dealerIds:[] }` and closes the dropdown (PROTO L1168).

- [ ] **Step 1: Write the failing test** — `tests/credit-form-hook.test.ts`:

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { useCreditForm } from "#/credit/useCreditForm";

afterEach(cleanup);

describe("useCreditForm", () => {
  test("SEND is invalid until instrument + qty>0 + >=1 dealer", () => {
    const { result } = renderHook(() => {
      return useCreditForm();
    });
    expect(result.current.valid).toBe(false);

    act(() => {
      result.current.selectInstrument(2);
    });
    act(() => {
      result.current.setQty("500");
    });
    expect(result.current.valid).toBe(false);

    act(() => {
      result.current.toggleDealer(1);
    });
    expect(result.current.valid).toBe(true);
  });

  test("toggleAllDealers selects then clears all", () => {
    const { result } = renderHook(() => {
      return useCreditForm();
    });
    act(() => {
      result.current.toggleAllDealers();
    });
    expect(result.current.allDealers).toBe(true);
    act(() => {
      result.current.toggleAllDealers();
    });
    expect(result.current.value.dealerIds).toEqual([]);
  });

  test("clear resets direction, instrument, qty, dealers and closes dropdown", () => {
    const { result } = renderHook(() => {
      return useCreditForm();
    });
    act(() => {
      result.current.setDir("Sell");
      result.current.selectInstrument(3);
      result.current.toggleInstr();
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.value).toEqual({ dir: "Buy", instrumentId: null, qty: "", dealerIds: [] });
    expect(result.current.showInstr).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Expected: module not found.

- [ ] **Step 3: Implement `src/credit/useCreditForm.ts`.**

```ts
import { useCallback, useMemo, useState } from "react";

import { DEALERS, parseNotional } from "#/credit/creditData";
import type { Dir } from "#/credit/types";

export interface RfqFormValue {
  dir: Dir;
  instrumentId: number | null;
  qty: string;
  dealerIds: number[];
}

export interface CreditFormApi {
  value: RfqFormValue;
  showInstr: boolean;
  valid: boolean;
  allDealers: boolean;
  setDir(dir: Dir): void;
  selectInstrument(id: number): void;
  toggleInstr(): void;
  setQty(qty: string): void;
  toggleDealer(id: number): void;
  toggleAllDealers(): void;
  clear(): void;
}

const EMPTY: RfqFormValue = { dir: "Buy", instrumentId: null, qty: "", dealerIds: [] };

export function useCreditForm(): CreditFormApi {
  const [value, setValue] = useState<RfqFormValue>(EMPTY);
  const [showInstr, setShowInstr] = useState(false);

  const setDir = useCallback((dir: Dir) => {
    setValue((prev) => {
      return { ...prev, dir };
    });
  }, []);

  const selectInstrument = useCallback((id: number) => {
    setValue((prev) => {
      return { ...prev, instrumentId: id };
    });
    setShowInstr(false);
  }, []);

  const toggleInstr = useCallback(() => {
    setShowInstr((prev) => {
      return !prev;
    });
  }, []);

  const setQty = useCallback((qty: string) => {
    setValue((prev) => {
      return { ...prev, qty };
    });
  }, []);

  const toggleDealer = useCallback((id: number) => {
    setValue((prev) => {
      const has = prev.dealerIds.includes(id);
      return {
        ...prev,
        dealerIds: has
          ? prev.dealerIds.filter((x) => {
              return x !== id;
            })
          : [...prev.dealerIds, id],
      };
    });
  }, []);

  const toggleAllDealers = useCallback(() => {
    setValue((prev) => {
      const all = prev.dealerIds.length === DEALERS.length;
      return {
        ...prev,
        dealerIds: all
          ? []
          : DEALERS.map((d) => {
              return d.id;
            }),
      };
    });
  }, []);

  const clear = useCallback(() => {
    setValue(EMPTY);
    setShowInstr(false);
  }, []);

  const valid: boolean =
    value.instrumentId != null &&
    parseNotional(value.qty) > 0 &&
    value.dealerIds.length > 0;
  const allDealers: boolean = value.dealerIds.length === DEALERS.length;

  return useMemo(() => {
    return {
      value, showInstr, valid, allDealers,
      setDir, selectInstrument, toggleInstr, setQty,
      toggleDealer, toggleAllDealers, clear,
    };
  }, [value, showInstr, valid, allDealers, setDir, selectInstrument, toggleInstr, setQty, toggleDealer, toggleAllDealers, clear]);
}
```

- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Full gate.** Green.
- [ ] **Step 6: Commit** — `feat(client-prototype): P3 useCreditForm`.

---

## Task 4: `useCreditRfqs` — the streaming-quotes engine

The one genuinely new behavior. Mirrors `useFxRates`: injectable `rng`, RNG in a ref, all timers tracked and cleared on unmount, **RNG/persistence never inside a `setState` updater** (values are drawn up-front, then set). Per §4.2 of the spec, each dealer's `delay` / `pass` / `price` are drawn **synchronously at send time** (deterministic mapping in `dealerIds` order) and applied when the timer fires.

**Files:**
- Create: `src/credit/useCreditRfqs.ts`
- Test: `tests/credit-rfqs.test.ts`

**Interfaces:**
- Consumes: `RfqFormValue` (`#/credit/useCreditForm`); `CreditTab`, `CreditTrade`, `Rfq` (`#/credit/types`); `INSTRUMENTS`, `SEED_RFQS`, `SEED_TRADES`, `DEALERS`, `RFQ_SEQ_START`, `RFQ_EXPIRY_SECS`, `fmtNum`, `parseNotional`, `fmtDate` (`#/credit/creditData`).
- Produces:
  ```ts
  export interface UseCreditRfqsOptions { rng?: () => number; nowIntervalMs?: number; }
  export interface CreditRfqsApi {
    rfqs: Rfq[];
    creditTab: CreditTab;
    creditTrades: CreditTrade[];
    now: number;
    liveCount: number;
    shownRfqs: Rfq[];
    noRfqs: boolean;
    newRfqId: number | null;
    newCreditId: number | null;
    exitingRfqs: number[];
    onTab(tab: CreditTab): void;
    sendRfq(form: RfqFormValue): void;
    acceptQuote(rfqId: number, dealerId: number): void;
    cancelRfq(rfqId: number): void;
    removeRfq(rfqId: number): void;
    onExport(): void;
  }
  export function useCreditRfqs(opts?: UseCreditRfqsOptions): CreditRfqsApi;
  ```

**Constants (verbatim, PROTO L1169/L1173):** `QUOTE_MIN_DELAY_MS = 700`, `QUOTE_SPAN_MS = 3200`, `DEALER_PASS_PROB = 0.12`, `HOUSE_DEALER_ID = 1`, `HOUSE_EDGE = 0.18`, `PRICE_SPAN = 0.9`, `NEW_RFQ_FLASH_MS = 800`, `REMOVE_ANIM_MS = 330`, `EXITING_RETAIN_MS = 380`, `NOW_INTERVAL_MS = 400`, `TRADE_CAP = 40`.

Behavior:
- **`now` + expiry tick** (interval `nowIntervalMs`, default 400): set `now = Date.now()`; sweep `Open` RFQs past `createdAt + expirySecs*1000` → `Expired`, their `pending` quotes → `passed`, stamp `exitAt` (PROTO `_checkExpiries`).
- **`shownRfqs`** (derived each render): filter by `creditTab` (`live`→`Open`; `closed`→ not `Open`; `all`→ all), **plus** any id in `exitingRfqs`, **plus** any just-closed-in-live within `EXITING_RETAIN_MS` (so an accepted/expired card animates out before vanishing) — PROTO L1327. `noRfqs = shownRfqs.length === 0`. `liveCount` = count of `Open`.
- **`sendRfq(form)`** (PROTO L1169): guard `valid` (instrument set, `parseNotional(qty)>0`, `dealerIds.length>0`); `id = seqRef.current++`; `qty = parseNotional(form.qty) * 1000`; build `Open` rfq with `pending` quotes; **prepend**; `creditTab="live"`; `newRfqId=id` (cleared after `NEW_RFQ_FLASH_MS`). For each `did` in `form.dealerIds`, draw `delay = QUOTE_MIN_DELAY_MS + rng()*QUOTE_SPAN_MS`, `pass = rng() < DEALER_PASS_PROB`, `raw = inst.ref + (rng()-0.5)*PRICE_SPAN` then house edge `-= form.dir==="Buy" ? HOUSE_EDGE : -HOUSE_EDGE` when `did===HOUSE_DEALER_ID`, `price = +raw.toFixed(2)`; schedule `setTimeout(delay)` → flip that quote to `passed`(price null) or `priced`(price) **only if the rfq is still `Open`**.
- **`acceptQuote(rfqId, dealerId)`** (PROTO L1170): rfq → `Closed`, `acceptedDealerId`, that quote → `accepted`, stamp `exitAt`; prepend a `CreditTrade` (`Done`, `fmtDate(0)`, `cp=dealer.name`, `cusip/sec=inst`, `qty=fmtNum(rfq.qty)`, `ot="AON"`, `price="$"+ (quote.price ?? inst.ref).toFixed(2)`), cap `TRADE_CAP`; `newCreditId=rfqId`.
- **`cancelRfq(rfqId)`** (PROTO L1171): `Open` → `Cancelled`, stamp `exitAt`.
- **`removeRfq(rfqId)`** (PROTO L1172): add to `exitingRfqs`; after `REMOVE_ANIM_MS`, filter the rfq out and drop it from `exitingRfqs`.
- **`onExport()`**: `toCsv([...10 headers], creditTrades.map(...))` + `downloadCsv("credit-trades.csv", …)` (PROTO L1161) via `#/csvExport`. Headers: `["Trade ID","Status","Trade Date","Direction","Counterparty","CUSIP","Security","Quantity","Order Type","Unit Price"]`.

- [ ] **Step 1: Write the failing test** — `tests/credit-rfqs.test.ts`:

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useCreditRfqs } from "#/credit/useCreditRfqs";
import { mulberry32 } from "#/mock/rng";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const BUY = { dir: "Buy", instrumentId: 2, qty: "500", dealerIds: [1, 2, 3] } as const;

describe("useCreditRfqs", () => {
  test("seeds two RFQs and starts on the 'all' tab", () => {
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    expect(result.current.rfqs).toHaveLength(2);
    expect(result.current.creditTab).toBe("all");
  });

  test("sendRfq prepends a live RFQ, switches to live, and flags it new", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    expect(result.current.creditTab).toBe("live");
    expect(result.current.rfqs[0].state).toBe("Open");
    expect(result.current.rfqs[0].id).toBe(700);
    expect(result.current.newRfqId).toBe(700);
    expect(result.current.rfqs[0].quotes.every((q) => {
      return q.state === "pending";
    })).toBe(true);
  });

  test("dealer quotes arrive priced/passed after their timers", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    const settled = result.current.rfqs[0].quotes.every((q) => {
      return q.state === "priced" || q.state === "passed";
    });
    expect(settled).toBe(true);
  });

  test("acceptQuote closes the RFQ and books a credit trade", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    const priced = result.current.rfqs[0].quotes.find((q) => {
      return q.state === "priced";
    });
    const beforeTrades = result.current.creditTrades.length;
    act(() => {
      result.current.acceptQuote(700, priced!.dealerId);
    });
    expect(result.current.rfqs[0].state).toBe("Closed");
    expect(result.current.creditTrades).toHaveLength(beforeTrades + 1);
    expect(result.current.creditTrades[0].id).toBe(700);
  });

  test("the 400ms sweep expires an Open RFQ past 120s", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    act(() => {
      vi.advanceTimersByTime(121_000);
    });
    expect(result.current.rfqs[0].state).toBe("Expired");
  });

  test("cancelRfq marks an Open RFQ Cancelled", () => {
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
    expect(result.current.rfqs[0].state).toBe("Cancelled");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `src/credit/useCreditRfqs.ts`** per the Interfaces + Behavior above. Structure it like `useFxRates`: `rngRef`, `seqRef`, `timersRef = useRef<Set<…>>(new Set())`; three `useEffect`s (the `now`/expiry interval keyed on `nowIntervalMs`; a mount-only timer-cleanup effect); `useState` for `rfqs` (init `SEED_RFQS`), `creditTab` (`"all"`), `creditTrades` (init `SEED_TRADES`), `now`, `newRfqId`, `newCreditId`, `exitingRfqs`. Draw all RNG values **before** `setState`. Compute `shownRfqs`/`liveCount`/`noRfqs` as plain derived values in the render body. Look up `INSTRUMENTS`/`DEALERS` with `.find` (block-body arrows).

Key skeleton (fill bodies from PROTO refs above):
```ts
export function useCreditRfqs(opts: UseCreditRfqsOptions = {}): CreditRfqsApi {
  const { rng = Math.random, nowIntervalMs = NOW_INTERVAL_MS } = opts;
  const rngRef = useRef(rng);
  const seqRef = useRef(RFQ_SEQ_START);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const [rfqs, setRfqs] = useState<Rfq[]>(SEED_RFQS);
  const [creditTab, setCreditTab] = useState<CreditTab>("all");
  const [creditTrades, setCreditTrades] = useState<CreditTrade[]>(SEED_TRADES);
  const [now, setNow] = useState(0);
  const [newRfqId, setNewRfqId] = useState<number | null>(null);
  const [newCreditId, setNewCreditId] = useState<number | null>(null);
  const [exitingRfqs, setExitingRfqs] = useState<number[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      setRfqs((prev) => { /* expiry sweep — PROTO _checkExpiries */ });
    }, nowIntervalMs);
    return () => { clearInterval(id); };
  }, [nowIntervalMs]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => { for (const id of timers) { clearTimeout(id); } timers.clear(); };
  }, []);

  // sendRfq / acceptQuote / cancelRfq / removeRfq / onTab / onExport …

  const shownRfqs = /* filter by tab + exiting + recently-exited */;
  const liveCount: number = rfqs.filter((r) => { return r.state === "Open"; }).length;
  const noRfqs: boolean = shownRfqs.length === 0;
  return { rfqs, creditTab, creditTrades, now, liveCount, shownRfqs, noRfqs, newRfqId, newCreditId, exitingRfqs, onTab, sendRfq, acceptQuote, cancelRfq, removeRfq, onExport };
}
```

- [ ] **Step 4: Run to verify it passes.** All six tests green.
- [ ] **Step 5: Full gate.** Green.
- [ ] **Step 6: Commit** — `feat(client-prototype): P3 useCreditRfqs streaming engine`.

---

## Task 5: New RFQ panel — `NewRfqPanel`, `InstrumentSelect`, `DealerChecklist`

Dumb components driven by `CreditFormApi`. **Markup reference:** PROTO L534–557. Convert inline styles to CSS Modules: buy/sell direction + selected/checked state + house-dealer tint + SEND-enabled → `data-*`; the dropdown open/closed → `data-open`; all colors via `data-*` in CSS (never inline).

**Files:**
- Create: `src/credit/NewRfq/NewRfqPanel.tsx` (+ `.module.css`), `src/credit/NewRfq/InstrumentSelect.tsx` (+ `.module.css`), `src/credit/NewRfq/DealerChecklist.tsx` (+ `.module.css`)
- Test: `tests/credit-form.test.tsx`

**Interfaces:**
- Consumes: `CreditFormApi` (`#/credit/useCreditForm`); `INSTRUMENTS`, `DEALERS` (`#/credit/creditData`).
- Produces:
  - `function NewRfqPanel(props: { form: CreditFormApi }): ReactElement` — direction toggle ("You Buy"/"You Sell", `data-active`/`data-dir`), `<InstrumentSelect>`, Qty (000) `<input value={form.value.qty} onChange>`, static "2 Min" duration display, `<DealerChecklist>`, CLEAR (`form.clear`) + SEND RFQ (`data-enabled={form.valid}`, `disabled={!form.valid}`, calls a `props.onSend`). **Add `onSend(): void` to props** — the screen passes `() => { if (form.valid) { rfqs.sendRfq(form.value); form.clear(); } }`.
  - `function InstrumentSelect(props: { form: CreditFormApi }): ReactElement` — the label button (`form.value.instrumentId` → ticker or "Select instrument") toggling `form.toggleInstr()`, and when `form.showInstr` a list of `INSTRUMENTS` rows (ticker + `cusip · name`) calling `form.selectInstrument(i.id)`.
  - `function DealerChecklist(props: { form: CreditFormApi }): ReactElement` — an "All Dealers" row (`data-checked={form.allDealers}`, `form.toggleAllDealers`) then a row per `DEALERS` (`data-checked`, `data-house={d.id===1}`, `form.toggleDealer(d.id)`).

Update `NewRfqPanel`'s props interface to `{ form: CreditFormApi; onSend(): void }`.

- [ ] **Step 1: Write the failing test** — `tests/credit-form.test.tsx`:

```ts
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { NewRfqPanel } from "#/credit/NewRfq/NewRfqPanel";
import { useCreditForm } from "#/credit/useCreditForm";

afterEach(cleanup);

function Harness(props: { onSend: () => void }): ReturnType<typeof NewRfqPanel> {
  const form = useCreditForm();
  return <NewRfqPanel form={form} onSend={props.onSend} />;
}

describe("NewRfqPanel", () => {
  test("renders the form controls and a disabled SEND until valid", () => {
    const { getByText, getByPlaceholderText } = render(<Harness onSend={vi.fn()} />);
    expect(getByText("You Buy")).toBeTruthy();
    expect(getByText("Select instrument")).toBeTruthy();
    expect(getByPlaceholderText("0")).toBeTruthy();
    const send = getByText("SEND RFQ");
    expect(send.getAttribute("data-enabled")).toBe("false");
  });

  test("selecting an instrument, qty and a dealer enables SEND", () => {
    const { getByText, getByPlaceholderText, getAllByText } = render(<Harness onSend={vi.fn()} />);
    fireEvent.click(getByText("Select instrument"));
    fireEvent.click(getByText("MSFT 3.3 02/27"));
    fireEvent.change(getByPlaceholderText("0"), { target: { value: "500" } });
    fireEvent.click(getByText("Citi"));
    expect(getByText("SEND RFQ").getAttribute("data-enabled")).toBe("true");
    expect(getAllByText("Adaptive Bank").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement the three components + CSS Modules** (exported component is the file's lede; filename matches; helpers/subcomponents below). Direction/checkbox/house/enabled state via `data-*`; the ⊕ header accessory is passed by the panel wrapper in Task 8 via `<Panel headAccessory="⊕">`, so `NewRfqPanel` here renders only the **form body + its own head content** (the "✚ New RFQ" tab label) — it does not wrap itself in `Panel` (Task 8 does that).
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Full gate.** Green.
- [ ] **Step 6: Commit** — `feat(client-prototype): P3 New RFQ form panel`.

---

## Task 6: RFQs panel — `RfqsPanel`, `RfqCard`, `QuoteRow`, `EmptyRfqs`, `rfqCardVm`

**Markup reference:** PROTO L563–582 (RFQs panel + cards + quote rows), VM builder PROTO L1330. FLIP glide reuses `#/motion/useFlip` over `[data-rfq-id]` (same as FX Live-Rates). Card enter/exit/flash + accept animations use the existing `global.css` keyframes (`cardInA/B`, `cardOut`, `cardFlash`, `acceptIn`, `acceptPulse`). Convert to CSS Modules: dir/state/best/passed/house/live → `data-*`; countdown bar width → named-const `--bar-pct` custom prop; per-card animation selection → `data-anim` + `data-parity` `data-*` (avoid inline `animation:` strings — drive keyframe choice from CSS on `data-*`).

**Files:**
- Create: `src/credit/rfqCardVm.ts`; `src/credit/Rfqs/RfqsPanel.tsx` (+ css), `RfqCard.tsx` (+ css), `QuoteRow.tsx` (+ css), `EmptyRfqs.tsx` (+ css)
- Test: `tests/credit-rfqs-vm.test.ts`, `tests/credit-rfqs-panel.test.tsx`

**Interfaces:**
- Produces `#/credit/rfqCardVm`:
  ```ts
  export interface QuoteVm { dealerId: number; bank: string; priceText: string; state: QuoteState; best: boolean; canAccept: boolean; house: boolean; }
  export interface RfqCardVm {
    rid: number; dir: Dir; ticker: string; cusip: string; qty: string;
    stateLabel: string; state: RfqState; quotes: QuoteVm[];
    live: boolean; accepted: boolean; terminated: boolean;
    secs: number; pct: number; acceptedDealer: string;
  }
  export function rfqCardVm(r: Rfq, now: number): RfqCardVm;
  ```
  Rules (PROTO L1330): `live = state==="Open"`; `accepted = state==="Closed"`; `terminated = state==="Cancelled" || state==="Expired"`. `secs = live ? max(0, ceil((createdAt+expirySecs*1000-now)/1000)) : 0`; `pct` likewise as a 0–100 fraction. Best among `priced`/`accepted` quotes = **min** price for a Buy, **max** for a Sell; only a `live` + `priced` + best quote sets `best=true`. Per-quote `priceText`: `pending`→`"…"`, `passed`→`"Passed"`, else `"$"+price.toFixed(2)`. `canAccept = live && state==="priced"`. `house = dealerId===1`. `stateLabel`: `Open`→`"LIVE"`, `Closed`→`"ACCEPTED"`, else `state.toUpperCase()`. `acceptedDealer` = accepted dealer's name (from `DEALERS`) or `""`.
- Produces:
  - `function RfqsPanel(props: { rfqs: CreditRfqsApi }): ReactElement` — the head content (◳ RFQs label + LIVE `liveCount`/CLOSED/ALL filter pills → `rfqs.onTab`, `data-active`), and the body: `EmptyRfqs` when `rfqs.noRfqs`, else a FLIP-glided grid of `RfqCard` over `rfqs.shownRfqs` (keyed by `rfq.id`, each wrapped with `data-rfq-id={rfq.id}`). It maps each `rfq` through `rfqCardVm(rfq, rfqs.now)`.
  - `function RfqCard(props: { vm: RfqCardVm; isNew: boolean; isExiting: boolean; onAccept(dealerId): void; onCancel(): void; onRemove(): void }): ReactElement` — header (dir chip, ticker, `cusip · QTY`, state label), the `QuoteRow` list, and the footer switch (live: `secs` + bar + CANCEL; accepted: ✓ "You traded with X"; terminated: 🗑 "<state> · remove").
  - `function QuoteRow(props: { vm: QuoteVm; onAccept(): void }): ReactElement`.
  - `function EmptyRfqs(): ReactElement` — the "◇ / No RFQs to show / Create one with the New RFQ form" empty state.

- [ ] **Step 1: Write the failing VM test** — `tests/credit-rfqs-vm.test.ts` (pure, no timers):

```ts
import { describe, expect, test } from "vitest";

import { rfqCardVm } from "#/credit/rfqCardVm";
import type { Rfq } from "#/credit/types";

function openBuy(): Rfq {
  const now = 1_000_000;
  return {
    id: 701, state: "Open", dir: "Buy", instrumentId: 2, qty: 500_000,
    dealerIds: [1, 2], acceptedDealerId: null, createdAt: now, expirySecs: 120,
    quotes: [
      { dealerId: 1, state: "priced", price: 99.5 },
      { dealerId: 2, state: "priced", price: 99.8 },
    ],
  };
}

describe("rfqCardVm", () => {
  test("marks the lowest price best for a Buy and formats prices", () => {
    const vm = rfqCardVm(openBuy(), 1_000_000);
    expect(vm.stateLabel).toBe("LIVE");
    expect(vm.quotes[0].best).toBe(true);
    expect(vm.quotes[0].priceText).toBe("$99.50");
    expect(vm.quotes[1].best).toBe(false);
    expect(vm.quotes.every((q) => {
      return q.canAccept;
    })).toBe(true);
  });

  test("counts down secs from createdAt+expiry", () => {
    const r = openBuy();
    const vm = rfqCardVm(r, r.createdAt + 30_000);
    expect(vm.secs).toBe(90);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement `rfqCardVm.ts`** per the rules.
- [ ] **Step 4: Run VM test — green.**
- [ ] **Step 5: Write the panel smoke** — `tests/credit-rfqs-panel.test.tsx`: render `RfqsPanel` with a real `useCreditRfqs()` harness (fake timers); assert the empty state is absent when seeded, that the two seed cards render (`getByText("ACCEPTED")` and `getByText("CANCELLED")`), and that clicking the LIVE pill switches the tab (seed cards are not `Open`, so the empty state appears).
- [ ] **Step 6: Implement the four components + CSS.** FLIP: call `useFlip` with a ref over the grid, keyed on `shownRfqs.map(r=>r.id).join(",")` and the filter — mirror `LiveRatesPanel`'s usage.
- [ ] **Step 7: Run to verify it passes.**
- [ ] **Step 8: Full gate.** Green.
- [ ] **Step 9: Commit** — `feat(client-prototype): P3 RFQs panel (streaming quote cards)`.

---

## Task 7: Credit Blotter panel

Display-only (no sort/filter — faithful). **Markup reference:** PROTO L585–590.

**Files:**
- Create: `src/credit/Blotter/CreditBlotterPanel.tsx` (+ `.module.css`)
- Test: `tests/credit-blotter.test.tsx`

**Interfaces:**
- Consumes: `CreditTrade` (`#/credit/types`).
- Produces: `function CreditBlotterPanel(props: { trades: CreditTrade[]; count: string; newCreditId: number | null; onExport(): void }): ReactElement` — the head content (▤ Credit Blotter label, `count` text, CSV button → `onExport`), a sticky 10-column header row (ID/Status/Date/Dir/Counterparty/CUSIP/Security/Qty/Type/Price), and a row per trade (dir → `data-dir`; a new row (`t.id===newCreditId`) → `data-new` for the `rowIn`+`rowFlash` animation via `--row-acc`). Grid columns per PROTO L588 (`64px 92px 118px 64px 112px 104px 126px 92px 72px 84px`, `min-width:940px`).

- [ ] **Step 1: Write the failing test** — `tests/credit-blotter.test.tsx`:

```ts
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CreditBlotterPanel } from "#/credit/Blotter/CreditBlotterPanel";
import { SEED_TRADES } from "#/credit/creditData";

afterEach(cleanup);

describe("CreditBlotterPanel", () => {
  test("renders the seed trades and the column header", () => {
    const { getByText, getAllByText } = render(
      <CreditBlotterPanel trades={SEED_TRADES} count="2 trades" newCreditId={null} onExport={vi.fn()} />,
    );
    expect(getByText("Counterparty")).toBeTruthy();
    expect(getByText("2 trades")).toBeTruthy();
    expect(getAllByText("Citi").length).toBeGreaterThan(0);
  });

  test("clicking CSV calls onExport", () => {
    const onExport = vi.fn();
    const { getByText } = render(
      <CreditBlotterPanel trades={SEED_TRADES} count="2 trades" newCreditId={null} onExport={onExport} />,
    );
    fireEvent.click(getByText(/CSV/));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement `CreditBlotterPanel` + CSS.** The CSV `onExport` is wired to `useCreditRfqs().onExport` by Task 8; verify the CSV string shape with a tiny direct `toCsv` assertion inside this test file if desired (optional — the engine's `onExport` uses the shared `toCsv` already covered by FX's `fx-csv` test).
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Full gate.** Green.
- [ ] **Step 6: Commit** — `feat(client-prototype): P3 Credit Blotter panel`.

---

## Task 8: `useCreditDock` + `CreditScreen` composition

Mirror `FxScreen`: a root with `data-max-panel`, two `useSplit`s (V for the form width, H for the RFQs/Blotter stack), CSS that (a) sizes columns off `--main-ratio`/`--stack-ratio`, (b) on maximize hides siblings, (c) collapses the left form to a strip when `maxPanel ∈ {rfqs,cblot}`. Panels use the shared `<Panel id=… headAccessory>`.

**Files:**
- Create: `src/credit/useCreditDock.ts`; `src/credit/CreditScreen.tsx` (+ `.module.css`)
- Test: `tests/credit-dock.test.ts`, `tests/credit-screen.test.tsx`

**Interfaces:**
- Produces `#/credit/useCreditDock`:
  ```ts
  export type CreditPanelId = "rfqs" | "cblot";
  export interface CreditDockApi { maxPanel: CreditPanelId | null; leftCollapsed: boolean; toggleMax(id: CreditPanelId): void; restore(): void; }
  export function useCreditDock(): CreditDockApi;
  ```
  Built on `useMaxPanel<CreditPanelId>("rt_credit_maxPanel", ["rfqs","cblot"])`; `leftCollapsed = maxPanel === "rfqs" || maxPanel === "cblot"`; `restore()` = `toggleMax(maxPanel)` when set (clears it) — used by the strip.
- Produces `function CreditScreen(): ReactElement` — owns `useCreditForm()`, `useCreditRfqs()`, `useCreditDock()`, the two `useSplit`s (`storageKey: "creditW"` V, initial ≈ 0.25; `storageKey: "creditStackR"` H, initial 0.62), refs for the screen + right column. Left `Panel` (no maximize surfaced — the New RFQ form panel's `onToggleMax` is a no-op/omitted; only RFQs + Blotter pass `dock.toggleMax`). `headAccessory="⊕"` on the New RFQ panel. When `dock.leftCollapsed`, the left column renders a `⛶ NEW RFQ` strip button → `dock.restore()`. Wire `onSend`, `onAccept`, `onCancel`, `onRemove`, `onExport` through.

Note on `Panel` + the collapse: since `leftCollapsed` is *derived from maximize*, model it exactly like FX — set `data-max-panel={dock.maxPanel ?? ""}` on the root and let `CreditScreen.module.css` both hide the maximized panel's sibling **and** collapse the `.leftCol` to `38px` (showing the strip) under `[data-max-panel="rfqs"]` / `[data-max-panel="cblot"]`.

- [ ] **Step 1: Write the failing dock test** — `tests/credit-dock.test.ts`:

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { useCreditDock } from "#/credit/useCreditDock";

afterEach(cleanup);

describe("useCreditDock", () => {
  test("maximizing a right panel collapses the left form; restore clears it", () => {
    const { result } = renderHook(() => {
      return useCreditDock();
    });
    expect(result.current.leftCollapsed).toBe(false);
    act(() => {
      result.current.toggleMax("rfqs");
    });
    expect(result.current.maxPanel).toBe("rfqs");
    expect(result.current.leftCollapsed).toBe(true);
    act(() => {
      result.current.restore();
    });
    expect(result.current.maxPanel).toBe(null);
    expect(result.current.leftCollapsed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails. Step 3: Implement `useCreditDock`. Step 4: Green.**

- [ ] **Step 5: Write the screen smoke** — `tests/credit-screen.test.tsx`:

```ts
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CreditScreen } from "#/credit/CreditScreen";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CreditScreen", () => {
  test("renders the three Credit panels", () => {
    const { getByText } = render(<CreditScreen />);
    expect(getByText("✚ New RFQ")).toBeTruthy();
    expect(getByText("◳ RFQs")).toBeTruthy();
    expect(getByText("▤ Credit Blotter")).toBeTruthy();
  });

  test("sending an RFQ adds a live card", () => {
    vi.useFakeTimers();
    const { getByText, getByPlaceholderText, container } = render(<CreditScreen />);
    fireEvent.click(getByText("Select instrument"));
    fireEvent.click(getByText("MSFT 3.3 02/27"));
    fireEvent.change(getByPlaceholderText("0"), { target: { value: "500" } });
    fireEvent.click(getByText("Citi"));
    fireEvent.click(getByText("SEND RFQ"));
    expect(container.querySelector("[data-rfq-id]")).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run to verify it fails. Step 7: Implement `CreditScreen` + CSS** (mirror `FxScreen.module.css` maximize/collapse structure, but for `rfqs`/`cblot` and a left-form strip). **Step 8: Green.**
- [ ] **Step 9: Full gate.** Green.
- [ ] **Step 10: Commit** — `feat(client-prototype): P3 Credit dock + screen composition`.

---

## Task 9: Shell wiring — render `CreditScreen` for the `credit` tab

**Files:**
- Modify: `src/shell/AppShell.tsx`
- Test: `tests/shell.test.tsx` (extend)

**Interfaces:**
- Consumes: `CreditScreen` (`#/credit/CreditScreen`).

- [ ] **Step 1: Extend the failing test.** In `tests/shell.test.tsx` add a case: rendering `AppShell` with `tab="credit"` shows the Credit screen (`getByText("◳ RFQs")`) and **not** the placeholder. Run — expect FAIL.

- [ ] **Step 2: Wire it.** In `src/shell/AppShell.tsx`, import `CreditScreen` and change the body switch:
```tsx
import { CreditScreen } from "#/credit/CreditScreen";
// …
<main className={styles.body}>
  {tab === "fx" ? (
    <FxScreen />
  ) : tab === "credit" ? (
    <CreditScreen />
  ) : (
    <PlaceholderPanel tab={tab} />
  )}
</main>
```
(If Biome/ESLint flags the nested ternary, extract a small `function screenFor(tab): ReactElement` helper below the component instead.)

- [ ] **Step 3: Run to verify it passes.**
- [ ] **Step 4: Full gate + the WHOLE suite** (`pnpm --filter @rtc/client-prototype test`). Green.
- [ ] **Step 5: Commit** — `feat(client-prototype): P3 wire Credit screen into the shell`.

---

## Self-Review (completed during authoring)

**Spec coverage:** shared-layout extraction → Task 1; Credit dock → Tasks 8; New RFQ form → Tasks 3,5; streaming engine → Task 4; RFQs cards + FLIP + empty state → Task 6; Credit Blotter + CSV → Task 7; shell swap → Task 9; fidelity notes (left-collapse-via-maximize → Task 8; house bias, 12% pass, 120s expiry, static duration, seeds → Tasks 2,4); `logEvt` omitted (no task adds it — deliberate); no RFQ persistence (engine holds in-memory state only). ✅

**Type consistency:** `RfqFormValue` (Task 3) is consumed by `useCreditRfqs.sendRfq` (Task 4) and `NewRfqPanel.onSend` (Tasks 5,8). `CreditRfqsApi` (Task 4) feeds `RfqsPanel`/`CreditBlotterPanel` (Tasks 6,7) and `CreditScreen` (Task 8). `rfqCardVm` types (Task 6) match `Rfq`/`Quote` (Task 2). `useMaxPanel<T>` (Task 1) is reused by `useDockState` (Task 1) and `useCreditDock` (Task 8). `Panel.id: string` (Task 1) accepts both FX's `PanelId` and Credit's `CreditPanelId`. ✅

**Placeholder scan:** logic/data/hook/test code is complete; presentational components carry full interfaces + PROTO markup line refs + the CSS-Modules taxonomy (matching the P2 plan's density for dumb components). ✅

**Deliberate decisions a reviewer may question (plan-mandated):** (1) `fmtNum`/`parseNotional`/`fmtDate` are duplicated locally in `creditData.ts` rather than shared — the spec mandates feature self-containment and defers a shared format module (YAGNI). (2) Quote `delay`/`pass`/`price` are drawn synchronously at send time (not at timer-fire) for deterministic test mapping — visible behavior is identical. Both are intentional; if flagged, treat as a plan-vs-review conflict for the human.
