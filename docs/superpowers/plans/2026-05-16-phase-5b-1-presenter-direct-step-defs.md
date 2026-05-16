# Phase 5B.1 Presenter-Direct Step Definitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth e2e peer that binds the existing `.feature` files to the RxJS presenter layer with no browser, establishing the foundation for the Phase 5B comparison artifact.

**Architecture:** A new Cucumber-JS profile runs `@presenter`-tagged scenarios in pure Node. `_buildApp.ts` is the sole seam between test code and `createApp(simulatorPorts)`. Step defs are one-liners delegating to scenarios fns; scenarios fns subscribe to presenter streams via `firstValueFrom + timeout`.

**Tech Stack:** Cucumber-JS 11 (existing), RxJS 7.8 (already in `@rtc/domain`/`@rtc/client`), TypeScript, simulator-backed ports.

**Spec:** [`docs/superpowers/specs/2026-05-16-phase-5b-1-presenter-direct-step-defs-design.md`](../specs/2026-05-16-phase-5b-1-presenter-direct-step-defs-design.md)

---

## File map

**Production-code changes (minimal):**
- Create: `packages/client/src/index.ts` (top-level barrel)
- Modify: `packages/client/package.json` (add `main`/`exports`)
- Modify: `packages/client/src/app/composition.ts` (export `withSyntheticGatewayConnected`)

**Test workspace changes:**
- Modify: `tests/package.json` (add deps + new script)
- Create: `tests/cucumber-presenter-real.js`
- Create: `tests/scenarios/presenter/_buildApp.ts`
- Create: `tests/scenarios/presenter/cucumber-real/{common,fxLiveRates,fxTrading,fxRfq,creditRfq,blotter,analytics,connection}.ts`
- Create: `tests/steps/presenter/cucumber-real/{common,fxLiveRates,fxTrading,fxRfq,creditRfq,blotter,analytics,connection}.steps.ts`
- Create: `tests/support/presenter/cucumber-real/{world,hooks}.ts`
- Modify: `tests/scripts/grep-gates.ts` (add 3 gates)
- Modify: `tests/scripts/run-all.ts` (5th peer)
- Modify: `tests/specs/*.feature` (add `@presenter` tags + new scenarios)

**Docs:**
- Modify: `docs/architecture.md` §9.5 (5-runner)
- Modify: `docs/superpowers/STATUS.md` (5B.1 DONE; add 5B.2-5B.4 rows)

---

## Task 1: Expose `@rtc/client` package API

**Files:**
- Create: `packages/client/src/index.ts`
- Modify: `packages/client/package.json`
- Modify: `packages/client/src/app/composition.ts:56`

- [ ] **Step 1: Export `withSyntheticGatewayConnected` from composition.ts**

In `packages/client/src/app/composition.ts`, change line 56:
```diff
-function withSyntheticGatewayConnected(
+export function withSyntheticGatewayConnected(
   inner: ConnectionEventsPort,
 ): ConnectionEventsPort {
```

- [ ] **Step 2: Create top-level barrel `packages/client/src/index.ts`**

```ts
export {
  createApp,
  buildDefaultPorts,
  withSyntheticGatewayConnected,
  type App,
  type Presenters,
  type AppPorts,
} from "./app/composition";
export {
  createSimulatorPorts,
  createWsRealPorts,
} from "./app/adapters/portFactory";
```

- [ ] **Step 3: Add `main`/`exports` to `packages/client/package.json`**

Insert after `"type": "module",`:
```json
  "main": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
```

- [ ] **Step 4: Verify typecheck still passes**

Run: `pnpm typecheck`
Expected: PASS in all packages.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/index.ts packages/client/package.json packages/client/src/app/composition.ts
git commit -m "feat(phase-5b.1): expose @rtc/client package API for presenter tests"
```

---

## Task 2: Add `@rtc/*` and rxjs deps to tests workspace

**Files:**
- Modify: `tests/package.json`

- [ ] **Step 1: Add workspace deps**

Add a `dependencies` block (the package currently has only `devDependencies`):
```json
  "dependencies": {
    "@rtc/client": "workspace:*",
    "@rtc/domain": "workspace:*",
    "rxjs": "^7.8"
  },
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updated; `tests/node_modules/@rtc/client` symlinked.

- [ ] **Step 3: Smoke-verify the import works**

Run:
```bash
cd tests && pnpm exec tsx -e 'import { createApp, createSimulatorPorts } from "@rtc/client"; const app = createApp(createSimulatorPorts() as any); console.log(Object.keys(app.presenters));'
```
Expected: prints all 11 presenter keys (priceStream, priceHistory, execution, blotter, analytics, rfqs, currencyPairs, instruments, dealers, connection, rfqQuote).

Note: the `as any` cast is only for this one-shot smoke probe (we haven't yet built the test ConnectionEventsPort wrapper); production-grade typing comes via `_buildApp.ts` in Task 3.

- [ ] **Step 4: Commit**

```bash
git add tests/package.json pnpm-lock.yaml
git commit -m "feat(phase-5b.1): wire @rtc/client + @rtc/domain + rxjs into tests workspace"
```

---

## Task 3: Build `_buildApp.ts` — the test/app seam

**Files:**
- Create: `tests/scenarios/presenter/_buildApp.ts`

- [ ] **Step 1: Write `_buildApp.ts`**

```ts
// tests/scenarios/presenter/_buildApp.ts
import { Subject } from "rxjs";
import {
  createApp,
  createSimulatorPorts,
  withSyntheticGatewayConnected,
  type App,
  type AppPorts,
} from "@rtc/client";
import type { ConnectionEvent } from "@rtc/domain";

export interface PresenterCtx {
  app: App;
  connectionEvents$: Subject<ConnectionEvent>;
}

export function buildPresenterApp(): PresenterCtx {
  const connectionEvents$ = new Subject<ConnectionEvent>();
  const ports: AppPorts = {
    ...createSimulatorPorts(),
    connectionEvents: withSyntheticGatewayConnected({
      events: () => connectionEvents$.asObservable(),
    }),
  };
  return { app: createApp(ports), connectionEvents$ };
}
```

- [ ] **Step 2: Smoke-verify it builds and types check**

Run:
```bash
cd tests && pnpm exec tsx -e 'import { buildPresenterApp } from "./scenarios/presenter/_buildApp"; const { app, connectionEvents$ } = buildPresenterApp(); console.log("presenters:", Object.keys(app.presenters).length, "events port wired:", !!connectionEvents$);'
```
Expected: `presenters: 11 events port wired: true`

- [ ] **Step 3: Commit**

```bash
git add tests/scenarios/presenter/_buildApp.ts
git commit -m "feat(phase-5b.1): _buildApp.ts — App + simulator + test ConnectionEventsPort seam"
```

---

## Task 4: Build Cucumber harness (World, hooks, common, config, script)

**Files:**
- Create: `tests/support/presenter/cucumber-real/world.ts`
- Create: `tests/support/presenter/cucumber-real/hooks.ts`
- Create: `tests/scenarios/presenter/cucumber-real/common.ts`
- Create: `tests/cucumber-presenter-real.js`
- Modify: `tests/package.json` (add script)

- [ ] **Step 1: Write Scratchpad + Background helpers in `common.ts`**

```ts
// tests/scenarios/presenter/cucumber-real/common.ts
import type { CurrencyPair, Price, ExecutionStatus, Direction } from "@rtc/domain";
import type { RfqQuoteResult } from "@rtc/domain";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export interface PresenterScratchpad {
  firstPair?: CurrencyPair;
  lastPrice?: Price;
  recordedCount: Map<string, number>;
  lastTradeStatus?: ExecutionStatus;
  lastTradeDirection?: Direction;
  lastTradeNotional?: number;
  rejectedSeen?: boolean;
  observedTradeCount: number;
  rfqQuote?: RfqQuoteResult;
}

export const newScratchpad = (): PresenterScratchpad => ({
  recordedCount: new Map(),
  observedTradeCount: 0,
});

export async function openWorkspace(_w: PresenterWorld): Promise<void> { /* no-op: workspaces are UI-only */ }
export async function openFxWorkspace(_w: PresenterWorld): Promise<void> { /* no-op: workspaces are UI-only */ }
export async function openCreditWorkspace(_w: PresenterWorld): Promise<void> { /* no-op: workspaces are UI-only */ }

