# Phase 5B.2 — Cucumber-JS + Fake Timers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sixth e2e test peer (`test:presenter:cucumber-fake`) that runs the same 19 `@presenter` scenarios as Phase 5B.1 under `@sinonjs/fake-timers`, demonstrating both the speed win (<1s vs 60–90s) and the migration cost (one helper abstraction on the World).

**Architecture:** Introduce an `AwaitHelpers` interface implemented by two `PresenterWorld` classes — one real-time (existing cucumber-real, modified) and one fake-time (new cucumber-fake). Scenarios in `tests/scenarios/presenter/cucumber-real/*.ts` call `w.awaitFirstWithin(source$, ms)` instead of bare `firstValueFrom(...pipe(timeout(...)))`, making them runtime-mechanism-agnostic and consumable by both runners. The fake-time World owns a `@sinonjs/fake-timers` clock for the scenario lifetime, advancing virtual time inside `awaitFirstWithin`.

**Tech Stack:** `@cucumber/cucumber` 11, `@sinonjs/fake-timers` 14, RxJS 7.8, TypeScript 5.6, pnpm workspaces + Turborepo.

**Spec:** `docs/superpowers/specs/2026-05-17-phase-5b-2-cucumber-fake-timers-design.md` (commit `1665b67`).

---

## File map

| Path | Action |
|------|--------|
| `tests/package.json` | Modify — add `@sinonjs/fake-timers` dep + `test:presenter:cucumber-fake` script |
| `tests/scenarios/presenter/_await.ts` | **Create** — `AwaitHelpers` interface + `RealAwaitHelpers` class |
| `tests/scenarios/presenter/_world.ts` | **Create** — `PresenterWorld` structural type |
| `tests/support/presenter/cucumber-real/world.ts` | Modify — implement `AwaitHelpers` via `RealAwaitHelpers` |
| `tests/scenarios/presenter/cucumber-real/common.ts` | Modify — drop `waitSeconds` (moves to World) |
| `tests/steps/presenter/cucumber-real/common.steps.ts` | Modify — call `this.waitSeconds(n)` instead of `common.waitSeconds(this, n)` |
| `tests/scenarios/presenter/cucumber-real/connection.ts` | Modify — bare `firstValueFrom(...pipe(timeout))` → `w.awaitFirstWithin(...)` |
| `tests/scenarios/presenter/cucumber-real/fxLiveRates.ts` | Modify (same pattern) |
| `tests/scenarios/presenter/cucumber-real/fxTrading.ts` | Modify (same pattern) |
| `tests/scenarios/presenter/cucumber-real/blotter.ts` | Modify (same pattern) |
| `tests/scenarios/presenter/cucumber-real/analytics.ts` | Modify (same pattern) |
| `tests/scenarios/presenter/cucumber-real/fxRfq.ts` | Modify (same pattern) |
| `tests/scenarios/presenter/cucumber-real/creditRfq.ts` | Modify (same pattern) |
| `tests/support/presenter/cucumber-fake/world.ts` | **Create** — `FakePresenterWorld` |
| `tests/support/presenter/cucumber-fake/hooks.ts` | **Create** — install/uninstall fake-timers |
| `tests/cucumber-presenter-fake.js` | **Create** — Cucumber config for fake-time runner |
| `tests/scripts/run-all.ts` | Modify — append 6th peer |
| `tests/scripts/grep-gates.ts` | Modify — add gate 18 |
| `docs/architecture.md` | Modify — §9.5 (Five-runner → Six-runner stack) |
| `docs/superpowers/STATUS.md` | Modify — flip Phase 5B.2 row to ✅ DONE |

---

## Task 1: Add `@sinonjs/fake-timers` dep + create `_await.ts` and `_world.ts`

**Files:**
- Modify: `tests/package.json`
- Create: `tests/scenarios/presenter/_await.ts`
- Create: `tests/scenarios/presenter/_world.ts`

- [ ] **Step 1: Add `@sinonjs/fake-timers` to `tests/package.json` devDependencies**

Open `tests/package.json` and insert into `devDependencies` (alphabetical order):

```json
"@sinonjs/fake-timers": "^14.0.0",
```

The block should look like (showing context — `@playwright/test` precedes it):
```json
"devDependencies": {
  "@badeball/cypress-cucumber-preprocessor": "24.0.1",
  "@bahmutov/cypress-esbuild-preprocessor": "2.2.8",
  "@cucumber/cucumber": "^11.0.0",
  "@playwright/test": "^1.50",
  "@sinonjs/fake-timers": "^14.0.0",
  "@types/node": "^25.5.0",
  ...
}
```

- [ ] **Step 2: Install the dep**

Run from the repo root:
```bash
pnpm install
```
Expected: `+ @sinonjs/fake-timers 14.x.x` added to `tests/node_modules`. No errors.

- [ ] **Step 3: Create `tests/scenarios/presenter/_await.ts`**

