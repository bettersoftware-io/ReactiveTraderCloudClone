# Behaviour Sync to the Original — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring this clone's observable behaviour into exact agreement with the original ReactiveTraderCloud web/PWA build, correcting all three layers (`./specs/`, tests, implementation) so they finally agree — without changing the clean architecture.

**Architecture:** Each of the 13 in-scope behaviours is one red-first TDD task: correct the spec + test to the original's value (fails against current code), then fix the implementation (green). Deterministic value/logic is verified with golden fixtures lifted from the original's pure functions; behavioural wiring is provenance-cited to the original `file:line`. The clone's RxJS simulators legitimately play the server's role where the original's behaviour was server-driven (auto-reject, expiry).

**Tech Stack:** TypeScript, pnpm + Turborepo, RxJS (domain), React + Vite (client), Vitest (unit/contract), Playwright/Cypress (e2e), CSS Modules, Biome/ESLint/Stylelint/dependency-cruiser gates. New UI-only dependency: `d3-force`/`d3-drag`/`d3-selection` (client-react only — never the domain).

**Source of truth:** the original repo, archived commit `4a31f01`, paths under `packages/client/src/`. Every value targeted by this plan is cited to that commit. (During execution the original is available as a shallow clone; if absent, re-clone `https://github.com/AdaptiveConsulting/ReactiveTraderCloud` at `4a31f01`.)

**Design spec:** `docs/superpowers/specs/2026-06-23-behaviour-sync-to-original-design.md` (the approved brainstorming output this plan implements).

## Global Constraints

These bind every task. Any step that would violate one is wrong.

- **Dependency rule (machine-enforced by dependency-cruiser):** `@rtc/domain` depends only on `rxjs` at runtime — no d3, no other runtime deps. `shared` depends only on `domain`. `client`/`server`/`mobile` never import each other. d3 submodules go in `@rtc/client-react` only.
- **Framework-swap test structure preserved:** corrected assertions live in the framework-neutral `shared/` contract layer; the `react/` swap-trio (render/registry/page-objects) stays intact so the planned SolidJS client inherits the corrected contract.
- **Observable-web-build target (decision D1):** match what a user sees running the original's standard web/PWA build. CreditExceeded stays unreachable (the web build no-ops the limit check) — it is the one deliberate non-fix.
- **Red-first TDD (decision D4):** the corrected spec/test must fail against current code before the implementation is changed.
- **Verification (decision D3):** deterministic value/logic → golden fixture lifted from the original (Task 0 helper); behavioural wiring → assertion citing the original `file:line`.
- **Dual visual-golden sets:** any change altering rendered appearance regenerates BOTH committed sets — CI `react/` (x86) and local `react-local/<arch>/` — via the `test:ui:visual:*:update` scripts.
- **Dep hygiene:** new deps respect the 24h `minimumReleaseAge` cooldown; run `pnpm outdated -r` and pick the latest acceptable version. Confirm `knip` shows no unused dep and `grep -n d3 packages/domain/package.json` is empty.
- **Commit copy:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Work on the branch `feat/behaviour-sync-to-original` (already created; the design spec is committed there).
- **Single-file test commands:** domain → `pnpm --filter @rtc/domain exec vitest run <path>`; client-react contract tier → `pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts <path>`; client-react unit → `pnpm --filter @rtc/client-react exec vitest run <path>`.

---

## Cross-task contracts (read before executing)

These hold across tasks; honouring them prevents a later task from breaking an earlier one.

- **Execution order is the §-sequence:** Task 0 → Blotter (T1.1, T1.7) → Analytics (T1.2, T1.4, T1.3) → Credit (T1.5, T2.3, T3.1, T3.2) → FX/Tile (T1.6, T2.1) → Shared (T2.4, T2.2) → final verification (Z1). T2.3 depends on T1.1; do not reorder them.
- **Sort API evolution (T1.1 → T2.3):** T1.1 corrects the FX desc-first set and keeps `nextSortDirection(column, current)` (2-arg) plus its tests. T2.3 generifies the blotter utilities for credit reuse — it MUST keep `nextSortDirection(column, current)` working for FX (e.g. keep an FX-bound `nextSortDirection`/`applySortToTrades` and add the generic under a distinct name `nextSortDirectionFor<TRow>` / `applySort<TRow>`, or give the generic a `descFirst = FX_DESC_FIRST` default). T1.1's `columnSort.test.ts` + `columnSort.golden.test.ts` are the regression gate (re-run them in T2.3 Step 3). The corrected FX desc-first set is exactly `{ tradeId, tradeDate, valueDate }` and becomes `FX_DESC_FIRST`.
- **Golden fixture location:** the domain `loadGolden` resolves `./__golden__/<name>.original.json` relative to the importing test. The analytics tasks (T1.2/T1.3/T1.4) place fixtures under `src/analytics/__golden__/` and read them with an inline `readFileSync` of the identical shape — both forms are valid (Task 0, Step 3 note).
- **d3 is client-react only:** T1.4 adds `d3-force`/`d3-drag`/`d3-selection` to `@rtc/client-react`. The per-currency aggregation is a pure domain function with no d3. The final task (Z1) gates on `grep -n d3 packages/domain/package.json` being empty.
- **CreditExceeded is the one deliberate non-fix** (web build no-ops the limit check). No task implements it; Z1 confirms it stays documented.
- **Larger UI tasks need the original/FX files open:** T2.3 (credit blotter render), T1.4 (d3 bubble chart), and T3.2 (countdown hook) give the load-bearing specifics (testids, column config, formulas, d3 forces) but reference `FxBlotter.tsx` / the original `BubbleChart.tsx` / `RfqTileMachine.ts` for the surrounding render scaffold — read those alongside the task.

---

### Task 0: Golden-fixture infrastructure

**Files:**
- Create: `packages/client-react/tests/ui/__golden__/loadGolden.ts`
- Create: `packages/client-react/tests/ui/__golden__/README.md`
- Create: `packages/domain/src/__testUtils__/loadGolden.ts`
- Create: `packages/domain/src/__testUtils__/README.golden.md`
- Test: `packages/domain/src/__testUtils__/loadGolden.test.ts`

**Interfaces:**
- Consumes: the `#tests/` subpath alias in `@rtc/client-react` (maps `#tests/` → `tests/`; confirm in `package.json` `imports` + tsconfig `paths`).
- Produces: `loadGolden<TCase>(name): { _source: string; cases: readonly TCase[] }` in two locations — `#tests/ui/__golden__/loadGolden` (client-react contract tier) and `../__testUtils__/loadGolden.js` (domain). Both read a sibling `./<name>.original.json` shaped `{ "_source": "rtc-original@4a31f01 <file:line>", "cases": [ { ... } ] }`. Later tasks place their fixtures next to the consuming test (`packages/.../__golden__/<name>.original.json`) and read them with the nearest `loadGolden`.

- [ ] **Step 1: Write the failing loader test (domain)**

Create `packages/domain/src/__testUtils__/loadGolden.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { loadGolden } from "./loadGolden.js";

interface SmokeCase {
  input: number;
  expected: number;
}

describe("loadGolden", () => {
  it("loads a co-located golden fixture by name", () => {
    const golden = loadGolden<SmokeCase>("loadGoldenSmoke");
    expect(golden._source).toMatch(/^rtc-original@4a31f01/);
    expect(golden.cases).toEqual([{ input: 1, expected: 1 }]);
  });
});
```

Create the smoke fixture `packages/domain/src/__testUtils__/__golden__/loadGoldenSmoke.original.json`:

```json
{
  "_source": "rtc-original@4a31f01 (smoke fixture for the loadGolden helper)",
  "cases": [{ "input": 1, "expected": 1 }]
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/domain exec vitest run src/__testUtils__/loadGolden.test.ts`
Expected: FAIL — cannot resolve `./loadGolden.js`.

- [ ] **Step 3: Write the domain loader**

Create `packages/domain/src/__testUtils__/loadGolden.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Golden<TCase> {
  readonly _source: string;
  readonly cases: readonly TCase[];
}

/**
 * Loads a golden fixture lifted from the original ReactiveTraderCloud codebase.
 * Fixtures live next to the test that consumes them under `__golden__/` and are
 * named `<name>.original.json`, with a `_source` header citing the original
 * commit + file:line the expected values were derived from.
 */
export function loadGolden<TCase>(name: string): Golden<TCase> {
  const url = new URL(`./__golden__/${name}.original.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Golden<TCase>;
}
```

> Note: a few domain tasks (T1.2/T1.3/T1.4 in analytics) read their fixture with an inline `readFileSync` block instead of importing this helper, because their fixtures sit beside the feature code (`src/analytics/__golden__/`) rather than beside `__testUtils__`. Both are acceptable — the JSON shape is identical. Prefer this helper when the fixture is a sibling of `__testUtils__`; otherwise inline the same three-line read with a path relative to the test.

- [ ] **Step 4: Write the client-react contract loader**

Create `packages/client-react/tests/ui/__golden__/loadGolden.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Golden<TCase> {
  readonly _source: string;
  readonly cases: readonly TCase[];
}

/**
 * Loads a golden fixture lifted from the original ReactiveTraderCloud codebase
 * (commit 4a31f01). Fixtures live under tests/ui/__golden__/<name>.original.json
 * with a `_source` header citing the original file:line.
 */