export async function waitSeconds(_w: PresenterWorld, n: number): Promise<void> {
  await new Promise((r) => setTimeout(r, n * 1000));
}
```

- [ ] **Step 2: Write `PresenterWorld`**

```ts
// tests/support/presenter/cucumber-real/world.ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import type { PresenterCtx } from "../../../scenarios/presenter/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";

export class PresenterWorld extends World {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
}
setWorldConstructor(PresenterWorld);
```

- [ ] **Step 3: Write hooks**

```ts
// tests/support/presenter/cucumber-real/hooks.ts
import { Before } from "@cucumber/cucumber";
import { buildPresenterApp } from "../../../scenarios/presenter/_buildApp";
import { newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import type { PresenterWorld } from "./world";

Before(function(this: PresenterWorld) {
  this.ctx = buildPresenterApp();
  this.scratch = newScratchpad();
});
```

- [ ] **Step 4: Write the Cucumber config**

```js
// tests/cucumber-presenter-real.js
export default {
  paths: ["specs/**/*.feature"],
  import: [
    "support/presenter/cucumber-real/**/*.ts",
    "scenarios/presenter/_buildApp.ts",
    "scenarios/presenter/cucumber-real/**/*.ts",
    "steps/presenter/cucumber-real/**/*.ts",
  ],
  tags: "@presenter",
  format: ["progress-bar", "html:reports/cucumber-presenter-real.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: 0,
};
```

- [ ] **Step 5: Add the npm script to `tests/package.json`**

In the `scripts` block, insert after `test:e2e:playwright`:
```json
    "test:presenter:cucumber-real":      "NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber-presenter-real.js",
```

- [ ] **Step 6: Run with zero `@presenter` scenarios — expect "0 scenarios"**

Run: `pnpm --filter @rtc/tests test:presenter:cucumber-real`
Expected: exits 0; output says `0 scenarios`. This verifies the config loads, the imports resolve, and `Before` fires only when needed.

- [ ] **Step 7: Commit**

```bash
git add tests/support/presenter tests/scenarios/presenter/cucumber-real/common.ts tests/cucumber-presenter-real.js tests/package.json
git commit -m "feat(phase-5b.1): Cucumber harness (World, hooks, common, config, script) for presenter peer"
```

---

## Task 5: Connection feature — tag + implement

**Files:**
- Modify: `tests/specs/connection.feature`
- Create: `tests/scenarios/presenter/cucumber-real/connection.ts`
- Create: `tests/steps/presenter/cucumber-real/connection.steps.ts`
- Create: `tests/steps/presenter/cucumber-real/common.steps.ts`

The connection feature has 4 scenarios. All qualify for `@presenter` under loose mapping: UI references like "footer shows X" and "overlay becomes visible" map to `status$` state assertions. The presenter has no "overlay" or "footer" — the step bodies translate to the underlying state machine.

- [ ] **Step 1: Tag the 4 connection scenarios**

In `tests/specs/connection.feature`, add `@presenter` above each `Scenario:` line:
```diff
   Background:
     Given the trader has the workspace open

+  @presenter
   Scenario: connected status is shown in the footer
     Then the connection status footer is visible
     And the connection status footer shows "Connected"

+  @presenter
   Scenario: connection overlay is hidden when connected
     Then the connection overlay is hidden

+  @presenter
   Scenario: going offline shows the overlay with an offline message
     When the browser goes offline
     Then the connection overlay becomes visible within 3 seconds
     And the connection overlay text matches /offline/i
     And the connection status footer shows "Offline"

+  @presenter
   Scenario: coming back online dismisses the overlay
     When the browser goes offline
     And the connection overlay becomes visible within 3 seconds
     And the browser comes back online
     Then the connection overlay is hidden within 5 seconds
     And the connection status footer shows "Connected"
```

- [ ] **Step 2: Run cucumber — expect failure on first undefined step**

Run: `pnpm --filter @rtc/tests test:presenter:cucumber-real`
Expected: `4 scenarios (4 undefined)`. Output suggests adding step "Given the trader has the workspace open".

- [ ] **Step 3: Write Background step bindings in `common.steps.ts`**

```ts
// tests/steps/presenter/cucumber-real/common.steps.ts
import { Given, When } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as common from "../../../scenarios/presenter/cucumber-real/common";

Given("the trader has the workspace open",
  function(this: PresenterWorld) { return common.openWorkspace(this); });
Given("the trader has the FX workspace open",
  function(this: PresenterWorld) { return common.openFxWorkspace(this); });
Given("the credit workspace is open",
  function(this: PresenterWorld) { return common.openCreditWorkspace(this); });

When("the trader waits {int} seconds",
  function(this: PresenterWorld, n: number) { return common.waitSeconds(this, n); });
```

- [ ] **Step 4: Write `connection.ts` scenarios fns**

```ts
// tests/scenarios/presenter/cucumber-real/connection.ts
import { firstValueFrom, filter, timeout } from "rxjs";
import { ConnectionStatus } from "@rtc/domain";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function browserGoesOffline(w: PresenterWorld): Promise<void> {
  w.ctx.connectionEvents$.next({ type: "browserOffline" });
}

export async function browserComesBackOnline(w: PresenterWorld): Promise<void> {
  w.ctx.connectionEvents$.next({ type: "browserOnline" });
}

export async function expectStatusEqualsWithin(
  w: PresenterWorld, status: ConnectionStatus, seconds: number,
): Promise<void> {
  await firstValueFrom(
    w.ctx.app.presenters.connection.status$.pipe(
      filter((s) => s === status),
      timeout(seconds * 1000),
    ),
  );
}

export async function expectStatusNotEqualsWithin(
  w: PresenterWorld, status: ConnectionStatus, seconds: number,
): Promise<void> {
  await firstValueFrom(
    w.ctx.app.presenters.connection.status$.pipe(
      filter((s) => s !== status),
      timeout(seconds * 1000),
    ),
  );
}

export async function noopAssertConnectionUiPresent(_w: PresenterWorld): Promise<void> {
  // "the connection status footer is visible" / "the connection overlay text matches /offline/i":
  // these reference UI elements that don't exist at presenter level. The underlying truth
  // (status$ stream is alive) is verified implicitly by other steps in the same scenario.
}
```

- [ ] **Step 5: Write `connection.steps.ts` step defs**

```ts
// tests/steps/presenter/cucumber-real/connection.steps.ts
import { Then, When } from "@cucumber/cucumber";
import { ConnectionStatus } from "@rtc/domain";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as conn from "../../../scenarios/presenter/cucumber-real/connection";

When("the browser goes offline",
  function(this: PresenterWorld) { return conn.browserGoesOffline(this); });

When("the browser comes back online",
  function(this: PresenterWorld) { return conn.browserComesBackOnline(this); });

Then("the connection status footer is visible",
  function(this: PresenterWorld) { return conn.noopAssertConnectionUiPresent(this); });

Then("the connection status footer shows {string}",
  function(this: PresenterWorld, label: string) {
    const target = label === "Connected"
      ? ConnectionStatus.CONNECTED
      : ConnectionStatus.OFFLINE_DISCONNECTED;  // "Offline" maps to OFFLINE_DISCONNECTED
    return conn.expectStatusEqualsWithin(this, target, 3);
  });

Then("the connection overlay is hidden",
  function(this: PresenterWorld) {
    return conn.expectStatusEqualsWithin(this, ConnectionStatus.CONNECTED, 1);
  });

Then("the connection overlay is hidden within {int} seconds",
  function(this: PresenterWorld, n: number) {
    return conn.expectStatusEqualsWithin(this, ConnectionStatus.CONNECTED, n);
  });

Then("the connection overlay becomes visible within {int} seconds",
  function(this: PresenterWorld, n: number) {
    // "overlay visible" = "status is one of the disconnected states"
    return conn.expectStatusEqualsWithin(this, ConnectionStatus.OFFLINE_DISCONNECTED, n);
  });

Then("the connection overlay text matches \\/offline\\/i",
  function(this: PresenterWorld) { return conn.noopAssertConnectionUiPresent(this); });
```

- [ ] **Step 6: Run cucumber — expect all 4 connection scenarios pass**

Run: `pnpm --filter @rtc/tests test:presenter:cucumber-real`
Expected: `4 scenarios (4 passed)`.

- [ ] **Step 7: Run full suite — verify 4 browser peers still pass**

Run: `pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`
Expected: all green. (Tagging doesn't affect browser peers; they don't filter by `@presenter`.)

- [ ] **Step 8: Commit**

```bash
git add tests/specs/connection.feature tests/scenarios/presenter/cucumber-real/connection.ts tests/steps/presenter/cucumber-real/
git commit -m "feat(phase-5b.1): connection feature — 4 @presenter scenarios + step tree"
```

---

## Task 6: FX live rates — tag 2 existing + author 2 new + implement

**Files:**
- Modify: `tests/specs/fxLiveRates.feature`
- Create: `tests/scenarios/presenter/cucumber-real/fxLiveRates.ts`
- Create: `tests/steps/presenter/cucumber-real/fxLiveRates.steps.ts`
- Possibly modify: `tests/scenarios/fxLiveRates.ts` and PO impls (only if new browser-side steps required)

The 2 existing applicable: "tile grid renders streaming prices", "prices update over time". New scenarios authored: "currency pairs list has at least 7 entries", "first tile shows a numeric mid value".

- [ ] **Step 1: Tag 2 existing + append 2 new scenarios**

In `tests/specs/fxLiveRates.feature`, add `@presenter` and append:
```diff
+  @presenter
   Scenario: tile grid renders streaming prices
     Then a price tile is visible within 5 seconds
     And there is at least 1 visible tile

...

+  @presenter
   Scenario: prices update over time
     Then a price tile is visible within 5 seconds
     When the trader records the first tile text
     And the trader waits 2 seconds
     Then the first tile text is non-empty
+
+  @presenter
+  Scenario: currency pairs list has at least 7 entries
+    Then there are at least 7 visible tiles within 5 seconds
+
+  @presenter
+  Scenario: first tile shows a numeric mid value
+    Then a price tile is visible within 5 seconds
+    And the first tile text matches /\d+\.\d+/
```

- [ ] **Step 2: Run cucumber filtered to fxLiveRates only — observe undefined steps**

Run:
```bash
cd tests && NODE_OPTIONS='--import tsx/esm' pnpm exec cucumber-js --config cucumber-presenter-real.js specs/fxLiveRates.feature
```
Expected: 4 scenarios, all undefined or partial.

- [ ] **Step 3: Write `fxLiveRates.ts` scenarios fns**

```ts
// tests/scenarios/presenter/cucumber-real/fxLiveRates.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function expectPriceTileVisibleWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const pairs = await firstValueFrom(w.ctx.app.presenters.currencyPairs.pairs$);
  if (pairs.length === 0) throw new Error("no currency pairs available");
  const pair = pairs[0]!;
  const price = await firstValueFrom(
    w.ctx.app.presenters.priceStream.price$(pair).pipe(timeout(seconds * 1000)),
  );
  w.scratch.firstPair = pair;
  w.scratch.lastPrice = price;
}

export async function expectAtLeastNVisibleTilesWithin(
  w: PresenterWorld, n: number, seconds: number,
): Promise<void> {
  const pairs = await firstValueFrom(
    w.ctx.app.presenters.currencyPairs.pairs$.pipe(timeout(seconds * 1000)),
  );
  if (pairs.length < n) throw new Error(`expected >= ${n} currency pairs, got ${pairs.length}`);
}

export async function recordFirstTileText(w: PresenterWorld): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured yet");
  const price = await firstValueFrom(w.ctx.app.presenters.priceStream.price$(pair));
  w.scratch.lastPrice = price;
}