```typescript
// tests/scenarios/presenter/_await.ts
import { firstValueFrom, timeout, type Observable } from "rxjs";

export interface AwaitHelpers {
  /** Resolves to first emission within timeoutMs; rejects with TimeoutError otherwise. */
  awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T>;
  /** Advances time by n seconds (real or virtual). */
  waitSeconds(n: number): Promise<void>;
}

export class RealAwaitHelpers implements AwaitHelpers {
  awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
    return firstValueFrom(source$.pipe(timeout(timeoutMs)));
  }
  waitSeconds(n: number): Promise<void> {
    return new Promise((r) => setTimeout(r, n * 1000));
  }
}
```

- [ ] **Step 4: Create `tests/scenarios/presenter/_world.ts`**

```typescript
// tests/scenarios/presenter/_world.ts
import type { PresenterCtx } from "./_buildApp";
import type { PresenterScratchpad } from "./cucumber-real/common";
import type { AwaitHelpers } from "./_await";

export type PresenterWorld = AwaitHelpers & {
  ctx: PresenterCtx;
  scratch: PresenterScratchpad;
};
```

- [ ] **Step 5: Typecheck**

Run from repo root:
```bash
pnpm typecheck
```
Expected: all packages green. The new modules compile; nothing imports them yet so no integration check needed.

- [ ] **Step 6: Commit**

```bash
git add tests/package.json pnpm-lock.yaml tests/scenarios/presenter/_await.ts tests/scenarios/presenter/_world.ts
git commit -m "$(cat <<'EOF'
feat(phase-5b.2): add @sinonjs/fake-timers + AwaitHelpers scaffold

Adds the dep and creates the AwaitHelpers interface that both real-time
and fake-time PresenterWorld classes will implement, plus a structural
PresenterWorld type so scenarios can be runner-agnostic.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire `AwaitHelpers` into real `PresenterWorld` + drop `common.waitSeconds`

**Files:**
- Modify: `tests/support/presenter/cucumber-real/world.ts`
- Modify: `tests/scenarios/presenter/cucumber-real/common.ts`
- Modify: `tests/steps/presenter/cucumber-real/common.steps.ts`

- [ ] **Step 1: Modify `tests/support/presenter/cucumber-real/world.ts`**

Replace the entire file with:

```typescript
// tests/support/presenter/cucumber-real/world.ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import type { Subscription } from "rxjs";
import type { PresenterCtx } from "../../../scenarios/presenter/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import { type AwaitHelpers, RealAwaitHelpers } from "../../../scenarios/presenter/_await";

export class PresenterWorld extends World implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  /** Held for the entire scenario to keep shareReplay streams warm. */
  _statusSub?: Subscription;
  private readonly _await = new RealAwaitHelpers();
  awaitFirstWithin = this._await.awaitFirstWithin.bind(this._await);
  waitSeconds = this._await.waitSeconds.bind(this._await);
}
setWorldConstructor(PresenterWorld);
```

- [ ] **Step 2: Modify `tests/scenarios/presenter/cucumber-real/common.ts`**

Remove the `waitSeconds` function (it moves to the World). The file becomes:

```typescript
// tests/scenarios/presenter/cucumber-real/common.ts
import type { CurrencyPair, Price, ExecutionStatus, Direction } from "@rtc/domain";
import type { RfqQuoteResult } from "@rtc/domain";
import type { PresenterWorld } from "../_world";

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
```

- [ ] **Step 3: Modify `tests/steps/presenter/cucumber-real/common.steps.ts`**

Update the `waitSeconds` step binding to call `this.waitSeconds(n)` instead of `common.waitSeconds(this, n)`. Read the file first to confirm exact context, then edit line 14:

```typescript
// before
function(this: PresenterWorld, n: number) { return common.waitSeconds(this, n); });
// after
function(this: PresenterWorld, n: number) { return this.waitSeconds(n); });
```

- [ ] **Step 4: Typecheck**

Run from repo root:
```bash
pnpm typecheck
```
Expected: all packages green.

- [ ] **Step 5: Run cucumber-real to verify no regression**

Run from `tests/`:
```bash
pnpm test:presenter:cucumber-real
```
Expected: 19/19 scenarios pass. Runtime should be similar to baseline (60–90s).

- [ ] **Step 6: Commit**

```bash
git add tests/support/presenter/cucumber-real/world.ts tests/scenarios/presenter/cucumber-real/common.ts tests/steps/presenter/cucumber-real/common.steps.ts
git commit -m "$(cat <<'EOF'
feat(phase-5b.2): PresenterWorld implements AwaitHelpers; drop common.waitSeconds

Real-time PresenterWorld now delegates awaitFirstWithin + waitSeconds to
RealAwaitHelpers. The step binding for "when {int} seconds elapse" calls
this.waitSeconds(n) on the World instead of the module-level helper.
Existing cucumber-real suite still passes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Refactor `connection.ts` to use `w.awaitFirstWithin`

**Files:**
- Modify: `tests/scenarios/presenter/cucumber-real/connection.ts`

- [ ] **Step 1: Replace the file**

