# Phase 5B.1 — Presenter-direct step definitions (Cucumber-JS + real-time) (design)

**Date:** 2026-05-16
**Status:** Approved (design); implementation plan to follow.
**Predecessor:** [Phase 5A.4 design](./2026-05-11-phase-5a-4-raw-cypress-po-contracts-design.md) — completes the four-runner browser stack that this sub-phase extends.
**Phase 5B umbrella:** this sub-phase establishes the foundation for a four-variant comparison artifact. Sub-phases 5B.2 / 5B.3 / 5B.4 each add another variant; see §8 for outlines.

---

## 1. Goal

Add a fifth e2e peer driven by **Cucumber-JS in pure Node, binding `.feature` scenarios to the RxJS presenter layer with no browser involvement.** Same `tests/specs/**/*.feature` files as the four browser peers; a new step tree at `tests/steps/presenter/cucumber-real/`; a new scenarios layer at `tests/scenarios/presenter/cucumber-real/`; a Cucumber World whose `ctx` holds an `App` graph (presenters + simulator-backed ports) instead of page objects.

The peer runs the subset of scenarios that translate cleanly to the application layer (~20-22 of 40 after authoring ~8-10 new business-behaviour scenarios in this sub-phase). All `@presenter`-tagged scenarios pass on all 5 peers — 4 browser + 1 presenter.

### Why this exists

Three compounding rationales:

1. **Architectural claim in `architecture.md` §1.1 rule #4:** *"Behavioural specs survive technology swaps."* The browser peers prove the four-driver swap; the presenter peer proves the **no-UI** swap. If React vanished tomorrow, the same `.feature` set would still run against the application layer.
2. **Architecture explicitly designs for it** (`architecture.md` §9.2): *"application-layer step defs -- drives presenters directly, asserts hook output, no browser. Fast."*
3. **Absorbs Phase 3 follow-up #2** (STATUS): *"Strengthen presenter test depth"* — the presenter-direct driver re-exercises every presenter contract through realistic scenarios, not the thin unit tests today.

### Phase 5B umbrella goal (context)

Phase 5B as a whole is a **four-variant comparison artifact** for the team. Same behavioural surface; four different test-stack styles; side-by-side readable code. After all four sub-phases land, the team can compare:

- 5B.1 — Cucumber-JS + real time (this sub-phase)
- 5B.2 — Cucumber-JS + fake timers (virtual time)
- 5B.3 — Vitest + Gherkin + fake timers
- 5B.4 — Vitest + plain TS (no Gherkin) + fake timers

5B.1 ships the first variant **and** the cross-cutting foundation (`@presenter` tagging, the shared `_buildApp.ts`, directory layout, peer wiring).

### Non-goals

5B.1 does NOT:

- Add new presenter classes (no `ThemePresenter`, no `TabPresenter`).
- Modify existing `.feature` scenarios (only adds `@presenter` tags and appends new scenarios).
- Touch `tests/scenarios/*.ts` or `tests/scenarios/cypress/*.ts`.
- Implement 5B.2 / 5B.3 / 5B.4 (separate sub-phases).
- Add `@sinonjs/fake-timers`, Vitest, or `jest-cucumber` as deps.
- Rename `test:e2e:*` scripts.
- Add a `disposable` collection to `PresenterCtx` (deferred; only if subscription-leak flake surfaces).
- Add new PO methods or browser-side step defs *unless required by a new dual-layer scenario*.

---

## 2. Architecture

### Directory layout

```
tests/
  specs/**/*.feature                                  # SOT, shared (with @presenter tags added)

  scenarios/presenter/
    _buildApp.ts                                      # SHARED across 5B.1-5B.4 (App + simulator factory)
    cucumber-real/                                    # 5B.1's scenarios fns
      common.ts                                       # Backgrounds + waitSeconds + Scratchpad
      fxLiveRates.ts
      fxTrading.ts
      fxRfq.ts
      creditRfq.ts
      blotter.ts
      analytics.ts
      connection.ts

  steps/presenter/
    cucumber-real/                                    # 5B.1's step defs
      common.steps.ts
      fxLiveRates.steps.ts
      fxTrading.steps.ts
      fxRfq.steps.ts
      creditRfq.steps.ts
      blotter.steps.ts
      analytics.steps.ts
      connection.steps.ts

  support/presenter/
    cucumber-real/
      world.ts                                        # PresenterWorld
      hooks.ts                                        # Before/After

  cucumber-presenter-real.js                          # 5B.1's Cucumber 11 ESM flat config
```