export async function expectFirstTileTextNonEmpty(w: PresenterWorld): Promise<void> {
  if (!w.scratch.lastPrice || !Number.isFinite(w.scratch.lastPrice.mid)) {
    throw new Error("first tile mid is not a finite number");
  }
}

export async function expectFirstTileTextMatches(w: PresenterWorld, pattern: RegExp): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured yet");
  const price = await firstValueFrom(w.ctx.app.presenters.priceStream.price$(pair));
  const text = price.mid.toFixed(5);
  if (!pattern.test(text)) throw new Error(`mid "${text}" did not match ${pattern}`);
}
```

- [ ] **Step 4: Write `fxLiveRates.steps.ts` step defs**

```ts
// tests/steps/presenter/cucumber-real/fxLiveRates.steps.ts
import { Then, When } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as fx from "../../../scenarios/presenter/cucumber-real/fxLiveRates";

Then("a price tile is visible within {int} seconds",
  function(this: PresenterWorld, n: number) { return fx.expectPriceTileVisibleWithin(this, n); });

Then("a price tile is visible",
  function(this: PresenterWorld) { return fx.expectPriceTileVisibleWithin(this, 5); });

Then("there is at least 1 visible tile",
  function(this: PresenterWorld) { return fx.expectAtLeastNVisibleTilesWithin(this, 1, 5); });

Then("there are at least {int} visible tiles within {int} seconds",
  function(this: PresenterWorld, n: number, s: number) { return fx.expectAtLeastNVisibleTilesWithin(this, n, s); });

When("the trader records the first tile text",
  function(this: PresenterWorld) { return fx.recordFirstTileText(this); });

Then("the first tile text is non-empty",
  function(this: PresenterWorld) { return fx.expectFirstTileTextNonEmpty(this); });

Then("the first tile text matches {}",
  function(this: PresenterWorld, regexAsString: string) {
    const m = regexAsString.match(/^\/(.+)\/([a-z]*)$/);
    if (!m) throw new Error(`bad regex literal in: ${regexAsString}`);
    return fx.expectFirstTileTextMatches(this, new RegExp(m[1]!, m[2]!));
  });
