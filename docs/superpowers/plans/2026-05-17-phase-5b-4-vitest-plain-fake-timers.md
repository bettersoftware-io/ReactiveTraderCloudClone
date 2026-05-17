# Phase 5B.4 — Vitest + plain TS (no Gherkin) + fake timers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an 8th e2e peer `test:presenter:vitest-plain` that runs the same 19 `@presenter` scenarios as 5B.1/5B.2/5B.3 under Vitest + `vi.useFakeTimers()` with **no Gherkin loader** — hand-written `describe`/`it` blocks calling the existing `tests/scenarios/presenter/_shared/*.ts` modules.

**Architecture:** Per-feature `*.test.ts` files in a new top-level folder `tests/presenter-tests/vitest-plain/`. Each file maps `Feature: <title>` → `describe("@presenter Feature: <title>")` and each `@presenter Scenario:` → one `it()` body that linearly invokes `_shared/*.ts` functions. A single plain-object `_world.ts` factory installs fake timers, builds the presenter app, holds the status subscription, and implements `AwaitHelpers` via `vi.advanceTimersByTimeAsync`. No new dependencies (vitest is already in the tree from 5B.3).

**Tech Stack:** TypeScript, Vitest `^3.2` (existing), `vi.useFakeTimers` (sinon-based, ships with vitest), RxJS (`firstValueFrom`, `timeout`). Forbidden in this peer by gate 20: `@cucumber/cucumber`, `quickpickle`.

**Spec reference:** `docs/superpowers/specs/2026-05-17-phase-5b-4-vitest-plain-fake-timers-design.md` (commit `e27242f`).

---

## File Structure

**Create:**
- `tests/vitest-presenter-plain.config.ts` — Vitest config (no qpickle-loader plugin, glob-scoped include).
- `tests/presenter-tests/vitest-plain/_world.ts` — `buildWorld()` / `teardownWorld()` factory + `VitestPlainPresenterWorld` interface.
- `tests/presenter-tests/vitest-plain/connection.test.ts` — 4 `it()` blocks (connection.feature @presenter scenarios).
- `tests/presenter-tests/vitest-plain/fxLiveRates.test.ts` — 4 `it()` blocks.
- `tests/presenter-tests/vitest-plain/fxTrading.test.ts` — 5 `it()` blocks.
- `tests/presenter-tests/vitest-plain/blotter.test.ts` — 2 `it()` blocks.
- `tests/presenter-tests/vitest-plain/analytics.test.ts` — 2 `it()` blocks.
- `tests/presenter-tests/vitest-plain/fxRfq.test.ts` — 1 `it()` block.
- `tests/presenter-tests/vitest-plain/creditRfq.test.ts` — 1 `it()` block.

**Modify:**
- `tests/package.json` — add `test:presenter:vitest-plain` script (no new deps).
- `tests/scripts/run-all.ts` — append the 8th peer line.
- `tests/scripts/grep-gates.ts` — add gate 20 (Gherkin forbidden in vitest-plain); extend `Gate` interface with optional `customCheck?: () => string[]`; add gate 21 (count parity).
- `docs/superpowers/STATUS.md` — flip Phase 5B.4 row to ✅ DONE; bump test-counts line; add `## Phase 5B.4 follow-ups` section.
- `docs/architecture.md` — add an 8th row to the "Presenter test stack" table; bump scenario tallies.

**Unchanged:** `tests/specs/*.feature`, `tests/scenarios/presenter/_shared/*.ts`, `tests/scenarios/presenter/_await.ts`, `tests/scenarios/presenter/_buildApp.ts`, `tests/scenarios/presenter/_world.ts`, all `tests/steps/**`, all `tests/support/**`, and the other 7 peers' configs.

---

### Task 1: Vitest config and pnpm script

**Files:**
- Create: `tests/vitest-presenter-plain.config.ts`
- Modify: `tests/package.json` (add one line under `scripts`)

- [ ] **Step 1: Create the Vitest config**

Write `tests/vitest-presenter-plain.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["presenter-tests/vitest-plain/**/*.test.ts"],
    reporters: ["default"],
    pool: "threads",
  },
});
```

No `setupFiles`, no `testNamePattern`, no plugin. The folder is scoped to `@presenter` by location; the per-suite `beforeEach` does the world build.

- [ ] **Step 2: Add the pnpm script**

Edit `tests/package.json`. Inside the `"scripts"` object, after the existing `"test:presenter:vitest-fake"` line, add:

```json
    "test:presenter:vitest-plain": "vitest run --config vitest-presenter-plain.config.ts",
```

Make sure the previous line ends with `,` after the edit. Final `scripts` section should contain (excerpt):

```json
    "test:presenter:vitest-fake": "vitest run --config vitest-presenter-fake.config.ts",
    "test:presenter:vitest-plain": "vitest run --config vitest-presenter-plain.config.ts",
    "test:e2e:raw-playwright": "tsx scripts/with-server.ts playwright test --config raw/playwright/playwright.config.ts",
```

No `devDependencies` change — `vitest ^3.2` was already installed for 5B.3.

- [ ] **Step 3: Run the new script to verify it's wired but has no tests yet**