### What is NOT touched

- `tests/page-objects/**` — unchanged (PO contracts and impls stay UI-shaped).
- `tests/scenarios/*.ts` and `tests/scenarios/cypress/*.ts` — unchanged (both UI-shaped).
- `tests/steps/*.ts` (existing browser tree) — unchanged.
- `tests/support/{playwright,cypress}/` — unchanged.
- `tests/raw/{playwright,cypress}/` — unchanged.
- `packages/**` source — one-line `export` widening in `composition.ts` (see §2.3); no other changes.

### Key architectural choices

**1. `_buildApp.ts` is the only seam between the test stack and the application layer.** It imports `createApp` and `createSimulatorPorts`; step defs and scenarios fns never see them. A future swap (presenters move to a separate package, simulator API changes) touches one file. Enforced by grep gate 17.

**2. Test-controlled `ConnectionEventsPort`.** Production's `BrowserConnectionEventsAdapter` uses `window.addEventListener('online'/'offline')` — won't work in Node. `_buildApp.ts` substitutes a `Subject<ConnectionEvent>` exposed on `PresenterCtx.connectionEvents$` so the `connection.feature` scenarios can `subject.next({ type: 'browserOffline' })` directly. We still wrap with the existing `withSyntheticGatewayConnected` so synthetic-startup behaviour matches production.

**3. PresenterWorld shape mirrors browser StepContext.** Same `{ ctx, scratch }` shape; `ctx` holds an `App` instead of POs. Reduces cognitive load when moving between trees.

**4. Mirror, don't share, scenarios files.** `scenarios/presenter/cucumber-real/fxLiveRates.ts` is a fork of `scenarios/fxLiveRates.ts`, fn-for-fn by name where applicable. Same naming makes the comparison trivial. Matches the 5A.4 precedent (cypress-forked scenarios mirror shared scenarios 1:1).

**5. Subscription model: lazy, per-step.** Each scenarios fn subscribes only to the streams it needs, captures the value, then resolves. No global pre-subscription.

**6. No App teardown in 5B.1.** Subjects + simulator state get GC'd between scenarios. Risk noted in §9; defer the `disposable` collection until leak flake surfaces (if ever).

---

## 3. Tagging strategy & coverage

### Audit of existing 40 scenarios

A scenario qualifies for `@presenter` only if **every** step in it can be expressed against the presenter API without DOM/CSS/click/visibility assertions. One UI-only step makes the whole scenario UI-only.

| Feature | @presenter | Total | Notes on rejected scenarios |
|---|---|---|---|
| analytics | 1 | 4 | 3 rejected because of "shows the section *X*" JSX label assertions |
| blotter | 2 | 7 | 5 rejected: hover/background, sort, filter UI, CSV button, row CSS |
| connection | 4 | 4 | All map cleanly to `status$` state transitions |
| creditRfq | 0 | 7 | All scenarios are UI navigation (tabs, panels, headings, copy) |
| fxLiveRates | 2 | 6 | 4 rejected: tile buttons, currency filter UI, view toggle, reload persistence |
| fxRfq | 0 | 2 | Both rely on "RFQ initiation button appears" — UI side-effect of `getRfqQuote()` |
| fxTrading | 3 | 5 | 2 rejected: notional input UI, dismiss-by-click UI |
| theme | 0 | 5 | All pure UI; no presenter equivalent exists |
| **Existing total** | **12** | **40** | |

This is itself a finding worth reporting to the team: **only ~30% of the existing suite validates behaviour that lives at the presenter layer.** That's an artifact of how the suite grew (browser-only at first), not a flaw in either layer.

### New scenarios authored in 5B.1

5B.1 authors ~8-10 new scenarios in the existing `.feature` files. Each:

- Tests authentic business behaviour at the presenter layer.
- Is also writable at the browser layer (passes on all 5 peers).
- Is tagged `@presenter`.
- Is appended to its feature file (does not modify existing scenarios).

Working set (final list trimmed/adjusted during plan-writing):