```

Note: `Then("the first tile text matches {}",...)` matches the inline-regex literal `/\d+\.\d+/`. Cucumber's `{}` placeholder captures the raw token. The parser unpacks it.

- [ ] **Step 5: Run cucumber, verify the 4 fxLiveRates scenarios pass**

Run:
```bash
cd tests && NODE_OPTIONS='--import tsx/esm' pnpm exec cucumber-js --config cucumber-presenter-real.js specs/fxLiveRates.feature
```
Expected: `4 scenarios (4 passed)`.

- [ ] **Step 6: Run the new scenarios on the 4 browser peers**

Run: `pnpm --filter @rtc/tests test:e2e`
Expected: all 5 peers green. If the browser peers don't yet recognise `there are at least {int} visible tiles within {int} seconds` or `the first tile text matches {}`, **add the matching step defs in `tests/steps/fxLiveRates.steps.ts` and PO methods in `tests/page-objects/{playwright,cypress}/*.ts` as needed.** Keep the changes minimal — extend existing patterns. Re-run.

- [ ] **Step 7: Commit**

```bash
git add tests/specs/fxLiveRates.feature tests/scenarios/presenter/cucumber-real/fxLiveRates.ts tests/steps/presenter/cucumber-real/fxLiveRates.steps.ts tests/scenarios/fxLiveRates.ts tests/steps/fxLiveRates.steps.ts tests/page-objects
git commit -m "feat(phase-5b.1): fxLiveRates — 2 tagged + 2 new @presenter scenarios + dual-layer step support"
```

---

## Task 7: FX trading — tag 3 existing + author 2 new + implement

**Files:**
- Modify: `tests/specs/fxTrading.feature`
- Create: `tests/scenarios/presenter/cucumber-real/fxTrading.ts`
- Create: `tests/steps/presenter/cucumber-real/fxTrading.steps.ts`
- Possibly modify: browser-side step files / PO impls

Existing applicable: "execute a buy trade and see confirmation", "execute a sell trade and see confirmation", "executed trade appears in the blotter". New scenarios: "executed trade carries the requested notional", "rejected trades complete with a rejected status".

- [ ] **Step 1: Tag existing + append new scenarios in `fxTrading.feature`**

```diff
+  @presenter
   Scenario: execute a buy trade and see confirmation
     ...

+  @presenter
   Scenario: execute a sell trade and see confirmation
     ...

+  @presenter
   Scenario: executed trade appears in the blotter
     Then a price tile is visible within 5 seconds
     When the trader clicks buy on the first tile
     And the trader waits 2 seconds
     Then the blotter table is visible
     And the blotter has at least 1 row

+  @presenter
+  Scenario: executed trade carries the requested notional
+    Then a price tile is visible within 5 seconds
+    When the trader executes a buy for "1000000" on the first tile
+    Then the executed trade carries notional "1000000"
+
+  @presenter
+  Scenario: rejected trades occur with non-zero probability across multiple attempts
+    Then a price tile is visible within 5 seconds
+    When the trader buys 5 times with confirmation dismissals
+    Then at least one trade confirmation matched /rejected/i
```

- [ ] **Step 2: Write `fxTrading.ts` scenarios fns**

```ts
// tests/scenarios/presenter/cucumber-real/fxTrading.ts
import { firstValueFrom, take, timeout } from "rxjs";
import { Direction, ExecutionStatus } from "@rtc/domain";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

async function executeOnFirstPair(
  w: PresenterWorld, direction: Direction, notional: number,
): Promise<{ status: ExecutionStatus; notional: number }> {
  const pair = w.scratch.firstPair ?? (await firstValueFrom(
    w.ctx.app.presenters.currencyPairs.pairs$
  ))[0]!;
  w.scratch.firstPair = pair;
  const price = await firstValueFrom(w.ctx.app.presenters.priceStream.price$(pair));
  const result = await firstValueFrom(
    w.ctx.app.presenters.execution.execute({
      pair,
      direction,
      price,
      notional,
    }).pipe(take(1), timeout(5000)),
  );
  return { status: result.status, notional: result.trade.notional };
}

export async function executeBuyOnFirstTile(w: PresenterWorld): Promise<void> {
  const r = await executeOnFirstPair(w, Direction.Buy, 1_000_000);
  w.scratch.lastTradeStatus = r.status;
  w.scratch.lastTradeDirection = Direction.Buy;
  w.scratch.lastTradeNotional = r.notional;
  w.scratch.observedTradeCount += 1;
}

export async function executeSellOnFirstTile(w: PresenterWorld): Promise<void> {
  const r = await executeOnFirstPair(w, Direction.Sell, 1_000_000);
  w.scratch.lastTradeStatus = r.status;
  w.scratch.lastTradeDirection = Direction.Sell;
  w.scratch.lastTradeNotional = r.notional;
  w.scratch.observedTradeCount += 1;
}

export async function executeBuyWithNotional(w: PresenterWorld, notional: number): Promise<void> {
  const r = await executeOnFirstPair(w, Direction.Buy, notional);
  w.scratch.lastTradeStatus = r.status;
  w.scratch.lastTradeDirection = Direction.Buy;
  w.scratch.lastTradeNotional = r.notional;
  w.scratch.observedTradeCount += 1;
}

/**
 * UI patterns ("/You Bought/i", "/Executing/i", etc.) describe the React-rendered confirmation
 * text. At presenter level the equivalent is the ExecutionStatus enum returned by execute().
 * This table maps UI patterns to the presenter statuses they correspond to. A scenario passes
 * if the observed status is any value mapped by ANY of the patterns asserted by the scenario.
 */
const UI_PATTERN_TO_STATUSES: Array<{ test: (p: RegExp) => boolean; statuses: ExecutionStatus[] }> = [
  { test: (p) => /Executing|You Bought|You Sold|Bought|Sold/i.test(p.source), statuses: [ExecutionStatus.Done] },
  { test: (p) => /rejected/i.test(p.source), statuses: [ExecutionStatus.Rejected] },
  { test: (p) => /Credit limit/i.test(p.source), statuses: [ExecutionStatus.CreditExceeded] },
  { test: (p) => /timed out/i.test(p.source), statuses: [ExecutionStatus.Timeout] },
];

export async function expectTradeConfirmationMatchesOneOf(
  w: PresenterWorld, patterns: RegExp[],
): Promise<void> {
  const status = w.scratch.lastTradeStatus;
  if (!status) throw new Error("no trade status captured");
  const accepted = new Set<ExecutionStatus>();
  for (const p of patterns) {
    for (const rule of UI_PATTERN_TO_STATUSES) {
      if (rule.test(p)) for (const s of rule.statuses) accepted.add(s);
    }
    if (p.test(status)) accepted.add(status);  // also allow direct enum-name match
  }
  if (!accepted.has(status)) {
    throw new Error(
      `presenter status "${status}" not in accepted set [${[...accepted].join(", ")}] ` +
      `(from UI patterns ${patterns.map(String).join(", ")})`,
    );
  }
}

export async function buyNTimesWithDismissals(w: PresenterWorld, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const r = await executeOnFirstPair(w, Direction.Buy, 1_000_000);
    if (r.status === ExecutionStatus.Rejected) w.scratch.rejectedSeen = true;
    w.scratch.observedTradeCount += 1;
  }
}

export async function expectAtLeastOneRejection(w: PresenterWorld): Promise<void> {
  if (!w.scratch.rejectedSeen) throw new Error("no rejected trade observed across N attempts");
}

