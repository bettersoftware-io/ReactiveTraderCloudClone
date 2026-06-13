# UI Test Taxonomy + Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the `src/ui` "behaviour" test tier to a self-describing `ui:contract` tier, add a focused `test:app` runner, fix the stale test docs, then drive `src/ui` to ≥95% coverage with a CI-enforced gate.

**Architecture:** Two source layers map to two focused runners — `src/app` (presenters/adapters, co-located unit tests) → `test:app`; `src/ui` (thin React components) → `test:ui:contract` (sociable RTL contract specs) — with bare `test` remaining their union. Phase 1 is a pure rename verified by an unchanged 30/90 suite; Phase 2 adds sociable specs per `.tsx` component + plain unit tests per pure `.ts` util/hook until the v8 coverage gate passes.

**Tech Stack:** Vitest 4 (jsdom), `@testing-library/{react,dom,user-event}`, `@vitest/coverage-v8`, RxJS, the existing neutral harness under `tests/behaviour/` (→ `tests/ui/contract/`).

**Reference (the canonical worked examples — read these before Phase 2):**
- Spec style: `packages/client/tests/ui/contract/specs/fx/blotter/FxBlotter.contract.spec.ts` (after Task 1 rename) — collection + empty + `emit`.
- Interaction + command/callback spy: `.../specs/credit/newRfq/NewRfqForm.contract.spec.ts`.
- Page-object style: `.../shared/pages/**` (DOM via `@testing-library/dom` only).
- Token + registry wiring: `.../shared/components.ts`, `.../react/registry.tsx`.

**Design:** `docs/superpowers/specs/2026-06-13-ui-test-taxonomy-and-coverage-design.md`. Out of scope: the `visual-diff → ui/visual` refold (Phase 3, separate branch).

---

## PHASE 1 — Rename + restructure (no new tests)

## Task 1: Move the tier to `tests/ui/contract` and rewire everything

**Files:**
- Move: `packages/client/tests/behaviour/` → `packages/client/tests/ui/contract/`
- Rename within: `**/*.behaviour.spec.ts` → `**/*.contract.spec.ts`
- Modify: `packages/client/tests/ui/contract/vitest.config.ts`, `.../react/render.tsx`, `.../react/setup.ts`, `.../shared/harness/activeDriver.ts`, all 4 spec files (import alias), `.../shared/components.ts` (none — uses relative), `.../README.md`
- Rename: `packages/client/tsconfig.behaviour.json` → `tsconfig.ui-contract.json`
- Modify: `packages/client/tsconfig.visual-diff.json`, `packages/client/package.json`, `packages/client/vitest.config.ts`

- [ ] **Step 1: Move the folder and rename spec files (preserve git history)**

```bash
cd packages/client
mkdir -p tests/ui
git mv tests/behaviour tests/ui/contract
git mv tests/ui/contract/specs/fx/analytics/PnlValue.behaviour.spec.ts        tests/ui/contract/specs/fx/analytics/PnlValue.contract.spec.ts
git mv tests/ui/contract/specs/shell/connection/ConnectionStatusBar.behaviour.spec.ts tests/ui/contract/specs/shell/connection/ConnectionStatusBar.contract.spec.ts
git mv tests/ui/contract/specs/fx/blotter/FxBlotter.behaviour.spec.ts         tests/ui/contract/specs/fx/blotter/FxBlotter.contract.spec.ts
git mv tests/ui/contract/specs/credit/newRfq/NewRfqForm.behaviour.spec.ts     tests/ui/contract/specs/credit/newRfq/NewRfqForm.contract.spec.ts
```

- [ ] **Step 2: Update the spec import aliases (`@behaviour` → `@ui-contract`)**

In all 4 moved spec files, replace `@behaviour/mount` → `@ui-contract/mount` and `@behaviour/components` → `@ui-contract/components`:

```bash
grep -rl "@behaviour/" tests/ui/contract/specs | xargs sed -i 's#@behaviour/#@ui-contract/#g'
```