Run: `cd tests && pnpm test:presenter:vitest-plain`
Expected: vitest exits non-zero with a message similar to `No test files found, exiting with code 1` (or `Include pattern: presenter-tests/vitest-plain/**/*.test.ts ... No test files found`). This is the deliberate "failing" state — Task 2 makes it pass by adding the first test file.

- [ ] **Step 4: Commit**

```bash
git add tests/vitest-presenter-plain.config.ts tests/package.json
git commit -m "feat(phase-5b.4): scaffold vitest-presenter-plain config + script"
```

---

### Task 2: connection.test.ts + _world.ts (first test peer, drives world factory)

This task uses TDD across two files: write the test first (it can't compile because `_world.ts` doesn't exist), then create `_world.ts` to make it pass. After this task, the 4 `@presenter` scenarios in `connection.feature` have peer `it()` blocks running under vitest-plain.

**Files:**
- Create: `tests/presenter-tests/vitest-plain/connection.test.ts`
- Create: `tests/presenter-tests/vitest-plain/_world.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/presenter-tests/vitest-plain/connection.test.ts`:

```typescript
import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as conn from "../../scenarios/presenter/_shared/connection";
import type { ConnectionStatus } from "@rtc/domain";

// String-literal stand-ins for the ConnectionStatus const enum. Same trick as
// steps/presenter/vitest-fake/connection.steps.ts — verbatimModuleSyntax +
// isolatedModules forbid accessing ambient const enum values from a different
// package. The members are string-valued so the cast is safe at runtime.
const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;
const CS_OFFLINE = "OFFLINE_DISCONNECTED" as unknown as ConnectionStatus;

describe("@presenter Feature: Connection status", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("connected status is shown in the footer", async () => {
    await conn.noopAssertConnectionUiPresent(w);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 3);
  });

  it("connection overlay is hidden when connected", async () => {
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 1);
  });

  it("going offline shows the overlay with an offline message", async () => {
    await conn.browserGoesOffline(w);
    await conn.expectStatusEqualsWithin(w, CS_OFFLINE, 3);
    await conn.noopAssertConnectionUiPresent(w);
    await conn.expectStatusEqualsWithin(w, CS_OFFLINE, 3);
  });

  it("coming back online dismisses the overlay", async () => {
    await conn.browserGoesOffline(w);
    await conn.expectStatusEqualsWithin(w, CS_OFFLINE, 3);
    await conn.browserComesBackOnline(w);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 5);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 3);
  });
});
```

- [ ] **Step 2: Run to verify it fails because `_world` is missing**

Run: `cd tests && pnpm test:presenter:vitest-plain`
Expected: vitest fails to resolve `"./_world"` (the import in line 2). Error contains `Cannot find module './_world'` or `Failed to load url ./_world`.

- [ ] **Step 3: Create `_world.ts`**

Create `tests/presenter-tests/vitest-plain/_world.ts`:

```typescript
import { firstValueFrom, timeout, type Observable, type Subscription } from "rxjs";
import { vi } from "vitest";
import { buildPresenterApp, type PresenterCtx } from "../../scenarios/presenter/_buildApp";
import { newScratchpad, type PresenterScratchpad } from "../../scenarios/presenter/_shared/common";
import type { AwaitHelpers } from "../../scenarios/presenter/_await";

export interface VitestPlainPresenterWorld extends AwaitHelpers {
  ctx: PresenterCtx;
  scratch: PresenterScratchpad;
  /** Held for the entire test to keep shareReplay streams warm. */
  _statusSub: Subscription;
}

export function buildWorld(): VitestPlainPresenterWorld {
  // Install fake timers BEFORE buildPresenterApp so simulators capture patched
  // setTimeout/setInterval. Seed virtual now() with real Date.now() so simulator
  // historical timestamps stay sensible. Same ordering as vitest-fake/hooks.ts.
  vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false });
  const ctx = buildPresenterApp();
  const w: VitestPlainPresenterWorld = {
    ctx,
    scratch: newScratchpad(),
    _statusSub: ctx.app.presenters.connection.status$.subscribe(),
    async awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
      const p = firstValueFrom(source$.pipe(timeout(timeoutMs)));
      await vi.advanceTimersByTimeAsync(timeoutMs);
      return p;
    },
    async waitSeconds(n: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(n * 1000);
    },
  };
  return w;
}

export function teardownWorld(w: VitestPlainPresenterWorld): void {
  w._statusSub.unsubscribe();
  vi.useRealTimers();
}
```

- [ ] **Step 4: Run to verify all 4 tests pass**

Run: `cd tests && pnpm test:presenter:vitest-plain`
Expected: `Test Files  1 passed (1)` and `Tests  4 passed (4)`. Runtime ~1–2s.

- [ ] **Step 5: Commit**

```bash
git add tests/presenter-tests/vitest-plain/connection.test.ts tests/presenter-tests/vitest-plain/_world.ts
git commit -m "feat(phase-5b.4): vitest-plain world factory + connection peer (4/19)"
```

---

### Task 3: fxLiveRates.test.ts (4 @presenter scenarios)

**Files:**
- Create: `tests/presenter-tests/vitest-plain/fxLiveRates.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/presenter-tests/vitest-plain/fxLiveRates.test.ts`:

```typescript
import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as fx from "../../scenarios/presenter/_shared/fxLiveRates";

describe("@presenter Feature: FX live rates", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("tile grid renders streaming prices", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await fx.expectAtLeastNVisibleTilesWithin(w, 1, 5);
  });

  it("prices update over time", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await fx.recordFirstTileText(w);
    await w.waitSeconds(2);
    await fx.expectFirstTileTextNonEmpty(w);
  });

  it("currency pairs list has at least 7 entries", async () => {
    await fx.expectAtLeastNVisibleTilesWithin(w, 7, 5);
  });

  it("first tile shows a numeric mid value", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await fx.expectFirstTileTextMatches(w, /\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run to verify all 8 tests pass (4 connection + 4 fxLiveRates)**

Run: `cd tests && pnpm test:presenter:vitest-plain`
Expected: `Test Files  2 passed (2)` and `Tests  8 passed (8)`.

- [ ] **Step 3: Commit**

```bash
git add tests/presenter-tests/vitest-plain/fxLiveRates.test.ts
git commit -m "feat(phase-5b.4): fxLiveRates peer (8/19)"
```

---

### Task 4: fxTrading.test.ts (5 @presenter scenarios)

One scenario ("executed trade appears in the blotter") cross-references the `_shared/blotter` module, so the file imports from both `_shared/fxTrading` and `_shared/blotter`. This mirrors how qpickle-loader resolves cross-feature step references in vitest-fake.

**Files:**
- Create: `tests/presenter-tests/vitest-plain/fxTrading.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/presenter-tests/vitest-plain/fxTrading.test.ts`:

```typescript
import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as fx from "../../scenarios/presenter/_shared/fxLiveRates";
import * as trading from "../../scenarios/presenter/_shared/fxTrading";
import * as blotter from "../../scenarios/presenter/_shared/blotter";

describe("@presenter Feature: FX trading", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("execute a buy trade and see confirmation", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.executeBuyOnFirstTile(w);
    // "the trade confirmation appears within 5 seconds" is implicit:
    // executeBuyOnFirstTile already awaited the confirmation and captured status.
    await trading.expectTradeConfirmationMatchesOneOf(w, [/Executing/i, /You Bought/i, /rejected/i]);
  });

  it("execute a sell trade and see confirmation", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.executeSellOnFirstTile(w);
    await trading.expectTradeConfirmationMatchesOneOf(w, [/Executing/i, /You Sold/i, /rejected/i]);
  });

  it("executed trade appears in the blotter", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.executeBuyOnFirstTile(w);
    await w.waitSeconds(2);
    await blotter.expectBlotterVisible(w);
    await blotter.expectBlotterHasAtLeastNRows(w, 1);
  });

  it("executed trade carries the requested notional", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.executeBuyWithNotional(w, 1_000_000);
    await trading.expectTradeNotionalEquals(w, 1_000_000);
  });

  it("rejected trades occur with non-zero probability across multiple attempts", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.buyNTimesWithDismissals(w, 5);
    await trading.expectAtLeastOneRejection(w);
  });
});
```

- [ ] **Step 2: Run to verify all 13 tests pass (4 + 4 + 5)**

Run: `cd tests && pnpm test:presenter:vitest-plain`
Expected: `Test Files  3 passed (3)` and `Tests  13 passed (13)`.

- [ ] **Step 3: Commit**

```bash
git add tests/presenter-tests/vitest-plain/fxTrading.test.ts
git commit -m "feat(phase-5b.4): fxTrading peer (13/19)"
```

---

### Task 5: blotter.test.ts (2 @presenter scenarios)

Both scenarios import from `_shared/fxLiveRates`, `_shared/fxTrading`, and `_shared/blotter`.

**Files:**
- Create: `tests/presenter-tests/vitest-plain/blotter.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/presenter-tests/vitest-plain/blotter.test.ts`:

```typescript
import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as fx from "../../scenarios/presenter/_shared/fxLiveRates";
import * as trading from "../../scenarios/presenter/_shared/fxTrading";
import * as blotter from "../../scenarios/presenter/_shared/blotter";

describe("@presenter Feature: FX trade blotter", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("rejected trade flow does not error after multiple buys", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.buyNTimesWithDismissals(w, 3);
    await blotter.expectBlotterVisible(w);
    await blotter.expectBlotterHasAtLeastNRows(w, 1);
  });

  it("blotter accumulates after multiple trades", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.executeBuyOnFirstTile(w);
    await trading.executeBuyOnFirstTile(w);
    await w.waitSeconds(2);
    await blotter.expectBlotterHasAtLeastNRows(w, 2);
  });
});
```

- [ ] **Step 2: Run to verify all 15 tests pass**

Run: `cd tests && pnpm test:presenter:vitest-plain`
Expected: `Test Files  4 passed (4)` and `Tests  15 passed (15)`.

- [ ] **Step 3: Commit**

```bash
git add tests/presenter-tests/vitest-plain/blotter.test.ts
git commit -m "feat(phase-5b.4): blotter peer (15/19)"
```

---

### Task 6: analytics.test.ts (2 @presenter scenarios)

Scenario 1 cross-imports `_shared/fxLiveRates` (the Gherkin step "a price tile is visible" without "within N seconds" maps to `expectPriceTileVisibleWithin(w, 5)` per the existing vitest-fake step def).

**Files:**
- Create: `tests/presenter-tests/vitest-plain/analytics.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/presenter-tests/vitest-plain/analytics.test.ts`:

```typescript
import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as fx from "../../scenarios/presenter/_shared/fxLiveRates";
import * as analytics from "../../scenarios/presenter/_shared/analytics";