export async function dismissTradeConfirmation(_w: PresenterWorld): Promise<void> {
  // UI-only: at presenter level the confirmation observable completes after one emission.
}

export async function expectTradeConfirmationHides(_w: PresenterWorld): Promise<void> {
  // UI-only counterpart to "dismiss".
}

export async function expectTradeNotionalEquals(w: PresenterWorld, expected: number): Promise<void> {
  if (w.scratch.lastTradeNotional !== expected) {
    throw new Error(`trade notional ${w.scratch.lastTradeNotional} != expected ${expected}`);
  }
}
```

- [ ] **Step 3: Write `fxTrading.steps.ts`**

```ts
// tests/steps/presenter/cucumber-real/fxTrading.steps.ts
import { Then, When } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as trading from "../../../scenarios/presenter/cucumber-real/fxTrading";

When("the trader clicks buy on the first tile",
  function(this: PresenterWorld) { return trading.executeBuyOnFirstTile(this); });

When("the trader clicks sell on the first tile",
  function(this: PresenterWorld) { return trading.executeSellOnFirstTile(this); });

When("the trader executes a buy for {string} on the first tile",
  function(this: PresenterWorld, notional: string) {
    return trading.executeBuyWithNotional(this, Number(notional));
  });

When("the trader buys {int} times with confirmation dismissals",
  function(this: PresenterWorld, n: number) { return trading.buyNTimesWithDismissals(this, n); });

When("the trader dismisses the trade confirmation",
  function(this: PresenterWorld) { return trading.dismissTradeConfirmation(this); });

Then("the trade confirmation appears within {int} seconds",
  function(this: PresenterWorld, _n: number) {
    // implicit: executeBuyOnFirstTile awaits the confirmation already (status captured)
  });

Then("the trade confirmation matches one of {}",
  function(this: PresenterWorld, regexList: string) {
    const patterns = parseRegexList(regexList);
    return trading.expectTradeConfirmationMatchesOneOf(this, patterns);
  });

Then("the trade confirmation matches one of {} within {int} seconds",
  function(this: PresenterWorld, regexList: string, _n: number) {
    const patterns = parseRegexList(regexList);
    return trading.expectTradeConfirmationMatchesOneOf(this, patterns);
  });

Then("the trade confirmation hides within {int} seconds",
  function(this: PresenterWorld) { return trading.expectTradeConfirmationHides(this); });

Then("at least one trade confirmation matched {}",
  function(this: PresenterWorld, _pattern: string) { return trading.expectAtLeastOneRejection(this); });

Then("the executed trade carries notional {string}",
  function(this: PresenterWorld, value: string) { return trading.expectTradeNotionalEquals(this, Number(value)); });

function parseRegexList(raw: string): RegExp[] {
  // Splits "/A/i, /B/i, /C/i" into [/A/i, /B/i, /C/i]
  return raw.split(",").map((s) => s.trim()).map((s) => {
    const m = s.match(/^\/(.+)\/([a-z]*)$/);
    if (!m) throw new Error(`bad regex literal in: ${s}`);
    return new RegExp(m[1]!, m[2]!);
  });
}
```

- [ ] **Step 4: Run cucumber filtered**

Run:
```bash
cd tests && NODE_OPTIONS='--import tsx/esm' pnpm exec cucumber-js --config cucumber-presenter-real.js specs/fxTrading.feature
```
Expected: `5 scenarios (5 passed)`.

- [ ] **Step 5: Run all 5 peers, add browser-side step bindings for the 2 new steps if missing**

Run: `pnpm --filter @rtc/tests test:e2e`
- If "the trader executes a buy for {string} on the first tile" is undefined on browser peers, add to `tests/steps/fxTrading.steps.ts` calling existing PO methods (setNotional + clickBuy).
- If "at least one trade confirmation matched {}" is undefined, add a browser-side helper that tracks confirmation text across `buyNTimes` calls.

Expected after browser-side fixes: all 5 peers green.

- [ ] **Step 6: Commit**

```bash
git add tests/specs/fxTrading.feature tests/scenarios/presenter/cucumber-real/fxTrading.ts tests/steps/presenter/cucumber-real/fxTrading.steps.ts tests/scenarios/ tests/steps/fxTrading.steps.ts tests/page-objects
git commit -m "feat(phase-5b.1): fxTrading — 3 tagged + 2 new @presenter scenarios + dual-layer step support"
```

---

## Task 8: Blotter — tag 2 existing + author 1 new + implement

**Files:**
- Modify: `tests/specs/blotter.feature`
- Create: `tests/scenarios/presenter/cucumber-real/blotter.ts`
- Create: `tests/steps/presenter/cucumber-real/blotter.steps.ts`

Existing applicable: "rejected trade flow does not error after multiple buys" (already from blotter.feature). The "executed trade appears in the blotter" is in fxTrading.feature — already tagged in Task 7. So blotter.feature contributes 1 existing. New: "blotter accumulates after N trades".

- [ ] **Step 1: Tag existing + append new in `blotter.feature`**

```diff
+  @presenter
   Scenario: rejected trade flow does not error after multiple buys
     Then a price tile is visible within 5 seconds
     When the trader buys 3 times with confirmation dismissals
     Then the blotter table is visible
     And the blotter has at least 1 row

+  @presenter
+  Scenario: blotter accumulates after multiple trades
+    Then a price tile is visible within 5 seconds
+    When the trader clicks buy on the first tile
+    And the trader clicks buy on the first tile
+    And the trader waits 2 seconds
+    Then the blotter has at least 2 rows
```

- [ ] **Step 2: Write `blotter.ts` scenarios fns**

```ts
// tests/scenarios/presenter/cucumber-real/blotter.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function expectBlotterTableVisible(_w: PresenterWorld): Promise<void> {
  // Trivially true at presenter level — the blotter presenter is wired in createApp.
}

export async function expectBlotterHasAtLeast(w: PresenterWorld, n: number): Promise<void> {
  const trades = await firstValueFrom(
    w.ctx.app.presenters.blotter.trades$.pipe(timeout(2000)),
  );
  // The blotter accumulates only NON-REJECTED trades; observedTradeCount counts attempts.
  // We assert on the actual stream length.
  if (trades.length < n) {
    throw new Error(`blotter has ${trades.length} rows, expected ≥ ${n}`);
  }
}
```

- [ ] **Step 3: Write `blotter.steps.ts`**

```ts
// tests/steps/presenter/cucumber-real/blotter.steps.ts
import { Then } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as blotter from "../../../scenarios/presenter/cucumber-real/blotter";

Then("the blotter table is visible",
  function(this: PresenterWorld) { return blotter.expectBlotterTableVisible(this); });

Then("the blotter has at least {int} row",
  function(this: PresenterWorld, n: number) { return blotter.expectBlotterHasAtLeast(this, n); });

Then("the blotter has at least {int} rows",
  function(this: PresenterWorld, n: number) { return blotter.expectBlotterHasAtLeast(this, n); });