```typescript
// tests/scenarios/presenter/cucumber-real/connection.ts
import { filter } from "rxjs";
import type { ConnectionStatus } from "@rtc/domain";
import type { PresenterWorld } from "../_world";

export async function browserGoesOffline(w: PresenterWorld): Promise<void> {
  w.ctx.connectionEvents$.next({ type: "browserOffline" });
}

export async function browserComesBackOnline(w: PresenterWorld): Promise<void> {
  w.ctx.connectionEvents$.next({ type: "browserOnline" });
}

export async function expectStatusEqualsWithin(
  w: PresenterWorld, status: ConnectionStatus, seconds: number,
): Promise<void> {
  await w.awaitFirstWithin(
    w.ctx.app.presenters.connection.status$.pipe(filter((s) => s === status)),
    seconds * 1000,
  );
}

export async function expectStatusNotEqualsWithin(
  w: PresenterWorld, status: ConnectionStatus, seconds: number,
): Promise<void> {
  await w.awaitFirstWithin(
    w.ctx.app.presenters.connection.status$.pipe(filter((s) => s !== status)),
    seconds * 1000,
  );
}

export async function noopAssertConnectionUiPresent(_w: PresenterWorld): Promise<void> {
  // "the connection status footer is visible" / "the connection overlay text matches /offline/i":
  // these reference UI elements that don't exist at presenter level. The underlying truth
  // (status$ stream is alive) is verified implicitly by other steps in the same scenario.
}
```

Note the import changes: drop `firstValueFrom, timeout` from rxjs (keep `filter`); switch the `PresenterWorld` import to `../_world`.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: green.

- [ ] **Step 3: Run cucumber-real**

```bash
cd tests && pnpm test:presenter:cucumber-real
```
Expected: 19/19 pass.

- [ ] **Step 4: Commit**

```bash
git add tests/scenarios/presenter/cucumber-real/connection.ts
git commit -m "refactor(phase-5b.2): connection scenarios use w.awaitFirstWithin

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Refactor `fxLiveRates.ts` to use `w.awaitFirstWithin`

**Files:**
- Modify: `tests/scenarios/presenter/cucumber-real/fxLiveRates.ts`

- [ ] **Step 1: Replace the file**

```typescript
// tests/scenarios/presenter/cucumber-real/fxLiveRates.ts
import { firstValueFrom } from "rxjs";
import type { PresenterWorld } from "../_world";

export async function expectPriceTileVisibleWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const pairs = await firstValueFrom(w.ctx.app.presenters.currencyPairs.pairs$);
  if (pairs.length === 0) throw new Error("no currency pairs available");
  const pair = pairs[0]!;
  const price = await w.awaitFirstWithin(
    w.ctx.app.presenters.priceStream.price$(pair),
    seconds * 1000,
  );
  w.scratch.firstPair = pair;
  w.scratch.lastPrice = price;
}