describe("@presenter Feature: Analytics panel", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("analytics panel shows alongside live rates", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await analytics.expectAnalyticsVisibleWithin(w, 5);
  });

  it("analytics presenter emits a non-empty snapshot", async () => {
    await analytics.expectAnalyticsEmits(w, 5);
  });
});
```

- [ ] **Step 2: Run to verify all 17 tests pass**

Run: `cd tests && pnpm test:presenter:vitest-plain`
Expected: `Test Files  5 passed (5)` and `Tests  17 passed (17)`.

- [ ] **Step 3: Commit**

```bash
git add tests/presenter-tests/vitest-plain/analytics.test.ts
git commit -m "feat(phase-5b.4): analytics peer (17/19)"
```

---

### Task 7: fxRfq.test.ts (1 @presenter scenario)

**Files:**
- Create: `tests/presenter-tests/vitest-plain/fxRfq.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/presenter-tests/vitest-plain/fxRfq.test.ts`:

```typescript
import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as fx from "../../scenarios/presenter/_shared/fxLiveRates";
import * as rfq from "../../scenarios/presenter/_shared/fxRfq";

describe("@presenter Feature: FX RFQ flow", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("large notional triggers an RFQ flow on the first tile", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await rfq.setFirstTileNotional(w, 10_000_000);
    await rfq.requestRfqQuoteOnFirstTile(w);
    await rfq.expectRfqQuoteArrivesWithin(w, 5);
  });
});
```

- [ ] **Step 2: Run to verify all 18 tests pass**

Run: `cd tests && pnpm test:presenter:vitest-plain`
Expected: `Test Files  6 passed (6)` and `Tests  18 passed (18)`.

- [ ] **Step 3: Commit**

```bash
git add tests/presenter-tests/vitest-plain/fxRfq.test.ts
git commit -m "feat(phase-5b.4): fxRfq peer (18/19)"
```

---

### Task 8: creditRfq.test.ts (1 @presenter scenario)

**Files:**
- Create: `tests/presenter-tests/vitest-plain/creditRfq.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/presenter-tests/vitest-plain/creditRfq.test.ts`:

```typescript
import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as credit from "../../scenarios/presenter/_shared/creditRfq";

describe("@presenter Feature: Credit RFQ", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("credit RFQ list is empty when no RFQs have been created", async () => {
    await credit.expectRfqListEmptyWithin(w, 3);
  });
});
```

- [ ] **Step 2: Run to verify all 19 tests pass**

Run: `cd tests && pnpm test:presenter:vitest-plain`
Expected: `Test Files  7 passed (7)` and `Tests  19 passed (19)`. This matches the 5B comparison artifact: 19 `@presenter` scenarios → 19 `it()` blocks → parity with cucumber-real, cucumber-fake, and vitest-fake.

- [ ] **Step 3: Commit**

```bash
git add tests/presenter-tests/vitest-plain/creditRfq.test.ts
git commit -m "feat(phase-5b.4): creditRfq peer — 19/19 vitest-plain scenarios"
```

---

### Task 9: Wire vitest-plain into run-all.ts (8th peer)

**Files:**
- Modify: `tests/scripts/run-all.ts` (add one line in the `try` block)

- [ ] **Step 1: Edit `tests/scripts/run-all.ts`**

After the existing `combinedExit |= await run("pnpm", ["test:presenter:vitest-fake"]);` line, add a new line for vitest-plain. The `try` block should end up looking exactly like this (8 peers):

```typescript
try {
  combinedExit |= await run("pnpm", ["test:e2e:playwright"]);
  combinedExit |= await run("pnpm", ["test:e2e:raw-playwright"]);
  combinedExit |= await run("pnpm", ["test:e2e:cypress"]);
  combinedExit |= await run("pnpm", ["test:e2e:raw-cypress"]);
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-real"]);
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-fake"]);
  combinedExit |= await run("pnpm", ["test:presenter:vitest-fake"]);
  combinedExit |= await run("pnpm", ["test:presenter:vitest-plain"]);
} finally {
  await dev.stop();
}
```

- [ ] **Step 2: Run the 8th peer through run-all to verify wiring**

Run: `cd tests && pnpm test:presenter:vitest-plain`
Expected: still `19 passed (19)` (sanity — Task 8 already proved this passes; we're confirming no edit collateral).

- [ ] **Step 3: Commit**

```bash
git add tests/scripts/run-all.ts
git commit -m "feat(phase-5b.4): wire vitest-plain as 8th peer in run-all.ts"
```

---

### Task 10: Add gate 20 (Gherkin loader forbidden in vitest-plain)

A simple pattern-grep gate. Locks down the defining negative-space property of the peer: no Gherkin loader imports allowed inside `presenter-tests/vitest-plain/`.

**Files:**
- Modify: `tests/scripts/grep-gates.ts` (add one entry to the `GATES` array)

- [ ] **Step 1: Edit `tests/scripts/grep-gates.ts`**

After the existing gate 19 entry in the `GATES` array (the entry whose `name` starts with `"19. No vitest/qpickle-loader imports outside vitest-fake peer"`), add gate 20:

```typescript
  {
    name: "20. No Gherkin loader imports in vitest-plain peer",
    pattern: '"quickpickle"|"@cucumber/cucumber"|from "quickpickle/',
    paths: ["presenter-tests/vitest-plain/"],
    excludes: ["/node_modules/"],
  },