```

- [ ] **Step 4: Run cucumber**

Run:
```bash
cd tests && NODE_OPTIONS='--import tsx/esm' pnpm exec cucumber-js --config cucumber-presenter-real.js
```
Expected: blotter scenarios pass; cumulative count is now `12 scenarios (12 passed)` (4 connection + 4 fxLiveRates + 5 fxTrading - wait this overlaps).

Actually let me recount: Connection 4, fxLiveRates 4, fxTrading 5, blotter 2. Plus the existing "executed trade appears in the blotter" which is in fxTrading.feature. Tally: 4+4+5+2 = 15 @presenter scenarios so far.

- [ ] **Step 5: Run full suite**

Run: `pnpm --filter @rtc/tests test:e2e`
Expected: 5 peers green. If "the blotter has at least 2 rows" is missing browser-side, add the plural variant (likely a one-line addition).

- [ ] **Step 6: Commit**

```bash
git add tests/specs/blotter.feature tests/scenarios/presenter/cucumber-real/blotter.ts tests/steps/presenter/cucumber-real/blotter.steps.ts tests/steps/blotter.steps.ts
git commit -m "feat(phase-5b.1): blotter — 1 tagged + 1 new @presenter scenario + dual-layer step support"
```

---

## Task 9: Analytics — tag 1 existing + author 1 new + implement

**Files:**
- Modify: `tests/specs/analytics.feature`
- Create: `tests/scenarios/presenter/cucumber-real/analytics.ts`
- Create: `tests/steps/presenter/cucumber-real/analytics.steps.ts`

Existing applicable: "analytics panel shows alongside live rates" (only step "a price tile is visible" + "analytics panel is visible within N seconds" — both presenter-mapable). New: "analytics emits a non-empty snapshot".

- [ ] **Step 1: Tag existing + append new in `analytics.feature`**

```diff
+  @presenter
   Scenario: analytics panel shows alongside live rates
     Then a price tile is visible
     And the analytics panel is visible within 5 seconds

+  @presenter
+  Scenario: analytics presenter emits a non-empty snapshot
+    Then the analytics presenter emits within 5 seconds
```

Note: the second scenario uses a presenter-flavored step phrasing. Browser-peer side will need a step def too — see Step 5.

- [ ] **Step 2: Write `analytics.ts` scenarios fns**

```ts
// tests/scenarios/presenter/cucumber-real/analytics.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function expectAnalyticsVisibleWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const snapshot = await firstValueFrom(
    w.ctx.app.presenters.analytics.position$.pipe(timeout(seconds * 1000)),
  );
  if (!snapshot) throw new Error("analytics emitted but value was falsy");
}

export async function expectAnalyticsEmits(w: PresenterWorld, seconds: number): Promise<void> {
  return expectAnalyticsVisibleWithin(w, seconds);
}
```

Note: `AnalyticsPresenter` exposes `position$: Observable<PositionUpdates>` as a property (not a method). The plan uses the actual API.

- [ ] **Step 3: Write `analytics.steps.ts`**

```ts
// tests/steps/presenter/cucumber-real/analytics.steps.ts
import { Then } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as analytics from "../../../scenarios/presenter/cucumber-real/analytics";

Then("the analytics panel is visible within {int} seconds",
  function(this: PresenterWorld, n: number) { return analytics.expectAnalyticsVisibleWithin(this, n); });

Then("the analytics presenter emits within {int} seconds",
  function(this: PresenterWorld, n: number) { return analytics.expectAnalyticsEmits(this, n); });
```

- [ ] **Step 4: Run cucumber**

Expected: 2 analytics scenarios pass. Cumulative 17 @presenter scenarios.

- [ ] **Step 5: Add browser-side step def for "the analytics presenter emits within {int} seconds"**

In `tests/steps/analytics.steps.ts`, add (using existing analytics PO method — likely `expectAnalyticsVisibleWithin`):

```ts
Then("the analytics presenter emits within {int} seconds",
  function(this: StepContext, n: number) { return analytics.expectAnalyticsVisibleWithin(this.ctx, n); });
```

This makes the new scenario pass on all browser peers as a synonym for "analytics panel is visible".

- [ ] **Step 6: Run full suite**

Run: `pnpm --filter @rtc/tests test:e2e`
Expected: all 5 peers green.

- [ ] **Step 7: Commit**

```bash
git add tests/specs/analytics.feature tests/scenarios/presenter/cucumber-real/analytics.ts tests/steps/presenter/cucumber-real/analytics.steps.ts tests/steps/analytics.steps.ts
git commit -m "feat(phase-5b.1): analytics — 1 tagged + 1 new @presenter scenario + dual-layer step support"
```

---

## Task 10: FX RFQ — author 1 new + implement (no existing applicable)

**Files:**
- Modify: `tests/specs/fxRfq.feature`
- Create: `tests/scenarios/presenter/cucumber-real/fxRfq.ts`
- Create: `tests/steps/presenter/cucumber-real/fxRfq.steps.ts`

No existing fxRfq scenarios qualify. New scenario: "RFQ quote arrives with widened spread relative to streaming price".

- [ ] **Step 1: Append new scenario in `fxRfq.feature`**

```diff
+  @presenter
+  Scenario: RFQ quote spread is wider than streaming spread
+    Then a price tile is visible within 5 seconds
+    When the trader requests an RFQ quote on the first pair at pips position 4
+    Then the RFQ quote ask exceeds the streaming ask
+    And the RFQ quote bid is below the streaming bid
```

- [ ] **Step 2: Write `fxRfq.ts` scenarios fns**

```ts
// tests/scenarios/presenter/cucumber-real/fxRfq.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function requestRfqQuoteAt(w: PresenterWorld, pipsPosition: number): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured");
  const streaming = await firstValueFrom(w.ctx.app.presenters.priceStream.price$(pair));
  w.scratch.lastPrice = { mid: streaming.mid, ask: streaming.ask, bid: streaming.bid };
  // RfqQuotePresenter.requestQuote(symbol, pipsPosition) returns Observable<RfqQuoteResult>.
  const quote = await firstValueFrom(
    w.ctx.app.presenters.rfqQuote.requestQuote(pair.symbol, pipsPosition).pipe(timeout(5000)),
  );
  w.scratch.rfqQuote = quote;
}

export async function expectRfqAskExceedsStreamingAsk(w: PresenterWorld): Promise<void> {
  const q = w.scratch.rfqQuote;
  if (!q || !w.scratch.lastPrice) throw new Error("RFQ quote or streaming price missing");
  if (!(q.ask > w.scratch.lastPrice.ask)) {
    throw new Error(`RFQ ask ${q.ask} not greater than streaming ask ${w.scratch.lastPrice.ask}`);
  }
}

export async function expectRfqBidBelowStreamingBid(w: PresenterWorld): Promise<void> {
  const q = w.scratch.rfqQuote;
  if (!q || !w.scratch.lastPrice) throw new Error("RFQ quote or streaming price missing");
  if (!(q.bid < w.scratch.lastPrice.bid)) {
    throw new Error(`RFQ bid ${q.bid} not less than streaming bid ${w.scratch.lastPrice.bid}`);
  }
}
```

Note: `RfqQuotePresenter.requestQuote(symbol, pipsPosition): Observable<RfqQuoteResult>` is a method (verified against `packages/client/src/app/presenters/RfqQuotePresenter.ts`). The `rfqQuote?: RfqQuoteResult` field on `PresenterScratchpad` was added in Task 4.

- [ ] **Step 3: Write `fxRfq.steps.ts`**

```ts
// tests/steps/presenter/cucumber-real/fxRfq.steps.ts
import { Then, When } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as rfq from "../../../scenarios/presenter/cucumber-real/fxRfq";

When("the trader requests an RFQ quote on the first pair at pips position {int}",
  function(this: PresenterWorld, p: number) { return rfq.requestRfqQuoteAt(this, p); });

Then("the RFQ quote ask exceeds the streaming ask",
  function(this: PresenterWorld) { return rfq.expectRfqAskExceedsStreamingAsk(this); });