export function loadGolden<TCase>(name: string): Golden<TCase> {
  const url = new URL(`./${name}.original.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Golden<TCase>;
}
```

- [ ] **Step 5: Document the convention**

Create `packages/client-react/tests/ui/__golden__/README.md`:

```markdown
# Golden fixtures (ground truth from the original)

Each `<name>.original.json` pins the **original** ReactiveTraderCloud's actual
output for a pure function, so the clone's reimplementation is verified against
ground truth rather than a hand-typed number.

Shape:
\`\`\`json
{ "_source": "rtc-original@4a31f01 <path/file.ts:line>", "cases": [ { "input": ..., "expected": ... } ] }
\`\`\`

- `_source` MUST cite the original commit (`4a31f01`) and the file:line the
  expected values were derived from.
- Load with `loadGolden(name)` from `#tests/ui/__golden__/loadGolden`.
- Domain-side fixtures live under `packages/domain/src/.../__golden__/` and use
  the domain `loadGolden` (or an inline `readFileSync` of the same shape).
```

Create `packages/domain/src/__testUtils__/README.golden.md` with the same content (adjusting the loader path note to the domain helper).

- [ ] **Step 6: Run the loader test to verify it passes**

Run: `pnpm --filter @rtc/domain exec vitest run src/__testUtils__/loadGolden.test.ts`
Expected: PASS (1 test).

- [ ] **Step 7: Confirm the `#tests/` alias resolves the client loader**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: PASS (no unresolved `#tests/ui/__golden__/loadGolden` import once a later task imports it; this step just confirms the file + alias compile).

- [ ] **Step 8: Commit**

```bash
git add packages/client-react/tests/ui/__golden__ packages/domain/src/__testUtils__/loadGolden.ts packages/domain/src/__testUtils__/README.golden.md packages/domain/src/__testUtils__/__golden__ packages/domain/src/__testUtils__/loadGolden.test.ts
git commit -m "test: golden-fixture infrastructure for behaviour sync

loadGolden helpers (domain + client-react contract tier) that read
<name>.original.json fixtures lifted from rtc-original@4a31f01, plus the
provenance convention README. Ground-truth oracle for the behaviour-sync tasks.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---


## Domain 1 — Blotter

### Task T1.1: Blotter sort direction

**Files:**
- **Modify:** `packages/client-react/src/ui/fx/blotter/columnSort.ts`
- **Modify (test):** `packages/client-react/src/ui/fx/blotter/columnSort.test.ts`
- **Modify (test):** `packages/client-react/tests/ui/contract/specs/fx/blotter/FxBlotter.contract.spec.ts`
- **Create (test):** `packages/client-react/tests/ui/__golden__/sort-first-click-direction.original.json`
- **Create (test):** `packages/client-react/src/ui/fx/blotter/columnSort.golden.test.ts`
- **Verify:** `specs/features/blotter/sorting.feature` (already aligned — see Step 5)

**Interfaces:**
- Consumes: `loadGolden("sort-first-click-direction")` from `#tests/ui/__golden__/loadGolden`; the `nextSortDirection(column, current)` pure function (unchanged signature) from `./columnSort`.
- Produces: corrected first-click direction — desc-first **only** for `{ tradeId, tradeDate, valueDate }`; every other column (incl. `notional`, `spotRate`) asc-first.

**Root cause (clone, verbatim).** `packages/client-react/src/ui/fx/blotter/columnSort.ts:10-17`:
```ts
// Date/ID columns: desc first. Text columns: asc first.
const numericOrDateColumns = new Set<keyof Trade>([
  "tradeId",
  "tradeDate",
  "valueDate",
  "notional",
  "spotRate",
]);
```
Consulted on first click at `columnSort.ts:25` (`const dir = numericOrDateColumns.has(column) ? "desc" : "asc";`) and on re-init at `columnSort.ts:33`. It wrongly includes `notional` and `spotRate`.

**Original truth (verbatim).** `rtc-original@4a31f01 packages/client/src/client/App/Trades/TradesState/sortState.ts:32`:
```ts
const descDefaultFields = new Set(["tradeDate", "valueDate", "tradeId"])
```
Consumed at `sortState.ts:66-69` for a new column (`descDefaultFields.has(...) ? "DESC" : "ASC"`). So `notional` and `spotRate`/rate sort ASC on first click.

- [ ] **Step 1: Write the failing golden-fixture test first.**

Create the golden fixture `packages/client-react/tests/ui/__golden__/sort-first-click-direction.original.json`:

```json
{
  "_source": "rtc-original@4a31f01 packages/client/src/client/App/Trades/TradesState/sortState.ts:32,66-69",
  "cases": [
    { "input": "tradeId",       "expected": "desc" },
    { "input": "tradeDate",     "expected": "desc" },
    { "input": "valueDate",     "expected": "desc" },
    { "input": "notional",      "expected": "asc" },
    { "input": "spotRate",      "expected": "asc" },
    { "input": "status",        "expected": "asc" },
    { "input": "direction",     "expected": "asc" },
    { "input": "currencyPair",  "expected": "asc" },
    { "input": "dealtCurrency", "expected": "asc" },
    { "input": "tradeName",     "expected": "asc" }
  ]
}
```

Create `packages/client-react/src/ui/fx/blotter/columnSort.golden.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Trade } from "@rtc/domain";

import { loadGolden } from "#tests/ui/__golden__/loadGolden";

import { nextSortDirection, type SortState } from "./columnSort";

interface FirstClickCase {
  input: keyof Trade;
  expected: "asc" | "desc";
}

describe("nextSortDirection — first-click direction matches rtc-original descDefaultFields", () => {
  const golden = loadGolden<FirstClickCase>("sort-first-click-direction");
  const none: SortState = { column: null, direction: null };

  for (const { input, expected } of golden.cases) {
    it(`sorts ${input} ${expected} on first click`, () => {
      expect(nextSortDirection(input, none)).toEqual({
        column: input,
        direction: expected,
      });
    });
  }
});
```

- [ ] **Step 2: Run the test, verify it fails.**

Run: `pnpm --filter @rtc/client-react exec vitest run src/ui/fx/blotter/columnSort.golden.test.ts`
Expected: the `notional` and `spotRate` cases FAIL (other 8 pass):
```
- Expected  { column: "notional", direction: "asc" }
+ Received  { column: "notional", direction: "desc" }
```

- [ ] **Step 3: Fix the implementation.**

Edit `packages/client-react/src/ui/fx/blotter/columnSort.ts`. Replace the over-broad set (lines 10-17) with the original's exact desc-first set, renamed:

```ts
// Desc-first columns, verbatim from rtc-original@4a31f01
// App/Trades/TradesState/sortState.ts:32 `descDefaultFields`.
// Every other column (incl. notional, spotRate) sorts ASC on first click.
const descFirstColumns = new Set<keyof Trade>([
  "tradeId",
  "tradeDate",
  "valueDate",
]);
```

Update both consult sites. `columnSort.ts:25`:
```ts
    const dir = descFirstColumns.has(column) ? "desc" : "asc";
```
`columnSort.ts:33`:
```ts
  const dir = descFirstColumns.has(column) ? "desc" : "asc";
```
(No other logic changes — the cycle derives its starting direction from this set.)

- [ ] **Step 4: Run the test, verify pass.**

Run: `pnpm --filter @rtc/client-react exec vitest run src/ui/fx/blotter/columnSort.golden.test.ts`
Expected: `Tests  10 passed`.

- [ ] **Step 5: Correct existing specs and contract assertions.**

**5a.** `packages/client-react/src/ui/fx/blotter/columnSort.test.ts` bakes in the old behaviour. Replace lines 28-46:
```ts
  it("starts a date/ID column descending on first click", () => {
    const none: SortState = { column: null, direction: null };
    expect(nextSortDirection("tradeId", none)).toEqual({
      column: "tradeId",
      direction: "desc",
    });
    expect(nextSortDirection("tradeDate", none)).toEqual({
      column: "tradeDate",
      direction: "desc",
    });
  });

  it("starts a non-desc column (text or numeric) ascending on first click", () => {
    const none: SortState = { column: null, direction: null };
    expect(nextSortDirection("tradeName", none)).toEqual({
      column: "tradeName",
      direction: "asc",
    });
    expect(nextSortDirection("notional", none)).toEqual({
      column: "notional",
      direction: "asc",
    });
    expect(nextSortDirection("spotRate", none)).toEqual({
      column: "spotRate",
      direction: "asc",
    });
  });
```
Replace the cycle test (lines 48-56) to anchor on a desc-first column:
```ts
  it("cycles desc -> asc -> none on a desc-first column", () => {
    const desc: SortState = { column: "tradeId", direction: "desc" };
    const asc = nextSortDirection("tradeId", desc);
    expect(asc).toEqual({ column: "tradeId", direction: "asc" });
    expect(nextSortDirection("tradeId", asc)).toEqual({
      column: null,
      direction: null,
    });
  });
```
Replace the re-init test (lines 58-63):
```ts
    const nulled: SortState = { column: "notional", direction: null };
    expect(nextSortDirection("notional", nulled)).toEqual({
      column: "notional",
      direction: "asc",
    });
```

**5b.** `packages/client-react/tests/ui/contract/specs/fx/blotter/FxBlotter.contract.spec.ts` asserts Notional descending-first — wrong. Replace the `sorting` block (lines 82-117):
```ts
    it("sorts a numeric column ascending on first header click", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [a, b, c] } });
      await blotter.clickColumnHeader("Notional");
      expect(blotter.sortIndicatorFor("Notional")).toBe("asc");
      expect(blotter.columnValues("Notional")).toEqual([
        "1,000,000",
        "2,000,000",
        "3,000,000",
      ]);
    });

    it("toggles a numeric column to descending on the second click", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [a, b, c] } });
      await blotter.clickColumnHeader("Notional");
      await blotter.clickColumnHeader("Notional");
      expect(blotter.sortIndicatorFor("Notional")).toBe("desc");
      expect(blotter.columnValues("Notional")).toEqual([
        "3,000,000",
        "2,000,000",
        "1,000,000",
      ]);
    });

    it("clears the sort on the third click", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [a, b, c] } });
      await blotter.clickColumnHeader("Notional");
      await blotter.clickColumnHeader("Notional");
      await blotter.clickColumnHeader("Notional");
      expect(blotter.sortIndicatorFor("Notional")).toBe(null);
      // Back to insertion order.
      expect(blotter.columnValues("Notional")).toEqual([
        "3,000,000",
        "1,000,000",
        "2,000,000",
      ]);
    });
```
Run the contract suite: `pnpm --filter @rtc/client-react test:ui:contract`

**5c.** `specs/features/blotter/sorting.feature` is **already aligned** (only Trade ID / Trade Date / Value Date are desc-first; Notional sorts ascending). Confirm and leave unchanged:
```bash
grep -n "Notional\|Rate" specs/features/blotter/sorting.feature
```
Expected: the only `Notional` match is the ascending-numeric scenario. No edit required.

- [ ] **Step 6: Commit.**

```bash
git add packages/client-react/src/ui/fx/blotter/columnSort.ts \
        packages/client-react/src/ui/fx/blotter/columnSort.test.ts \
        packages/client-react/src/ui/fx/blotter/columnSort.golden.test.ts \
        packages/client-react/tests/ui/__golden__/sort-first-click-direction.original.json \
        packages/client-react/tests/ui/contract/specs/fx/blotter/FxBlotter.contract.spec.ts
git commit -m "fix(client): align blotter sort desc-first set with original (tradeId/tradeDate/valueDate only)

Notional and spotRate wrongly started descending; original descDefaultFields
(sortState.ts:32) is exactly {tradeId,tradeDate,valueDate}. Encode first-click
direction as a golden fixture; correct columnSort + contract assertions.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task T1.7: Blotter new-row highlight 3× flash

**Files:**
- **Modify:** `packages/client-react/src/ui/fx/blotter/BlotterRow.module.css`
- **Verify (no change):** `packages/client-react/src/ui/fx/blotter/BlotterRow.tsx`, `packages/client-react/src/app/presenters/RowHighlightMachine.ts`
- **Modify (test):** `packages/client-react/tests/ui/contract/specs/fx/blotter/BlotterRow.contract.spec.ts`
- **Modify (test PO):** `packages/client-react/tests/ui/contract/shared/pages/fx/blotter/BlotterRowPage.ts`
- **Create (test):** `packages/client-react/tests/ui/__golden__/row-highlight-animation.original.json`
- **Regenerate:** visual goldens (both committed sets) — Step 5c
- **Verify (no change):** `specs/features/blotter/trade-display.feature`

**Interfaces:**
- Consumes: `loadGolden("row-highlight-animation")`; the `data-highlight="true"` attribute the row already emits (`BlotterRow.tsx:28`) for `HIGHLIGHT_MS = 3000` (`RowHighlightMachine.ts:9`).
- Produces: CSS `@keyframes backgroundFlash` (bg→brand→bg) applied as `animation: backgroundFlash 1s ease-in-out 3` while `data-highlight="true"`, replacing the single-`transition` fade. The 3000ms machine window is unchanged.

**Root cause (clone, verbatim).** `packages/client-react/src/ui/fx/blotter/BlotterRow.module.css:1-13`:
```css
.row {
  background-color: transparent;
  transition: background-color 1s ease-in-out;
  color: var(--text-primary);
}

.row[data-hovered="true"] {
  background-color: var(--bg-secondary);
}

.row[data-highlight="true"] {
  background-color: rgba(59, 130, 246, 0.15);
}
```

**Original truth (verbatim).** `rtc-original@4a31f01 App/Trades/GridRegion/styled.ts:36-38`: `animation: ${backgroundFlash} 1s ease-in-out 3`. Keyframes `utils/styling/backgroundFlash.ts:3-13`: `0% bg-primary → 50% bg-brand-primary → 100% bg-primary`. Hold `constants.ts:54` `HIGHLIGHT_ROW_FLASH_TIME = 3000` — the clone's `HIGHLIGHT_MS = 3000` already matches; keep it.

- [ ] **Step 1: Write the failing golden-fixture test first.**

Create `packages/client-react/tests/ui/__golden__/row-highlight-animation.original.json`:
```json
{
  "_source": "rtc-original@4a31f01 App/Trades/GridRegion/styled.ts:36-38 + utils/styling/backgroundFlash.ts:3-13 + constants.ts:54",
  "cases": [
    {
      "input": "new-row",
      "expected": {
        "animationName": "backgroundFlash",
        "animationDuration": "1s",
        "animationTimingFunction": "ease-in-out",
        "animationIterationCount": "3",
        "keyframeStops": ["bg-primary", "bg-brand-primary", "bg-primary"],
        "holdMs": 3000
      }
    },
    { "input": "existing-row", "expected": { "animationName": "none", "holdMs": 0 } }
  ]
}
```

Add an animation reader to `packages/client-react/tests/ui/contract/shared/pages/fx/blotter/BlotterRowPage.ts` (after `backgroundColor()`):
```ts
  /** The CSS animation longhands resolved on the row (the golden fixture pins these). */
  animation(): {
    name: string;
    duration: string;
    timingFunction: string;
    iterationCount: string;
  } {
    const s = getComputedStyle(this.row());
    return {
      name: s.animationName,
      duration: s.animationDuration,
      timingFunction: s.animationTimingFunction,
      iterationCount: s.animationIterationCount,
    };
  }
```

Add the import + a golden-driven describe to `packages/client-react/tests/ui/contract/specs/fx/blotter/BlotterRow.contract.spec.ts` (import at top, describe before the outer close):
```ts
import { loadGolden } from "#tests/ui/__golden__/loadGolden";
```
```ts
  describe("new-row flash animation (rtc-original parity)", () => {
    const golden = loadGolden<{
      input: string;
      expected: {
        animationName: string;
        animationDuration?: string;
        animationTimingFunction?: string;
        animationIterationCount?: string;
      };
    }>("row-highlight-animation");

    it("flashes 1s ease-in-out three times for a new row", () => {
      const expected = golden.cases.find((c) => {
        return c.input === "new-row";
      })?.expected;
      if (!expected) throw new Error("missing new-row golden case");

      const row = mount(BlotterRow, { props: { trade: trade(), isNew: true } });
      const anim = row.animation();
      expect(anim.name).toBe(expected.animationName);
      expect(anim.duration).toBe(expected.animationDuration);
      expect(anim.timingFunction).toBe(expected.animationTimingFunction);
      expect(anim.iterationCount).toBe(expected.animationIterationCount);
    });

    it("applies no flash animation to an existing row", () => {
      const row = mount(BlotterRow, { props: { trade: trade(), isNew: false } });
      expect(row.animation().name).toBe("none");
    });
  });
```

- [ ] **Step 2: Run the test, verify it fails.**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- tests/ui/contract/specs/fx/blotter/BlotterRow.contract.spec.ts`
Expected: `flashes 1s ease-in-out three times` FAILS — current `.row` has no `animation` (`Received "none"`).

- [ ] **Step 3: Fix the implementation (CSS).**

Replace `packages/client-react/src/ui/fx/blotter/BlotterRow.module.css` (final file):
```css
.row {
  background-color: transparent;
  color: var(--text-primary);
}

.row[data-hovered="true"] {
  background-color: var(--bg-secondary);
}

/* New-row flash, ported from rtc-original GridRegion/styled.ts:36-38
 * (animation: backgroundFlash 1s ease-in-out 3) + backgroundFlash.ts:3-13
 * (bg -> brand -> bg). The 3s hold stays in createRowHighlightMachine
 * (HIGHLIGHT_MS=3000), which removes data-highlight after the three cycles. */
@keyframes backgroundFlash {
  0% {
    background-color: var(--bg-primary);
  }
  50% {
    background-color: var(--bg-brand-primary);
  }
  100% {
    background-color: var(--bg-primary);
  }
}

.row[data-highlight="true"] {
  animation: backgroundFlash 1s ease-in-out 3;
}

.row[data-state="rejected"] {
  text-decoration: line-through;
  color: var(--accent-negative);
}

.cell {
  padding: 4px 8px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}
```
Notes: `BlotterRow.tsx` and `RowHighlightMachine.ts` need no change. If `--bg-brand-primary` is not defined in the theme CSS, add it alongside the existing `--bg-*` tokens (grep `--bg-secondary` to find the block) before this step.

- [ ] **Step 4: Run the test, verify pass.**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- tests/ui/contract/specs/fx/blotter/BlotterRow.contract.spec.ts`
Expected: both new-row-flash cases pass. Then `pnpm --filter @rtc/client-react test:ui:contract` (no regressions).

- [ ] **Step 5: Correct existing assertions + regenerate visual goldens.**

**5a.** The existing `BlotterRow.contract.spec.ts` tests assert a static `rgba(59, 130, 246, ...)` background that no longer exists. In `BlotterRowPage.ts`, change `backgroundColor()`:
```ts
  backgroundColor(): string {
    const el = this.row();
    if (el.dataset.highlight === "true") return "animation:backgroundFlash";
    if (el.dataset.hovered === "true") return "var(--bg-secondary)";
    return "transparent";
  }
```
Update the new-row test:
```ts
  it("flashes a newly arrived trade", () => {
    const row = mount(BlotterRow, { props: { trade: trade(), isNew: true } });
    expect(row.backgroundColor()).toBe("animation:backgroundFlash");
  });
```
Update the timeout-clear test:
```ts
  it("clears the flash after the 3s highlight window elapses", () => {
    vi.useFakeTimers();
    const row = mount(BlotterRow, { props: { trade: trade(), isNew: true } });
    expect(row.backgroundColor()).toBe("animation:backgroundFlash");
    vi.advanceTimersByTime(3000);
    row.setProps({ isNew: true });
    expect(row.backgroundColor()).toBe("transparent");
  });
```

**5b.** `specs/features/blotter/trade-display.feature` is **already correct** (1s ease-in-out, repeats 3 times, total 3 seconds). Confirm and leave unchanged:
```bash
grep -n "flash\|repeats 3 times\|ease-in-out" specs/features/blotter/trade-display.feature
```

**5c.** Regenerate visual goldens (appearance changed). Both committed sets:
```bash
pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:update
pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react:update
```
Verify clean: `pnpm --filter @rtc/client-react test:ui:visual:react`. Regenerate the x86 CI `react/` set on x86 and the local `react-local/<arch>/` set locally — commit BOTH. A flash-mid-frame screenshot is non-deterministic; if it flakes, pin the capture to a fixed point (animation paused / `prefers-reduced-motion`, or capture at iteration end) before committing.

- [ ] **Step 6: Commit.**

```bash
git add packages/client-react/src/ui/fx/blotter/BlotterRow.module.css \
        packages/client-react/tests/ui/contract/specs/fx/blotter/BlotterRow.contract.spec.ts \
        packages/client-react/tests/ui/contract/shared/pages/fx/blotter/BlotterRowPage.ts \
        packages/client-react/tests/ui/__golden__/row-highlight-animation.original.json \
        packages/client-react/tests/ui/visual
git commit -m "fix(client): flash new blotter rows 3x like original (backgroundFlash 1s ease-in-out 3)

Replace single transition fade with @keyframes backgroundFlash (bg->brand->bg)
animated 3 times, per original GridRegion/styled.ts:36-38 + backgroundFlash.ts:3-13;
keep the 3000ms RowHighlightMachine window. Golden-fixture the animation params;
update contract PO + assertions; regenerate visual goldens.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---


## Domain 2 — Analytics

> All three tasks assume **Task 0** has landed the golden-fixture helper. Fixtures live under `packages/client-react/tests/ui/__golden__/<name>.original.json` shaped `{ "_source": "...", "cases": [{ "input": ..., "expected": ... }] }` and are read with `loadGolden(name)` from `#tests/ui/__golden__/loadGolden`. **For pure logic that belongs in the domain, the fixture and its test live in the domain package** (`packages/domain/src/.../__golden__/`) and the domain may depend only on `rxjs` (no d3, no Intl-wrapper libraries — plain `Intl.NumberFormat` is fine, it is a platform global).

> **Single-file test commands** (verified against `package.json`):
> - domain single file: `pnpm --filter @rtc/domain exec vitest run src/analytics/<file>.test.ts`
> - client-react contract single file: `pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/fx/analytics/<file>.contract.spec.ts`

---

### Task T1.2 — Latest P&L value format (`USD` prefix, `+`/`-` sign, whole-number with commas)

### Background — current vs. original

**Clone — `packages/client-react/src/ui/fx/analytics/PnlValue.tsx:9-32`** abbreviates and emits no `USD`:

```tsx
function formatPnl(value: number): string {
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = `${(abs / 1_000_000).toFixed(2)}m`;
  } else if (abs >= 1_000) {
    formatted = `${(abs / 1_000).toFixed(1)}k`;
  } else {
    formatted = abs.toFixed(0);
  }
  return (value >= 0 ? "+" : "-") + formatted;
}
```

**Original — `LastPosition.tsx:11,16,23`:**
- `:11` latest value = `history[history.length - 1]?.usPnl ?? 0`
- `:16` `const lastPosStr = \`${lastPos >= 0 ? "+" : ""}${formatAsWholeNumber(lastPos)}\``
- `:23` literal text `USD` precedes the value inside the `Stack`.

**Original — `utils/formatNumber.ts:95-99,136`:** `formatAsWholeNumber = precisionNumberFormatter(0)`, where `precisionNumberFormatter(precision)` = `Intl.NumberFormat(locale, { minimumFractionDigits: precision, maximumFractionDigits: precision })`. So `formatAsWholeNumber` = `Intl.NumberFormat` with 0 fraction digits → comma grouping, rounding.

**Verified original outputs** (full string the user sees, `USD ` + sign + whole-with-commas):

| input | original output |
|---|---|
| `0` | `USD +0` |
| `12345` | `USD +12,345` |
| `-12345` | `USD -12,345` |
| `1500000` | `USD +1,500,000` |
| `500` | `USD +500` |

> The current clone contract spec (`PnlValue.contract.spec.ts`) and `AnalyticsPanel.contract.spec.ts` assert abbreviated values (`"+12.5k"`, `"+1.50m"`, `"-2.5k"`, `"+7.0k"`) — these are the **wrong** behaviour and must be replaced.

### Decision
The formatter is **pure number formatting → it belongs in the domain** as `formatPnlValue` (the value-only portion: sign + whole-with-commas). The literal `"USD"` chrome stays in the UI component (it is layout, not formatting). The golden fixture lives in the **domain** package.

### Files
- **New** `packages/domain/src/analytics/formatPnlValue.ts` — pure `formatPnlValue(value: number): string`.
- **New** `packages/domain/src/analytics/__golden__/formatPnlValue.original.json` — golden fixture.
- **New** `packages/domain/src/analytics/formatPnlValue.test.ts` — golden-driven test.
- **Edit** `packages/domain/src/index.ts` — export `formatPnlValue`.
- **Edit** `packages/client-react/src/ui/fx/analytics/PnlValue.tsx` — use `formatPnlValue`, add `USD` prefix.
- **Edit** `packages/client-react/src/ui/fx/analytics/PnlValue.module.css` — add a label style for the `USD` prefix.
- **Edit** `packages/client-react/tests/ui/contract/specs/fx/analytics/PnlValue.contract.spec.ts` — correct expectations.
- **Edit** `packages/client-react/tests/ui/contract/specs/fx/analytics/AnalyticsPanel.contract.spec.ts` — correct `latestPnlText()` expectations.
- **Edit** `packages/client-react/tests/ui/contract/shared/pages/fx/analytics/AnalyticsPanelPage.ts` — `latestPnlText()` must read the value span, not the whole `USD …` block (clarified below).
- **Edit** `specs/features/analytics/profit-and-loss.feature` — tighten the "USD"/commas scenarios.

### Interfaces
```ts
// packages/domain/src/analytics/formatPnlValue.ts
export function formatPnlValue(value: number): string;
// Returns sign ("+" for value >= 0, "-" otherwise, baked into the number's own sign)
// followed by the value formatted as a whole number with locale comma grouping.
// e.g. 12345 -> "+12,345", -12345 -> "-12,345", 0 -> "+0".
```

### Steps

1. **[ ] Write the golden fixture (failing-test input).** Create `packages/domain/src/analytics/__golden__/formatPnlValue.original.json`:
   ```json
   {
     "_source": "rtc-original@4a31f01 packages/client/src/client/App/Analytics/ProfitAndLoss/LastPosition.tsx:16 + utils/formatNumber.ts:95-99,136",
     "cases": [
       { "input": 0,        "expected": "+0" },
       { "input": 12345,    "expected": "+12,345" },
       { "input": -12345,   "expected": "-12,345" },
       { "input": 1500000,  "expected": "+1,500,000" },
       { "input": 500,      "expected": "+500" }
     ]
   }
   ```
   > Note: the fixture holds only the value portion (no `"USD "`). The `"USD "` prefix is UI chrome asserted in the contract spec, not in the pure formatter.

2. **[ ] Write the failing domain test.** Create `packages/domain/src/analytics/formatPnlValue.test.ts`:
   ```ts
   import { readFileSync } from "node:fs";
   import { fileURLToPath } from "node:url";

   import { describe, expect, it } from "vitest";

   import { formatPnlValue } from "./formatPnlValue.js";

   interface Golden {
     readonly _source: string;
     readonly cases: ReadonlyArray<{ input: number; expected: string }>;
   }

   const golden: Golden = JSON.parse(
     readFileSync(
       fileURLToPath(
         new URL("./__golden__/formatPnlValue.original.json", import.meta.url),
       ),
       "utf8",
     ),
   );

   describe("formatPnlValue (golden: original LastPosition + formatAsWholeNumber)", () => {
     for (const { input, expected } of golden.cases) {
       it(`formats ${input} as ${expected}`, () => {
         expect(formatPnlValue(input)).toBe(expected);
       });
     }
   });
   ```
   > The domain golden loader (`loadGolden`) lives in the client-react tests tree; the domain test reads its own co-located fixture directly (shown above) since domain may not import client-react test helpers. If Task 0 also ships a domain-side `loadGolden`, swap the `readFileSync` block for it.

3. **[ ] Run — confirm it fails.**
   ```
   pnpm --filter @rtc/domain exec vitest run src/analytics/formatPnlValue.test.ts
   ```
   Expect: module-not-found for `./formatPnlValue.js`.

4. **[ ] Implement the formatter.** Create `packages/domain/src/analytics/formatPnlValue.ts`:
   ```ts
   // Mirrors the original client's formatAsWholeNumber = precisionNumberFormatter(0):
   // Intl.NumberFormat with 0 fraction digits (comma grouping, rounding).
   // See rtc-original@4a31f01 utils/formatNumber.ts:95-99,136 and
   // App/Analytics/ProfitAndLoss/LastPosition.tsx:16.
   const wholeNumber = new Intl.NumberFormat("en-US", {
     minimumFractionDigits: 0,
     maximumFractionDigits: 0,
   });

   /**
    * Formats a P&L value the way the original "last position" figure does:
    * a leading "+" for non-negative values (negatives carry their own "-"),
    * then the value as a whole number with locale comma grouping.
    */
   export function formatPnlValue(value: number): string {
     const sign = value >= 0 ? "+" : "";
     return `${sign}${wholeNumber.format(value)}`;
   }
   ```
   > Locale is pinned to `"en-US"` to match the verified golden grouping deterministically across CI/sandbox runtimes (the original uses `"default"`, but the golden contract requires a fixed separator).

5. **[ ] Export from domain.** In `packages/domain/src/index.ts`, under the `// Analytics` block (currently only the `type` re-export at lines 3-8), add:
   ```ts
   export { formatPnlValue } from "./analytics/formatPnlValue.js";
   ```

6. **[ ] Run — confirm domain test passes.**
   ```
   pnpm --filter @rtc/domain exec vitest run src/analytics/formatPnlValue.test.ts
   ```

7. **[ ] Build domain so client-react sees the new export.**
   ```
   pnpm --filter @rtc/domain build
   ```

8. **[ ] Rewrite `PnlValue.tsx`.** Replace the whole file `packages/client-react/src/ui/fx/analytics/PnlValue.tsx`:
   ```tsx
   import type { ReactElement } from "react";

   import { formatPnlValue } from "@rtc/domain";

   import styles from "./PnlValue.module.css";

   interface PnlValueProps {
     value: number;
   }

   export function PnlValue({ value }: PnlValueProps): ReactElement {
     const sign = value >= 0 ? "pos" : "neg";

     return (
       <div data-sign={sign} className={styles.value}>
         <span className={styles.currency}>USD</span>
         <span className={styles.amount} data-testid="lastPosition">
           {formatPnlValue(value)}
         </span>
       </div>
     );
   }
   ```

9. **[ ] Add the `USD` label style.** Append to `packages/client-react/src/ui/fx/analytics/PnlValue.module.css`:
   ```css
   .currency {
     margin-right: 6px;
     color: var(--text-muted);
   }

   .amount {
     /* sign + value; colour inherited from .value[data-sign] */
   }
   ```

10. **[ ] Run — confirm the existing contract spec now FAILS** (it still expects abbreviated text and no `USD`):
    ```
    pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/fx/analytics/PnlValue.contract.spec.ts
    ```

11. **[ ] Correct the PnlValue contract spec.** The page object `PnlValuePage.text()` returns the whole trimmed `textContent` — which is now `"USD +500"`. Replace `packages/client-react/tests/ui/contract/specs/fx/analytics/PnlValue.contract.spec.ts`:
    ```ts
    import { PnlValue } from "@ui-contract/components";
    import { mount } from "@ui-contract/mount";
    import { describe, expect, it } from "vitest";

    describe("PnlValue", () => {
      it("shows a positive value with a USD prefix and + sign", () => {
        expect(mount(PnlValue, { props: { value: 500 } }).text()).toBe(
          "USD +500",
        );
      });

      it("shows a negative value with a USD prefix and - sign", () => {
        expect(mount(PnlValue, { props: { value: -500 } }).text()).toBe(
          "USD -500",
        );
      });

      it("treats zero as positive", () => {
        expect(mount(PnlValue, { props: { value: 0 } }).text()).toBe("USD +0");
      });

      it("formats thousands as a whole number with comma grouping", () => {
        expect(mount(PnlValue, { props: { value: 12_345 } }).text()).toBe(
          "USD +12,345",
        );
        expect(mount(PnlValue, { props: { value: -12_345 } }).text()).toBe(
          "USD -12,345",
        );
      });

      it("formats millions as a whole number with comma grouping", () => {
        expect(mount(PnlValue, { props: { value: 1_500_000 } }).text()).toBe(
          "USD +1,500,000",
        );
      });

      it("re-renders when its value prop changes", () => {
        const pnl = mount(PnlValue, { props: { value: 100 } });
        expect(pnl.text()).toBe("USD +100");
        pnl.setProps({ value: 12_345 });
        expect(pnl.text()).toBe("USD +12,345");
      });
    });
    ```

12. **[ ] Correct the `AnalyticsPanelPage.latestPnlText()` reader.** With `USD` now inside the value block, `latestPnlText()` returns `"USD +…"`. Tighten it to read only the amount span. In `packages/client-react/tests/ui/contract/shared/pages/fx/analytics/AnalyticsPanelPage.ts`, replace the `latestPnlText()` body:
    ```ts
      /** The formatted latest-P&L amount the panel summarises, e.g. "+12,345". */
      latestPnlText(): string {
        const amount = within(this.root).queryByTestId("lastPosition");
        return amount?.textContent?.trim() ?? "";
      }
    ```
    > This makes the assertion target the amount only (mirrors the original `data-testid="lastPosition"` at `LastPosition.tsx:34`), so the panel spec asserts formatting without re-asserting the `USD` chrome.

13. **[ ] Correct the AnalyticsPanel contract spec.** In `packages/client-react/tests/ui/contract/specs/fx/analytics/AnalyticsPanel.contract.spec.ts`, update every `latestPnlText()` expectation to the new whole-number format:
    - line 67: `expect(panel.latestPnlText()).toBe("+1.50m");` → `expect(panel.latestPnlText()).toBe("+1,500,000");`
    - line 75: `expect(panel.latestPnlText()).toBe("+0");` → unchanged (`"+0"`).
    - line 85: `expect(panel.latestPnlText()).toBe("-2.5k");` → `expect(panel.latestPnlText()).toBe("-2,500");`
    - line 94: `expect(panel.latestPnlText()).toBe("+500");` → unchanged (`"+500"`).
    - line 100: `expect(panel.latestPnlText()).toBe("+12.5k");` → `expect(panel.latestPnlText()).toBe("+12,500");`
    - line 123: `expect(panel.latestPnlText()).toBe("+7.0k");` → `expect(panel.latestPnlText()).toBe("+7,000");`

14. **[ ] Run — confirm both contract specs pass.**
    ```
    pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/fx/analytics/PnlValue.contract.spec.ts tests/ui/contract/specs/fx/analytics/AnalyticsPanel.contract.spec.ts
    ```

15. **[ ] Correct the feature file.** In `specs/features/analytics/profit-and-loss.feature`:
    - Scenario "P&L value is formatted as a whole number with commas" (lines 48-50): tighten the `Then` to the concrete output:
      ```gherkin
      Scenario: P&L value is formatted as a whole number with commas
        Given the most recent P&L value is 12345
        Then the displayed value is "USD +12,345"
      ```
    - Scenario "Most recent P&L amount is displayed" (lines 34-36): leave the `USD` prefix wording (now correct), but ensure the example matches whole-number formatting — keep as-is (it is descriptive, not value-pinned).

16. **[ ] Note: regenerate visual goldens.** `PnlValue` is rendered in `analytics/populated`, `analytics/negative-pnl`, `analytics/millions` scenarios (`tests/ui/visual/playwright-ct/analytics.spec.tsx`). The label text changed (`+12.5k` → `USD +12,345` etc.), so **both committed golden sets** must be regenerated:
    ```
    pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react:update   # CI react/ set
    pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
    pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:update
    ```
    Regenerate the local `<arch>` set on the local machine too (per the dual-set rule).

17. **[ ] Commit.**
    ```
    git add -A
    git commit -m "feat(analytics): format latest P&L as USD whole-number with sign (T1.2)

    Match original LastPosition: USD prefix, leading + for non-negatives,
    formatAsWholeNumber (Intl 0-fraction comma grouping). Pure formatPnlValue
    in @rtc/domain, golden-fixtured from rtc-original@4a31f01.

    Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
    ```

---

### Task T1.3 — PnL-per-pair bar: scaled default label + hover-precise (2 dp)

### Background — current vs. original

**Clone — `packages/client-react/src/ui/fx/analytics/PairPnlBars.tsx:11-16`** is a static abbreviated label with an `m` branch and no hover:

```tsx
function formatPnl(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return value.toFixed(0);
}
```
Label is rendered once at `:46-48` with no hover state.

**Original — `App/Analytics/PnL/PNLBar.tsx`:**
- `:29` `const formatToPrecision2 = precisionNumberFormatter(2)`
- `:42` `const [hovering, setHovering] = useState(false)`
- `:49` `const price = formatWithScale(profitOrLossValue, formatAsWholeNumber)`
- `:50` `const hoverPrice = formatToPrecision2(profitOrLossValue)`
- `:73-74` `onMouseEnter={() => setHovering(true)}` / `onMouseLeave={() => setHovering(false)}`
- `:81` `{hovering ? hoverPrice : price}`

**Original — `utils/formatNumber.ts`:**
- `scaleNumber` (`:37-57`): picks scale by magnitude — `>= t`→`t`, `>= b`→`b`, `>= m`→`m`, `>= k`→`k`, else `""`; value divided by the chosen multiplier (`k=1e3`, `m=1e6`, `b=1e9`, `t=1e12`).
- `formatWithScale(num, format)` (`:144-147`): `format(value) + scale`.
- `formatAsWholeNumber` (`:136`) = `precisionNumberFormatter(0)` = `Intl.NumberFormat` 0 fraction digits (comma grouping).
- `precisionNumberFormatter(2)` (`:95-99`) = `Intl.NumberFormat` `{ min/maxFractionDigits: 2 }` (comma grouping, 2 dp).

**Verified original outputs:**

| input | default `formatWithScale(v, formatAsWholeNumber)` | hover `precisionNumberFormatter(2)` |
|---|---|---|
| `1234` | `1k` | `1,234.00` |
| `12345678` | `12m` | `12,345,678.00` |
| `564.97` | `565` | `564.97` |
| `-1656.82` | `-2k` | `-1,656.82` |
| `1382.31` | `1k` | `1,382.31` |
| `0` | `0` | `0.00` |

> **Feature-file correction required:** line 115 currently claims `for a P&L of 12345678 the displayed value is "12,346k"`. That is **wrong** — `scaleNumber(12345678)` selects the `m` scale (magnitude ≥ 1,000,000), so the original renders **`12m`**, not `12,346k`. The plan corrects this.

### Decision
`formatWithScale` (with whole-number mantissa) and `precisionNumberFormatter(2)` are **pure number formatting → domain.** Expose `formatWithScale` and `formatPrecise2` (a fixed 2-dp formatter) from `@rtc/domain`, golden-fixtured. The hover state stays in the UI component.

### Files
- **New** `packages/domain/src/analytics/formatScale.ts` — `scaleNumber`, `formatWithScale`, `formatPrecise2`.
- **New** `packages/domain/src/analytics/__golden__/formatScale.original.json`
- **New** `packages/domain/src/analytics/formatScale.test.ts`
- **Edit** `packages/domain/src/index.ts` — export the new functions.
- **Edit** `packages/client-react/src/ui/fx/analytics/PairPnlBars.tsx` — use domain formatters + per-row hover.
- **Edit** `packages/client-react/src/ui/fx/analytics/PairPnlBars.module.css` — hover affordance for the label.
- **New** `packages/client-react/tests/ui/contract/specs/fx/analytics/PairPnlBars.contract.spec.ts`
- **New** page object + registration (swap-trio) — see steps.
- **Edit** `tests/ui/contract/vitest.config.ts` — remove `PairPnlBars.tsx` from the coverage `exclude` list (it now has DOM-assertable hover logic).
- **Edit** `specs/features/analytics/profit-and-loss.feature` lines 112-119.

### Interfaces
```ts
// packages/domain/src/analytics/formatScale.ts
export type Scale = "k" | "m" | "b" | "t" | "";
export function scaleNumber(value: number): { value: number; scale: Scale };
export function formatWithScale(value: number): string; // whole-number mantissa + scale suffix
export function formatPrecise2(value: number): string;  // Intl 2-dp, comma grouping
```

### Steps

1. **[ ] Write the golden fixture.** Create `packages/domain/src/analytics/__golden__/formatScale.original.json`:
   ```json
   {
     "_source": "rtc-original@4a31f01 utils/formatNumber.ts:37-57,95-99,136,144-147 + App/Analytics/PnL/PNLBar.tsx:49-50",
     "cases": [
       { "input": 1234,      "expected": { "withScale": "1k",  "precise2": "1,234.00" } },
       { "input": 12345678,  "expected": { "withScale": "12m", "precise2": "12,345,678.00" } },
       { "input": 564.97,    "expected": { "withScale": "565", "precise2": "564.97" } },
       { "input": -1656.82,  "expected": { "withScale": "-2k", "precise2": "-1,656.82" } },
       { "input": 1382.31,   "expected": { "withScale": "1k",  "precise2": "1,382.31" } },
       { "input": 0,         "expected": { "withScale": "0",   "precise2": "0.00" } }
     ]
   }
   ```

2. **[ ] Write the failing domain test.** Create `packages/domain/src/analytics/formatScale.test.ts`:
   ```ts
   import { readFileSync } from "node:fs";
   import { fileURLToPath } from "node:url";

   import { describe, expect, it } from "vitest";

   import { formatPrecise2, formatWithScale } from "./formatScale.js";

   interface Golden {
     readonly _source: string;
     readonly cases: ReadonlyArray<{
       input: number;
       expected: { withScale: string; precise2: string };
     }>;
   }

   const golden: Golden = JSON.parse(
     readFileSync(
       fileURLToPath(
         new URL("./__golden__/formatScale.original.json", import.meta.url),
       ),
       "utf8",
     ),
   );

   describe("formatScale (golden: original PNLBar default + hover)", () => {
     for (const { input, expected } of golden.cases) {
       it(`scales ${input} to ${expected.withScale}`, () => {
         expect(formatWithScale(input)).toBe(expected.withScale);
       });
       it(`renders ${input} to 2dp as ${expected.precise2}`, () => {
         expect(formatPrecise2(input)).toBe(expected.precise2);
       });
     }
   });
   ```

3. **[ ] Run — confirm it fails.**
   ```
   pnpm --filter @rtc/domain exec vitest run src/analytics/formatScale.test.ts
   ```
   Expect: module-not-found for `./formatScale.js`.

4. **[ ] Implement the formatters.** Create `packages/domain/src/analytics/formatScale.ts`:
   ```ts
   // Pure re-implementation of the original number-scaling helpers.
   // See rtc-original@4a31f01 utils/formatNumber.ts:37-57 (scaleNumber),
   // :144-147 (formatWithScale), :136 (formatAsWholeNumber), :95-99 (precision).

   export type Scale = "k" | "m" | "b" | "t" | "";

   const k = 1_000;
   const m = k * k;
   const b = m * k;
   const t = b * k;

   const wholeNumber = new Intl.NumberFormat("en-US", {
     minimumFractionDigits: 0,
     maximumFractionDigits: 0,
   });

   const precise2 = new Intl.NumberFormat("en-US", {
     minimumFractionDigits: 2,
     maximumFractionDigits: 2,
   });

   export function scaleNumber(value: number): { value: number; scale: Scale } {
     const magnitude = Math.abs(value);
     if (magnitude >= t) return { value: value / t, scale: "t" };
     if (magnitude >= b) return { value: value / b, scale: "b" };
     if (magnitude >= m) return { value: value / m, scale: "m" };
     if (magnitude >= k) return { value: value / k, scale: "k" };
     return { value, scale: "" };
   }

   /**
    * Original `formatWithScale(value, formatAsWholeNumber)`: scale the number,
    * format the mantissa as a whole number (comma grouping, rounding), then
    * append the scale suffix. e.g. 1234 -> "1k", 12345678 -> "12m", 565 stays "565".
    */
   export function formatWithScale(value: number): string {
     const { value: scaled, scale } = scaleNumber(value);
     return wholeNumber.format(scaled) + scale;
   }

   /** Original `precisionNumberFormatter(2)`: 2 fraction digits, comma grouping. */
   export function formatPrecise2(value: number): string {
     return precise2.format(value);
   }
   ```

5. **[ ] Export from domain.** In `packages/domain/src/index.ts`, in the `// Analytics` block add:
   ```ts
   export type { Scale } from "./analytics/formatScale.js";
   export {
     formatPrecise2,
     formatWithScale,
     scaleNumber,
   } from "./analytics/formatScale.js";
   ```

6. **[ ] Run — confirm domain test passes, then build domain.**
   ```
   pnpm --filter @rtc/domain exec vitest run src/analytics/formatScale.test.ts
   pnpm --filter @rtc/domain build
   ```

7. **[ ] Rewrite `PairPnlBars.tsx` with per-row hover.** Replace `packages/client-react/src/ui/fx/analytics/PairPnlBars.tsx`:
   ```tsx
   import { useState } from "react";
   import type { CSSProperties, ReactElement } from "react";

   import { type CurrencyPairPosition, formatPrecise2, formatWithScale } from "@rtc/domain";

   import styles from "./PairPnlBars.module.css";

   interface PairPnlBarsProps {
     positions: readonly CurrencyPairPosition[];
   }

   export function PairPnlBars({ positions }: PairPnlBarsProps): ReactElement {
     const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);

     const maxAbsPnl = Math.max(
       ...positions.map((p) => {
         return Math.abs(p.basePnl);
       }),
       1,
     );

     return (
       <div className={styles.container}>
         {positions.map((pos) => {
           const fraction = pos.basePnl / maxAbsPnl;
           const sign = pos.basePnl >= 0 ? "pos" : "neg";
           const barWidth = `${Math.abs(fraction) * 50}%`;
           const hovering = hoveredSymbol === pos.symbol;
           const label = hovering
             ? formatPrecise2(pos.basePnl)
             : formatWithScale(pos.basePnl);

           return (
             <div key={pos.symbol} className={styles.row}>
               <span className={styles.symbol}>{pos.symbol}</span>
               <div className={styles.barContainer}>
                 {/* Center line */}
                 <div className={styles.centerLine} />
                 {/* Bar: continuous width via custom property; side via data-sign */}
                 <div
                   data-sign={sign}
                   className={styles.bar}
                   style={{ "--bar-width": barWidth } as CSSProperties}
                 />
               </div>
               <span
                 data-sign={sign}
                 data-testid={`priceLabel-${pos.symbol}`}
                 className={styles.pnlLabel}
                 onMouseEnter={() => {
                   return setHoveredSymbol(pos.symbol);
                 }}
                 onMouseLeave={() => {
                   return setHoveredSymbol(null);
                 }}
               >
                 {label}
               </span>
             </div>
           );
         })}
       </div>
     );
   }
   ```

8. **[ ] Add a hover affordance.** Append to `packages/client-react/src/ui/fx/analytics/PairPnlBars.module.css`:
   ```css
   .pnlLabel {
     cursor: default;
   }
   ```
   > (Append the rule; the existing `.pnlLabel` block at lines 59-64 already sets layout — this only adds the cursor.)

9. **[ ] Add the page object (swap-trio part 1).** Create `packages/client-react/tests/ui/contract/shared/pages/fx/analytics/PairPnlBarsPage.ts`:
   ```ts
   import { within } from "@testing-library/dom";

   import type { CurrencyPairPosition } from "@rtc/domain";

   import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

   export interface PairPnlBarsProps {
     positions: readonly CurrencyPairPosition[];
   }

   /** Page object for the PairPnlBars chart leaf. */
   export class PairPnlBarsPage extends MountedComponent<PairPnlBarsProps> {
     /** The P&L label text for one pair symbol, e.g. "1k" (or "1,234.00" while hovered). */
     labelFor(symbol: string): string {
       const el = within(this.root).queryByTestId(`priceLabel-${symbol}`);
       return el?.textContent?.trim() ?? "";
     }

     /** Move the pointer onto a pair's label to switch it to the precise format. */
     hover(symbol: string): void {
       const el = within(this.root).getByTestId(`priceLabel-${symbol}`);
       el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
     }

     /** Move the pointer off a pair's label to return it to the scaled format. */
     unhover(symbol: string): void {
       const el = within(this.root).getByTestId(`priceLabel-${symbol}`);
       el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
     }
   }
   ```

10. **[ ] Register the component (swap-trio part 2 — shared token + React element).**
    - In `packages/client-react/tests/ui/contract/shared/components.ts`, add the import (near the other `pages/fx/analytics` imports at lines 11-15):
      ```ts
      import {
        PairPnlBarsPage,
        type PairPnlBarsProps,
      } from "./pages/fx/analytics/PairPnlBarsPage";
      ```
      and add the token export near `PnlValue` (after line 121):
      ```ts
      export const PairPnlBars = component<PairPnlBarsProps, PairPnlBarsPage>(
        (ctx) => {
          return new PairPnlBarsPage(ctx);
        },
      );
      ```
    - In `packages/client-react/tests/ui/contract/react/registry.tsx`:
      - add the component import near line 34:
        ```ts
        import { PairPnlBars as PairPnlBarsComponent } from "#/ui/fx/analytics/PairPnlBars";
        ```
      - add `PairPnlBars` to the destructured import from `../shared/components` (alongside `PnlValue` at line 87).
      - add a registry entry (after the `PnlValue` entry, line 132):
        ```tsx
        [
          PairPnlBars,
          (p: Record<string, unknown>): ReactElement => {
            return (
              <PairPnlBarsComponent
                positions={
                  (p.positions as readonly CurrencyPairPosition[]) ?? []
                }
              />
            );
          },
        ],
        ```
      - ensure `CurrencyPairPosition` is imported from `@rtc/domain` at the top of `registry.tsx` (add to the existing `@rtc/domain` type import block, lines 3-14).

11. **[ ] Write the failing contract spec (swap-trio part 3).** Create `packages/client-react/tests/ui/contract/specs/fx/analytics/PairPnlBars.contract.spec.ts`:
    ```ts
    import { PairPnlBars } from "@ui-contract/components";
    import { cleanupMounted, mount } from "@ui-contract/mount";
    import { afterEach, describe, expect, it } from "vitest";

    import type { CurrencyPairPosition } from "@rtc/domain";

    afterEach(() => {
      return cleanupMounted();
    });

    const pos = (symbol: string, basePnl: number): CurrencyPairPosition => {
      return { symbol, basePnl, baseTradedAmount: 0, counterTradedAmount: 0 };
    };

    describe("PairPnlBars", () => {
      it("shows each pair's P&L with whole-number scaled notation", () => {
        const bars = mount(PairPnlBars, {
          props: { positions: [pos("EURUSD", 1234), pos("USDJPY", 12_345_678)] },
        });
        expect(bars.labelFor("EURUSD")).toBe("1k");
        expect(bars.labelFor("USDJPY")).toBe("12m");
      });

      it("switches to a precise 2dp comma format while hovered", () => {
        const bars = mount(PairPnlBars, {
          props: { positions: [pos("EURUSD", 1234)] },
        });
        expect(bars.labelFor("EURUSD")).toBe("1k");
        bars.hover("EURUSD");
        expect(bars.labelFor("EURUSD")).toBe("1,234.00");
        bars.unhover("EURUSD");
        expect(bars.labelFor("EURUSD")).toBe("1k");
      });

      it("renders sub-thousand and negative values without a scale suffix change", () => {
        const bars = mount(PairPnlBars, {
          props: { positions: [pos("GBPUSD", -1656.82), pos("EURJPY", 564.97)] },
        });
        expect(bars.labelFor("GBPUSD")).toBe("-2k");
        expect(bars.labelFor("EURJPY")).toBe("565");
        bars.hover("GBPUSD");
        expect(bars.labelFor("GBPUSD")).toBe("-1,656.82");
      });
    });
    ```

12. **[ ] Drop `PairPnlBars.tsx` from the coverage exclude list.** In `packages/client-react/tests/ui/contract/vitest.config.ts`, remove line 44 (`"src/ui/fx/analytics/PairPnlBars.tsx",`) from the `coverage.exclude` array — it now has DOM-assertable hover behaviour and a contract spec.

13. **[ ] Run — confirm the new contract spec passes.**
    ```
    pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/fx/analytics/PairPnlBars.contract.spec.ts
    ```

14. **[ ] Correct the feature file (lines 112-119).** In `specs/features/analytics/profit-and-loss.feature` replace:
    ```gherkin
      Scenario: Each currency pair shows its P&L value with abbreviated notation
        Given a currency pair has a P&L of 1234
        Then the displayed value is "1k"
        And for a P&L of 12345678 the displayed value is "12m"

      Scenario: Hovering over a P&L bar value shows the precise amount
        When the user hovers over a currency pair P&L value
        Then the display switches to a precise number formatted to 2 decimal places with thousands separators
        And for a P&L of 1234 the hovered value is "1,234.00"
    ```
    > The only value change is `12,346k` → **`12m`** (matching the verified original `scaleNumber`), plus a concrete hover example.

15. **[ ] Regenerate visual goldens** (PairPnlBars labels changed: `1k`/`12m` and a `565` no longer `0k` etc.). Affected scenarios: `analytics/populated`, `analytics/negative-pnl`, `analytics/millions`, `analytics/flat-positions`.
    ```
    pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react:update
    pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
    pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:update
    ```
    Regenerate the local `<arch>` set on the local machine too.

16. **[ ] Commit.**
    ```
    git add -A
    git commit -m "feat(analytics): scaled pair-PnL label with hover-precise 2dp (T1.3)

    Match original PNLBar: default formatWithScale(value, formatAsWholeNumber)
    (k/m scale, whole mantissa), hover -> precisionNumberFormatter(2). Pure
    formatWithScale/formatPrecise2 in @rtc/domain, golden-fixtured. Corrects
    feature claim 12,346k -> 12m.

    Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
    ```

---

### Task T1.4 — Position bubbles: per-currency aggregation + traded-amount sizing/colour + drag + tooltip

### Background — current vs. original

**Clone — `packages/client-react/src/ui/fx/analytics/PositionBubbles.tsx`** renders one static flex-wrapped div per **pair**, sized/coloured by **`basePnl`**, labelled with the 3-char base of the pair symbol, no drag, no tooltip:

```tsx
const MIN_RADIUS = 15;
const MAX_RADIUS = 60;

function computeRadius(basePnl: number, maxAbsPnl: number): number {
  if (maxAbsPnl === 0) return MIN_RADIUS;
  const fraction = Math.abs(basePnl) / maxAbsPnl;
  return MIN_RADIUS + fraction * (MAX_RADIUS - MIN_RADIUS);
}
// …maps over positions, key=pos.symbol, sign = basePnl >= 0, symbol = pos.symbol.slice(0,3)
```

**Clone domain shape — `packages/domain/src/analytics/position.ts:1-6`:** `CurrencyPairPosition { symbol, basePnl, baseTradedAmount, counterTradedAmount }`. **Clone simulator — `AnalyticsSimulator.ts:15-40`** supplies 9 pairs; e.g. `EURUSD { basePnl: 564.97, baseTradedAmount: -2_000_000, counterTradedAmount: 2_726_570 }`, and four all-zero pairs (`GBPJPY`, `EURJPY`, `AUDUSD`, `NZDUSD`, `EURCAD`, `EURAUD`).

**Original — `App/Analytics/Positions/data.ts:46-90`** aggregates per **currency**, not per pair:
- `:47-57` for each pair `symbol`, split into `base`/`terms` from `currencyPairs[symbol]`; accumulate `acc[base] += baseTradedAmount`, `acc[counter] += counterTradedAmount`.
- `:58-63` map to `{ symbol: currency, baseTradedAmount: total }` and **filter out zero** (`baseTradedAmount !== 0`).
- `:66-79` radius scale: `minR=15`, `maxR=60`, domain = `[minValue, maxValue]` of `abs(baseTradedAmount)` (where `minValue` is the real min unless it equals max, in which case 0), range `[15, 60]` — a `d3.scaleLinear`.
- `:87-89` colour by **sign of the aggregated traded amount**: `> 0` → buy/positive colour, else sell/negative.
- `:96` `r: scales.r(Math.abs(dataObj.baseTradedAmount))`.
- `:97` `text: formatAsWholeNumber(dataObj.baseTradedAmount)` (the tooltip amount).

**Original — `App/Analytics/Positions/BubbleChart.tsx`:**
- `:85-98` `d3.forceSimulation` with `forceX(width*0.5).strength(0.1)`, `forceY(height*0.5).strength(0.1)`.
- `:101-108` `forceCollide().strength(0.5).radius(d => d.r + COLLIDE_BORDER_WIDTH)` where `COLLIDE_BORDER_WIDTH = 2` (`:20`); `:109` `.alphaMin(0.05)`.
- `:121-130` `d3.drag()` with `on("start"/"drag", onMove)` setting `d.fx=event.x, d.fy=event.y`; `on("end", …)` sets **`d.fx=null; d.fy=null`** (drift-back) and `force.alphaTarget(0)`.
- `:63-73` `positionTooltip` sets tooltip text to **`` `${id} ${node.text}` ``** = `"{CURRENCY} {formatAsWholeNumber(amount)}"`.
- `:131-138` `mouseover` shows tooltip, `mousemove` repositions, `mouseout` hides.

> Currency derivation: the original reads `currencyPairs[symbol].base`/`.terms`. The clone has no separate currency-pairs map flowing into PositionBubbles, but the symbol is a 6-char pair — split `base = symbol.slice(0,3)`, `counter = symbol.slice(3,6)`, exactly as the domain's `deriveBaseTerm` (`currencyPair.ts:15-20`). Use that.

**Worked aggregation example** (from the 9 simulator pairs, taking only the 3 non-zero ones EURUSD/USDJPY/GBPUSD): base contributions — EUR `-2,000,000`; USD `-1,000,000` (USDJPY base) `-1,000,000` (GBPUSD base) = `-2,000,000`; USD also gets counter from EURUSD `+2,726,570` and GBPUSD `+1,638,980`; JPY gets counter `+102,144,000`; net per currency = sum across base & counter. The pure function must reproduce this fold exactly. The golden fixture pins it.

### Decision — three separable sub-tasks
- **(a)** Pure per-currency aggregation in **domain** (no d3), golden-fixtured.
- **(b)** Add d3 packages to **client-react only** (`d3-scale`, `d3-force`, `d3-drag`, `d3-selection` + `@types/*`); domain stays d3-free.
- **(c)** Rewrite UI `PositionBubbles.tsx` to consume the aggregation + d3 force/drag/tooltip.

### Files
- **New** `packages/domain/src/analytics/aggregatePositions.ts`
- **New** `packages/domain/src/analytics/__golden__/aggregatePositions.original.json`
- **New** `packages/domain/src/analytics/aggregatePositions.test.ts`
- **Edit** `packages/domain/src/index.ts` — export aggregation.
- **Edit** `packages/client-react/package.json` — add d3 deps.
- **Rewrite** `packages/client-react/src/ui/fx/analytics/PositionBubbles.tsx`
- **Edit** `packages/client-react/src/ui/fx/analytics/PositionBubbles.module.css` — SVG/tooltip styling.
- **New** contract spec + page object + registration (swap-trio).
- **Edit** `specs/features/analytics/profit-and-loss.feature` lines 61-94.

### Sub-task (a) — pure per-currency aggregation (domain)

#### Interface
```ts
// packages/domain/src/analytics/aggregatePositions.ts
export interface CurrencyPositionNode {
  readonly currency: string;       // e.g. "EUR"
  readonly tradedAmount: number;   // aggregated base+counter traded amount
  readonly radius: number;         // 15..60, linear by abs(tradedAmount)
  readonly sign: "pos" | "neg";    // sign of tradedAmount
  readonly text: string;           // formatAsWholeNumber(tradedAmount) — tooltip amount
}
export const POSITION_MIN_RADIUS: 15;
export const POSITION_MAX_RADIUS: 60;
export function aggregatePositionsByCurrency(
  positions: readonly CurrencyPairPosition[],
): readonly CurrencyPositionNode[];
```

#### Steps

1. **[ ] Write the golden fixture.** Compute the expected output by running the original fold + scale once. Create `packages/domain/src/analytics/__golden__/aggregatePositions.original.json`. Use a small, hand-verifiable input plus the full simulator set. *Compute the `expected` arrays with the helper script in step 1a before pasting — do not hand-guess radii.*

   1a. **[ ] Generate the expected values deterministically.** Run this throwaway node script (mirrors `data.ts:46-99` exactly) and paste its JSON into the fixture:
   ```
   node --input-type=module -e '
   const whole = new Intl.NumberFormat("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
   const base = s => s.slice(0,3), term = s => s.slice(3,6);
   function agg(positions){
     const acc = {};
     for (const p of positions){
       acc[base(p.symbol)] = (acc[base(p.symbol)]||0) + p.baseTradedAmount;
       acc[term(p.symbol)] = (acc[term(p.symbol)]||0) + p.counterTradedAmount;
     }
     const data = Object.entries(acc).map(([c,v])=>({currency:c,tradedAmount:v})).filter(d=>d.tradedAmount!==0);
     const baseValues = data.map(d=>Math.abs(d.tradedAmount));
     const maxValue = Math.max(...baseValues) || 0;
     const minValue = Math.min(...baseValues) !== maxValue ? Math.min(...baseValues) : 0;
     // d3.scaleLinear().domain([minValue,maxValue]).range([15,60]) evaluated at abs(v):
     const r = v => 15 + (Math.abs(v)-minValue)*(60-15)/(maxValue-minValue || 1);
     return data.map(d=>({
       currency:d.currency, tradedAmount:d.tradedAmount,
       radius: r(d.tradedAmount), sign: d.tradedAmount>0?"pos":"neg",
       text: whole.format(d.tradedAmount),
     }));
   }
   const sim = [
     {symbol:"EURUSD",baseTradedAmount:-2000000,counterTradedAmount:2726570},
     {symbol:"USDJPY",baseTradedAmount:-1000000,counterTradedAmount:102144000},
     {symbol:"GBPUSD",baseTradedAmount:-1000000,counterTradedAmount:1638980},
     {symbol:"GBPJPY",baseTradedAmount:0,counterTradedAmount:0},
     {symbol:"EURJPY",baseTradedAmount:0,counterTradedAmount:0},
     {symbol:"AUDUSD",baseTradedAmount:0,counterTradedAmount:0},
     {symbol:"NZDUSD",baseTradedAmount:0,counterTradedAmount:0},
     {symbol:"EURCAD",baseTradedAmount:0,counterTradedAmount:0},
     {symbol:"EURAUD",baseTradedAmount:0,counterTradedAmount:0},
   ];
   const tiny = [
     {symbol:"EURUSD",baseTradedAmount:1000000,counterTradedAmount:0},
     {symbol:"USDJPY",baseTradedAmount:-2000000,counterTradedAmount:0},
   ];
   console.log(JSON.stringify({sim:agg(sim), tiny:agg(tiny)},null,2));
   '
   ```
   Then create the fixture using the printed values:
   ```json
   {
     "_source": "rtc-original@4a31f01 App/Analytics/Positions/data.ts:46-99 (per-currency fold + scaleLinear[15,60] + formatAsWholeNumber); pair->currency via symbol.slice(0,3)/slice(3,6)",
     "cases": [
       { "input": [ /* the `tiny` simulator subset above */ ], "expected": [ /* paste tiny[] */ ] },
       { "input": [ /* the full 9-pair `sim` set above */ ],   "expected": [ /* paste sim[] */ ] }
     ]
   }
   ```
   > The `input` arrays use the full `CurrencyPairPosition` shape (`basePnl` may be `0` for these — aggregation ignores it). Keep numeric `radius` exact (floats) as printed.

2. **[ ] Write the failing domain test.** Create `packages/domain/src/analytics/aggregatePositions.test.ts`:
   ```ts
   import { readFileSync } from "node:fs";
   import { fileURLToPath } from "node:url";

   import { describe, expect, it } from "vitest";

   import type { CurrencyPairPosition } from "./position.js";
   import {
     aggregatePositionsByCurrency,
     type CurrencyPositionNode,
   } from "./aggregatePositions.js";

   interface Golden {
     readonly _source: string;
     readonly cases: ReadonlyArray<{
       input: CurrencyPairPosition[];
       expected: CurrencyPositionNode[];
     }>;
   }

   const golden: Golden = JSON.parse(
     readFileSync(
       fileURLToPath(
         new URL(
           "./__golden__/aggregatePositions.original.json",
           import.meta.url,
         ),
       ),
       "utf8",
     ),
   );

   describe("aggregatePositionsByCurrency (golden: original Positions/data.ts)", () => {
     golden.cases.forEach(({ input, expected }, i) => {
       it(`aggregates case ${i} to the original per-currency nodes`, () => {
         // Order-independent comparison keyed by currency.
         const got = [...aggregatePositionsByCurrency(input)].sort((a, b) => {
           return a.currency.localeCompare(b.currency);
         });
         const want = [...expected].sort((a, b) => {
           return a.currency.localeCompare(b.currency);
         });
         expect(got).toEqual(want);
       });

       it(`drops zero-net currencies in case ${i}`, () => {
         const got = aggregatePositionsByCurrency(input);
         expect(got.every((n) => n.tradedAmount !== 0)).toBe(true);
       });
     });

     it("scales radii linearly between 15 and 60", () => {
       const nodes = aggregatePositionsByCurrency(golden.cases[1].input);
       for (const n of nodes) {
         expect(n.radius).toBeGreaterThanOrEqual(15);
         expect(n.radius).toBeLessThanOrEqual(60);
       }
     });
   });
   ```

3. **[ ] Run — confirm it fails.**
   ```
   pnpm --filter @rtc/domain exec vitest run src/analytics/aggregatePositions.test.ts
   ```
   Expect: module-not-found for `./aggregatePositions.js`.

4. **[ ] Implement the pure aggregation (no d3 — re-implement the linear scale by hand).** Create `packages/domain/src/analytics/aggregatePositions.ts`:
   ```ts
   import { deriveBaseTerm } from "../fx/currencyPair.js";
   import type { CurrencyPairPosition } from "./position.js";

   export const POSITION_MIN_RADIUS = 15;
   export const POSITION_MAX_RADIUS = 60;

   export interface CurrencyPositionNode {
     readonly currency: string;
     readonly tradedAmount: number;
     readonly radius: number;
     readonly sign: "pos" | "neg";
     readonly text: string;
   }

   // Mirrors the original formatAsWholeNumber (Intl 0-fraction, comma grouping).
   const wholeNumber = new Intl.NumberFormat("en-US", {
     minimumFractionDigits: 0,
     maximumFractionDigits: 0,
   });

   /**
    * Per-currency aggregation matching rtc-original@4a31f01
    * App/Analytics/Positions/data.ts:46-99.
    *
    * For each pair, the base traded amount accrues to its base currency and the
    * counter traded amount to its counter currency. Currencies whose net traded
    * amount is zero are dropped. Radius is a linear scale of abs(tradedAmount)
    * over [minValue, maxValue] -> [15, 60], where minValue collapses to 0 when
    * all magnitudes are equal (original :73). Colour follows the sign of the net.
    */
   export function aggregatePositionsByCurrency(
     positions: readonly CurrencyPairPosition[],
   ): readonly CurrencyPositionNode[] {
     const totals = new Map<string, number>();
     for (const p of positions) {
       const { base, terms } = deriveBaseTerm(p.symbol);
       totals.set(base, (totals.get(base) ?? 0) + p.baseTradedAmount);
       totals.set(terms, (totals.get(terms) ?? 0) + p.counterTradedAmount);
     }

     const data = [...totals.entries()]
       .map(([currency, tradedAmount]) => {
         return { currency, tradedAmount };
       })
       .filter((d) => {
         return d.tradedAmount !== 0;
       });

     const magnitudes = data.map((d) => {
       return Math.abs(d.tradedAmount);
     });
     const maxValue = magnitudes.length > 0 ? Math.max(...magnitudes) : 0;
     const rawMin = magnitudes.length > 0 ? Math.min(...magnitudes) : 0;
     const minValue = rawMin !== maxValue ? rawMin : 0;

     const span = maxValue - minValue;
     const scaleRadius = (amount: number): number => {
       if (span === 0) return POSITION_MIN_RADIUS;
       const fraction = (Math.abs(amount) - minValue) / span;
       return (
         POSITION_MIN_RADIUS +
         fraction * (POSITION_MAX_RADIUS - POSITION_MIN_RADIUS)
       );
     };

     return data.map((d) => {
       return {
         currency: d.currency,
         tradedAmount: d.tradedAmount,
         radius: scaleRadius(d.tradedAmount),
         sign: d.tradedAmount > 0 ? "pos" : "neg",
         text: wholeNumber.format(d.tradedAmount),
       };
     });
   }
   ```
   > `d3.scaleLinear().domain([min,max]).range([15,60])` is exactly `15 + (x-min)/(max-min)*(60-15)`; reproducing it by hand keeps d3 out of the domain (per the single-dep rule). Verify the golden matches; if any radius differs at float level, the hand scale and the script in 1a use identical arithmetic, so they will agree.

5. **[ ] Export from domain.** In `packages/domain/src/index.ts` `// Analytics` block add:
   ```ts
   export type { CurrencyPositionNode } from "./analytics/aggregatePositions.js";
   export {
     aggregatePositionsByCurrency,
     POSITION_MAX_RADIUS,
     POSITION_MIN_RADIUS,
   } from "./analytics/aggregatePositions.js";
   ```

6. **[ ] Run — confirm domain test passes, then build domain.**
   ```
   pnpm --filter @rtc/domain exec vitest run src/analytics/aggregatePositions.test.ts
   pnpm --filter @rtc/domain build
   ```

### Sub-task (b) — add d3 to client-react (domain stays d3-free)

7. **[ ] Add d3 packages to client-react only.** From the repo root (respect the 24h `minimumReleaseAge` cooldown; pick the latest *acceptable* versions):
   ```
   pnpm --filter @rtc/client-react add d3-scale d3-force d3-drag d3-selection
   pnpm --filter @rtc/client-react add -D @types/d3-scale @types/d3-force @types/d3-drag @types/d3-selection
   ```
   > Do **not** add the d3 meta-package — only the four submodules used (`scaleLinear` is already replicated in the domain, but `d3-scale` is still listed for parity should the UI prefer it; the UI below uses `d3-force`/`d3-drag`/`d3-selection` and consumes the pre-computed `radius` from the domain, so `d3-scale` can be dropped if unused — confirm with `knip` after wiring). Confirm `@rtc/domain` did **not** receive any d3 dependency: `grep -n d3 packages/domain/package.json` must be empty.

8. **[ ] Verify dep freshness.**
   ```
   pnpm outdated -r
   ```
   Confirm the four d3 packages are at their latest acceptable versions.

### Sub-task (c) — UI rewrite

9. **[ ] Rewrite `PositionBubbles.tsx` with d3 force/drag/tooltip.** Replace `packages/client-react/src/ui/fx/analytics/PositionBubbles.tsx`:
   ```tsx
   import { drag } from "d3-drag";
   import {
     forceCollide,
     forceSimulation,
     forceX,
     forceY,
     type SimulationNodeDatum,
   } from "d3-force";
   import { select } from "d3-selection";
   import { useLayoutEffect, useRef } from "react";
   import type { ReactElement } from "react";

   import {
     aggregatePositionsByCurrency,
     type CurrencyPairPosition,
   } from "@rtc/domain";

   import styles from "./PositionBubbles.module.css";

   interface PositionBubblesProps {
     positions: readonly CurrencyPairPosition[];
   }

   // Mirrors original BubbleChart.tsx:20 — collision padding beyond each radius.
   const COLLIDE_BORDER_WIDTH = 2;

   interface BubbleNode extends SimulationNodeDatum {
     id: string; // currency code
     r: number;
     sign: "pos" | "neg";
     text: string; // tooltip amount, formatAsWholeNumber
   }

   export function PositionBubbles({
     positions,
   }: PositionBubblesProps): ReactElement {
     const wrapperRef = useRef<HTMLDivElement | null>(null);
     // Keep the latest aggregation in a ref so the d3 effect (mounted once) can
     // read fresh data without re-running and tearing down the simulation.
     const nodesRef = useRef<BubbleNode[]>([]);
     nodesRef.current = aggregatePositionsByCurrency(positions).map((n) => {
       return {
         id: n.currency,
         r: n.radius,
         sign: n.sign,
         text: n.text,
       };
     });

     useLayoutEffect(() => {
       const chartDiv = wrapperRef.current;
       if (!chartDiv) return;

       const { width, height } = chartDiv.getBoundingClientRect();

       const tooltip = select(chartDiv)
         .append("div")
         .attr("class", styles.tooltip)
         .attr("data-testid", "tooltip")
         .style("visibility", "hidden");

       const svg = select(chartDiv)
         .append("svg")
         .attr("width", width)
         .attr("height", height);

       const positionTooltip = (
         event: MouseEvent | null,
         node: BubbleNode,
       ): void => {
         if (node.x === undefined || node.y === undefined) return;
         const tipWidth =
           (tooltip.node() as HTMLDivElement | null)?.clientWidth ?? 0;
         const posX = (event ? event.offsetX : node.x) - tipWidth / 2;
         const posY = event ? event.offsetY : node.y;
         tooltip
           .style("top", `${posY + 15}px`)
           .style("left", `${posX}px`)
           .text(`${node.id} ${node.text}`); // "{CURRENCY} {amount}"
       };

       const onMove = (
         event: { x: number; y: number; sourceEvent: MouseEvent },
         d: BubbleNode,
       ): void => {
         force.alpha(0.5).restart();
         positionTooltip(event.sourceEvent, d);
         d.fx = event.x;
         d.fy = event.y;
       };

       const force = forceSimulation<BubbleNode>()
         .force("forceX", forceX<BubbleNode>().strength(0.1).x(width * 0.5))
         .force("forceY", forceY<BubbleNode>().strength(0.1).y(height * 0.5))
         .force(
           "collide",
           forceCollide<BubbleNode>()
             .strength(0.5)
             .radius((d) => {
               return d.r + COLLIDE_BORDER_WIDTH;
             }),
         )
         .alphaMin(0.05);

       force.on("tick", () => {
         svg
           .selectAll<SVGGElement, BubbleNode>("g:not(.exit)")
           .data(force.nodes(), (d) => {
             return d.id;
           })
           .join(
             (enter) => {
               const g = enter
                 .append("g")
                 .attr("class", "node")
                 .attr("data-sign", (d) => {
                   return d.sign;
                 })
                 .style("visibility", "hidden")
                 .call(
                   drag<SVGGElement, BubbleNode>()
                     .on("start", onMove)
                     .on("drag", onMove)
                     .on("end", (event, d) => {
                       force.alphaTarget(0);
                       positionTooltip(event.sourceEvent, d);
                       d.fx = null; // drift back to centre
                       d.fy = null;
                     }),
                 )
                 .on("mouseover", (e: MouseEvent, d) => {
                   tooltip.style("visibility", "visible");
                   positionTooltip(e, d);
                 })
                 .on("mousemove", (e: MouseEvent, d) => {
                   positionTooltip(e, d);
                 })
                 .on("mouseout", () => {
                   tooltip.style("visibility", "hidden");
                 });
               g.append("circle")
                 .attr("r", (d) => {
                   return d.r;
                 })
                 .attr("cx", width / 2)
                 .attr("cy", height / 2);
               g.append("text")
                 .attr("text-anchor", "middle")
                 .attr("class", styles.label)
                 .attr("data-testid", (d) => {
                   return `positions-label-${d.id}`;
                 })
                 .text((d) => {
                   return d.id;
                 });
               return g;
             },
             (update) => {
               update.style("visibility", "visible");
               update
                 .select("circle")
                 .attr("cx", (d) => {
                   return d.x ?? width / 2;
                 })
                 .attr("cy", (d) => {
                   return d.y ?? height / 2;
                 })
                 .attr("r", (d) => {
                   return d.r;
                 });
               update
                 .select("text")
                 .attr("x", (d) => {
                   return d.x ?? width / 2;
                 })
                 .attr("y", (d) => {
                   return (d.y ?? height / 2) + 4;
                 });
               return update;
             },
             (exit) => {
               return exit.classed("exit", true).remove();
             },
           );
       });

       force.nodes(nodesRef.current).alpha(0.5).restart();

       return () => {
         force.stop();
         select(chartDiv).select("svg").remove();
         select(chartDiv).select(`.${styles.tooltip}`).remove();
       };
     }, []);

     return (
       <div
         ref={wrapperRef}
         data-testid="position-bubbles"
         className={styles.container}
       />
     );
   }
   ```
   > Faithful to `BubbleChart.tsx`: forceX/forceY strength `0.1`, forceCollide strength `0.5` radius `r + 2`, `alphaMin(0.05)`, drag-end `fx/fy = null` drift-back, tooltip text `"{currency} {amount}"`. Colour is carried as `data-sign` on each `<g>` so the CSS module owns the buy/sell colours (matching the clone's existing semantic-state convention) instead of injecting theme colours into the stream.

10. **[ ] Replace the CSS module.** Replace `packages/client-react/src/ui/fx/analytics/PositionBubbles.module.css`:
    ```css
    .container {
      position: relative;
      width: 100%;
      height: 180px;
      overflow: hidden;
    }

    .container svg {
      display: block;
    }

    /* Bubble fill/stroke by sign, applied to the <g class="node"> wrapper. */
    .container :global(g.node[data-sign="pos"]) circle {
      fill: rgba(34, 197, 94, 0.2);
      stroke: var(--accent-positive);
    }

    .container :global(g.node[data-sign="neg"]) circle {
      fill: rgba(239, 68, 68, 0.2);
      stroke: var(--accent-negative);
    }

    .label {
      font-size: 11px;
      font-weight: 600;
      fill: var(--text-primary);
      pointer-events: none;
    }

    .tooltip {
      position: absolute;
      padding: 2px 6px;
      font-size: 11px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-primary);
      border-radius: 3px;
      pointer-events: none;
      white-space: nowrap;
      z-index: 1;
    }
    ```
    > `:global(...)` is needed because d3 sets `class="node"` directly (not via the CSS-module hash). If the repo's stylelint forbids `:global` selectors, instead apply the hashed `styles.node` class to the `<g>` in step 9 and drop `:global`. Confirm against `pnpm lint:css`.

11. **[ ] Add the page object (swap-trio part 1).** Create `packages/client-react/tests/ui/contract/shared/pages/fx/analytics/PositionBubblesPage.ts`:
    ```ts
    import { within } from "@testing-library/dom";

    import type { CurrencyPairPosition } from "@rtc/domain";

    import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

    export interface PositionBubblesProps {
      positions: readonly CurrencyPairPosition[];
    }

    /** Page object for the PositionBubbles d3 chart. */
    export class PositionBubblesPage extends MountedComponent<PositionBubblesProps> {
      /** The currency codes shown as bubble labels, sorted. */
      currencyLabels(): string[] {
        return within(this.root)
          .queryAllByTestId(/^positions-label-/)
          .map((el) => {
            return el.textContent?.trim() ?? "";
          })
          .filter((t) => {
            return t.length > 0;
          })
          .sort();
      }

      /** The data-sign ("pos"/"neg") of a currency's bubble group. */
      signFor(currency: string): string | null {
        const label = within(this.root).queryByTestId(
          `positions-label-${currency}`,
        );
        const group = label?.closest("g.node");
        return group?.getAttribute("data-sign") ?? null;
      }

      /** The bubble radius (circle r attr) for a currency, as a number. */
      radiusFor(currency: string): number {
        const label = within(this.root).queryByTestId(
          `positions-label-${currency}`,
        );
        const circle = label?.closest("g.node")?.querySelector("circle");
        return Number(circle?.getAttribute("r") ?? "0");
      }

      /** The tooltip text after hovering a currency's bubble, e.g. "EUR -2,000,000". */
      tooltipAfterHover(currency: string): string {
        const label = within(this.root).getByTestId(
          `positions-label-${currency}`,
        );
        const group = label.closest("g.node");
        group?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        const tip = within(this.root).queryByTestId("tooltip");
        return tip?.textContent?.trim() ?? "";
      }
    }
    ```
    > jsdom (the contract env) does not run d3's force `tick` with real layout, and SVG geometry is approximate. Assertions therefore target **labels, sign, radius attr, and tooltip text** — the behavioural contract — not pixel coordinates or live drag physics (drag/drift-back is covered by the feature file + visual/e2e tiers).

12. **[ ] Register the component (swap-trio part 2).** As in T1.3 step 10, but for `PositionBubbles`:
    - In `shared/components.ts` import `PositionBubblesPage`/`PositionBubblesProps` and export:
      ```ts
      export const PositionBubbles = component<
        PositionBubblesProps,
        PositionBubblesPage
      >((ctx) => {
        return new PositionBubblesPage(ctx);
      });
      ```
    - In `react/registry.tsx` import `PositionBubbles as PositionBubblesComponent` from `#/ui/fx/analytics/PositionBubbles`, add `PositionBubbles` to the destructured `../shared/components` import, and add the registry entry:
      ```tsx
      [
        PositionBubbles,
        (p: Record<string, unknown>): ReactElement => {
          return (
            <PositionBubblesComponent
              positions={
                (p.positions as readonly CurrencyPairPosition[]) ?? []
              }
            />
          );
        },
      ],
      ```

13. **[ ] Write the failing contract spec (swap-trio part 3).** Create `packages/client-react/tests/ui/contract/specs/fx/analytics/PositionBubbles.contract.spec.ts`:
    ```ts
    import { PositionBubbles } from "@ui-contract/components";
    import { cleanupMounted, mount } from "@ui-contract/mount";
    import { afterEach, describe, expect, it } from "vitest";

    import type { CurrencyPairPosition } from "@rtc/domain";

    afterEach(() => {
      return cleanupMounted();
    });

    const pair = (
      symbol: string,
      baseTradedAmount: number,
      counterTradedAmount: number,
    ): CurrencyPairPosition => {
      return { symbol, basePnl: 0, baseTradedAmount, counterTradedAmount };
    };

    describe("PositionBubbles", () => {
      it("renders one bubble per non-zero currency, base+counter aggregated", () => {
        const bubbles = mount(PositionBubbles, {
          props: {
            positions: [
              pair("EURUSD", -2_000_000, 2_726_570),
              pair("USDJPY", -1_000_000, 102_144_000),
              pair("GBPJPY", 0, 0),
            ],
          },
        });
        // EUR (base of EURUSD), USD (base USDJPY + counter EURUSD),
        // JPY (counter USDJPY). GBPJPY is all-zero -> dropped.
        expect(bubbles.currencyLabels()).toEqual(["EUR", "JPY", "USD"]);
      });

      it("colours bubbles by the sign of the aggregated traded amount", () => {
        const bubbles = mount(PositionBubbles, {
          props: { positions: [pair("EURUSD", -2_000_000, 2_726_570)] },
        });
        expect(bubbles.signFor("EUR")).toBe("neg"); // -2,000,000
        expect(bubbles.signFor("USD")).toBe("pos"); // +2,726,570
      });

      it("scales radii within [15, 60]", () => {
        const bubbles = mount(PositionBubbles, {
          props: {
            positions: [
              pair("EURUSD", 1_000_000, 0),
              pair("USDJPY", -3_000_000, 0),
            ],
          },
        });
        for (const ccy of ["EUR", "USD"]) {
          expect(bubbles.radiusFor(ccy)).toBeGreaterThanOrEqual(15);
          expect(bubbles.radiusFor(ccy)).toBeLessThanOrEqual(60);
        }
      });

      it("shows a tooltip of '{currency} {whole-number amount}' on hover", () => {
        const bubbles = mount(PositionBubbles, {
          props: { positions: [pair("EURUSD", -2_000_000, 2_726_570)] },
        });
        expect(bubbles.tooltipAfterHover("EUR")).toBe("EUR -2,000,000");
      });
    });
    ```
    > `PositionBubbles.tsx` is already in the contract coverage `exclude` (vitest.config.ts:43) — **leave it excluded** if jsdom can't drive the force tick to mount the `<g>` nodes. If the `mouseover`/label nodes do render in jsdom (the `join` enter runs on the first `tick`, which `force.restart()` schedules synchronously enough for `act` to flush), remove line 43 from the exclude list so coverage counts it. Decide after step 14.

14. **[ ] Run — confirm the new contract spec passes.**
    ```
    pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/fx/analytics/PositionBubbles.contract.spec.ts
    ```
    If the force tick does not fire under jsdom (no `<g>` nodes), make the spec deterministic by ticking manually: the page object can call `force.tick()` — but since the simulation is internal, prefer asserting via a `requestAnimationFrame`-free path. Practical fallback: in `PositionBubbles.tsx`, after `force.nodes(...).alpha(0.5).restart()`, also call `force.tick()` once synchronously so the enter-join runs even when the env has no animation frames. Re-run until green.

15. **[ ] Correct the feature file (lines 61-94).** In `specs/features/analytics/profit-and-loss.feature`, tighten the bubble scenarios so they describe **per-currency** aggregation and **traded-amount** colour/size (the current wording at 61-64, 70-76 already says "currency"/"traded amount" — keep), and make the size scenario concrete:
    ```gherkin
      Scenario: Bubble chart displays a bubble for each currency with a non-zero net position
        Given the analytics service is providing position data
        Then the bubble chart displays one bubble per currency whose net traded amount (base + counter across all pairs) is non-zero
        And currencies may include: NZD, USD, JPY, GBP, EUR, CAD, AUD

      Scenario: Bubble size represents relative aggregated position magnitude
        Given two currencies have different absolute net traded amounts
        Then the currency with the larger absolute net traded amount has a larger bubble
        And bubble radii scale linearly between a minimum of 15 pixels and a maximum of 60 pixels

      Scenario: Hovering over a bubble shows a tooltip
        When the user hovers over a currency bubble
        Then a tooltip appears displaying the currency code followed by the net traded amount
        And the tooltip text follows the pattern "{CURRENCY} {amount}"
        And the amount is formatted as a whole number with commas

      Scenario: Bubbles can be dragged and drift back
        When the user drags a bubble to a new location
        Then the bubble moves to follow the drag
        And the tooltip remains visible during the drag
        When the user releases the bubble
        Then the bubble drifts back toward the center of the chart
    ```
    > Keep scenarios 66-76 (label = currency code; positive/negative traded-amount colour) — they already match the original behaviour. The substantive corrections are: "non-zero **net** position", colour/size by **traded amount** (not basePnl), and explicit linear 15-60 scale.

16. **[ ] Run the full analytics contract suite + typecheck.**
    ```
    pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/fx/analytics
    pnpm --filter @rtc/client-react typecheck
    pnpm lint:dead   # knip: confirm no unused d3 submodule
    ```

17. **[ ] Regenerate visual goldens (heavy).** PositionBubbles changed from flex divs to an SVG force chart — every analytics scenario rendering it (`analytics/populated`, `analytics/negative-pnl`, `analytics/millions`, `analytics/flat-positions`, `analytics/empty`) changes. Force layout is non-deterministic, so for visual goldens either (a) freeze the simulation (run `force.tick()` to a fixed alpha and `force.stop()` under a test flag), or (b) move bubble-layout coverage to e2e and exclude these arms from the pixel goldens. Regenerate **both** committed sets after deciding:
    ```
    pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react:update
    pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
    pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:update
    ```
    Plus the local `<arch>` set on the local machine.

18. **[ ] Commit.**
    ```
    git add -A
    git commit -m "feat(analytics): per-currency position bubbles with d3 force/drag/tooltip (T1.4)

    Match original Positions/data.ts + BubbleChart.tsx: aggregate base+counter
    traded amounts per currency, drop zero nets, radius scaleLinear[15,60] by
    abs(amount), colour by sign, d3 forceSimulation (forceX/Y .1, collide r+2),
    drag with fx/fy=null drift-back, tooltip '{CCY} {whole-number amount}'.

    Pure aggregatePositionsByCurrency in @rtc/domain (no d3), golden-fixtured;
    d3-force/d3-drag/d3-selection added to client-react only.

    Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
    ```

---

### Cross-task notes / key findings
- **Two feature-file bugs found and corrected by these plans:**
  1. T1.3 line 115: `"12,346k"` is wrong — original `formatWithScale(12345678, formatAsWholeNumber)` yields **`12m`** (verified by running the original scale logic).
  2. T1.4 lines 61-90 describe bubbles as if labelled/sized per pair; the original aggregates **per currency** by **traded amount**, which the clone currently does not.
- **Domain stays single-dep:** all three formatters use the platform `Intl.NumberFormat` global (not a runtime dep) and the linear scale is hand-reimplemented, so no d3 enters `@rtc/domain`. d3 submodules are added to `client-react` only (verify with `grep -n d3 packages/domain/package.json` → empty).
- **Contract coverage exclusions** (`tests/ui/contract/vitest.config.ts:42-45`) currently list `PositionBubbles.tsx` (line 43) and `PairPnlBars.tsx` (line 44). T1.3 removes line 44; T1.4 removes line 43 only if jsdom can drive the force tick (decide at T1.4 step 13/14).
- **Locale pinned to `en-US`** in all three formatters so golden comma grouping is deterministic across the Node 26 CI/sandbox runtimes (the original used `"default"`, which is runtime-dependent and unsuitable for a golden contract).
- Every UI change requires regenerating **both** committed visual-golden sets (CI `react/` x86 + local `react-local/<arch>/`) per the dual-set rule.


## Domain 3 — Credit

### Task T1.5: New-RFQ max quantity = cap, not block

**Context (verbatim, current vs. original).** The clone **blocks** submission — `packages/client-react/src/ui/credit/newRfq/NewRfqForm.tsx:54-68`:
```tsx
  const quantityNum = parseFloat(quantity);
  const quantityError =
    quantity &&
    !Number.isNaN(quantityNum) &&
    quantityNum > CREDIT_MAX_QUANTITY_INPUT
      ? "Max quantity exceeded"
      : null;

  const canSubmit =
    instrument !== null &&
    !Number.isNaN(quantityNum) &&
    quantityNum > 0 &&
    !quantityError &&
    selectedDealerIds.size > 0 &&
    !submitting;
```
The original **caps** silently — `rtc-original utils/formatNumber.ts:232-235` (`applyMaximum = Math.min(value, MAX_INPUT_VALUE)`, `MAX_INPUT_VALUE = 100_000_000`), applied to the UI-scale value before the ×1000 multiply (`App/Credit/NewRfq/state.ts:69-74`). The cap belongs in the domain as a pure `applyMaximum` next to `CREDIT_MAX_QUANTITY_INPUT`, applied in `CreateRfqUseCase` (which already does the ×1000 multiply at `CreateRfqUseCase.ts:21-30`).

**Files:**
- `packages/domain/src/credit/rfq.ts` — add `applyMaximum`.
- `packages/domain/src/usecases/CreateRfqUseCase.ts` — cap before multiply.
- `packages/domain/src/credit/rfq.test.ts` — golden-fixture test (create).
- `packages/domain/src/credit/__golden__/creditMaxQuantity.original.json` — fixture (create).
- `packages/client-react/src/ui/credit/newRfq/NewRfqForm.tsx` — remove the block.
- `packages/client-react/src/ui/credit/newRfq/QuantityInput.tsx` — drop the `error` prop.
- `packages/client-react/tests/ui/contract/specs/credit/newRfq/NewRfqForm.contract.spec.ts:91-97` — assert capping.
- `packages/client-react/tests/ui/contract/shared/pages/credit/newRfq/NewRfqFormPage.ts:112-115` — replace `hasQuantityError()`.
- `specs/features/credit/new-rfq.feature:66-68` — verify (already correct).

**Interfaces:**
- Produces: `applyMaximum(value: number): number` (= `Math.min(value, CREDIT_MAX_QUANTITY_INPUT)`) from `@rtc/domain`.

- [ ] **Step 1: Add the golden fixture + failing domain test.**

Create `packages/domain/src/credit/__golden__/creditMaxQuantity.original.json`:
```json
{
  "_source": "rtc-original@4a31f01 packages/client/src/client/utils/formatNumber.ts:232-235",
  "cases": [
    { "input": 0, "expected": 0 },
    { "input": 500, "expected": 500 },
    { "input": 100000000, "expected": 100000000 },
    { "input": 100000001, "expected": 100000000 },
    { "input": 200000000, "expected": 100000000 }
  ]
}
```
Create `packages/domain/src/credit/rfq.test.ts` (or extend if it exists):
```ts
import { describe, expect, it } from "vitest";

import { applyMaximum } from "./rfq.js";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface Case {
  readonly input: number;
  readonly expected: number;
}
const golden = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("./__golden__/creditMaxQuantity.original.json", import.meta.url),
    ),
    "utf8",
  ),
) as { cases: Case[] };

describe("applyMaximum (credit max-quantity cap)", () => {
  for (const c of golden.cases) {
    it(`caps ${c.input} -> ${c.expected}`, () => {
      expect(applyMaximum(c.input)).toBe(c.expected);
    });
  }
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `pnpm --filter @rtc/domain exec vitest run src/credit/rfq.test.ts`
Expected: FAIL — `applyMaximum` is not exported.

- [ ] **Step 3: Implement the cap.**

In `packages/domain/src/credit/rfq.ts`, after the existing constants, append:
```ts
/**
 * Caps a UI-scale credit quantity at CREDIT_MAX_QUANTITY_INPUT. Mirrors
 * rtc-original applyMaximum (utils/formatNumber.ts:234-235) — exceeding the
 * maximum CLAMPS the value; it does not block submission.
 */
export function applyMaximum(value: number): number {
  return Math.min(value, CREDIT_MAX_QUANTITY_INPUT);
}
```
(Confirm `CREDIT_MAX_QUANTITY_INPUT = 100_000_000` and `CREDIT_QUANTITY_MULTIPLIER = 1_000` exist here; add them if missing.) Ensure `packages/domain/src/index.ts` re-exports `applyMaximum`.

In `packages/domain/src/usecases/CreateRfqUseCase.ts`, import and apply the cap before the multiply:
```ts
import { applyMaximum, CREDIT_QUANTITY_MULTIPLIER } from "../credit/rfq.js";
```
```ts
    quantity: applyMaximum(input.quantity) * CREDIT_QUANTITY_MULTIPLIER,
```

- [ ] **Step 4: Run, verify pass.**

Run: `pnpm --filter @rtc/domain exec vitest run src/credit/rfq.test.ts`
Expected: all cap cases pass. Then `pnpm --filter @rtc/domain build` so client-react sees the new export.

- [ ] **Step 5: Remove the UI block + correct contract assertions.**

In `packages/client-react/src/ui/credit/newRfq/NewRfqForm.tsx`, replace lines 54-68:
```tsx
  const quantityNum = parseFloat(quantity);

  const canSubmit =
    instrument !== null &&
    !Number.isNaN(quantityNum) &&
    quantityNum > 0 &&
    selectedDealerIds.size > 0 &&
    !submitting;
```
Update the import to drop `CREDIT_MAX_QUANTITY_INPUT` (no longer referenced here):
```tsx
import { Direction, type Instrument } from "@rtc/domain";
```
Remove `error={quantityError}` from `<QuantityInput>`:
```tsx
      <QuantityInput value={quantity} onChange={setQuantity} />
```
In `packages/client-react/src/ui/credit/newRfq/QuantityInput.tsx`, remove the `error` field from props, its destructure, the `data-error` attribute and the trailing error `<span>`; keep `max={CREDIT_MAX_QUANTITY_INPUT}` on the input.

In `packages/client-react/tests/ui/contract/shared/pages/credit/newRfq/NewRfqFormPage.ts`, replace `hasQuantityError()` (lines 112-115):
```ts
  /** The submit button is enabled even when the entered quantity exceeds the maximum. */
  isSubmitEnabledWithOverMaxQuantity(): boolean {
    return !this.isSubmitDisabled();
  }
```
In `packages/client-react/tests/ui/contract/specs/credit/newRfq/NewRfqForm.contract.spec.ts`, replace the block test (lines 91-97):
```ts
  it("caps rather than blocks when the quantity exceeds the maximum", async () => {
    const form = ready();
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(200_000_000);
    // Cap, don't block: submission stays enabled (rtc-original state.ts:69-74).
    expect(form.isSubmitDisabled()).toBe(false);
    await form.submit();
    expect(form.createdRfq()).toMatchObject({ quantity: 200_000_000 });
  });
```
(The harness fakes `createRfq`, so the component sends the raw UI value; the domain cap is exercised by the Step-1 domain test. This spec proves the block is gone.)

- [ ] **Step 6: Verify the feature spec.**

`specs/features/credit/new-rfq.feature:66-68` already reads "the quantity is capped at 100,000,000" — confirm, no edit; record in the commit.

- [ ] **Step 7: Run tests + commit.**

```bash
pnpm --filter @rtc/domain exec vitest run src/credit/rfq.test.ts
pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/credit/newRfq/NewRfqForm.contract.spec.ts
pnpm --filter @rtc/client-react typecheck
git add -A && git commit -m "feat(credit): cap New-RFQ quantity at 100M instead of blocking submission

Mirrors rtc-original applyMaximum (formatNumber.ts:232-235 + state.ts:69-74):
>100M clamps silently; the Max-quantity-exceeded block is removed. Cap moves to
the domain (CreateRfqUseCase) with a golden test.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task T2.3: Credit blotter sort/filter/CSV via FX grid reuse

**Context.** The clone's `packages/client-react/src/ui/credit/blotter/CreditBlotter.tsx` is a static table; its `deriveTrades` + `useHooks()` wiring (lines 50-108) is sound and kept — only the render (lines 110-157) is replaced. The original reuses one shared grid for both blotters (`rtc-original CoreCreditTrades.tsx` + `colConfig.ts:109-167` `creditColDef` + `ExcelButton.tsx`). The clone's FX blotter already has the machinery, but every utility is hard-typed to `Trade`. **Design:** generify the FX utilities over a row type with injected columns (matching the original's config-driven `GridRegion`), rather than duplicating. The credit row type `packages/domain/src/credit/creditTrade.ts:3-14` has `tradeId, status, tradeDate, direction, counterParty, cusip, security, quantity, orderType, unitPrice`. **Date caveat:** `CreditTrade.tradeDate` is currently a pre-formatted `dd-MMM-yyyy` string (`CreditBlotter.tsx:71`); the FX date filter/sort assume ISO — carry ISO `tradeDate` and format at the cell layer.

**Files:**
- `packages/client-react/src/ui/fx/blotter/blotterColumns.ts` — generify `ColumnDef<TRow>`, `CellFormatter<TRow>`; rename FX `formatCellValue` → `formatFxCell`.
- `packages/client-react/src/ui/fx/blotter/columnSort.ts` — generify `SortState<TRow>`, `nextSortDirection<TRow>(col, cur, descSet)`, `applySort<TRow>`; keep FX wrappers `applySortToTrades` + `FX_DESC_FIRST`.
- `packages/client-react/src/ui/fx/blotter/columnFilter/filterState.ts` — generify `ColumnFilter<TRow>`, `applyFilters<TRow>`.
- `packages/client-react/src/ui/fx/blotter/csvExport.ts` — `exportToCsv<TRow>(rows, columns, format, unformatted?)`.
- `packages/client-react/src/ui/fx/blotter/BlotterHeader.tsx`, `BlotterRow.tsx` — accept `columns` + `format` props.
- `packages/client-react/src/ui/credit/blotter/creditBlotterColumns.ts` — **new** credit columns + `formatCreditCell`.
- `packages/client-react/src/ui/credit/blotter/CreditBlotter.tsx` — rewrite render to reuse the generic machinery.
- `packages/domain/src/credit/creditTrade.ts` — document `tradeDate` as ISO.
- `packages/client-react/tests/ui/contract/specs/credit/blotter/CreditBlotter.contract.spec.ts` — add sort/filter/CSV blocks.
- `packages/client-react/tests/ui/contract/shared/pages/credit/blotter/CreditBlotterPage.ts` — add FX-style helpers.
- `specs/features/credit/credit-blotter.feature` — verify/align.

**Interfaces:**
```ts
export interface ColumnDef<TRow> { key: keyof TRow; label: string; filterType: "set" | "number" | "date"; }
export type CellFormatter<TRow> = (row: TRow, col: ColumnDef<TRow>) => string;
export interface SortState<TRow> { column: keyof TRow | null; direction: "asc" | "desc" | null; }
export function nextSortDirection<TRow>(column: keyof TRow, current: SortState<TRow>, descFirst: ReadonlySet<keyof TRow>): SortState<TRow>;
export function applySort<TRow>(rows: readonly TRow[], sort: SortState<TRow>): readonly TRow[];
export type ColumnFilter<TRow> = { column: keyof TRow; /* set | number | date */ };
export function applyFilters<TRow>(rows: readonly TRow[], filters: Map<keyof TRow, ColumnFilter<TRow>>, quickFilter: string): readonly TRow[];
export function exportToCsv<TRow>(rows: readonly TRow[], columns: readonly ColumnDef<TRow>[], format: CellFormatter<TRow>, unformatted?: ReadonlySet<keyof TRow>): void;
```

- [ ] **Step 1: Make `CreditTrade.tradeDate` ISO.** In `packages/domain/src/credit/creditTrade.ts:6`:
```ts
  readonly tradeDate: string; // ISO date "YYYY-MM-DD"; formatted at the cell layer (matches FX)
```

- [ ] **Step 2: Generify the FX blotter utilities (failing FX tests first).** Before editing the utilities, run the FX blotter unit + contract suites to capture the green baseline (`pnpm --filter @rtc/client-react exec vitest run src/ui/fx/blotter` and the FX contract spec). Then generify:
  - `blotterColumns.ts`: replace the `Trade`-bound `ColumnDef`/`formatCellValue` with the generic `ColumnDef<TRow>` + `CellFormatter<TRow>`; rename `formatCellValue` → `formatFxCell: CellFormatter<Trade>`; type FX `COLUMNS` as `readonly ColumnDef<Trade>[]`.
  - `columnSort.ts`: generic `SortState<TRow>`, `nextSortDirection<TRow>(column, current, descFirst)`, `applySort<TRow>`; export `FX_DESC_FIRST = new Set<keyof Trade>(["tradeId","tradeDate","valueDate"])` (the T1.1-corrected set) and a wrapper `applySortToTrades = (t: readonly Trade[], s: SortState<Trade>) => applySort(t, s)` so `FxBlotter.tsx` keeps working. *(This task depends on T1.1 having corrected the desc-first set.)*
  - `columnFilter/filterState.ts`: generic `ColumnFilter<TRow>` + `applyFilters<TRow>`; keep the quick-filter `Object.values(row).join(" ")` logic.
  - `csvExport.ts`: `exportToCsv<TRow>(rows, columns, format, unformatted?)`, iterating `columns` and using `unformatted?.has(col.key) ? String(row[col.key]) : format(row, col)`; keep `download = "RT-Blotter.csv"`. Update `FxBlotter.tsx`'s call to `exportToCsv(processedTrades, COLUMNS, formatFxCell, new Set(["notional"]))`.
  - `BlotterHeader.tsx`/`BlotterRow.tsx`: add `columns` + `format` props; replace internal `COLUMNS`/`formatCellValue` use; keep all `data-testid`s and glyphs. Pass `columns={COLUMNS} format={formatFxCell}` from `FxBlotter.tsx`.

- [ ] **Step 3: Run the FX suites — confirm no regression.**
```bash
pnpm --filter @rtc/client-react exec vitest run src/ui/fx/blotter
pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/fx/blotter/FxBlotter.contract.spec.ts
```
Expected: green (generification is behaviour-preserving for FX).

- [ ] **Step 4: Create the credit columns.** `packages/client-react/src/ui/credit/blotter/creditBlotterColumns.ts`:
```ts
import type { CreditTrade } from "@rtc/domain";
import type { ColumnDef } from "#/ui/fx/blotter/blotterColumns";

export const CREDIT_COLUMNS: readonly ColumnDef<CreditTrade>[] = [
  { key: "tradeId", label: "Trade ID", filterType: "number" },
  { key: "status", label: "Status", filterType: "set" },
  { key: "tradeDate", label: "Trade Date", filterType: "date" },
  { key: "direction", label: "Direction", filterType: "set" },
  { key: "counterParty", label: "Counterparty", filterType: "set" },
  { key: "cusip", label: "CUSIP", filterType: "set" },
  { key: "security", label: "Security", filterType: "set" },
  { key: "quantity", label: "Quantity", filterType: "number" },
  { key: "orderType", label: "Order Type", filterType: "set" },
  { key: "unitPrice", label: "Unit Price", filterType: "number" },
];

export const CREDIT_DESC_FIRST = new Set<keyof CreditTrade>([
  "tradeId", "tradeDate",
]);

export const CREDIT_CSV_UNFORMATTED = new Set<keyof CreditTrade>([
  "quantity", "unitPrice",
]);

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function formatCreditCell(
  row: CreditTrade,
  col: ColumnDef<CreditTrade>,
): string {
  switch (col.key) {
    case "status":
      return "Accepted";
    case "tradeDate": {
      const d = new Date(`${row.tradeDate}T00:00:00`);
      if (Number.isNaN(d.getTime())) return row.tradeDate;
      const day = String(d.getDate()).padStart(2, "0");
      return `${day}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
    }
    case "quantity":
      return row.quantity.toLocaleString("en-US", { maximumFractionDigits: 0 });
    case "unitPrice":
      return `$${row.unitPrice}`;
    default:
      return String(row[col.key]);
  }
}
```

- [ ] **Step 5: Rewrite `CreditBlotter.tsx` render.** Keep `deriveTrades` + `useHooks()`; change the date line to ISO (`tradeDate: new Date(rfq.creationTimestamp).toISOString().slice(0, 10)`) and delete the local `MONTHS`/`formatDate`. Replace lines 110-157 with the FX-style render (state for sort/filters/quick filter; `applyFilters` then `applySort`; `<BlotterHeader columns={CREDIT_COLUMNS} format={formatCreditCell} .../>`; rows via `<BlotterRow row={trade} columns={CREDIT_COLUMNS} format={formatCreditCell} isNew={false} />`; an `export-csv` button calling `exportToCsv(processed, CREDIT_COLUMNS, formatCreditCell, CREDIT_CSV_UNFORMATTED)`; a `<QuickFilter>`; keep the `data-testid="blotter-table"`). Keep the empty message `"No credit trades yet"` exactly (the existing contract spec asserts it). Add `.toolbar`/`.exportBtn` rules to `CreditBlotter.module.css` mirroring `FxBlotter.module.css`. (Full render scaffold mirrors `FxBlotter.tsx`; pass `CREDIT_DESC_FIRST` into `nextSortDirection`.)

- [ ] **Step 6: Add page-object helpers.** In `packages/client-react/tests/ui/contract/shared/pages/credit/blotter/CreditBlotterPage.ts`, switch the table lookup to `getByTestId("blotter-table")` and port from `FxBlotterPage.ts`: `clickColumnHeader`, `sortIndicatorFor`, `typeQuickFilter`, `activeFilterSummary`, `openColumnFilter`, `toggleSetOption`, `applyOpenFilter`, `applyNumberFilter`, `clickExport` — retaining existing `columnHeaders/tradeRowCount/emptyMessage/columnValues/hasCell`.

- [ ] **Step 7: Extend the contract spec (red, then green).** In `CreditBlotter.contract.spec.ts`, keep existing derivation tests and add blocks mirroring `FxBlotter.contract.spec.ts:77-218`: sorting (Trade ID desc-first, toggle asc, clear on 3rd), quick filter, a Counterparty set filter (`activeFilterSummary` includes `/counterparty/i`), a Quantity number `gt` filter, and CSV export (assert header `Trade ID,Status,...` + one row per trade, `quantity`/`unitPrice` unformatted; a `2024-03-05` trade renders `05-Mar-2024`). Run:
```bash
pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/credit/blotter/CreditBlotter.contract.spec.ts
```

- [ ] **Step 8: Align the feature spec.** Confirm `specs/features/credit/credit-blotter.feature` "supports column sorting" (101-104), "column filtering on Counterparty" (106-108), "export in the same format as the FX blotter" (110-112) match; edit only if wording drifts.

- [ ] **Step 9: Run + commit.**
```bash
pnpm --filter @rtc/client-react exec vitest run src/ui/fx/blotter
pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/credit/blotter/CreditBlotter.contract.spec.ts tests/ui/contract/specs/fx/blotter/FxBlotter.contract.spec.ts
pnpm --filter @rtc/client-react typecheck
git add -A && git commit -m "feat(credit): credit blotter sort/filter/CSV by reusing the FX grid

Generifies the FX blotter utilities over a row type and reuses them for credit
with a creditBlotterColumns config — matching rtc-original's one-GridRegion
design (CoreCreditTrades + colConfig creditColDef + ExcelButton). CreditTrade
tradeDate is now ISO, formatted at the cell layer.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task T3.1: Competing-quote auto-reject surfaced live

**Context.** The clone's simulator rejects siblings internally with **no event** — `packages/domain/src/simulators/CreditRfqSimulator.ts:199-223` (comment at :221 admits "no separate event type"). The `RfqEvent` union (`packages/domain/src/ports/workflowPort.ts:7-15`) and reducer (`packages/domain/src/usecases/WorkflowEventStreamUseCase.ts:21-43`) have no rejected case. `RfqsPresenter` subscribes once via a shared `state$` (shareReplay), so a reducer-visible event flips siblings live with **no presenter change**. The original surfaces rejection from one `quoteAccepted` server event whose client reducer derives the siblings (`rtc-original creditRfqs.ts:173-216` `getQuoteStateOnAccept`). **Design:** add a `quoteRejected` event to the union; emit it per flipped sibling; reduce it identically to `quoteAccepted`. Domain stays rxjs-only (no new imports).

**Files:**
- `packages/domain/src/ports/workflowPort.ts` — add `quoteRejected`.
- `packages/domain/src/simulators/CreditRfqSimulator.ts` — emit `quoteRejected` per sibling.
- `packages/domain/src/usecases/WorkflowEventStreamUseCase.ts` — reduce `quoteRejected`.
- `packages/domain/src/simulators/CreditRfqSimulator.test.ts:197-300` — assert the live event.
- `packages/domain/src/usecases/WorkflowEventStreamUseCase.test.ts` — reducer flips siblings (create/extend).
- `specs/services/workflow.yaml` — add the update type.
- `specs/features/credit/quote-acceptance.feature` — note the live flip.

- [ ] **Step 1: Add the event to the union.** `packages/domain/src/ports/workflowPort.ts` (after `quoteAccepted`, line 14):
```ts
  | { readonly type: "quoteAccepted"; readonly payload: Quote }
  | { readonly type: "quoteRejected"; readonly payload: Quote }
  | { readonly type: "rfqClosed"; readonly payload: Rfq };
```

- [ ] **Step 2: Add the failing reducer test.** Create/extend `packages/domain/src/usecases/WorkflowEventStreamUseCase.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { RfqEvent } from "../ports/workflowPort.js";
import { reduceRfqEvent } from "./WorkflowEventStreamUseCase.js";

describe("reduceRfqEvent quoteRejected", () => {
  it("flips a losing sibling to rejected in the quotes map", () => {
    const events: RfqEvent[] = [
      { type: "startOfStateOfTheWorld" },
      { type: "quoteCreated", payload: { id: 1, rfqId: 9, dealerId: 1, state: { type: "pendingWithPrice", price: 100 } } },
      { type: "quoteCreated", payload: { id: 2, rfqId: 9, dealerId: 2, state: { type: "pendingWithPrice", price: 105 } } },
      { type: "quoteAccepted", payload: { id: 1, rfqId: 9, dealerId: 1, state: { type: "accepted", price: 100 } } },
      { type: "quoteRejected", payload: { id: 2, rfqId: 9, dealerId: 2, state: { type: "rejectedWithPrice", price: 105 } } },
    ];
    const state = events.reduce(reduceRfqEvent, { rfqs: new Map(), quotes: new Map() });
    expect(state.quotes.get(1)?.state).toEqual({ type: "accepted", price: 100 });
    expect(state.quotes.get(2)?.state).toEqual({ type: "rejectedWithPrice", price: 105 });
  });
});
```
Run: `pnpm --filter @rtc/domain exec vitest run src/usecases/WorkflowEventStreamUseCase.test.ts` → FAIL (TS: `quoteRejected` not handled / not in reducer).

- [ ] **Step 3: Implement emission + reduction.**
In `CreditRfqSimulator.ts`, replace the block at lines 218-222:
```ts
        if (rejectedState) {
          const rejected: Quote = { ...other, state: rejectedState };
          this.quotes.set(otherId, rejected);
          // Surface the rejection live so competing cards flip immediately
          // (rtc-original getQuoteStateOnAccept). The simulator is the server here.
          this.events$.next({ type: "quoteRejected", payload: rejected });
        }
```
In `WorkflowEventStreamUseCase.ts`, add `quoteRejected` to the quote-bearing case (lines 34-42):
```ts
    case "quoteCreated":
    case "quoteQuoted":
    case "quotePassed":
    case "quoteRejected":

    case "quoteAccepted": {
      const next = new Map(state.quotes);
      next.set(event.payload.id, event.payload);
      return { ...state, quotes: next };
    }
```

- [ ] **Step 4: Run, verify pass + migrate the SoW-observing simulator tests.**
Run the reducer test (green). Then in `CreditRfqSimulator.test.ts`, the two tests at lines 197-300 observe rejection via a fresh SoW snapshot — migrate them to assert the live `quoteRejected` event (collect events around `accept()`, find the event for the losing quote id, assert `state` is `rejectedWithPrice`/`rejectedWithoutPrice`). Delete the stale `// Rejected quotes carry no live event …` comment. Run:
```bash
pnpm --filter @rtc/domain exec vitest run src/simulators/CreditRfqSimulator.test.ts src/simulators/CreditRfqSimulator.contract.test.ts
```

- [ ] **Step 5: Update specs.**
`specs/services/workflow.yaml` — add after `quoteAccepted` (lines 23-24):
```yaml
        quoteRejected:
          payload: QuoteBody (state = rejectedWithPrice or rejectedWithoutPrice)
```
and tighten the `accept` behaviour (line 108): "All other pending quotes on the same RFQ are auto-rejected, each via a quoteRejected update".
`specs/features/credit/quote-acceptance.feature` — after line 44 append: "And these rejections surface live on the open subscription (no re-snapshot required)".

- [ ] **Step 6: Commit.**
```bash
pnpm --filter @rtc/domain typecheck
git add -A && git commit -m "feat(credit): emit quoteRejected so losing quotes flip live on accept

Adds quoteRejected to the RfqEvent union; CreditRfqSimulator.accept() emits it
per auto-rejected sibling; reduceRfqEvent handles it. RfqsPresenter's shared
state$ propagates the flip live. Mirrors rtc-original getQuoteStateOnAccept
(creditRfqs.ts:173-216). Domain stays rxjs-only.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task T3.2: RFQ expiry drives lifecycle + countdown

**Context.** `RfqState.Expired` exists (`packages/domain/src/credit/rfq.ts:3-8`) but is unreachable — the simulator only sets Open/Cancelled/Closed. The original makes expiry server-driven (`CREDIT_RFQ_EXPIRY_SECONDS = 120`; frontend countdown cosmetic — `rtc-original CreditRfqTimer.tsx`, `creditRfqs.ts:102-112`). Per decision D1 the clone's simulator is the server: it schedules an expiry transition at +120s flipping an open RFQ to Expired via `rfqClosed`. The simulator's existing `scheduleDealerResponse` (`CreditRfqSimulator.ts:110-136`) is the pattern (setTimeout → guard `state !== Open` → mutate + emit → push to `pendingTimeouts`, cleared in `dispose()`). Tests use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(...)`.

**Files:**
- `packages/domain/src/credit/rfq.ts` — add `CREDIT_RFQ_EXPIRY_SECONDS = 120`.
- `packages/domain/src/simulators/CreditRfqSimulator.ts` — schedule the expiry transition.
- `packages/domain/src/simulators/CreditRfqSimulator.test.ts` — RFQ reaches Expired at +120s; dispose cancels it.
- `packages/client-react/src/ui/credit/rfqTiles/RfqCard.tsx` (+ `.module.css`) — live countdown when Open.
- `packages/client-react/src/ui/hooks/createAppHooks.ts` + the `AppHooks` interface + a presenter machine — `useRfqCountdown`.
- `specs/features/credit/rfq-tiles.feature:84-91` — verify.
- `specs/mock-backend/credit-rfq-engine.md:44-48` — rewrite "RFQ Expiry".

- [ ] **Step 1: Add the expiry constant.** `packages/domain/src/credit/rfq.ts`:
```ts
/** Server-driven RFQ lifetime. Mirrors rtc-original CREDIT_RFQ_EXPIRY_SECONDS = 120. */
export const CREDIT_RFQ_EXPIRY_SECONDS = 120;
```
Export from the domain barrel if it uses a named list.

- [ ] **Step 2: Add the failing simulator test.** In `CreditRfqSimulator.test.ts`, add (mirrors the dealer-response test at 352-377; `Math.random → 0` to suppress dealer participation):
```ts
  it("an open RFQ transitions to Expired via rfqClosed after expirySecs", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(
      sim.createRfq({
        instrumentId: 1,
        dealerIds: [defined(DEALERS_CATALOG[0]).id],
        quantity: 1000,
        direction: "Buy" as never,
        expirySecs: 120,
      }),
    );
    await vi.advanceTimersByTimeAsync(120_000);
    stop();
    const closed = events.find((e) => { return e.type === "rfqClosed"; });
    expect(closed).toBeDefined();
    expect((closed as Extract<RfqEvent, RfqClosedMatcher>).payload.state).toBe("Expired");
  });

  it("dispose cancels a pending expiry (RFQ never reaches Expired)", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(
      sim.createRfq({
        instrumentId: 1,
        dealerIds: [defined(DEALERS_CATALOG[0]).id],
        quantity: 1000,
        direction: "Buy" as never,
        expirySecs: 120,
      }),
    );
    sim.dispose();
    await vi.advanceTimersByTimeAsync(120_000);
    stop();
    expect(events.some((e) => { return e.type === "rfqClosed"; })).toBe(false);
  });
```
(`RfqClosedMatcher` already exists at line 11.) Run: `pnpm --filter @rtc/domain exec vitest run src/simulators/CreditRfqSimulator.test.ts` → FAIL (no expiry).

- [ ] **Step 3: Implement the expiry schedule.** In `CreditRfqSimulator.ts`, add (modeled on `scheduleDealerResponse`):
```ts
  private scheduleExpiry(rfqId: number, expirySecs: number): void {
    const timeout = setTimeout(() => {
      const rfq = this.rfqs.get(rfqId);
      if (!rfq || rfq.state !== RfqState.Open) return;
      const expired: Rfq = { ...rfq, state: RfqState.Expired };
      this.rfqs.set(rfqId, expired);
      this.events$.next({ type: "rfqClosed", payload: expired });
    }, expirySecs * 1000);
    this.pendingTimeouts.push(timeout);
  }
```
Call it in `createRfq` before `return of(rfqId)`:
```ts
      this.scheduleExpiry(rfqId, request.expirySecs);
      return of(rfqId);
```
(`rfqClosed` already carries `RfqState.Expired` through the reducer/UI; no reducer change.) Run, verify both tests pass.

- [ ] **Step 4: Add the live countdown to the card.** Add `useRfqCountdown(creationTimestamp: number, totalMs: number): number` to the `AppHooks` interface + `createAppHooks.ts`, implemented as a presenter machine using `timer(0, COUNTDOWN_INTERVAL_MS)` (copy the `received` tick pattern from `RfqTileMachine.ts:89-103`), clamped at 0. In `packages/client-react/src/ui/credit/rfqTiles/RfqCard.tsx`, render the existing dumb `RfqCountdown` (`#/ui/fx/liveRates/tile/RfqCountdown`) only when `rfq.state === RfqState.Open`, fed by `useHooks().useRfqCountdown(rfq.creationTimestamp, rfq.expirySecs * 1000)`. No countdown when not Open (satisfies rfq-tiles.feature:89-91). Add a contract assertion in the credit rfqTiles specs that an Open card shows a countdown and a non-open card does not.

- [ ] **Step 5: Update specs.** Verify `specs/features/credit/rfq-tiles.feature:84-91`. Rewrite `specs/mock-backend/credit-rfq-engine.md:44-48` to state the backend schedules a server-side expiry at `expirySecs` (default 120), flips an Open RFQ to Expired via `rfqClosed`, cancellable on `dispose()`, with the frontend countdown cosmetic.

- [ ] **Step 6: Run + commit.**
```bash
pnpm --filter @rtc/domain exec vitest run src/simulators/CreditRfqSimulator.test.ts
pnpm --filter @rtc/domain typecheck
pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/credit
pnpm --filter @rtc/client-react typecheck
git add -A && git commit -m "feat(credit): server-driven RFQ expiry + cosmetic card countdown

CreditRfqSimulator schedules an expiry at +expirySecs (default 120), flipping an
open RFQ to Expired via rfqClosed (cancellable in dispose) — RfqState.Expired is
now reachable. RfqCard shows a live countdown only while Open. Inverts
credit-rfq-engine.md to the simulator-is-the-server design (rtc-original
CreditRfqTimer + creditRfqs.ts:102-112).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---


## Domain 4 — FX / Tile

### Task T1.6: FX RFQ response delay 500–999 ms

**Context.** Clone `packages/domain/src/simulators/PricingSimulator.ts:133`: `const delayMs = 500 + Math.floor(Math.random() * 1500);` (500–2000), with the doc comment at :117-121 saying "500–2000 ms". Original `rtc-original packages/client/src/services/rfqs/rfqs.ts:13`: `delay(500 + Math.floor(Math.random() * 500))` (500–999). Extract a pure `rfqResponseDelayMs(rand)` so the bound is golden-fixturable.

**Files:**
- `packages/domain/src/simulators/PricingSimulator.ts` — extract `rfqResponseDelayMs`, fix range + comment.
- `packages/domain/src/simulators/__golden__/rfqResponseDelayMs.original.json` — fixture (create).
- `packages/domain/src/simulators/rfqResponseDelayMs.golden.test.ts` — golden bounds test (create).
- `packages/domain/src/simulators/PricingSimulator.test.ts` — fix the two range tests (lines 76-77, 87-108).
- `packages/domain/src/simulators/PricingSimulator.contract.test.ts:25-28` — tighten the advance comment.
- `specs/mock-backend/pricing-engine.md:82` — align prose to 999 ms.

**Interfaces:**
- Produces: `rfqResponseDelayMs(rand: number): number` (= `500 + Math.floor(rand * 500)`, range [500,999]).

- [ ] **Step 1: Golden fixture + failing test.**
Create `packages/domain/src/simulators/__golden__/rfqResponseDelayMs.original.json`:
```json
{
  "_source": "rtc-original@4a31f01 packages/client/src/services/rfqs/rfqs.ts:13",
  "cases": [
    { "rand": 0, "expected": 500 },
    { "rand": 0.998, "expected": 999 },
    { "rand": 0.999999, "expected": 999 }
  ]
}
```
Create `packages/domain/src/simulators/rfqResponseDelayMs.golden.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { loadGolden } from "../__testUtils__/loadGolden.js";
import { rfqResponseDelayMs } from "./PricingSimulator.js";

interface DelayCase { rand: number; expected: number; }

describe("rfqResponseDelayMs (golden: rtc-original rfqs.ts:13)", () => {
  const golden = loadGolden<DelayCase>("rfqResponseDelayMs");
  it.each(golden.cases as DelayCase[])("rand=$rand -> $expected ms", ({ rand, expected }) => {
    expect(rfqResponseDelayMs(rand)).toBe(expected);
  });
  it("never below 500 ms or above 999 ms", () => {
    for (let i = 0; i < 10_000; i++) {
      const d = rfqResponseDelayMs(Math.random());
      expect(d).toBeGreaterThanOrEqual(500);
      expect(d).toBeLessThanOrEqual(999);
    }
  });
});
```
> The domain `loadGolden` (Task 0) resolves `./__golden__/<name>.original.json` relative to the importing test file, so the fixture sits beside this test under `src/simulators/__golden__/`.

- [ ] **Step 2: Run, verify it fails.**
Run: `pnpm --filter @rtc/domain exec vitest run src/simulators/rfqResponseDelayMs.golden.test.ts`
Expected: FAIL — `rfqResponseDelayMs` not exported.

- [ ] **Step 3: Extract the function + fix the range.**
In `PricingSimulator.ts`, add (after the `tickInterval` helper, before `export class PricingSimulator`):
```ts
/**
 * Pure RFQ artificial-delay computation, extracted so the 500–999 ms bound is
 * testable. Mirrors rtc-original packages/client/src/services/rfqs/rfqs.ts:13
 * (`delay(500 + Math.floor(Math.random() * 500))`).
 * @param rand a value in [0, 1) — pass Math.random() at the call site.
 * @returns integer delay in ms, in [500, 999].
 */
export function rfqResponseDelayMs(rand: number): number {
  return 500 + Math.floor(rand * 500);
}
```
Change the doc comment block at :117-121 to say "500–999 ms". Replace :133:
```ts
      const delayMs = rfqResponseDelayMs(Math.random());
```
Re-export `rfqResponseDelayMs` from `packages/domain/src/simulators/index.ts` and `packages/domain/src/index.ts` (match the file's existing export style).

- [ ] **Step 4: Run, verify pass.**
Run: `pnpm --filter @rtc/domain exec vitest run src/simulators/rfqResponseDelayMs.golden.test.ts`
Expected: all cases + the 10k-iteration bound test pass.

- [ ] **Step 5: Fix the existing range tests + spec prose.**
In `PricingSimulator.test.ts`: at :76-77 change the "advance past 2000ms" comment + `advanceTimersByTimeAsync(2000)` to 1000; replace the bounds test at :87-108 to assert no emit before 499ms and an emit after a further 500ms ("500–999 ms"). In `PricingSimulator.contract.test.ts:25-28`, change `advanceTimersByTimeAsync(2_000)` to `1_000` and the comment to "500–999 ms". In `specs/mock-backend/pricing-engine.md:82`, change the response-delay line to "500ms + floor(random()*500ms), so between **500ms and 999ms**".

- [ ] **Step 6: Run + commit.**
```bash
pnpm --filter @rtc/domain exec vitest run src/simulators/PricingSimulator.test.ts src/simulators/PricingSimulator.contract.test.ts
pnpm --filter @rtc/domain test
pnpm --filter @rtc/domain typecheck
git add packages/domain specs/mock-backend/pricing-engine.md
git commit -m "fix(domain): RFQ response delay 500-999ms to match original

Original services/rfqs/rfqs.ts:13 uses delay(500 + floor(rand*500)) = 500-999ms;
clone used 500 + floor(rand*1500) = 500-2000ms. Extract rfqResponseDelayMs(rand)
pure fn and golden-fixture its bounds.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task T2.1: Stale tile disables Buy/Sell (decision D6)

**Context.** Original: a stale tile is **suspended** (its inner content unmounts) so the Buy/Sell buttons are unreachable, and disabled buttons are inert (`pointer-events:none`) — `rtc-original App/LiveRates/Tile/Tile.tsx:50-58` + `PriceButton/PriceButton.styles.tsx:106-110`. Per decision D6 the clone's faithful observable equivalent is to include `stale` in the Buy/Sell `disabled` predicate. Clone: `stale` (in scope at `Tile.tsx:33` via `useStaleFlag(pair)`) only drives the greyed `StaleIndicator` overlay (`Tile.tsx:57`); the buttons' `disabled` at `Tile.tsx:95` is `isLoading || isBusy || hasError` and stays clickable. Buttons live in child `TileExecution.tsx` which forwards `disabled` to both `<button>`s.

**Files:**
- `packages/client-react/src/ui/fx/liveRates/tile/Tile.tsx` — add `stale` to the execution `disabled` predicate (and to the `handleExecute` guard).
- `packages/client-react/tests/ui/contract/specs/fx/liveRates/tile/Tile.contract.spec.ts` — assert Buy/Sell disabled while stale.
- `specs/features/fx/live-rates.feature:114-118` — already asserts "the bid and ask price buttons are disabled" (verify, no change).

**Interfaces:** no interface change. `TileExecution`'s `disabled: boolean` prop already wires both buttons; we widen the boolean from `Tile`.

- [ ] **Step 1: Extend the contract spec (red).** In `Tile.contract.spec.ts`, add after the existing stale-overlay test (around :265-278):
```ts
  it("disables the Buy/Sell buttons while the tile is stale", () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(tile.isStale()).toBe(false);
    expect(tile.isBuyDisabled()).toBe(false);
    expect(tile.isSellDisabled()).toBe(false);
    tile.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    tile.emit({ useConnectionStatus: ConnectionStatus.CONNECTED });
    expect(tile.isStale()).toBe(true);
    expect(tile.isBuyDisabled()).toBe(true);
    expect(tile.isSellDisabled()).toBe(true);
    tile.setPrice("EURUSD", price({ bid: 1.1 }));
    expect(tile.isStale()).toBe(false);
    expect(tile.isBuyDisabled()).toBe(false);
    expect(tile.isSellDisabled()).toBe(false);
  });
```
(`TilePage` already exposes `isBuyDisabled()`/`isSellDisabled()`/`isStale()` and `emit()`/`setPrice()`.)

- [ ] **Step 2: Run, verify it fails.**
Run: `pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/fx/liveRates/tile/Tile.contract.spec.ts`
Expected: the new test FAILS — buttons stay enabled while stale.

- [ ] **Step 3: Fix the implementation.** In `packages/client-react/src/ui/fx/liveRates/tile/Tile.tsx`, replace the `disabled` predicate (`Tile.tsx:95`):
```tsx
          disabled={isLoading || isBusy || hasError || stale}
```
And guard `handleExecute` (`Tile.tsx:50-53`) for defence in depth:
```tsx
    const p = priceVal ?? price;
    const n = notionalVal ?? notional.state.numericValue;
    if (!p || hasError || stale) return;
    tileExecution.execute(direction, p, n);
```

- [ ] **Step 4: Run, verify pass.**
Run: `pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/fx/liveRates/tile/Tile.contract.spec.ts`
Then the full contract tier + typecheck: `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-react typecheck`

- [ ] **Step 5: Verify the feature spec.** `specs/features/fx/live-rates.feature:114-118` already asserts "the bid and ask price buttons are disabled" and the recovery scenario (120-125) asserts re-enable — no change. (Optional: if the visual suite renders a stale tile, regenerate both golden sets via `test:ui:visual:vitest-browser:react:update`; no-op if no stale-tile golden.)

- [ ] **Step 6: Commit.**
```bash
git add packages/client-react/src/ui/fx/liveRates/tile/Tile.tsx \
        packages/client-react/tests/ui/contract/specs/fx/liveRates/tile/Tile.contract.spec.ts
git commit -m "fix(client): disable Buy/Sell on stale tile (D6, match original)

Original suspends the stale tile (App/LiveRates/Tile/Tile.tsx:50-58) so its
buttons are unreachable, with disabled buttons inert (PriceButton.styles.tsx:106-110).
Per decision D6 the faithful observable equivalent is to include stale in the
Buy/Sell disabled predicate.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---


## Domain 5 — Shared (Connection)

### Task T2.4: Footer label = "Disconnected"; idle/offline wording in the modal

**Context.** Original footer collapses both `IDLE_DISCONNECTED` and `OFFLINE_DISCONNECTED` to `DISCONNECTED`, showing only "Connecting / Connected / Disconnected" (`rtc-original App/Footer/StatusButton/StatusButton.tsx:8-19`). The distinct wording lives only in the modal (`components/DisconnectionOverlay.tsx:29-42`): idle "You have been disconnected due to inactivity."; offline "This device has been detected to be offline.  Connection to the server will resume when a stable internet connection is established."; plain "Trying to re-connect to the server...". Clone footer (`packages/client-react/src/ui/shell/connection/ConnectionStatusBar.tsx:9-15`) wrongly shows "Idle"/"Offline"; clone overlay (`ConnectionOverlay.tsx:9-15`) distinguishes the three but with non-matching wording.

**Files:**
- `packages/client-react/src/ui/shell/connection/ConnectionStatusBar.tsx` (collapse idle+offline → "Disconnected")
- `packages/client-react/src/ui/shell/connection/ConnectionOverlay.tsx` (port the three original sentences)
- `packages/client-react/tests/ui/contract/specs/shell/connection/ConnectionStatusBar.contract.spec.ts`
- `packages/client-react/tests/ui/contract/specs/shell/connection/ConnectionOverlay.contract.spec.ts`
- `tests/specs/connection.feature` (e2e source feature — consumed by browser AND presenter peers)
- `tests/browser/playwright/connection.spec.ts:31`, `tests/browser/cypress/connection.spec.ts:30` (assert footer "Offline")
- `tests/presenter/steps/connection.steps.ts` + `tests/presenter/vitest-quickpickle-fake-timers/steps/connection.steps.ts` (label→status collapse)
- `tests/presenter/scenarios/_shared/connection.ts` (add `expectStatusInWithin`)
- `specs/features/shared/connection.feature:36,61`, `specs/domain/connection.md` (footer-projection note)

**Interfaces:** no type change — `ConnectionStatus` keeps all five members; only the footer *projection* collapses three to one label. Adds `expectStatusInWithin(world, statuses[], seconds)` helper.

- [ ] **Step 1: Correct the footer contract spec (red).** In `ConnectionStatusBar.contract.spec.ts`, change the idle/offline cases (lines 32-46) to expect "Disconnected":
```ts
  it("labels an idle session as disconnected", () => {
    expect(
      mount(ConnectionStatusBar, {
        hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
      }).statusText(),
    ).toBe("Disconnected");
  });

  it("labels an offline session as disconnected", () => {
    expect(
      mount(ConnectionStatusBar, {
        hooks: { useConnectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED },
      }).statusText(),
    ).toBe("Disconnected");
  });
```
Run: `pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/shell/connection/ConnectionStatusBar.contract.spec.ts` → FAIL (current shows "Idle"/"Offline").

- [ ] **Step 2: Collapse the footer label map.** In `ConnectionStatusBar.tsx`, replace lines 9-15:
```ts
// Footer collapses IDLE_DISCONNECTED and OFFLINE_DISCONNECTED to "Disconnected":
// the distinct idle/offline wording lives in ConnectionOverlay, not the footer.
// Provenance: original App/Footer/StatusButton/StatusButton.tsx:8-19.
const statusLabel: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTING]: "Connecting...",
  [ConnectionStatus.CONNECTED]: "Connected",
  [ConnectionStatus.DISCONNECTED]: "Disconnected",
  [ConnectionStatus.IDLE_DISCONNECTED]: "Disconnected",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "Disconnected",
};
```
(Leave `data-status={status}` on the dot untouched so its colour still distinguishes idle/offline.) Run Step 1's command → PASS.

- [ ] **Step 3: Port the original overlay wording.** In `ConnectionOverlay.tsx`, replace lines 9-15:
```ts
// The distinct idle/offline/plain disconnection wording lives here, in the
// modal — the footer only ever shows "Disconnected".
// Provenance: original components/DisconnectionOverlay.tsx:29-42.
const overlayMessages: Partial<Record<ConnectionStatus, string>> = {
  [ConnectionStatus.DISCONNECTED]: "Trying to re-connect to the server...",
  [ConnectionStatus.IDLE_DISCONNECTED]:
    "You have been disconnected due to inactivity.",
  [ConnectionStatus.OFFLINE_DISCONNECTED]:
    "This device has been detected to be offline.  Connection to the server will resume when a stable internet connection is established.",
};
```
(The double space after "offline." is verbatim from the original.)

- [ ] **Step 4: Fix the overlay contract spec.** In `ConnectionOverlay.contract.spec.ts`, the plain-disconnect assertion `/reconnecting/i` (line 32) no longer matches "Trying to re-connect..." — change to `/re-connect/i`. The `/inactivity/i` (39) and `/offline/i` (46) assertions still match — no change. Run:
```bash
pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/shell/connection/ConnectionOverlay.contract.spec.ts
```

- [ ] **Step 5: Fix the e2e feature + browser mirrors.** In `tests/specs/connection.feature:20`, change `And the connection status footer shows "Offline"` → `"Disconnected"` (with a comment that the offline-specific wording is asserted on the overlay). In `tests/browser/playwright/connection.spec.ts:31` and `tests/browser/cypress/connection.spec.ts:30`, change the `expectConnectionStatusFooterShows(ctx, "Offline")` → `"Disconnected"`.

- [ ] **Step 6: Make the presenter footer step honour the collapse.** The presenter peers consume the same feature and map labels→status. In both `tests/presenter/steps/connection.steps.ts` and `tests/presenter/vitest-quickpickle-fake-timers/steps/connection.steps.ts`, replace the `FOOTER_LABEL_TO_STATUS` map with a label→statuses map and the footer step with an `expectStatusInWithin` call:
```ts
const FOOTER_LABEL_TO_STATUSES: Record<string, ConnectionStatus[]> = {
  Connected: [CS_CONNECTED],
  Disconnected: [CS_DISCONNECTED, CS_IDLE, CS_OFFLINE],
  "Connecting...": [CS_CONNECTING],
};
```
```ts
Then(
  "the connection status footer shows {string}",
  function connectionStatusFooterShows(this: PresenterWorld, label: string) {
    const targets = FOOTER_LABEL_TO_STATUSES[label] ?? [CS_DISCONNECTED];
    return conn.expectStatusInWithin(this, targets, 3);
  },
);
```
Add `expectStatusInWithin` to `tests/presenter/scenarios/_shared/connection.ts` (alongside `expectStatusEqualsWithin`):
```ts
export async function expectStatusInWithin(
  w: PresenterWorld,
  statuses: ConnectionStatus[],
  seconds: number,
): Promise<void> {
  await w.awaitFirstWithin(
    w.ctx.app.presenters.connection.status$.pipe(
      filter((s) => { return statuses.includes(s); }),
    ),
    seconds * 1000,
  );
}
```
(`tests/presenter/vitest-fake-timers/connection.test.ts` calls `conn.*` directly and asserts `CS_OFFLINE` — no change.)

- [ ] **Step 7: Update spec prose.** In `specs/domain/connection.md`, add a footer-projection note after the status table: the footer collapses `IDLE_DISCONNECTED`/`OFFLINE_DISCONNECTED` to "Disconnected"; the idle/offline wording lives in the overlay. In `specs/features/shared/connection.feature`, the state assertions at :36 ("Idle Disconnected") and :61 ("Offline Disconnected") describe *state* and stay; add a clarifying comment after each that the footer renders the state as "Disconnected".

- [ ] **Step 8: Run suites + gates + e2e.**
```bash
pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts tests/ui/contract/specs/shell/connection
pnpm --filter @rtc/root-tests exec vitest run --config presenter/vitest-fake-timers/vitest.config.ts
pnpm --filter @rtc/root-tests run gates
pnpm typecheck
pnpm test:e2e:no-cypress
```

- [ ] **Step 9: Regenerate visual goldens.** Footer + overlay text changed:
```bash
pnpm --filter @rtc/client-react run test:ui:visual:vitest-browser:react:update
```
Regenerate both committed sets; review the PNGs (footer "Disconnected", new overlay sentences); commit.

- [ ] **Step 10: Commit.**
```bash
git add -A && git commit -m "fix(connection): footer collapses idle/offline to Disconnected; port original overlay wording (T2.4)