```

Make sure the previous gate 19 entry's closing `},` keeps its comma and the new entry ends with `,` so the array remains well-formed.

- [ ] **Step 2: Run all gates to verify gate 20 passes on the new folder**

Run: `cd tests && pnpm gates`
Expected: every gate prints `PASS`, including `PASS 20. No Gherkin loader imports in vitest-plain peer`, ending with `all gates passed.`

- [ ] **Step 3: Smoke-check that gate 20 actually fires when violated**

Temporarily add `import { Given } from "quickpickle";` as the first line of `tests/presenter-tests/vitest-plain/creditRfq.test.ts`, then run:

Run: `cd tests && pnpm gates`
Expected: `FAIL 20. No Gherkin loader imports in vitest-plain peer` followed by a line referencing `presenter-tests/vitest-plain/creditRfq.test.ts`.

Then revert: remove the import line from `creditRfq.test.ts` and run `cd tests && pnpm gates` again. Expected: all gates PASS again.

- [ ] **Step 4: Commit**

```bash
git add tests/scripts/grep-gates.ts
git commit -m "feat(phase-5b.4): grep gate 20 — no Gherkin loader in vitest-plain"
```

---

### Task 11: Extend Gate interface + add gate 21 (count parity)

Gate 21 is count-based, not pattern-grep, so this task extends the `Gate` interface with an optional `customCheck?: () => string[]` field and adds a runner branch that calls it when present. Then registers `checkPresenterScenarioCounts` as gate 21.

**Files:**
- Modify: `tests/scripts/grep-gates.ts` (extend interface, add helper, add runner branch, add gate entry)

- [ ] **Step 1: Extend the `Gate` interface and add the imports**

At the top of `tests/scripts/grep-gates.ts`, replace the existing imports + `Gate` interface block:

```typescript
#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";

interface Gate {
  name: string;
  pattern: string;
  paths: string[];
  excludes?: string[];
}
```

with this expanded version:

```typescript
#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