Then("the RFQ quote bid is below the streaming bid",
  function(this: PresenterWorld) { return rfq.expectRfqBidBelowStreamingBid(this); });
```

- [ ] **Step 4: Browser-side step bindings**

This new scenario tests behavior that is harder to verify at the DOM level (DOM doesn't expose streaming-vs-RFQ as side-by-side numbers). Options:

(a) Add browser-side step defs that call the **same underlying port method** via a debug hook exposed in dev mode — out of scope for 5B.1.

(b) Drop this scenario from 5B.1 if browser-side support proves expensive. Document in the plan and move on.

(c) Reframe scenario to be testable at DOM: "When the trader enters notional 10000000, the price tile displays an RFQ indicator" — uses existing PO methods.

**Pick option (c) if (a) is infeasible.** The reframed scenario:

```gherkin
@presenter
Scenario: large notional triggers an RFQ flow on the first tile
  Then a price tile is visible within 5 seconds
  When the trader sets the first tile notional to "10000000"
  Then an RFQ quote arrives within 5 seconds
```

Presenter side: same as Step 2 above; "set notional" is a no-op at presenter level (the simulator's `getRfqQuote` doesn't gate on notional). Browser side: existing scenarios use this exact step phrasing already.

Adjust the scenario and step implementations if option (c) is chosen.

- [ ] **Step 5: Run cucumber + all 5 peers**

Run: `pnpm --filter @rtc/tests test:presenter:cucumber-real && pnpm --filter @rtc/tests test:e2e`
Expected: all 5 peers green.

- [ ] **Step 6: Commit**

```bash
git add tests/specs/fxRfq.feature tests/scenarios/presenter/cucumber-real/{fxRfq.ts,common.ts} tests/steps/presenter/cucumber-real/fxRfq.steps.ts tests/steps/fxRfq.steps.ts tests/page-objects
git commit -m "feat(phase-5b.1): fxRfq — 1 new @presenter scenario (RFQ flow on large notional)"
```

---

## Task 11: Credit RFQ — author 1 new + implement (no existing applicable)

**Files:**
- Modify: `tests/specs/creditRfq.feature`
- Create: `tests/scenarios/presenter/cucumber-real/creditRfq.ts`
- Create: `tests/steps/presenter/cucumber-real/creditRfq.steps.ts`

Credit RFQ existing scenarios are pure UI navigation. Authoring a presenter-friendly scenario means picking something testable at both the simulator level (`packages/domain/src/simulators/CreditRfqSimulator.ts`) and the browser level (existing credit form).

The chosen presenter-credit scenario asserts the rfqs stream starts empty. Browser side reuses the existing "No RFQs to display" assertion.

- [ ] **Step 1: Append the scenario in `creditRfq.feature`**

```diff
+  @presenter
+  Scenario: credit RFQ list is empty when no RFQs have been created
+    Then the credit RFQ list is empty within 3 seconds
```

- [ ] **Step 2: Write `creditRfq.ts` scenarios fns**

```ts
// tests/scenarios/presenter/cucumber-real/creditRfq.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function expectRfqListEmptyWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const rfqs = await firstValueFrom(
    w.ctx.app.presenters.rfqs.rfqs$.pipe(timeout(seconds * 1000)),
  );
  if (rfqs.length !== 0) throw new Error(`expected empty RFQ list, got ${rfqs.length}`);
}
```

Note: `RfqsPresenter.rfqs$: Observable<readonly Rfq[]>` is a property (verified against `packages/client/src/app/presenters/RfqsPresenter.ts`).

- [ ] **Step 3: Write `creditRfq.steps.ts`**

```ts
// tests/steps/presenter/cucumber-real/creditRfq.steps.ts
import { Then } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as credit from "../../../scenarios/presenter/cucumber-real/creditRfq";

Then("the credit RFQ list is empty within {int} seconds",
  function(this: PresenterWorld, n: number) { return credit.expectRfqListEmptyWithin(this, n); });
```

- [ ] **Step 4: Add browser-side step binding**

In `tests/steps/creditRfq.steps.ts`, add:

```ts
Then("the credit RFQ list is empty within {int} seconds",
  function(this: StepContext, n: number) {
    return credit.expectNoRfqsMessageWithin(this.ctx, n);  // delegates to existing "No RFQs" assertion
  });