export async function expectAtLeastNVisibleTilesWithin(
  w: PresenterWorld, n: number, seconds: number,
): Promise<void> {
  const pairs = await w.awaitFirstWithin(
    w.ctx.app.presenters.currencyPairs.pairs$,
    seconds * 1000,
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
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured yet");
  const current = await w.awaitFirstWithin(
    w.ctx.app.presenters.priceStream.price$(pair),
    2000,
  );
  if (!Number.isFinite(current.mid)) {
    throw new Error(`first tile mid is not a finite number, got: ${current.mid}`);
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

Notes:
- Three call sites switched from `firstValueFrom(...pipe(timeout(...)))` to `w.awaitFirstWithin(..., ms)`.
- Three call sites that have no `timeout(...)` stayed as `firstValueFrom(...)` — these read sync-on-subscribe sources (cached `pairs$` or `price$` after history is hot).
- Dropped `timeout` import from rxjs.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Run cucumber-real**

```bash
cd tests && pnpm test:presenter:cucumber-real
```
Expected: 19/19 pass.

- [ ] **Step 4: Commit**

```bash
git add tests/scenarios/presenter/cucumber-real/fxLiveRates.ts
git commit -m "refactor(phase-5b.2): fxLiveRates scenarios use w.awaitFirstWithin

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Refactor `fxTrading.ts` to use `w.awaitFirstWithin`

**Files:**
- Modify: `tests/scenarios/presenter/cucumber-real/fxTrading.ts`

- [ ] **Step 1: Replace the file**

```typescript
// tests/scenarios/presenter/cucumber-real/fxTrading.ts
//
// NOTE: Direction and ExecutionStatus are `const enum` types in @rtc/domain.
// With verbatimModuleSyntax + isolatedModules, ambient const enums cannot be
// accessed as values from a different package. We import them as types only
// and cast their string literals to the correct type via `as unknown as`.
import { firstValueFrom } from "rxjs";
import type { Direction, ExecutionStatus } from "@rtc/domain";
import type { PresenterWorld } from "../_world";

const DIR_BUY = "Buy" as unknown as Direction;
const DIR_SELL = "Sell" as unknown as Direction;

const ES_DONE = "Done" as unknown as ExecutionStatus;
const ES_REJECTED = "Rejected" as unknown as ExecutionStatus;
const ES_CREDIT_EXCEEDED = "CreditExceeded" as unknown as ExecutionStatus;
const ES_TIMEOUT = "Timeout" as unknown as ExecutionStatus;

async function executeOnFirstPair(
  w: PresenterWorld,
  direction: Direction,
  notional: number,
): Promise<{ status: ExecutionStatus; notional: number }> {
  const pair =
    w.scratch.firstPair ??
    (await firstValueFrom(w.ctx.app.presenters.currencyPairs.pairs$))[0]!;
  w.scratch.firstPair = pair;
  const price = await firstValueFrom(
    w.ctx.app.presenters.priceStream.price$(pair),
  );
  const result = await w.awaitFirstWithin(
    w.ctx.app.presenters.execution.execute({ pair, direction, price, notional }),
    5000,
  );
  return { status: result.status, notional: result.trade.notional };
}

export async function executeBuyOnFirstTile(w: PresenterWorld): Promise<void> {
  const r = await executeOnFirstPair(w, DIR_BUY, 1_000_000);
  w.scratch.lastTradeStatus = r.status;
  w.scratch.lastTradeDirection = DIR_BUY;
  w.scratch.lastTradeNotional = r.notional;
  w.scratch.observedTradeCount += 1;
}

export async function executeSellOnFirstTile(w: PresenterWorld): Promise<void> {
  const r = await executeOnFirstPair(w, DIR_SELL, 1_000_000);
  w.scratch.lastTradeStatus = r.status;
  w.scratch.lastTradeDirection = DIR_SELL;
  w.scratch.lastTradeNotional = r.notional;
  w.scratch.observedTradeCount += 1;
}

export async function executeBuyWithNotional(
  w: PresenterWorld,
  notional: number,
): Promise<void> {
  const r = await executeOnFirstPair(w, DIR_BUY, notional);
  w.scratch.lastTradeStatus = r.status;
  w.scratch.lastTradeDirection = DIR_BUY;
  w.scratch.lastTradeNotional = r.notional;
  w.scratch.observedTradeCount += 1;
}

const UI_PATTERN_TO_STATUSES: Array<{
  test: (p: RegExp) => boolean;
  statuses: ExecutionStatus[];
}> = [
  {
    test: (p) => /Executing|You Bought|You Sold|Bought|Sold/i.test(p.source),
    statuses: [ES_DONE],
  },
  {
    test: (p) => /rejected/i.test(p.source),
    statuses: [ES_REJECTED],
  },
  {
    test: (p) => /Credit limit/i.test(p.source),
    statuses: [ES_CREDIT_EXCEEDED],
  },
  {
    test: (p) => /timed out/i.test(p.source),
    statuses: [ES_TIMEOUT],
  },
];

export async function expectTradeConfirmationMatchesOneOf(
  w: PresenterWorld,
  patterns: RegExp[],
): Promise<void> {
  const status = w.scratch.lastTradeStatus;
  if (!status) throw new Error("no trade status captured");
  const accepted = new Set<ExecutionStatus>();
  for (const p of patterns) {
    for (const rule of UI_PATTERN_TO_STATUSES) {
      if (rule.test(p)) for (const s of rule.statuses) accepted.add(s);
    }
    if (p.test(status as unknown as string)) accepted.add(status);
  }
  if (!accepted.has(status)) {
    throw new Error(
      `presenter status "${status as unknown as string}" not in accepted set [${[...accepted].map((s) => s as unknown as string).join(", ")}] ` +
        `(from UI patterns ${patterns.map(String).join(", ")})`,
    );
  }
}

export async function buyNTimesWithDismissals(
  w: PresenterWorld,
  n: number,
): Promise<void> {
  const pairs = await firstValueFrom(
    w.ctx.app.presenters.currencyPairs.pairs$,
  );
  const gbpjpy = pairs.find((p) => p.symbol === "GBPJPY") ?? pairs[0]!;

  for (let i = 0; i < n; i++) {
    const price = await firstValueFrom(
      w.ctx.app.presenters.priceStream.price$(gbpjpy),
    );
    const result = await w.awaitFirstWithin(
      w.ctx.app.presenters.execution.execute({ pair: gbpjpy, direction: DIR_BUY, price, notional: 1_000_000 }),
      5000,
    );
    if ((result.status as unknown as string) === "Rejected") {
      w.scratch.rejectedSeen = true;
    }
    w.scratch.observedTradeCount += 1;
  }
}

export async function expectAtLeastOneRejection(
  w: PresenterWorld,
): Promise<void> {
  if (!w.scratch.rejectedSeen)
    throw new Error("no rejected trade observed across N attempts");
}

export async function dismissTradeConfirmation(
  _w: PresenterWorld,
): Promise<void> {
  // UI-only: at presenter level the confirmation observable completes after one
  // emission. No action needed.
}

export async function expectTradeConfirmationHides(
  _w: PresenterWorld,
): Promise<void> {
  // UI-only counterpart to "dismiss".
}

export async function expectTradeNotionalEquals(
  w: PresenterWorld,
  expected: number,
): Promise<void> {
  if (w.scratch.lastTradeNotional !== expected) {
    throw new Error(
      `trade notional ${w.scratch.lastTradeNotional} != expected ${expected}`,
    );
  }
}
```

Notes:
- Two call sites switched (the two `execute(...).pipe(timeout(5000))` patterns inside `executeOnFirstPair` and `buyNTimesWithDismissals`).
- Bare `firstValueFrom` for `pairs$` / `price$(pair)` stayed unchanged.
- Dropped `timeout` import from rxjs.
- Switched `PresenterWorld` import to `../_world`.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Run cucumber-real**

```bash
cd tests && pnpm test:presenter:cucumber-real
```
Expected: 19/19 pass.

- [ ] **Step 4: Commit**

```bash
git add tests/scenarios/presenter/cucumber-real/fxTrading.ts
git commit -m "refactor(phase-5b.2): fxTrading scenarios use w.awaitFirstWithin

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Refactor `blotter.ts` to use `w.awaitFirstWithin`

**Files:**
- Modify: `tests/scenarios/presenter/cucumber-real/blotter.ts`

- [ ] **Step 1: Replace the file**

```typescript
// tests/scenarios/presenter/cucumber-real/blotter.ts
import type { PresenterWorld } from "../_world";

export async function expectBlotterVisible(w: PresenterWorld): Promise<void> {
  // At presenter level, blotter is "visible" if trades$ emits (the observable exists).
  // We just assert the observable resolves without error.
  await w.awaitFirstWithin(w.ctx.app.presenters.blotter.trades$, 3000);
}

export async function expectBlotterHasAtLeastNRows(
  w: PresenterWorld,
  n: number,
): Promise<void> {
  const trades = await w.awaitFirstWithin(w.ctx.app.presenters.blotter.trades$, 3000);
  if (trades.length < n) {
    throw new Error(`blotter has ${trades.length} rows, expected at least ${n}`);
  }
}
```

Notes: dropped `firstValueFrom, timeout` import entirely; both call sites switched.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Run cucumber-real**

```bash
cd tests && pnpm test:presenter:cucumber-real
```
Expected: 19/19 pass.

- [ ] **Step 4: Commit**

```bash
git add tests/scenarios/presenter/cucumber-real/blotter.ts
git commit -m "refactor(phase-5b.2): blotter scenarios use w.awaitFirstWithin

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Refactor `analytics.ts`, `fxRfq.ts`, `creditRfq.ts` (single-site files)

**Files:**
- Modify: `tests/scenarios/presenter/cucumber-real/analytics.ts`
- Modify: `tests/scenarios/presenter/cucumber-real/fxRfq.ts`
- Modify: `tests/scenarios/presenter/cucumber-real/creditRfq.ts`

These three files each have exactly one `firstValueFrom(...pipe(timeout(...)))` call site. Refactor them in one batch.

- [ ] **Step 1: Replace `tests/scenarios/presenter/cucumber-real/analytics.ts`**

```typescript
// tests/scenarios/presenter/cucumber-real/analytics.ts
import type { PresenterWorld } from "../_world";

export async function expectAnalyticsVisibleWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const snapshot = await w.awaitFirstWithin(
    w.ctx.app.presenters.analytics.position$,
    seconds * 1000,
  );
  if (!snapshot) throw new Error("analytics emitted but value was falsy");
}

export async function expectAnalyticsEmits(w: PresenterWorld, seconds: number): Promise<void> {
  return expectAnalyticsVisibleWithin(w, seconds);
}
```

- [ ] **Step 2: Replace `tests/scenarios/presenter/cucumber-real/fxRfq.ts`**

```typescript
// tests/scenarios/presenter/cucumber-real/fxRfq.ts
import type { PresenterWorld } from "../_world";

// Notional input is UI state; the simulator's getRfqQuote doesn't gate on notional.
// At presenter level this is recorded but not used for the assertion.
export async function setFirstTileNotional(w: PresenterWorld, _notional: number): Promise<void> {
  // no-op at presenter level
  void w;
}

// Requests an RFQ quote via the presenter layer and stores the result in scratch.
// This is the presenter-layer analogue of clicking the "Initiate RFQ" button in the browser.
export async function requestRfqQuoteOnFirstTile(w: PresenterWorld): Promise<void> {
  const pair = w.scratch.firstPair;
  if (!pair) throw new Error("firstPair not captured (run a 'price tile is visible' step first)");
  const quote = await w.awaitFirstWithin(
    w.ctx.app.presenters.rfqQuote.requestQuote(pair.symbol, pair.pipsPosition),
    5_000,
  );
  w.scratch.rfqQuote = quote;
}

// Asserts that an RFQ quote was already obtained (by requestRfqQuoteOnFirstTile).
export async function expectRfqQuoteArrivesWithin(w: PresenterWorld, _seconds: number): Promise<void> {
  const quote = w.scratch.rfqQuote;
  if (!quote) throw new Error("rfqQuote not captured (run 'requests an RFQ quote' step first)");
  if (!quote.mid) throw new Error("RFQ quote arrived but has no mid price");
}
```

- [ ] **Step 3: Replace `tests/scenarios/presenter/cucumber-real/creditRfq.ts`**

```typescript
// tests/scenarios/presenter/cucumber-real/creditRfq.ts
import type { PresenterWorld } from "../_world";

export async function expectRfqListEmptyWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const rfqs = await w.awaitFirstWithin(
    w.ctx.app.presenters.rfqs.rfqs$,
    seconds * 1000,
  );
  if (rfqs.length !== 0) throw new Error(`expected empty RFQ list, got ${rfqs.length}`);
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Run cucumber-real**

```bash
cd tests && pnpm test:presenter:cucumber-real
```
Expected: 19/19 pass.

- [ ] **Step 6: Commit**

```bash
git add tests/scenarios/presenter/cucumber-real/analytics.ts tests/scenarios/presenter/cucumber-real/fxRfq.ts tests/scenarios/presenter/cucumber-real/creditRfq.ts
git commit -m "refactor(phase-5b.2): single-site files (analytics, fxRfq, creditRfq) use w.awaitFirstWithin

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Create `FakePresenterWorld` + hooks

**Files:**
- Create: `tests/support/presenter/cucumber-fake/world.ts`
- Create: `tests/support/presenter/cucumber-fake/hooks.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p tests/support/presenter/cucumber-fake
```

- [ ] **Step 2: Create `tests/support/presenter/cucumber-fake/world.ts`**

```typescript
// tests/support/presenter/cucumber-fake/world.ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import { firstValueFrom, timeout, type Observable, type Subscription } from "rxjs";
import type { InstalledClock } from "@sinonjs/fake-timers";
import type { PresenterCtx } from "../../../scenarios/presenter/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import type { AwaitHelpers } from "../../../scenarios/presenter/_await";

export class FakePresenterWorld extends World implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  clock!: InstalledClock;
  /** Held for the entire scenario to keep shareReplay streams warm. */
  _statusSub?: Subscription;

  async awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
    const p = firstValueFrom(source$.pipe(timeout(timeoutMs)));
    await this.clock.tickAsync(timeoutMs);
    return p;
  }
  async waitSeconds(n: number): Promise<void> {
    await this.clock.tickAsync(n * 1000);
  }
}
setWorldConstructor(FakePresenterWorld);
```

- [ ] **Step 3: Create `tests/support/presenter/cucumber-fake/hooks.ts`**

```typescript
// tests/support/presenter/cucumber-fake/hooks.ts
import { Before, After } from "@cucumber/cucumber";
import FakeTimers from "@sinonjs/fake-timers";
import { buildPresenterApp } from "../../../scenarios/presenter/_buildApp";
import { newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import type { FakePresenterWorld } from "./world";

Before(function(this: FakePresenterWorld) {
  // Install clock BEFORE buildPresenterApp so simulators capture patched setTimeout/setInterval.
  // Seed virtual now() with real Date.now() to keep simulator historical timestamps sensible.
  this.clock = FakeTimers.install({ now: Date.now(), shouldAdvanceTime: false });
  this.ctx = buildPresenterApp();
  this.scratch = newScratchpad();
  this._statusSub = this.ctx.app.presenters.connection.status$.subscribe();
});

After(function(this: FakePresenterWorld) {
  this._statusSub?.unsubscribe();
  this.clock.uninstall();
});
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```
Expected: green. Both new modules compile. (If `@sinonjs/fake-timers` types are missing, install `@types/sinonjs__fake-timers` — but v14 ships with TS types, so this should not be needed. If it is, add `@types/sinonjs__fake-timers` to devDeps in the same commit.)

- [ ] **Step 5: Commit**

```bash
git add tests/support/presenter/cucumber-fake/
git commit -m "$(cat <<'EOF'
feat(phase-5b.2): FakePresenterWorld + fake-timers Before/After hooks

New World class implementing AwaitHelpers via @sinonjs/fake-timers.
awaitFirstWithin starts the firstValueFrom promise then advances virtual
time by timeoutMs. Hooks install/uninstall the clock per scenario.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Create `cucumber-presenter-fake.js` + script + first green run

**Files:**
- Create: `tests/cucumber-presenter-fake.js`
- Modify: `tests/package.json`

- [ ] **Step 1: Create `tests/cucumber-presenter-fake.js`**

```javascript
// tests/cucumber-presenter-fake.js
export default {
  paths: ["specs/**/*.feature"],
  import: [
    "support/presenter/cucumber-fake/**/*.ts",
    "scenarios/presenter/_buildApp.ts",
    "scenarios/presenter/_await.ts",
    "scenarios/presenter/cucumber-real/**/*.ts",
    "steps/presenter/cucumber-real/**/*.ts",
  ],
  tags: "@presenter",
  format: ["progress-bar", "html:reports/cucumber-presenter-fake.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: 0,
};
```

Note: support glob is `cucumber-fake/**/*.ts` (vs `cucumber-real/`); scenarios + steps globs point at `cucumber-real/` (shared).

- [ ] **Step 2: Add `test:presenter:cucumber-fake` script to `tests/package.json`**

Insert after the existing `test:presenter:cucumber-real` script:

```json
"test:presenter:cucumber-fake":      "NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber-presenter-fake.js",
```

The relevant section of `tests/package.json` `scripts` should now contain:

```json
"test:presenter:cucumber-real":      "NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber-presenter-real.js",
"test:presenter:cucumber-fake":      "NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber-presenter-fake.js",
```

- [ ] **Step 3: First green run + record runtime**

Run from `tests/`:

```bash
time pnpm test:presenter:cucumber-fake
```

Expected: 19/19 `@presenter` scenarios pass. Runtime target <1s; acceptance is <5s. **Record the actual `real` time from the `time` output** — it goes into the commit message and Task 11 (STATUS.md).

If the run fails:
- Read the error message carefully. Common causes: a step that needs a tick the helper doesn't deliver (e.g., a scenario chains two waits and the over-tick from the first changes state seen by the second), a simulator constructor that captured the un-patched setTimeout (verify hooks order: `install()` before `buildPresenterApp()`).
- Do NOT add precision-tick logic — that's a follow-up. Instead, report the failing scenario back as DONE_WITH_CONCERNS and we'll triage.

- [ ] **Step 4: Commit**

```bash
git add tests/cucumber-presenter-fake.js tests/package.json
git commit -m "$(cat <<'EOF'
feat(phase-5b.2): cucumber-presenter-fake config + script

Sixth e2e peer. Same 19 @presenter scenarios, fake-timers runtime.
Recorded runtime: <PASTE FROM time OUTPUT>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire 6th peer in `run-all.ts` + add gate 18 in `grep-gates.ts`

**Files:**
- Modify: `tests/scripts/run-all.ts`
- Modify: `tests/scripts/grep-gates.ts`

- [ ] **Step 1: Add 6th peer to `tests/scripts/run-all.ts`**

After the existing `test:presenter:cucumber-real` line (currently line 19), append:

```typescript
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-fake"]);
```

The block should look like:
```typescript
  combinedExit |= await run("pnpm", ["test:e2e:playwright"]);
  combinedExit |= await run("pnpm", ["test:e2e:raw-playwright"]);
  combinedExit |= await run("pnpm", ["test:e2e:cypress"]);
  combinedExit |= await run("pnpm", ["test:e2e:raw-cypress"]);
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-real"]);
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-fake"]);
```

- [ ] **Step 2: Add gate 18 to `tests/scripts/grep-gates.ts`**

Append inside the `GATES` array (after gate 17, before the closing `]`):

```typescript
  {
    name: "18. No rxjs 'timeout' keyword in presenter scenarios (use w.awaitFirstWithin)",
    pattern: '\\btimeout\\b',
    paths: ["scenarios/presenter/cucumber-real/"],
    excludes: ["/node_modules/"],
  },