Footer maps IDLE_DISCONNECTED + OFFLINE_DISCONNECTED -> Disconnected (original
StatusButton.tsx:8-19); idle/offline/plain sentences move verbatim into
ConnectionOverlay (original DisconnectionOverlay.tsx:29-42). Presenter footer
step now maps the collapsed label to its status set.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task T2.2: Idle disconnect tears down the connection

**Context.** Original (`rtc-original services/connection.ts:71-96`): after `IDLE_TIMEOUT_MINUTES = 15`, `idleDisconnect$` calls the stored `dispose()` (closes the gateway socket), resets the disposable to a no-op, and emits `IDLE_DISCONNECTED`; reconnect is user-initiated (overlay Reconnect button). Clone (`packages/client-react/src/app/adapters/BrowserConnectionEventsAdapter.ts:21-26`) only **emits** an `idleTimeout` event; the WS socket stays open. **WsAdapter invariant:** `dispose()` is terminal (`WsAdapter.ts:202,62` set `disposed=true`, making `connect()` a permanent no-op) and clears `sendQueue` — so it cannot be used for idle teardown (user reconnect must reopen). Add a non-terminal `closeForIdle()`/`reopen()` that closes the current socket, suppresses auto-reconnect, and preserves `sendQueue`.

**Files:**
- `packages/client-react/src/app/adapters/WsAdapter.ts` — `idleClosed` flag, `closeForIdle()`, `reopen()`, guard auto-reconnect.
- `packages/client-react/src/app/adapters/IWsAdapter.ts` — extend the surface.
- `packages/client-react/src/app/composition.ts` — wire `idleTimeout`→close, `userActivity`→reopen (WS branch); faithful no-op (simulator branch).
- `packages/client-react/src/app/adapters/WsAdapter.test.ts` — close/reopen tests.
- FakeWsAdapter (referenced by `packages/client-react/src/app/adapters/__tests__/FakeWsAdapter.test.ts`) — implement the new methods.
- `packages/client-react/src/app/__tests__/idleTeardown.test.ts` — wiring test (create).
- `specs/features/shared/connection.feature:32-37`, `specs/domain/connection.md:82` — verify wording already says "terminated"/"closes the gateway connection".