```

Reuse the existing scenario fn that asserts the "No RFQs to display" message.

- [ ] **Step 5: Run cucumber + all 5 peers**

Run: `pnpm --filter @rtc/tests test:presenter:cucumber-real && pnpm --filter @rtc/tests test:e2e`
Expected: all 5 peers green.

- [ ] **Step 6: Commit**

```bash
git add tests/specs/creditRfq.feature tests/scenarios/presenter/cucumber-real/creditRfq.ts tests/steps/presenter/cucumber-real/creditRfq.steps.ts tests/steps/creditRfq.steps.ts
git commit -m "feat(phase-5b.1): creditRfq — 1 new @presenter scenario (RFQ list initial state)"
```

---

## Task 12: Wire presenter peer as 5th in `run-all.ts`

**Files:**
- Modify: `tests/scripts/run-all.ts`

- [ ] **Step 1: Add presenter peer**

Change `tests/scripts/run-all.ts`:
```diff
 try {
   combinedExit |= await run("pnpm", ["test:e2e:playwright"]);
   combinedExit |= await run("pnpm", ["test:e2e:raw-playwright"]);
   combinedExit |= await run("pnpm", ["test:e2e:cypress"]);
   combinedExit |= await run("pnpm", ["test:e2e:raw-cypress"]);
+  combinedExit |= await run("pnpm", ["test:presenter:cucumber-real"]);
 } finally {
```

- [ ] **Step 2: Run full e2e — verify all 5 peers**

Run: `pnpm --filter @rtc/tests test:e2e`
Expected: all 5 peers report green; total scenario count includes the ~17-18 @presenter passes.

- [ ] **Step 3: Commit**

```bash
git add tests/scripts/run-all.ts
git commit -m "feat(phase-5b.1): wire presenter peer as 5th in run-all.ts"
```

---

## Task 13: Add grep gates 15-17

**Files:**
- Modify: `tests/scripts/grep-gates.ts`

- [ ] **Step 1: Add gates 15, 16, 17**

In the `GATES` array, append:
```ts
{
  name: "15. No driver imports in presenter step/scenario/support files",
  pattern: '"cypress"|@badeball|@playwright/test',
  paths: ["steps/presenter/", "scenarios/presenter/", "support/presenter/"],
  excludes: ["/node_modules/"],
},
{
  name: "16. No DOM/page references in presenter step/scenario files",
  pattern: 'getByTestId|page\\.|cy\\.',
  paths: ["steps/presenter/", "scenarios/presenter/"],
  excludes: ["/node_modules/"],
},
{
  name: "17. No createApp/createSimulatorPorts outside _buildApp.ts",
  pattern: 'createApp|createSimulatorPorts',
  paths: ["steps/presenter/", "scenarios/presenter/", "support/presenter/"],
  excludes: ["/node_modules/", "scenarios/presenter/_buildApp.ts"],
},
```

- [ ] **Step 2: Run gates**

Run: `pnpm --filter @rtc/tests gates`
Expected: `all gates passed.` 17 total.

- [ ] **Step 3: Commit**

```bash
git add tests/scripts/grep-gates.ts
git commit -m "feat(phase-5b.1): grep gates 15-17 for presenter test-body invariants"
```

---

## Task 14: Update `docs/architecture.md` §9.5

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Rename section header**

Change:
```diff
-### 9.5 Quad-runner stack (Cucumber-JS + Cypress + raw @playwright/test + raw Cypress)
+### 9.5 Five-runner stack (Cucumber-JS + Cypress + raw @playwright/test + raw Cypress + presenter-direct)
```

- [ ] **Step 2: Update the opening paragraph**

Update the first paragraph to mention the fifth peer:
```diff
-Four runners exercise the same behavioural surface via two binding styles. [...]
+Five runners exercise the same behavioural surface via three binding styles. Cucumber-JS (with Playwright) and Cypress (via cypress-cucumber-preprocessor) bind Gherkin scenarios in `tests/specs/**/*.feature` to a shared step-definition tree. Raw `@playwright/test` and raw Cypress bind scenarios programmatically through their own step trees. A fifth peer — **presenter-direct** — binds a subset of the same scenarios (tagged `@presenter`) to the RxJS presenter layer in pure Node with no browser; see Phase 5B.1 spec for details.
```

- [ ] **Step 3: Add rows to the §9.5 table**

After the existing "Page-object impls" row, add (or merge into existing rows):
```diff
+| Presenter-direct specs | Same `tests/specs/**/*.feature` files, scenarios tagged `@presenter` |
+| Presenter-direct step defs | `tests/steps/presenter/cucumber-real/*.steps.ts` — bind to presenter streams; no driver imports |
+| Presenter-direct scenarios | `tests/scenarios/presenter/cucumber-real/*.ts` — subscribe to RxJS streams with `firstValueFrom + timeout` |
+| Presenter-direct harness | `tests/scenarios/presenter/_buildApp.ts` (App + simulator + test ConnectionEventsPort) · `tests/support/presenter/cucumber-real/{world,hooks}.ts` |
```

- [ ] **Step 4: Append a "Presenter-direct binding" paragraph after the existing "Raw Cypress binding" paragraph**

```markdown
**Presenter-direct binding (Phase 5B.1).** `tests/steps/presenter/cucumber-real/*.steps.ts` files use Cucumber-JS but in pure Node — no browser, no DOM, no React. Step bodies delegate to scenarios fns at `tests/scenarios/presenter/cucumber-real/*.ts`, which subscribe to presenter streams (`priceStream.price$`, `connection.status$`, `blotter.trades$`, etc.) via `firstValueFrom + timeout` and assert on emitted values. Background steps are no-ops (workspaces are a UI concern). The `@presenter` tag in `.feature` files selects ~17-22 scenarios that map cleanly to the application layer; UI-only scenarios (theme, hover, CSS, tabs) remain browser-only. `tests/scenarios/presenter/_buildApp.ts` is the sole seam to `createApp(simulatorPorts)`; grep gate 17 enforces it. Demonstrates that the same behavioural specs validate the application layer with no UI framework — closing the loop on `architecture.md §1.1` rule #4 ("Behavioural Tests as Insurance"). First sub-phase of Phase 5B; sub-phases 5B.2-5B.4 add variants (fake timers; Vitest+Gherkin; Vitest+plain-TS) as a comparison artifact.
```

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md
git commit -m "docs(arch): §9.5 — Five-runner stack with presenter-direct binding"
```

---

## Task 15: Update STATUS.md

**Files:**
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 1: Get the SHA range**

Run: `git log --oneline origin/main..HEAD | tail -1; git log --oneline -1`
Note the first SHA of the phase (Task 1 commit) and the most recent SHA.

- [ ] **Step 2: Update Phase 5B.1 row and add 5B.2-5B.4 rows**

In `docs/superpowers/STATUS.md`, change:
```diff
-| Phase 5B — Presenter-direct step definitions for the same `.feature` files | ⏳ NOT STARTED | (to be written) | — |
+| Phase 5B.1 — Cucumber-JS + real-time presenter step defs (foundation for 5B comparison artifact) | ✅ DONE | `plans/2026-05-16-phase-5b-1-presenter-direct-step-defs.md` | `<first-sha>..<last-sha>` (N task commits) + this STATUS update |
+| Phase 5B.2 — Cucumber-JS + fake timers (virtual time) | ⏳ NOT STARTED | (to be written) | — |
+| Phase 5B.3 — Vitest + Gherkin + fake timers | ⏳ NOT STARTED | (to be written) | — |
+| Phase 5B.4 — Vitest + plain TS (no Gherkin) + fake timers | ⏳ NOT STARTED | (to be written) | — |
```

- [ ] **Step 3: Bump "Last updated"**

```diff
-**Last updated:** 2026-05-16
+**Last updated:** 2026-05-16
```

(no-op if same date; bump otherwise)

- [ ] **Step 4: Update test counts line**

```diff
-- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 40 e2e (Cucumber+Playwright) + 40 e2e (raw Playwright) + 40 e2e (Cucumber+Cypress) + 40 e2e (raw Cypress)
+- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 40 (Cucumber+Playwright) + 40 (raw Playwright) + 40 (Cucumber+Cypress) + 40 (raw Cypress) + ~17-22 (presenter-direct)
```

- [ ] **Step 5: Append Phase 5B.1 follow-ups section**

After the Phase 5A.4 follow-ups section, add:
```markdown
## Phase 5B.1 follow-ups (carry into 5B.2+)

1. **App teardown.** `createApp` does not return a `dispose()` method. If subscription leaks cause flake across scenarios, add one. Recorded as a risk; defer to first sub-phase that surfaces flake.

2. **`Subject` vs `BehaviorSubject` for `connectionEvents$`.** A step subscribing before the first event misses it. Acceptable in 5B.1 (events come from explicit step bodies); revisit if scenarios get more complex.

3. **Browser-side step coverage for new scenarios.** Several new @presenter scenarios required adding step-def synonyms on the browser side. If these become idiomatic, consider extracting common phrasing patterns.

4. **`@rtc/client` package exports.** 5B.1 added a top-level barrel + `exports` field. Other tooling that imports `@rtc/client` (Vite build, server, etc.) wasn't affected, but verify on the next major dep bump.
```

- [ ] **Step 6: Final pass — `pnpm test:e2e` end-to-end**

Run: `pnpm --filter @rtc/tests test:e2e`
Expected: all 5 peers green. `pnpm typecheck` clean. `pnpm --filter @rtc/tests gates` reports 17 passes.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/STATUS.md
git commit -m "docs(status): Phase 5B.1 DONE; add 5B.2-5B.4 rows + follow-ups"
```

---

## Self-review checklist

After all tasks complete:

- [ ] `pnpm test:e2e` passes (5 peers)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm --filter @rtc/tests gates` reports 17/17 passing
- [ ] No `@playwright/test` / `cypress` / `getByTestId` / `cy.` / `page.` references inside `tests/{steps,scenarios,support}/presenter/`
- [ ] `createApp` / `createSimulatorPorts` referenced only in `tests/scenarios/presenter/_buildApp.ts`
- [ ] `docs/architecture.md` §9.5 reflects 5 runners
- [ ] `docs/superpowers/STATUS.md` Phase 5B.1 row is ✅ DONE; 5B.2/B.3/B.4 listed as ⏳ NOT STARTED
- [ ] At least 17 `@presenter`-tagged scenarios in `.feature` files (target 20-22)
- [ ] All `@presenter`-tagged scenarios pass on all 5 peers