```

Rationale: in these scenario files, `timeout` is only ever the rxjs operator. If the word appears, someone has reintroduced the bare `firstValueFrom(...pipe(timeout(...)))` pattern that deadlocks under fake timers. The `\btimeout\b` word boundaries catch both `import { ..., timeout } from "rxjs"` and standalone `timeout(...)` calls, but do NOT match identifiers like `timeoutMs` (no word boundary between `t` and `M`).

- [ ] **Step 3: Verify grep-gates pass**

Run from `tests/`:

```bash
pnpm gates
```

Expected: `18/18 gates passed.`

- [ ] **Step 4: Verify run-all passes all 6 peers**

Run from `tests/`:

```bash
pnpm test:e2e
```

Expected: all 6 peers green. This is a long run (~minutes) — be patient.

- [ ] **Step 5: Commit**

```bash
git add tests/scripts/run-all.ts tests/scripts/grep-gates.ts
git commit -m "$(cat <<'EOF'
feat(phase-5b.2): wire fake-time peer in run-all; gate 18 forbids rxjs timeout in presenter scenarios

run-all.ts now runs all 6 peers (4 browser + presenter-real + presenter-fake).
gate 18 forbids the rxjs 'timeout' keyword in scenarios/presenter/cucumber-real/
to prevent reintroducing the bare firstValueFrom(...pipe(timeout(...))) pattern
that deadlocks under fake timers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update `docs/architecture.md` §9.5 + `docs/superpowers/STATUS.md`

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 1: Read `docs/architecture.md` §9.5 to capture exact current wording**