**Interfaces:**
```ts
// IWsAdapter
closeForIdle(): void; // close the current socket without disposing; suppress auto-reconnect
reopen(): void;       // re-establish after an idle close (user-initiated)
```

- [ ] **Step 1: Add the failing WsAdapter close/reopen tests.** In `WsAdapter.test.ts` (uses a `MockWebSocket` stub + fake timers), add a `describe("WsAdapter.closeForIdle() / reopen()")` with three cases: (a) `closeForIdle()` closes the socket and does NOT schedule a reconnect after advancing past `reconnectDelayMs`; emitted events are `[gatewayConnected, gatewayDisconnected]`; (b) `reopen()` constructs a fresh socket and flushes a subscription buffered while idle-closed; (c) `dispose()` after `closeForIdle()` still tears down fully and `reopen()` is then a permanent no-op. (Mirror the existing test's `lastMock`/`MockWebSocket.constructed` helpers.)
Run: `pnpm --filter @rtc/client-react exec vitest run src/app/adapters/WsAdapter.test.ts` → FAIL (methods absent).

- [ ] **Step 2: Implement close/reopen in WsAdapter.** Add `private idleClosed = false;` next to `disposed`. In the `onclose` handler (lines 102-111), after emitting `gatewayDisconnected`, return early when `idleClosed` (skip `scheduleReconnect()`). Add:
```ts
  /** Close the current socket for an idle timeout without disposing the adapter.
   * Suppresses auto-reconnect (idle reconnect is user-initiated); preserves
   * sendQueue so subscriptions re-flush on reopen(). Provenance: original
   * services/connection.ts:91-93. */
  closeForIdle(): void {
    if (this.disposed || this.idleClosed) return;
    this.idleClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  /** Re-establish the socket after an idle close (user activity). */
  reopen(): void {
    if (this.disposed || !this.idleClosed) return;
    this.idleClosed = false;
    this.connect();
  }
```
`closeForIdle()` does NOT touch `sendQueue` (unlike `dispose()`), preserving the pre-open buffering invariant.

- [ ] **Step 3: Extend the interface + Fake.** Add `closeForIdle()`/`reopen()` to `IWsAdapter`. Implement on the FakeWsAdapter: `closeForIdle()` emits `gatewayDisconnected` + sets an internal `idleClosed`; `reopen()` clears it + emits `gatewayConnected` (match the fake's emission style). Run the WsAdapter tests → PASS.

- [ ] **Step 4: Wire composition (WS branch).** In `packages/client-react/src/app/composition.ts`, change the rxjs import to include `tap`, and in the WS branch wrap the merged events:
```ts
        return merge(gateway.events(), browser.events()).pipe(
          // Side-effect the transport in lock-step: idle timeout closes the
          // gateway socket; user activity (after an idle close) re-establishes it.
          // Provenance: original services/connection.ts:91-93; reconnect user-initiated.
          tap((e) => {
            if (e.type === "idleTimeout") ws.closeForIdle();
            else if (e.type === "userActivity") ws.reopen();
          }),
        );
```
(`reopen()` is a no-op unless `idleClosed`, so the frequent `userActivity` events while CONNECTED don't churn the socket.) Add a comment in the simulator branch that idle teardown is a faithful no-op (no socket; the state machine still reaches `IDLE_DISCONNECTED`, and `userActivity` is already remapped to re-emit `gatewayConnected`).

- [ ] **Step 5: Add the wiring test.** Create `packages/client-react/src/app/__tests__/idleTeardown.test.ts` proving an `idleTimeout` event invokes `closeForIdle()` and `userActivity` invokes `reopen()` on a fake adapter through the same `tap` logic (or, preferably, through the real `composition.ts` WS branch with a `VITE_SERVER_URL` stub + injected fake adapter if an app-test harness already exists — read `src/app/__tests__` first and reuse it).

- [ ] **Step 6: Verify spec prose.** `specs/features/shared/connection.feature:35` already reads "the connection should be terminated" and `specs/domain/connection.md:82` "the client closes the gateway connection" — now actually true. Add a provenance note after `connection.md:82` citing `WsAdapter.closeForIdle()` + `composition.ts` + original `services/connection.ts:91-93`. No idle scenario is added to `tests/specs/connection.feature` (a 15-min idle can't be injected via the DOM; teardown is proven by the unit + wiring tests, like the gateway-drop `@presenterOnly` scenario).

- [ ] **Step 7: Run + commit.**
```bash
pnpm --filter @rtc/client-react exec vitest run src/app/adapters/WsAdapter.test.ts src/app/adapters/__tests__/FakeWsAdapter.test.ts src/app/__tests__/idleTeardown.test.ts src/app/adapters/BrowserConnectionEventsAdapter.test.ts
pnpm typecheck
pnpm --filter @rtc/root-tests run gates
git add -A && git commit -m "fix(connection): idle timeout closes the gateway socket (T2.2)

WS branch calls WsAdapter.closeForIdle() on idleTimeout (closes the socket,
suppresses auto-reconnect) and reopen() on userActivity — reconnect is
user-initiated, matching original services/connection.ts:91-93. closeForIdle()
is non-terminal (unlike dispose()) and preserves the pre-open sendQueue.
Simulator mode has no socket, so teardown is a faithful no-op.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---


## Final — Whole-branch verification & resolution

### Task Z1: Full-suite verification and audit re-check

**Files:**
- Verify-only (no source change unless a regression surfaces).

**Interfaces:**
- Consumes: every prior task's deliverable.
- Produces: a green branch with all 13 behaviours matching the original.

- [ ] **Step 1: Run the whole test suite.**

```bash
pnpm test
pnpm typecheck
```
Expected: all unit + contract suites pass; no type errors.

- [ ] **Step 2: Run the dev gates.**

```bash
pnpm --filter @rtc/client-react lint        # Biome
pnpm --filter @rtc/client-react lint:css    # Stylelint
pnpm exec dependency-cruiser --config .dependency-cruiser.cjs packages
pnpm --filter @rtc/client-react lint:dead   # knip — confirm no unused d3 submodule
grep -n d3 packages/domain/package.json     # MUST be empty (domain stays rxjs-only)
```
Expected: all clean; the grep returns nothing.

- [ ] **Step 3: Run e2e.**

```bash
pnpm test:e2e:no-cypress
```
Expected: all suites pass (use `:no-cypress` locally per the aarch64 Cypress busy-spin caveat; CI runs the full set on x86).

- [ ] **Step 4: Confirm both visual-golden sets are committed and clean.**

```bash
pnpm --filter @rtc/client-react test:ui:visual:react
git status --porcelain packages/client-react/tests/ui/visual
```
Expected: visual tier green; the x86 CI `react/` set and the local `react-local/<arch>/` set are both committed (no stray `-actual.png`/`-diff.png`).

- [ ] **Step 5: Re-run the audit checklist against the original.**

For each in-scope item, confirm the clone now matches the original (cite the original `file:line` already recorded in each task): T1.1 sort ASC-first for Notional/Rate; T1.2 `USD +12,345`; T1.3 `12m` default + `12,345,678.00` hover; T1.4 per-currency bubbles, traded-amount sizing/colour, drag drift-back, `{CCY} {amount}` tooltip; T1.5 quantity caps at 100,000,000; T1.6 RFQ delay 500–999 ms; T1.7 3× flash; T2.1 Buy/Sell disabled while stale; T2.2 idle closes the socket; T2.3 credit blotter sorts/filters/exports; T2.4 footer "Disconnected" + idle/offline wording in the modal; T3.1 competing quotes flip to rejected live; T3.2 RFQ reaches Expired at +120s with a live countdown. Confirm CreditExceeded remains the sole documented non-fix.

- [ ] **Step 6: Append the resolution note to the retrospective.**

In `docs/research/2026-06-23-spec-driven-reimplementation-fidelity.md`, append a `## Resolution (2026-06-…)` section: link to `docs/superpowers/specs/2026-06-23-behaviour-sync-to-original-design.md` and this plan; state that the 13 in-scope divergences were synced to the original (golden-fixtured / provenance-cited) and that CreditExceeded was deliberately left web-build-faithful.

- [ ] **Step 7: Commit.**

```bash
git add docs/research/2026-06-23-spec-driven-reimplementation-fidelity.md
git commit -m "docs(research): resolution note — behaviour sync to original complete

13 in-scope divergences synced to rtc-original@4a31f01 (golden-fixtured or
provenance-cited); CreditExceeded left web-build-faithful by design.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 8: Finish the branch.**

Use the superpowers:finishing-a-development-branch skill to choose merge / PR / keep for `feat/behaviour-sync-to-original`.