| Feature | Proposed scenario | Presenter mapping | Browser mapping |
|---|---|---|---|
| fxLiveRates | "currency pairs list is populated" | `currencyPairs$` emits ≥ 7 entries | ≥ 7 tiles render |
| fxLiveRates | "price history accumulates ticks over time" | `priceHistory$` length grows within N seconds | Existing visible-chart assertion or spark-line bar count |
| fxRfq | "RFQ quote is wider than streaming quote" | `pricing.getRfqQuote()` returns ask/bid wider than current `priceStream` tick | UI shows widened pricing |
| fxTrading | "executed trade carries the requested notional" | `execute()` result.trade.notional == requested | Blotter row contains the requested notional value |
| fxTrading | "rejected trades complete with a rejected status" | `execute()` result.status matches /rejected/i across N attempts | Confirmation text matches /rejected/i across N buys |
| blotter | "blotter accumulates N executed trades" | After N executes, `trades$` length ≥ 1 | Blotter has ≥ N rows |
| blotter | "newest trade appears first in the blotter" | `trades$` array order: most-recent first | First row corresponds to most recent execute |
| analytics | "analytics emits a non-empty snapshot" | `analytics$` emits non-null PnL/positions fields | PnL section is non-empty text |
| creditRfq | "trader creates an RFQ and receives quotes" | Call workflow port → `rfqs.rfqs$()` emits with quotes within N seconds | Form submit → quotes panel populates |
| connection | "after offline-online cycle, status returns to CONNECTED" | Push offline then online → `status$` emits CONNECTED within N seconds | Footer shows "Connected" within N seconds |

### Final @presenter set (target)

- 12 existing scenarios identified in the audit
- ~8-10 new scenarios authored in 5B.1
- **Total: ~20-22 `@presenter`-tagged scenarios**

The other 18-20 scenarios remain unmodified and continue running on the 4 browser peers only.

### Background handling

All features have a `Background: Given the trader has the [...] workspace open`. At presenter level, the application is workspace-agnostic — the App graph has every presenter wired regardless. So all three Background phrasings become **no-op step bodies** in the presenter step tree. This is itself a finding: the existence of "workspaces" is a UI concern, not an application-layer concern. Documented in code (no-op comments) and here.

---

## 4. PresenterCtx, scenarios layer, step defs (concrete shape)

### `_buildApp.ts` — the seam