```bash
grep -n "9\.5\|Five-runner\|Five runners\|three binding styles" docs/architecture.md
```

The existing §9.5 (post-5B.1) describes "Five-runner stack" with "three binding styles" and lists presenter-direct binding. We're upgrading to **six runners** and **adding a fourth binding-style row** (cucumber-fake / presenter-direct / virtual time).

- [ ] **Step 2: Edit `docs/architecture.md` §9.5 — bump "Five-runner" → "Six-runner"**

In `docs/architecture.md`, find every occurrence inside §9.5 of "Five-runner stack", "Five runners", "five e2e peers" and update to "Six-runner stack", "Six runners", "six e2e peers". Also update the section's first paragraph count if it cites the number of presenter peers (currently "one presenter peer").

- [ ] **Step 3: Edit `docs/architecture.md` §9.5 — append cucumber-fake row to the runner table**

After the existing presenter-direct row (cucumber-real), add:

```markdown
| Cucumber + Presenter (fake time) | `tests/cucumber-presenter-fake.js` | `@cucumber/cucumber` + `@sinonjs/fake-timers` | presenter-direct binding, virtual time |
```

(Column structure should match the existing table format — adjust to match if the column count differs.)

- [ ] **Step 4: Append a paragraph after the existing "Presenter-direct binding (Phase 5B.1)" paragraph**