- [ ] **Step 3: Rename the driver symbol and fix the error message**

In `tests/ui/contract/shared/harness/activeDriver.ts`: rename interface `BehaviourDriver` → `UiContractDriver` (4 occurrences: the `export interface`, the `let active`, the `setDriver` param, the `getDriver` return), and fix the throw message path:

```ts
export interface UiContractDriver {
  render<P, Page extends MountedComponent<P>>(
    token: ComponentToken<P, Page>,
    inputs: RenderInputs<P>,
  ): MountedRoot;
}

let active: UiContractDriver | null = null;

export function setDriver(driver: UiContractDriver): void {
  active = driver;
}

export function getDriver(): UiContractDriver {
  if (!active) {
    throw new Error(
      "No ui-contract test driver registered. Ensure the tier's setupFiles entry " +
        "(tests/ui/contract/react/setup.ts) ran before the spec.",
    );
  }
  return active;
}
```

In `tests/ui/contract/react/render.tsx`: update both references — `import type { UiContractDriver } from "../shared/harness/activeDriver";` and `export const reactDriver: UiContractDriver = {`.

- [ ] **Step 4: Rewrite the focused vitest config (note the deeper root-pin)**

Replace `packages/client/tests/ui/contract/vitest.config.ts` with (root-pin is now **three** levels up — the config moved one level deeper; `@ui-contract` alias value stays `./shared`):

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-contract": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    // Pin root to the package dir (THREE levels up from tests/ui/contract) so
    // include/setup/report paths are stable regardless of invocation cwd.
    root: fileURLToPath(new URL("../../..", import.meta.url)),
    environment: "jsdom",
    include: ["tests/ui/contract/specs/**/*.contract.spec.ts"],
    setupFiles: ["./tests/ui/contract/react/setup.ts"],
    passWithNoTests: false,
    reporters: ["default", "html"],
    outputFile: { html: "reports/ui/contract/report/index.html" },
    coverage: {
      provider: "v8",
      include: ["src/ui/**"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/ui/contract/coverage",
    },
  },
});
```

- [ ] **Step 5: Rename + rewrite the tsconfig program**

```bash
git mv tsconfig.behaviour.json tsconfig.ui-contract.json
```
Then replace `packages/client/tsconfig.ui-contract.json` contents:

```json
{
  // Type-checks the ui-contract harness (tests/ui/contract/) together with the
  // src/ui files it mounts, so `pnpm typecheck` catches drift between
  // hooksFromWorld and the AppHooks interface.
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "paths": {
      "@ui-contract": ["./tests/ui/contract/shared"],
      "@ui-contract/*": ["./tests/ui/contract/shared/*"]
    }
  },
  "include": ["src", "tests/ui/contract"],
  "references": [{ "path": "../domain" }, { "path": "../shared" }]
}
```

- [ ] **Step 6: Update `tsconfig.visual-diff.json` exclude**

Change its `exclude` array entry `"tests/behaviour"` → `"tests/ui/contract"`:
```json
  "exclude": ["tests/visual-diff/playwright-ct/playwright-ct.config.ts", "tests/ui/contract"],
```

- [ ] **Step 7: Update the default `vitest.config.ts`**

Replace `packages/client/vitest.config.ts` with (alias key + path, include glob, setupFiles path all updated; report stays `reports/unit/`):

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-contract": fileURLToPath(
        new URL("./tests/ui/contract/shared", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/ui/contract/specs/**/*.contract.spec.ts",
    ],
    setupFiles: ["./tests/ui/contract/react/setup.ts"],
    passWithNoTests: true,
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
  },
});
```

- [ ] **Step 8: Update `package.json` scripts**

In `packages/client/package.json`, replace the two `test:behaviour*` lines and the `typecheck` tsconfig name, and add `test:app`:

```json
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.visual-diff.json && tsc --noEmit -p tsconfig.ui-contract.json",
    "test": "vitest run",
    "test:app": "vitest run src/app --outputFile.html=reports/app/report/index.html",
    "test:ui:contract": "vitest run -c tests/ui/contract/vitest.config.ts",
    "test:ui:contract:coverage": "vitest run -c tests/ui/contract/vitest.config.ts --coverage",
```

(The `test:app` positional `src/app` filters to the co-located presenter/adapter tests; `--outputFile.html` routes its report to `reports/app/` per the `test:<a>` ⇒ `reports/<a>/` rule.)

- [ ] **Step 9: Verify nothing regressed**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone
pnpm --filter @rtc/client test            # expect 30 files / 90 tests
pnpm --filter @rtc/client test:ui:contract # expect 4 files / 21 tests
pnpm --filter @rtc/client test:app         # expect 26 files / 69 tests
pnpm --filter @rtc/client typecheck        # expect exit 0
pnpm --filter @rtc/client build            # expect success
```
Then confirm no stray references remain in live code/config:
```bash
grep -rn "behaviour\|@behaviour" packages/client/tests packages/client/*.json packages/client/*.ts 2>/dev/null
```
Expected: only `reports/`-ignored output, none in source/config. (Historical `docs/superpowers/plans|specs` keep the old name — they are point-in-time records, do NOT edit them.)

- [ ] **Step 10: Commit**

```bash
git add -A packages/client
git commit -m "refactor(client): rename behaviour tier to ui:contract + add test:app"
```

---

## Task 2: Update the tier README + repo test docs + memory

**Files:**
- Rewrite: `packages/client/tests/ui/contract/README.md`
- Modify: `packages/client/README.md`, `README.md` (root), `tests/README.md`, `docs/superpowers/STATUS.md`
- Modify: `~/.claude/projects/-Users-csx-workarea-dev-github-com-bettersoftware-io-ReactiveTraderCloudClone/memory/project_behaviour_test_tier.md` + `MEMORY.md` pointer

- [ ] **Step 1: Rewrite the tier README**

Update `packages/client/tests/ui/contract/README.md`: replace every `behaviour`/`@behaviour`/`test:behaviour`/`tests/behaviour` with the `ui-contract`/`@ui-contract`/`test:ui:contract`/`tests/ui/contract` equivalents; retitle to "# UI contract test tier"; keep the layers/channels/swap/dual-use sections; in "Running", document `test:ui:contract` and `test:ui:contract:coverage` (report at `reports/ui/contract/coverage/index.html`).

- [ ] **Step 2: Fix the stale client README test table**

In `packages/client/README.md`: the row claiming `test` = "unit tier — presenters, adapters" is now wrong. Update the table to:
- `test:app` → **app tier** — presenters, adapters (`src/app`) → `reports/app/`
- `test:ui:contract[:coverage]` → **ui contract tier** — sociable RTL specs over `src/ui` → `reports/ui/contract/[coverage/]`
- `test` → **default** — union of app + ui-contract → `reports/unit/`
Keep the visual-diff rows unchanged (still `test:visual-diff:*` until Phase 3). Update the "Test portfolio" prose accordingly.

- [ ] **Step 3: Update root README + tests/README**

In root `README.md` "Checks & tests": note `pnpm test` is the per-package union and mention the new focused `test:app` / `test:ui:contract` client runners where the test topology is described. In `tests/README.md`: if it enumerates client tiers, add the ui-contract tier. Do not rename `test:visual-diff` anywhere (Phase 3).

- [ ] **Step 4: Update STATUS + memory**

In `docs/superpowers/STATUS.md`: update any "behaviour tier" reference to "ui-contract tier". Update the memory file `project_behaviour_test_tier.md` body + filename-pointer in `MEMORY.md` to the new names (rename the slug to `project_ui_contract_test_tier` is optional; at minimum fix names/paths inside).

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @rtc/client test  # still 30/90
git add -A packages/client README.md tests/README.md docs/superpowers/STATUS.md
git commit -m "docs(client): document app + ui:contract tiers; fix stale test table"
```

---

## PHASE 2 — Coverage to ≥95% + CI gate

> **Per-area recipe (apply in every Phase-2 task):** For each **`.tsx` component** in the area: (1) read the real component to learn its DOM (testids, roles, placeholder/label text, props, which hooks it reads); (2) add a page object under `tests/ui/contract/shared/pages/<mirror>/<Name>Page.ts` querying via `@testing-library/dom`; (3) add a token in `shared/components.ts` and a React entry in `react/registry.tsx`; (4) write `specs/<mirror>/<Name>.contract.spec.ts` asserting rendered DOM + recorded command/callback inputs + at least one dynamic `setProps`/`emit`; importing only `@ui-contract/*` + `@rtc/domain`. For each **pure `.ts` util/hook**: add a co-located `src/ui/.../<name>.test.ts` (plain Vitest; `renderHook` from `@testing-library/react` only if it needs hook context). **Oracle:** after each area, run `pnpm --filter @rtc/client test:ui:contract:coverage` and iterate until every non-excluded file in the area is ≥95% statements/branches/functions/lines. Never modify `src/` to fit a test — fix the test. Keep the neutrality invariant: only files under `tests/ui/contract/react/` may import React/`@testing-library/react`.

## Task 3: Coverage exclusions scaffold (gate OFF until Task 8)

**Files:** Modify `packages/client/tests/ui/contract/vitest.config.ts`

- [ ] **Step 1: Add the justified exclusion list to `coverage`**

Add `exclude` to the `coverage` block (thresholds come in Task 8). Each entry is owned by the visual/e2e tiers or carries no contract logic:

```ts
    coverage: {
      provider: "v8",
      include: ["src/ui/**"],
      exclude: [
        // Full-page composition roots — owned by visual-diff app/* + e2e.
        "src/ui/App.tsx",
        "src/ui/shell/layout/Workspace.tsx",
        "src/ui/credit/CreditWorkspace.tsx",
        // Real composition-root / providers / constants the harness replaces.
        "src/ui/hooks/createAppHooks.ts",
        "src/ui/hooks/HooksProvider.tsx",
        "src/ui/shell/theme/ThemeProvider.tsx",
        "src/ui/shell/theme/tokens.ts",
        // Canvas/chart leaves with no DOM-assertable logic — owned by visual-diff.
        "src/ui/fx/analytics/PnlChart.tsx",
        "src/ui/fx/analytics/PositionBubbles.tsx",
        "src/ui/fx/analytics/PairPnlBars.tsx",
        "src/ui/fx/liveRates/tile/TileChart.tsx",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/ui/contract/coverage",
    },
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter @rtc/client test:ui:contract:coverage 2>&1 | tail -5  # runs, no threshold failure yet
git add -A packages/client/tests/ui/contract/vitest.config.ts
git commit -m "test(client): scope ui:contract coverage with justified exclusions"
```

## Task 4: Cover `fx/blotter`

**Targets — components:** `BlotterRow.tsx`, `BlotterHeader.tsx`, `QuickFilter.tsx`, `columnFilter/DateFilter.tsx`, `columnFilter/NumberFilter.tsx`, `columnFilter/SetFilter.tsx`, and the missing `FxBlotter.tsx` **sort/filter/quick-filter** branches (currently 57% branch). **Targets — pure utils:** `columnSort.ts`, `csvExport.ts`, `columnFilter/filterState.ts`, `blotterColumns.ts`.

- [ ] **Step 1** Apply the per-area recipe. For sort/filter, drive interactions through the `FxBlotter` page object (click a column header to sort, open a column filter, type in `QuickFilter`) and assert the resulting row order/visibility; unit-test `columnSort`/`csvExport`/`filterState` directly with crafted `Trade[]`.
- [ ] **Step 2** `pnpm --filter @rtc/client test:ui:contract:coverage` — every listed `fx/blotter` file ≥95%.
- [ ] **Step 3** `pnpm --filter @rtc/client typecheck` exit 0.
- [ ] **Step 4** Commit: `git commit -m "test(client): cover fx/blotter components + utils"`

## Task 5: Cover `fx/analytics`

**Targets — components:** `AnalyticsPanel.tsx` (and any non-excluded analytics leaf). (`PnlChart`/`PositionBubbles`/`PairPnlBars` are excluded — do not test.)

- [ ] **Step 1** Recipe: mount `AnalyticsPanel` with `hooks: { useAnalytics: … }`; assert the summarised P&L/position figures it renders; add a dynamic `emit` updating analytics.
- [ ] **Step 2** Coverage ≥95% for non-excluded `fx/analytics` files. **Step 3** typecheck 0. **Step 4** Commit: `git commit -m "test(client): cover fx/analytics"`

## Task 6: Cover `fx/liveRates`

**Targets — components:** `LiveRatesPanel.tsx`, `CurrencyFilter.tsx`, `ViewToggle.tsx`, `tile/Tile.tsx`, `tile/TileHeader.tsx`, `tile/TilePrice.tsx`, `tile/TileNotional.tsx`, `tile/TileRfq.tsx`, `tile/TileExecution.tsx`, `tile/TileConfirmation.tsx`, `tile/RfqCountdown.tsx`. **Targets — hooks:** `tile/hooks/useNotional.ts`, `useExecuteTrade.ts`, `useRfqQuote.ts`, `useRfqState.ts`, `useTileState.ts`.

- [ ] **Step 1** Recipe. Tiles read parametric hooks (`usePrice`, etc.) — extend `tests/ui/contract/react/hooksFromWorld.ts` and `shared/harness/world.ts` if a tile needs a parametric source made reactive (add a controllable source keyed by pair/symbol; mirror the nullary-source pattern). Use fake timers for `RfqCountdown`/countdown logic (`vi.useFakeTimers()`; advance with `vi.advanceTimersByTime`). Unit-test the `tile/hooks/*` via `renderHook` wrapped in `HooksProvider` with a fake `AppHooks`, or as pure functions where they take plain args.
- [ ] **Step 2** Coverage ≥95% for non-excluded `fx/liveRates` files. **Step 3** typecheck 0. **Step 4** Commit: `git commit -m "test(client): cover fx/liveRates panel, tiles, hooks"`

## Task 7: Cover `credit` (incl. the `onCreated` spy)

**Targets — components:** `newRfq/InstrumentSearch.tsx`, `newRfq/QuantityInput.tsx`, `newRfq/DealerSelection.tsx` (deeper branch coverage), `rfqTiles/QuoteCard.tsx`, `rfqTiles/RfqCard.tsx`, `rfqTiles/RfqFilterTabs.tsx`, `rfqTiles/RfqTilesPanel.tsx`, `sellSide/SellSidePanel.tsx`, `sellSide/TradeTicket.tsx`, `blotter/CreditBlotter.tsx`.

- [ ] **Step 1: Assert the `NewRfqForm` `onCreated` callback (the explicit gap)**

Add a test to `specs/credit/newRfq/NewRfqForm.contract.spec.ts` that passes a spy and asserts it fires with the new RFQ id. The component calls `onCreated` on a ~1.5s `setTimeout`, so drive timers:

```ts
import { vi } from "vitest";
// inside the describe:
it("notifies the parent with the created RFQ id", async () => {
  vi.useFakeTimers();
  const onCreated = vi.fn();
  const form = mount(NewRfqForm, {
    props: { onCreated },
    hooks: { useInstruments: instruments, useDealers: dealers },
    commands: { createRfq: 555 },
  });
  await form.chooseInstrument("Apple Inc 2030");
  await form.setQuantity(5);
  await form.submit();
  await vi.advanceTimersByTimeAsync(1500);
  expect(onCreated).toHaveBeenCalledWith(555);
  vi.useRealTimers();
});
```
If `userEvent` interactions hang under fake timers, create the page object's `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` — add an optional ctor flag on `NewRfqFormPage` or a second `userEvent` instance; report the approach taken.

- [ ] **Step 2** Apply the recipe to the remaining `credit` components.
- [ ] **Step 3** Coverage ≥95% for non-excluded `credit` files. **Step 4** typecheck 0. **Step 5** Commit: `git commit -m "test(client): cover credit components incl. NewRfqForm onCreated spy"`

## Task 8: Cover `shell` + `admin`, then turn on the gate + CI

**Targets — components:** `shell/connection/ConnectionOverlay.tsx`, `shell/layout/Footer.tsx`, `shell/layout/Header.tsx`, `shell/stale/StaleIndicator.tsx`, `shell/theme/ThemeToggle.tsx`, `admin/AdminPanel.tsx`. **Targets — hooks:** `shell/stale/useStaleDetection.ts`, `admin/hooks/useThroughput.ts`.

- [ ] **Step 1** Apply the recipe to all targets (fake timers for `useStaleDetection`/staleness; `ThemeToggle` toggles `ThemeProvider` state — assert the toggle's effect on a `data-*`/class it controls, not colour).
- [ ] **Step 2: Confirm the whole non-excluded `src/ui` surface is ≥95%**

```bash
pnpm --filter @rtc/client test:ui:contract:coverage 2>&1 | tail -8
```
Inspect `reports/ui/contract/coverage/index.html`; close any remaining <95% file in any area (loop back to its task’s recipe).

- [ ] **Step 3: Turn on the threshold gate**

Add to the `coverage` block in `tests/ui/contract/vitest.config.ts`:
```ts
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
```
Run `pnpm --filter @rtc/client test:ui:contract:coverage` — must now PASS the gate (non-zero exit if under). 

- [ ] **Step 4: Add the CI step**

In `.github/workflows/ci.yml`, add a step running `pnpm --filter @rtc/client test:ui:contract:coverage` in the client job (after the existing unit/typecheck steps; before or alongside visual-diff). Match the file's existing step style (same Node/pnpm setup, `working-directory` if used). Do NOT touch `update-visual-goldens.yml` (Phase 3).

- [ ] **Step 5: Final docs + full verification**

Update `packages/client/README.md` + `packages/client/tests/ui/contract/README.md` to state the ≥95% gate and the `test:ui:contract:coverage` report path. Then:
```bash
pnpm --filter @rtc/client test && pnpm --filter @rtc/client test:ui:contract:coverage && pnpm --filter @rtc/client typecheck && pnpm --filter @rtc/client build
```
All green; coverage gate passes.

- [ ] **Step 6: Commit**

```bash
git add -A packages/client .github/workflows/ci.yml
git commit -m "test(client): cover shell+admin, enable 95% ui:contract coverage gate + CI"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** rename/taxonomy (Task 1–2); `test:app` (Task 1); stale-README fix (Task 2); exclusions (Task 3); per-area sociable + util tests (Tasks 4–8); `onCreated` spy (Task 7 Step 1); ≥95% gate + CI (Task 8). Phase 3 (visual-diff refold) intentionally absent.
- **Root-pin gotcha:** the focused config moved one level deeper → `new URL("../../..")` (Task 1 Step 4). Getting this wrong makes `include`/report paths resolve from the wrong dir.
- **Neutrality invariant** (re-verify after Task 8): `grep -rl "@testing-library/react\|useSyncExternalStore\|from \"react\"" packages/client/tests/ui/contract` lists only `react/` files (README prose excepted).
- **Type consistency:** `UiContractDriver` (renamed from `BehaviourDriver`) is used in `activeDriver.ts` + `render.tsx`; `@ui-contract` alias is declared identically in the focused config, the default config, and `tsconfig.ui-contract.json`. Spec glob `*.contract.spec.ts` matches in both configs.
- **Honesty of the gate:** every coverage exclusion is listed explicitly in the config (Task 3) so the 95% denominator isn’t silently shrunk; each is justified by another tier owning it.
- **No `src/` edits:** components are the source of truth throughout; a wrong expectation means fixing the test, never the component.