interface Gate {
  name: string;
  pattern: string;
  paths: string[];
  excludes?: string[];
  /**
   * Optional custom check. When present, runs INSTEAD OF the grep pipeline;
   * pattern/paths/excludes are ignored. Returns an array of failure-message
   * strings (empty array = pass).
   */
  customCheck?: () => string[];
}
```

- [ ] **Step 2: Add the `checkPresenterScenarioCounts` helper**

Immediately above the `const GATES: Gate[] = [` declaration, add:

```typescript
const FEATURE_NAMES = [
  "connection", "fxLiveRates", "fxTrading", "analytics",
  "blotter", "fxRfq", "creditRfq",
];

function checkPresenterScenarioCounts(): string[] {
  const failures: string[] = [];
  for (const feat of FEATURE_NAMES) {
    const featurePath = `specs/${feat}.feature`;
    if (!existsSync(featurePath)) {
      failures.push(`${feat}: feature file missing at ${featurePath}`);
      continue;
    }
    const featureSrc = readFileSync(featurePath, "utf8");
    const presenterScenarios = (featureSrc.match(/@presenter\s*\n\s*Scenario:/g) ?? []).length;

    const testPath = `presenter-tests/vitest-plain/${feat}.test.ts`;
    if (presenterScenarios === 0 && !existsSync(testPath)) continue;
    if (presenterScenarios === 0 && existsSync(testPath)) {
      failures.push(`${feat}: 0 @presenter scenarios but ${testPath} exists`);
      continue;
    }
    if (!existsSync(testPath)) {
      failures.push(`${feat}: ${presenterScenarios} @presenter scenarios but ${testPath} missing`);
      continue;
    }
    const testSrc = readFileSync(testPath, "utf8");
    // Count it("...") and it.skip("...") at line start (after indent) — NOT describe(.
    const itBlocks = (testSrc.match(/^\s*it(?:\.skip)?\(/gm) ?? []).length;
    if (itBlocks !== presenterScenarios) {
      failures.push(
        `${feat}: ${presenterScenarios} @presenter scenarios in ${featurePath} ` +
        `but ${itBlocks} it() blocks in ${testPath}`,
      );
    }
  }
  return failures;
}
```

- [ ] **Step 3: Register gate 21 in the `GATES` array**

After the gate 20 entry (added in Task 10), append gate 21:

```typescript
  {
    name: "21. vitest-plain it() count matches @presenter scenario count per .feature",
    pattern: "",
    paths: [],
    customCheck: checkPresenterScenarioCounts,
  },
```

The `pattern` and `paths` fields are unused when `customCheck` is set, but the interface still requires them — supply empty values.

- [ ] **Step 4: Add the runner branch that honors `customCheck`**

In the `for (const gate of GATES)` loop, replace the existing body:

```typescript
for (const gate of GATES) {
  const args = ["-rE", gate.pattern, ...gate.paths];
  const result = spawnSync("grep", args, { encoding: "utf8" });
  if (result.status === 2) {
    console.error(`ERROR running gate "${gate.name}":`, result.stderr);
    failed++;
    continue;
  }
  const out = result.stdout ?? "";
  const lines = out
    .split("\n")
    .filter(Boolean)
    .filter((line) => !(gate.excludes ?? []).some((e) => line.includes(e)));

  if (lines.length > 0) {
    console.error(`FAIL ${gate.name}`);
    for (const line of lines) console.error(`   ${line}`);
    failed++;
  } else {
    console.log(`PASS ${gate.name}`);
  }
}
```

with this version that checks `customCheck` first:

```typescript
for (const gate of GATES) {
  let lines: string[];

  if (gate.customCheck) {
    lines = gate.customCheck();
  } else {
    const args = ["-rE", gate.pattern, ...gate.paths];
    const result = spawnSync("grep", args, { encoding: "utf8" });
    if (result.status === 2) {
      console.error(`ERROR running gate "${gate.name}":`, result.stderr);
      failed++;
      continue;
    }
    const out = result.stdout ?? "";
    lines = out
      .split("\n")
      .filter(Boolean)
      .filter((line) => !(gate.excludes ?? []).some((e) => line.includes(e)));
  }

  if (lines.length > 0) {
    console.error(`FAIL ${gate.name}`);
    for (const line of lines) console.error(`   ${line}`);
    failed++;
  } else {
    console.log(`PASS ${gate.name}`);
  }
}
```

- [ ] **Step 5: Run all 21 gates and verify they pass**

Run: `cd tests && pnpm gates`
Expected: all gates print `PASS` ending with `all gates passed.` In particular: `PASS 21. vitest-plain it() count matches @presenter scenario count per .feature`.

- [ ] **Step 6: Smoke-check that gate 21 actually fires on drift**

Temporarily duplicate the last `it()` block in `tests/presenter-tests/vitest-plain/creditRfq.test.ts` (paste a second `it("..."` block inside the `describe`). Then:

Run: `cd tests && pnpm gates`
Expected: `FAIL 21. vitest-plain it() count matches @presenter scenario count per .feature` with a message like `creditRfq: 1 @presenter scenarios in specs/creditRfq.feature but 2 it() blocks in presenter-tests/vitest-plain/creditRfq.test.ts`.

Then revert: remove the duplicated `it()` block and run `cd tests && pnpm gates` again. Expected: all gates PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/scripts/grep-gates.ts
git commit -m "feat(phase-5b.4): grep gate 21 — count parity .feature ↔ vitest-plain"
```

---

### Task 12: Update STATUS.md + architecture.md and run full e2e

Final task: flip the Phase 5B.4 row to DONE, refresh test counts, add the follow-ups section, extend the presenter-test-stack table, and confirm all 8 peers + 21 gates run green end-to-end.

**Files:**
- Modify: `docs/superpowers/STATUS.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Edit `docs/superpowers/STATUS.md` test-counts line**

In the `## Current state` section, replace the existing `**Test counts:**` line:

```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 48 (Cucumber+Playwright) + 48 (raw Playwright) + 48 (Cucumber+Cypress) + 48 (raw Cypress) + 19 (presenter-cucumber-real) + 19 (presenter-cucumber-fake) + 19 (presenter-vitest-fake) — 48×4 + 19×3 = 249 e2e scenarios (4 browser peers × 48 scenarios; 3 presenter peers × 19 scenarios)
```

with the 5B.4-updated version:

```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 48 (Cucumber+Playwright) + 48 (raw Playwright) + 48 (Cucumber+Cypress) + 48 (raw Cypress) + 19 (presenter-cucumber-real) + 19 (presenter-cucumber-fake) + 19 (presenter-vitest-fake) + 19 (presenter-vitest-plain) — 48×4 + 19×4 = 268 e2e scenarios (4 browser peers × 48 scenarios; 4 presenter peers × 19 scenarios)
```

- [ ] **Step 2: Flip the Phase 5B.4 row in the `## Phases` table**

Replace the existing 5B.4 row:

```
| Phase 5B.4 — Vitest + plain TS (no Gherkin) + fake timers | ⏳ NOT STARTED | (to be written) | — |
```

with the DONE row. Determine the SHA range by running `git log --oneline origin/main..HEAD -- docs/superpowers/plans/2026-05-17-phase-5b-4-vitest-plain-fake-timers.md tests/ docs/architecture.md docs/superpowers/STATUS.md` and reading the first/last task-commit SHAs from Tasks 1–12. Then use this format:

```
| Phase 5B.4 — Vitest + plain TS (no Gherkin) + fake timers | ✅ DONE | `plans/2026-05-17-phase-5b-4-vitest-plain-fake-timers.md` | `<first-sha>..<last-sha>` (12 task commits) + this STATUS update |
```

Substitute `<first-sha>` and `<last-sha>` with the actual short SHAs (7 chars).

- [ ] **Step 3: Add the `## Phase 5B.4 follow-ups (carry into 5C+)` section**

Insert a new section immediately above the next phase's follow-ups section (or at the bottom of the existing follow-ups blocks). The five items mirror spec §10:

```markdown
## Phase 5B.4 follow-ups (carry into 5C+)

1. **Scratchpad audit.** 5B.1 follow-up #6 flagged write-only fields in `PresenterScratchpad` (`lastPrice`, `observedTradeCount`, `lastTradeDirection`, `recordedCount`). 5B.4 reused the scratchpad unchanged, so the audit remains a pure read-only review that can land separately.

2. **Step-tree de-duplication.** 5B.3 follow-up #3 suggested revisiting a "source-of-truth step registry" after 5B.4. vitest-plain has no step tree, so it doesn't add to the triplication. Re-evaluate as part of 5C.

3. **Gate 21 catches add/remove drift only.** Step-body changes inside an existing `@presenter` scenario won't trip gate 21 (e.g., editing a Gherkin step's text or arguments will not fail the gate). Acceptable for 5B.4 because the 19 `@presenter` scenarios are frozen by the 5B comparison artifact; revisit if presenter scenarios start changing meaningfully.

4. **`@presenter` tag in `describe` title is convention, not enforced.** A future contributor could omit the `"@presenter "` prefix in a vitest-plain `describe` title. Add a gate (or extend gate 21's `customCheck`) to assert the prefix if this becomes a recurring oversight.

5. **Naming asymmetry.** vitest-plain lives in `tests/presenter-tests/`, while the other 3 presenter peers' glue lives under `tests/steps/presenter/` and `tests/support/presenter/`. Deliberate (`steps/` is a misnomer for files with no step defs), but a reader scanning the file tree won't see all 4 presenter peers at one level. The STATUS phases table and `docs/architecture.md` presenter test stack table provide the unified view.
```

- [ ] **Step 4: Edit `docs/architecture.md` §9.5 to reflect the 4th presenter peer**

The actual structure in `docs/architecture.md` §9.5 is a `| Layer | Stack |` table where each presenter peer occupies 1–3 rows (runner / harness / step defs). The vitest-plain peer adds 2 rows (no step-defs row, since it has no step defs). Make four edits — all inside §9.5 (currently around lines 1162–1200):

**Edit 4a:** Rename the §9.5 heading. Replace:

```markdown
### 9.5 Seven-runner stack (Cucumber-JS + Cypress + raw @playwright/test + raw Cypress + presenter-direct × 3)
```

with:

```markdown
### 9.5 Eight-runner stack (Cucumber-JS + Cypress + raw @playwright/test + raw Cypress + presenter-direct × 4)
```

**Edit 4b:** Update the §9.5 intro paragraph. Locate the paragraph that begins with `Seven runners exercise the same behavioural surface via five binding styles.` and ends with `See Phase 5B.1, 5B.2, and 5B.3 specs for details.` — replace the entire paragraph with the version below. Note: this new paragraph reuses the existing `qpickle-loader` wording verbatim from the surrounding 5B.3 prose (preserve its spelling exactly as the source file has it; do not change it):

> Eight runners exercise the same behavioural surface via six binding styles. Cucumber-JS (with Playwright) and Cypress (via cypress-cucumber-preprocessor) bind Gherkin scenarios in `tests/specs/**/*.feature` to a shared step-definition tree. Raw `@playwright/test` and raw Cypress bind scenarios programmatically through their own step trees. Four presenter-direct peers — **cucumber-presenter-real**, **cucumber-presenter-fake**, **vitest-presenter-fake**, and **vitest-presenter-plain** — bind a subset of the same scenarios (tagged `@presenter`) to the RxJS presenter layer in pure Node with no browser; the cucumber-real peer uses wall-clock waits, cucumber-fake wraps the same bodies in `@sinonjs/fake-timers` virtual time, vitest-fake reruns the same bodies under Vitest + the same loader the 5B.3 paragraph names + `vi.useFakeTimers()`, and vitest-plain reruns the same `_shared/` scenario modules under Vitest + raw `describe`/`it` (no Gherkin loader) + `vi.useFakeTimers()` to prove the `_shared/*.ts` / `_await.ts` / `_world.ts` abstractions are useful even without a BDD step-tree. See Phase 5B.1, 5B.2, 5B.3, and 5B.4 specs for details.

(When pasting the paragraph into `docs/architecture.md`, replace the phrase `the same loader the 5B.3 paragraph names` with the exact loader name used in the existing 5B.3 paragraph immediately below this intro — copy it verbatim from that paragraph so the wording is consistent across §9.5.)

**Edit 4c:** Inside the `| Layer | Stack |` table, make three sub-edits:

(i) Replace the "Presenter-direct scenarios" row:

```
| Presenter-direct scenarios | `tests/scenarios/presenter/_shared/*.ts` — subscribe to RxJS streams with `firstValueFrom + timeout`; shared by all three presenter peers |
```

with:

```
| Presenter-direct scenarios | `tests/scenarios/presenter/_shared/*.ts` — subscribe to RxJS streams with `firstValueFrom + timeout`; shared by all four presenter peers |
```

(ii) Replace the "Orchestration" row:

```
| Orchestration | `tests/scripts/run-all.ts` — seven peers, one shared dev server, OR-ed exit codes |
```

with:

```
| Orchestration | `tests/scripts/run-all.ts` — eight peers, one shared dev server, OR-ed exit codes |
```

(iii) Locate the existing row that begins `| Presenter-vitest step defs |` (this is the last presenter row currently). Immediately AFTER that row, INSERT two new rows:

```
| Presenter-vitest-plain runner | `tests/vitest-presenter-plain.config.ts` · `vitest` + raw `describe`/`it` (no Gherkin loader) + `vi.useFakeTimers()` — same 19 `@presenter` scenarios as the other 3 presenter peers |
| Presenter-vitest-plain harness | `tests/presenter-tests/vitest-plain/_world.ts` (VitestPlainPresenterWorld plain-object factory implementing the same `AwaitHelpers` interface; one `*.test.ts` per feature, beforeEach/afterEach building/tearing down the world per `it()`) |
```

**Edit 4d:** Add a new "Plain-TS binding (Phase 5B.4):" paragraph. Insert it immediately AFTER the existing paragraph that begins `**Runner-portability binding (Phase 5B.3):**` (currently the last paragraph in §9.5 before the `---` separator) and BEFORE the `---` separator that ends §9.5:

> **Plain-TS binding (Phase 5B.4):** the vitest-presenter-plain runner reuses the same 19 `@presenter` scenarios as the other 3 presenter peers but executes them under Vitest with **no Gherkin loader at all** — hand-written `describe`/`it` blocks in `tests/presenter-tests/vitest-plain/*.test.ts` call the existing `tests/scenarios/presenter/_shared/*.ts` modules directly. The `VitestPlainPresenterWorld` is a plain object literal (not a class) implementing the same `AwaitHelpers` interface as the other presenter peers; `buildWorld()` / `teardownWorld()` run in `beforeEach` / `afterEach`. No step-def files exist for this peer — the test bodies inline what would otherwise be step-def delegation. The peer is the **plain-TS portability proof:** the `_shared/` scenario modules, the `AwaitHelpers` interface, and the `PresenterWorld` shape are abstractions useful enough that a contributor writing presenter tests in raw Vitest tomorrow would not need a new abstraction layer. Grep gate 20 forbids Gherkin loader imports inside `presenter-tests/vitest-plain/`; gate 21 enforces `@presenter` scenario count parity between `.feature` files and `*.test.ts` files via a `customCheck` extension to `grep-gates.ts`. Wall-clock: ~1.5s (parity with vitest-fake — same Vitest worker startup, same fake-timer mechanism).

**Sanity sweep:** Run `grep -n "three presenter peers\|seven runners\|Seven runners\|Seven-runner" docs/architecture.md` after the four edits — expected: zero matches. If any remain, update them to the four/eight equivalents.

- [ ] **Step 5: Run the full e2e suite end-to-end**

Run: `cd tests && pnpm test:e2e`
Expected:
- All 21 grep gates print `PASS` and the script reports `all gates passed.`
- All 8 peers run in order (playwright, raw-playwright, cypress, raw-cypress, cucumber-real, cucumber-fake, vitest-fake, vitest-plain).
- vitest-plain reports `Test Files  7 passed (7)` and `Tests  19 passed (19)`.
- Final exit code 0.

If any peer fails, do NOT proceed. Investigate and fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/STATUS.md docs/architecture.md
git commit -m "docs(phase-5b.4): flip STATUS to DONE + 4th presenter peer in architecture.md"
```

---

## Verification checklist

After Task 12, this is true:

- `git log origin/main..HEAD --oneline` shows 12 task commits (Tasks 1–12) on top of the existing main.
- `cd tests && pnpm test:presenter:vitest-plain` reports `7 passed` test files and `19 passed` tests.
- `cd tests && pnpm gates` reports 21 gates, all PASS.
- `cd tests && pnpm test:e2e` exits 0 after running all 8 peers.
- `docs/superpowers/STATUS.md` Phase 5B.4 row reads `✅ DONE` with the correct SHA range.
- `docs/architecture.md` "Presenter test stack" table has 4 rows (cucumber-real, cucumber-fake, vitest-fake, vitest-plain).
- `tests/presenter-tests/vitest-plain/` contains exactly 8 files: 7 `*.test.ts` + 1 `_world.ts`.
- `tests/scripts/grep-gates.ts` has 21 gate entries; gate 21's entry uses the new `customCheck` field; the `Gate` interface includes `customCheck?: () => string[]`.
- No edits to `tests/specs/*.feature`, `tests/scenarios/presenter/_shared/*`, `tests/scenarios/presenter/_await.ts`, `tests/scenarios/presenter/_buildApp.ts`, `tests/scenarios/presenter/_world.ts`, `tests/steps/**`, `tests/support/**`, the other 7 peers' configs, or `tests/package.json` `devDependencies`.