```markdown
**Virtual-time binding (Phase 5B.2):** the cucumber-presenter-fake runner reuses the same 19 `@presenter` scenarios as cucumber-presenter-real but runs each under `@sinonjs/fake-timers`. The `FakePresenterWorld` implements the same `AwaitHelpers` interface as the real-time `PresenterWorld`, advancing virtual time inside `awaitFirstWithin` via `clock.tickAsync`. Scenario bodies are shared verbatim. Runtime: <RECORDED RUNTIME> vs ~60–90s for the real-time peer.
```

Substitute `<RECORDED RUNTIME>` with the actual measurement from Task 9.

- [ ] **Step 5: Update `docs/superpowers/STATUS.md` — flip Phase 5B.2 row**

Find the row currently reading:
```
| Phase 5B.2 — Cucumber-JS + fake timers (virtual time) | ⏳ NOT STARTED | (to be written) | — |
```

Replace with:
```
| Phase 5B.2 — Cucumber-JS + fake timers (virtual time) | ✅ DONE | `plans/2026-05-17-phase-5b-2-cucumber-fake-timers.md` | `<FIRST_SHA>..<LAST_SHA>` (11 task commits) + this STATUS update |
```

Run:
```bash
git log --oneline 7ff3c62..HEAD | tail -1   # first SHA in this phase
git log --oneline -1                         # last (this commit will be it)
```
to get `<FIRST_SHA>` (first commit added in this plan, i.e. Task 1's commit) and `<LAST_SHA>` (commit before this STATUS update — i.e. Task 10's commit).