```ts
// tests/scenarios/presenter/_buildApp.ts
import { Subject } from "rxjs";
import { createApp, type App, type AppPorts } from "@rtc/client";
import { createSimulatorPorts } from "@rtc/client/app/adapters/portFactory";
import { withSyntheticGatewayConnected } from "@rtc/client/app/composition";
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

### Production-code change (only one)

```diff
-function withSyntheticGatewayConnected(
+export function withSyntheticGatewayConnected(
   inner: ConnectionEventsPort,
 ): ConnectionEventsPort {
```

Visibility-widening only; behaviour unchanged.

### `PresenterWorld` and lifecycle hooks

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

### `common.ts` — scratchpad + shared helpers

```ts
// tests/scenarios/presenter/cucumber-real/common.ts
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export interface PresenterScratchpad {
  firstPair?: { symbol: string };
  lastPrice?: { mid: number; ask: number; bid: number };
  recordedCount: Map<string, number>;
  lastTradeStatus?: string;
}
export const newScratchpad = (): PresenterScratchpad => ({ recordedCount: new Map() });

// Background no-ops (workspace concept is UI-only)
export async function openWorkspace(_w: PresenterWorld): Promise<void> { /* no-op */ }
export async function openFxWorkspace(_w: PresenterWorld): Promise<void> { /* no-op */ }
export async function openCreditWorkspace(_w: PresenterWorld): Promise<void> { /* no-op */ }

// Real-time wait (redefined to use clock.tickAsync in 5B.2)
export async function waitSeconds(_w: PresenterWorld, n: number): Promise<void> {
  await new Promise((r) => setTimeout(r, n * 1000));
}
```

### Representative scenarios fns

```ts
// tests/scenarios/presenter/cucumber-real/fxLiveRates.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function expectPriceTileVisibleWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const pairs = await firstValueFrom(w.ctx.app.presenters.currencyPairs.currencyPairs$());
  if (pairs.length === 0) throw new Error("no currency pairs available");
  const pair = pairs[0]!;
  const price = await firstValueFrom(
    w.ctx.app.presenters.priceStream.price$(pair).pipe(timeout(seconds * 1000)),
  );
  w.scratch.firstPair = pair;
  w.scratch.lastPrice = { mid: price.mid, ask: price.ask, bid: price.bid };
}

export async function expectAtLeastOneTileVisible(w: PresenterWorld): Promise<void> {
  const pairs = await firstValueFrom(w.ctx.app.presenters.currencyPairs.currencyPairs$());
  if (pairs.length < 1) throw new Error(`expected at least 1 currency pair, got ${pairs.length}`);
}
```

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

export async function expectStatusWithin(
  w: PresenterWorld, status: ConnectionStatus, seconds: number,
): Promise<void> {
  await firstValueFrom(
    w.ctx.app.presenters.connection.status$.pipe(
      filter((s) => s === status),
      timeout(seconds * 1000),
    ),
  );
}
```

```ts
// tests/scenarios/presenter/cucumber-real/fxTrading.ts
import { firstValueFrom, take } from "rxjs";

export async function executeBuyOnFirstPair(w: PresenterWorld): Promise<void> {
  const pair = w.scratch.firstPair ?? (await firstValueFrom(
    w.ctx.app.presenters.currencyPairs.currencyPairs$()
  ))[0]!;
  const result = await firstValueFrom(
    w.ctx.app.presenters.execution.execute({
      currencyPair: pair, direction: "Buy", notional: 1_000_000, /* full input shape in plan */
    }).pipe(take(1)),
  );
  w.scratch.lastTradeStatus = result.status;
}

export async function expectTradeConfirmationMatchesOneOf(
  w: PresenterWorld, patterns: RegExp[],
): Promise<void> {
  const status = w.scratch.lastTradeStatus;
  if (!status) throw new Error("no trade status captured");
  if (!patterns.some((p) => p.test(status))) {
    throw new Error(`status "${status}" matched none of: ${patterns.map(String).join(", ")}`);
  }
}
```

### Step defs — thin, no logic

```ts
// tests/steps/presenter/cucumber-real/fxLiveRates.steps.ts
import { Then } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as fx from "../../../scenarios/presenter/cucumber-real/fxLiveRates";

Then("a price tile is visible within {int} seconds",
  function(this: PresenterWorld, n: number) { return fx.expectPriceTileVisibleWithin(this, n); });

Then("there is at least 1 visible tile",
  function(this: PresenterWorld) { return fx.expectAtLeastOneTileVisible(this); });
```

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

Then("the connection status footer shows {string}",
  function(this: PresenterWorld, label: string) {
    const target = label === "Connected" ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED;
    return conn.expectStatusWithin(this, target, 3);
  });
```

### Key patterns

1. **Streams accessed lazily inside scenarios fns.** No global pre-subscription.
2. **`firstValueFrom + timeout`** for "happens-within-N-seconds" assertions — RxJS's `timeout` throws cleanly if no emission arrives.
3. **`filter`** for "status reaches state X" — hot streams emit current value first; `filter` skips until target arrives.
4. **Step defs are one-liners** — same discipline as browser step trees.
5. **Background = no-op** — recorded explicitly so future readers don't try to "implement" them.

---

## 5. Runner config, npm scripts, run-all, grep gates

### `tests/cucumber-presenter-real.js`

```js
// Cucumber 11 ESM flat config (same shape as cucumber.js)
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

A new flat-config file rather than profile-switching — per the comment in `cucumber.js`, Cucumber 11's flat ESM shape doesn't support named profiles.

### `tests/package.json` script addition

```diff
   "scripts": {
     "test:e2e":                          "pnpm gates && tsx scripts/run-all.ts",
     "test:e2e:playwright":               "NODE_OPTIONS='--import tsx/esm' cucumber-js",
+    "test:presenter:cucumber-real":      "NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber-presenter-real.js",
     "test:e2e:raw-playwright":           "tsx scripts/with-server.ts playwright test --config raw/playwright/playwright.config.ts",
     "test:e2e:cypress":                  "tsx scripts/with-server.ts cypress run --headless",
     "test:e2e:raw-cypress":              "tsx scripts/with-server.ts cypress run --headless --config-file raw/cypress/cypress.config.ts",
```

No `with-server.ts` wrapper — the presenter peer doesn't need a dev server.

### `tests/scripts/run-all.ts`

```diff
 try {
   combinedExit |= await run("pnpm", ["test:e2e:playwright"]);
   combinedExit |= await run("pnpm", ["test:e2e:raw-playwright"]);
   combinedExit |= await run("pnpm", ["test:e2e:cypress"]);
   combinedExit |= await run("pnpm", ["test:e2e:raw-cypress"]);
+  combinedExit |= await run("pnpm", ["test:presenter:cucumber-real"]);
 } finally {
   await dev.stop();
 }
```

5 peers total. The presenter peer doesn't need the dev server, but adding it after the browser peers keeps the script linear and reuses the same orchestrator. The unused dev server is harmless.

### Grep gates (3 new, total 17)

```ts
{
  name: "15. No driver imports in presenter step/scenario files",
  pattern: '"cypress"|@badeball|@playwright/test',
  paths: ["steps/presenter/", "scenarios/presenter/", "support/presenter/"],
  excludes: ["/node_modules/"],
},
{
  name: "16. No DOM/page imports in presenter test bodies",
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

Gate 17 enforces the `_buildApp.ts`-as-sole-seam discipline.

### npm deps

**None added in 5B.1.** Uses `@cucumber/cucumber` (already present) and pure RxJS (already in `@rtc/client` / `@rtc/domain`). Downstream sub-phases add their own (`@sinonjs/fake-timers` in 5B.2, etc.).

---

## 6. Acceptance criteria

1. `pnpm test:presenter:cucumber-real` passes locally with all ~20-22 `@presenter`-tagged scenarios green.
2. `pnpm test:e2e` (orchestrator) passes all 5 peers — 4 browser + presenter.
3. All ~20-22 `@presenter`-tagged scenarios also pass on the 4 browser peers (any new scenario carries dual-layer support).
4. `pnpm gates` — 17 gates total, all PASS.
5. `pnpm typecheck` clean.
6. No imports of `@playwright/test`, `cypress`, or `getByTestId` in `tests/steps/presenter/`, `tests/scenarios/presenter/`, `tests/support/presenter/`.
7. `createApp` and `createSimulatorPorts` are imported only by `tests/scenarios/presenter/_buildApp.ts` (gate 17).
8. `withSyntheticGatewayConnected` exported from `composition.ts`; no other production-code changes.
9. `docs/architecture.md` §9.5 updated: "Quad-runner stack" → "Five-runner stack"; new rows for presenter step defs, scenarios, harness.
10. `docs/superpowers/STATUS.md`: Phase 5B.1 row flipped to DONE with SHA range; Phase 5B.2 / 5B.3 / 5B.4 rows added as ⏳ NOT STARTED with one-paragraph descriptions.

---

## 7. Risks

**1. Real-time wait flake.** The `PricingSimulator` ticks at random 150-1000ms intervals. Scenarios using "within 5 seconds" leave 4-5× safety margin, so flake risk is low. Mitigation: `firstValueFrom + timeout` propagates a `TimeoutError` (not a hang); CI retry isn't enabled in 5B.1 but can be turned on per-config if it surfaces.

**2. New-scenario dual-layer cost.** Each ~8-10 new scenarios must pass on the 4 browser peers *and* the presenter peer. Worst case: a browser side needs a new PO method or step binding. Mitigation: pick scenarios where the browser side already has the required step (or a near-relative); reject scenarios that force new PO surface.

**3. Cucumber parallelism.** Existing `cucumber.js` runs `parallel: 2` locally. Each worker gets a fresh World → fresh `App + Subject` — no shared state. The simulator uses `Math.random()` globally, so two concurrent workers share the RNG. In practice irrelevant; flagged for completeness.

**4. `withSyntheticGatewayConnected` export.** Visibility-widening only; behaviour unchanged. Low risk.

**5. Background no-op semantic gap.** All Backgrounds become no-ops on the presenter side. A reader of the `.feature` files may assume Background does something material. Mitigation: the `@presenter` tag itself flags the divergence; this spec documents the finding ("workspaces are a UI concern").

---

## 8. Downstream sub-phase outlines

Full specs for these come in their own brainstorming rounds. One-paragraph each here so STATUS rows can be appended at end of 5B.1.

### Phase 5B.2 — Cucumber-JS + fake timers (virtual time)

Mechanical delta from 5B.1: new `tests/support/presenter/cucumber-fake/{world,hooks}.ts` installing `@sinonjs/fake-timers` in `Before` and uninstalling in `After`; new `tests/scenarios/presenter/cucumber-fake/common.ts` where `waitSeconds` uses `clock.tickAsync` instead of `setTimeout`; new `cucumber-presenter-fake.js`. Adds `@sinonjs/fake-timers` as a dep. Expected suite runtime: <1s vs 5B.1's 60-90s. Demonstrates the real-time → virtual-time migration is one hooks file plus one helper redefinition. Script: `test:presenter:cucumber-fake`.

### Phase 5B.3 — Vitest + Gherkin + fake timers

New runner. Adds Vitest as a tests-package dep (it's already in `@rtc/domain`/`@rtc/client`). Adds `jest-cucumber` or `@cucumber/gherkin` to parse `.feature` files inside Vitest's test registry. Per-feature setup blocks register `test()` per scenario. Reuses `tests/scenarios/presenter/_buildApp.ts`. New directory `tests/vitest/presenter/vitest-gherkin/`. Demonstrates "different runner, same scenarios layer". Script: `test:presenter:vitest-gherkin`.

### Phase 5B.4 — Vitest + plain TS (no Gherkin)

Same Vitest setup as 5B.3, but scenarios written as plain `describe`/`test()` blocks — same business intent as Gherkin, just expressed as TypeScript. Lets the team compare "with Gherkin vs without". Reuses `_buildApp.ts`. New directory `tests/vitest/presenter/vitest-pure/`. Script: `test:presenter:vitest-pure`.

### Run-all evolution

| Sub-phase | Peers in `run-all.ts` |
|---|---|
| 5B.1 (this) | 5 |
| 5B.2 | 6 |
| 5B.3 | 7 |
| 5B.4 | 8 |

After 5B.4: 8 e2e peers, ~20-22 scenarios each, four-way side-by-side comparison artifact.

---

## 9. Open questions (resolved during plan-writing, not in this spec)

1. **Exact list of new scenarios.** §3 lists 10 candidates; trimmed/adjusted in the plan after verifying each passes on both layers.
2. **Whether `steps/presenter/cucumber-real/` is shared with 5B.2 or forked.** 5B.2 uses fake timers; step bodies could be identical if the `waitSeconds` helper dispatches on `world.clock` presence. But that's premature coupling. Defer the call to 5B.2's spec; 5B.1 owns its own steps tree.
3. **Scenario ordering for new scenarios.** Append to bottom of each feature file (preserves existing numbering) or interleave by topic? Defer to plan.

---

## 10. Follow-ups (carry into 5B.2+)

1. **App teardown.** `createApp` does not return a `dispose()` method. If subscription leaks cause flake, add one. Recorded as a risk; deferred to first sub-phase that surfaces flake.
2. **`Subject` vs `BehaviorSubject` for `connectionEvents$`.** A step subscribing before the first event misses it. Acceptable in 5B.1 (events come from explicit step bodies); revisit if scenarios get more complex.
3. **Final scenario list.** Finalized in the 5B.1 implementation plan based on which new scenarios survive the "passes on all 5 peers" bar.

---

## 11. Document changes

- **`docs/architecture.md` §9.5** — "Quad-runner stack" header and table updated to "Five-runner stack"; new rows for presenter step defs, scenarios layer, harness; brief paragraph after the table summarising what the presenter peer is (no browser, drives application layer, asserts on RxJS stream emissions).
- **`docs/superpowers/STATUS.md`** — Phase 5B.1 row flipped to ✅ DONE with SHA range; Phase 5B.2 / 5B.3 / 5B.4 rows appended as ⏳ NOT STARTED with one-paragraph descriptions from §8; "Last updated" bumped; new "Phase 5B.1 follow-ups" section appended.
- No `CLAUDE.md` changes (this is a test-stack addition, not a workflow change).