- [ ] **Step 6: Bump STATUS.md "Last updated" to today's date**

Find the "Last updated:" line near the top of `docs/superpowers/STATUS.md` and update to `2026-05-17`.

- [ ] **Step 7: Update STATUS.md scenario count line**

Find the line citing scenario counts (currently along the lines of "48×4 + 19 = 211 e2e scenarios" added during 5B.1). Update to:
```
48×4 + 19×2 = 230 e2e scenarios (4 browser peers × 48 scenarios; 2 presenter peers × 19 scenarios)
```

- [ ] **Step 8: Append Phase 5B.2 follow-ups to STATUS.md**

Append a new follow-ups subsection at the end:

```markdown
## Phase 5B.2 follow-ups (carry into 5B.3+)

1. **Precision-tick mode.** If a future scenario chains time-bounded waits where over-advance matters, switch fake-world `awaitFirstWithin` to a `nextAsync` probe loop (advance to next scheduled timer, check promise state, repeat until promise resolved or deadline reached).
2. **`tests/scenarios/presenter/cucumber-real/` directory rename.** Now consumed by both runners; consider renaming to `shared/` (or splitting `_common/` from runner-specific bits). Defer to a dedicated naming refactor.
3. **5B.3 / 5B.4 should reuse `_await.ts` + `_world.ts`** when adding Vitest runners; install fake-timers per `test()` rather than per scenario.
```

- [ ] **Step 9: Verify typecheck still green**

```bash
pnpm typecheck
```

- [ ] **Step 10: Commit**

```bash
git add docs/architecture.md docs/superpowers/STATUS.md
git commit -m "$(cat <<'EOF'
docs(phase-5b.2): architecture §9.5 (Six-runner stack) + STATUS DONE

Adds virtual-time binding row to the runner stack table, records actual
runtime, flips Phase 5B.2 STATUS to DONE with SHA range, bumps scenario
count to 48×4 + 19×2 = 230, appends 3 follow-ups to carry into 5B.3+.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Acceptance verification (after Task 11)

- [ ] **Verify all 6 peers pass:**
  ```bash
  cd tests && pnpm test:e2e
  ```
  Expected: all 6 peers green; gates 18/18 pass.

- [ ] **Verify typecheck:**
  ```bash
  pnpm typecheck
  ```
  Expected: green across all packages.

- [ ] **Verify cucumber-fake runtime under 5s (target <1s):**
  ```bash
  cd tests && time pnpm test:presenter:cucumber-fake
  ```
  Expected: `real <5s`. Ideally `real <1s`.

- [ ] **Verify no `timeout` keyword in presenter scenarios:**
  ```bash
  grep -rE '\btimeout\b' tests/scenarios/presenter/cucumber-real/
  ```
  Expected: no output (gate 18 catches this; this is a manual cross-check).

- [ ] **Verify STATUS.md reflects DONE:**
  ```bash
  grep "Phase 5B.2" docs/superpowers/STATUS.md
  ```
  Expected: shows ✅ DONE row with SHA range.

Phase 5B.2 is complete when all five verification items pass.
