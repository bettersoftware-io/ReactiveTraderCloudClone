# Phase 5E — Follow-up Cleanups + STATUS.md Grooming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every actionable follow-up across phases 5A.2 → 5D that does NOT require its own architectural brainstorm; groom STATUS.md so that only the truly-architectural items remain on the active follow-up list.

**Architecture:** No architectural change. Pure cleanup + small ergonomic improvements + one new grep gate.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, Turborepo, Playwright, Cypress, Cucumber-JS. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-19-phase-5e-cleanup-design.md`.

---

## File structure

**New files (2):**

| Path | Role |
|---|---|
| `packages/client/src/app/adapters/__test__/awaitPendingRpc.ts` | Shared `awaitPendingRpc(ws, name, maxIterations?)` helper with explicit timeout error |
| (gate added in-place inside `tests/scripts/grep-gates.ts` — no new file) | n/a |

**Modified files (~22):**

| Path | Change |
|---|---|
| `tests/scenarios/common.ts` | Add `waitSeconds` export (relocated from `fxLiveRates.ts`) |
| `tests/scenarios/cypress/common.ts` | Add `waitSeconds` export (relocated from `cypress/fxLiveRates.ts`) |
| `tests/scenarios/fxLiveRates.ts` | Remove `waitSeconds` |
| `tests/scenarios/cypress/fxLiveRates.ts` | Remove `waitSeconds` |
| `tests/steps/fxLiveRates.steps.ts` | Add `common` import; switch call site |
| `tests/raw/playwright/blotter.spec.ts` | Add `common` import; switch 6 call sites |
| `tests/raw/playwright/fxLiveRates.spec.ts` | Switch 1 call site |
| `tests/raw/playwright/fxTrading.spec.ts` | Switch 1 call site |
| `tests/raw/cypress/blotter.spec.ts` | Add `common` import; switch 6 call sites |
| `tests/raw/cypress/fxLiveRates.spec.ts` | Switch 1 call site |
| `tests/raw/cypress/fxTrading.spec.ts` | Switch 1 call site |
| `tests/.gitignore` | Drop `test-results/` line |
| `tests/page-objects/cypress/Workspace.ts` | Replace 7 `cy.wrap(undefined) as unknown as Promise<void>` with `return <chain> as unknown as Promise<void>` |
| `tests/scenarios/cypress/connection.ts` | Add cross-ref to `_chainable.ts` rationale; `.should()` retry note |
| `tests/scenarios/cypress/_chainable.ts` | Expand docstring per spec §B2 |
| `tests/specs/fxTrading.feature` | Rename step at line 51 |
| `tests/steps/presenter/cucumber-real/fxTrading.steps.ts` | Rename step text at line 64 + drop unused arg |
| `tests/steps/presenter/vitest-fake/fxTrading.steps.ts` | Same rename at line 57 |
| `packages/domain/src/ports/__contracts__/WorkflowPortContract.ts` | Remove `emitQuotedEvent` from `WorkflowDriver` |
| `packages/domain/src/simulators/CreditRfqSimulator.contract.test.ts` | Remove `emitQuotedEvent: async () => …` (line ~67) |
| `packages/shared/src/__fixtures__/wireFrames.ts` | Rename `workflowEventQuoted` → `workflowEventQuoteCreated` |
| `packages/client/src/app/adapters/wsRealWorkflow.contract.test.ts` | Update import + call site for renamed factory |
| `packages/client/src/app/adapters/WsAdapter.ts` | `RECONNECT_DELAY_MS` becomes constructor option with default `3_000` |
| `packages/client/src/app/adapters/WsAdapter.test.ts` | Add test verifying configurable delay |
| `tests/support/cypress/cucumber-shim.ts` | Drop `isCyElement` dead branch (lines 42-44) + leave one-line comment |
| `packages/client/src/app/adapters/wsRealPricing.contract.test.ts` | Switch `while (!ws.hasPendingRpc(…))` to `awaitPendingRpc(…)` |
| `packages/client/src/app/adapters/wsRealPricing.errors.test.ts` | Switch (2 sites) |
| `packages/client/src/app/adapters/wsRealExecution.contract.test.ts` | Switch (1 site) |
| `packages/client/src/app/adapters/wsRealExecution.errors.test.ts` | Switch (1 site) |
| `packages/client/src/app/adapters/wsRealWorkflow.contract.test.ts` | Switch (1 site) |
| `packages/client/src/app/adapters/wsRealWorkflow.errors.test.ts` | Switch (3 sites) |
| `tests/scripts/grep-gates.ts` | Add gate 24 (`vitest-fake/setup.ts` barrel completeness via new `checkVitestFakeBarrelCompleteness()` custom check) |
| `docs/superpowers/STATUS.md` | Prune resolved follow-ups, add Phase 5E row + section |

---

## Task ordering

Tasks are mostly independent. Sequenced so each commits cleanly with all tests passing.

1. **A1: `waitSeconds` relocation** — touches 11 files; do as one atomic move
2. **A2: `tests/.gitignore` line** — trivial
3. **A3: `CypressWorkspace.ts` idiom unification**
4. **B1 + B2: Documentation polish** (combined commit)
5. **C1: Trade-rejection step rename** (feature file + 2 step files)
6. **C2: `emitQuotedEvent` prune**
7. **C3: `workflowEventQuoted` factory rename**
8. **D1: `RECONNECT_DELAY_MS` configurable**
9. **D2: `cucumber-shim` `isCyElement` removal**
10. **D3: RPC polling helper extraction + 10 call-site updates**
11. **E1: Gate 24** (`vitest-fake/setup.ts` barrel completeness)
12. **Full verification pass** — `pnpm build && typecheck && test && test:e2e` + 4 presenter peers + 24 gates
13. **G: STATUS.md grooming** — prune RESOLVED, add Phase 5E row + section (final commit; commit SHA recorded in STATUS itself by next user)

---

## Task 1: A1 — Relocate `waitSeconds` to `scenarios/common.ts`

**Files:**
- Modify: `tests/scenarios/common.ts`
- Modify: `tests/scenarios/cypress/common.ts`
- Modify: `tests/scenarios/fxLiveRates.ts:65-67`
- Modify: `tests/scenarios/cypress/fxLiveRates.ts:74-76`
- Modify: `tests/steps/fxLiveRates.steps.ts:3,53`
- Modify: `tests/raw/playwright/blotter.spec.ts` (header import + 6 call sites)
- Modify: `tests/raw/playwright/fxLiveRates.spec.ts:49`
- Modify: `tests/raw/playwright/fxTrading.spec.ts:45`
- Modify: `tests/raw/cypress/blotter.spec.ts` (header import + 6 call sites)
- Modify: `tests/raw/cypress/fxLiveRates.spec.ts:56`
- Modify: `tests/raw/cypress/fxTrading.spec.ts:50`

- [ ] **Step 1: Read current `waitSeconds` body and the two `common.ts` files**

```bash
sed -n '60,75p' tests/scenarios/fxLiveRates.ts
sed -n '70,80p' tests/scenarios/cypress/fxLiveRates.ts
cat tests/scenarios/common.ts
cat tests/scenarios/cypress/common.ts
```

- [ ] **Step 2: Add `waitSeconds` to `tests/scenarios/common.ts`**

Append exactly (preserving the existing `export ` style of that file):

```ts
export async function waitSeconds(ctx: TestContext, seconds: number): Promise<void> {
  await ctx.po.workspace.wait(seconds * 1_000);
}
```

If `TestContext` is not already imported in `tests/scenarios/common.ts`, add `import type { TestContext } from "../support/testContext";` at the top of the file (matching the import shape in `fxLiveRates.ts`).

- [ ] **Step 3: Add `waitSeconds` to `tests/scenarios/cypress/common.ts`**

```ts
export function waitSeconds(ctx: TestContext, seconds: number): void {
  void ctx.po.workspace.wait(seconds * 1_000);
}
```

Same import-adding rule for `TestContext`.

- [ ] **Step 4: Remove `waitSeconds` from `tests/scenarios/fxLiveRates.ts`**

Delete lines 65-67 (the function body). Verify no other site in this file uses `waitSeconds` internally:

```bash
grep -n "waitSeconds" tests/scenarios/fxLiveRates.ts
```

Expected: no output.

- [ ] **Step 5: Remove `waitSeconds` from `tests/scenarios/cypress/fxLiveRates.ts`**

Delete lines 74-76. Same verification:

```bash
grep -n "waitSeconds" tests/scenarios/cypress/fxLiveRates.ts
```

Expected: no output.

- [ ] **Step 6: Update Playwright-side cucumber step file**

`tests/steps/fxLiveRates.steps.ts` — at the top of the file, add (alongside the existing fxLiveRates namespace import):

```ts
import * as common from "../scenarios/common";
```

Then change line 53 from `fxLiveRates.waitSeconds(this.ctx, n)` to `common.waitSeconds(this.ctx, n)`.

- [ ] **Step 7: Update Playwright raw spec bodies**

For each of `tests/raw/playwright/blotter.spec.ts`, `tests/raw/playwright/fxLiveRates.spec.ts`, `tests/raw/playwright/fxTrading.spec.ts`:
- Add (alongside existing `import * as fxLiveRates from "..."`):
  ```ts
  import * as common from "../../scenarios/common";
  ```
- Replace every `fxLiveRates.waitSeconds(` call with `common.waitSeconds(`.

After:
```bash
grep -rn "fxLiveRates.waitSeconds" tests/raw/playwright/
```
Expected: no output.

- [ ] **Step 8: Update Cypress raw spec bodies**

Same surgery for `tests/raw/cypress/blotter.spec.ts`, `tests/raw/cypress/fxLiveRates.spec.ts`, `tests/raw/cypress/fxTrading.spec.ts`. Import path: `"../../scenarios/cypress/common"`.

```bash
grep -rn "fxLiveRates.waitSeconds" tests/raw/cypress/
```
Expected: no output.

- [ ] **Step 9: Final grep sanity**

```bash
grep -rn "waitSeconds" tests/scenarios/ tests/raw/ tests/steps/
```
Expected: `waitSeconds` appears only in `tests/scenarios/common.ts`, `tests/scenarios/cypress/common.ts`, and the call sites in steps/raw — never inside `fxLiveRates.ts`.

- [ ] **Step 10: Build + typecheck + run unit tests + all 4 e2e peers**

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm --filter @rtc/tests test:e2e
```
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add tests/scenarios/common.ts tests/scenarios/cypress/common.ts \
  tests/scenarios/fxLiveRates.ts tests/scenarios/cypress/fxLiveRates.ts \
  tests/steps/fxLiveRates.steps.ts \
  tests/raw/playwright/blotter.spec.ts tests/raw/playwright/fxLiveRates.spec.ts tests/raw/playwright/fxTrading.spec.ts \
  tests/raw/cypress/blotter.spec.ts tests/raw/cypress/fxLiveRates.spec.ts tests/raw/cypress/fxTrading.spec.ts
git commit -m "refactor(tests): move waitSeconds from fxLiveRates to common"
```

---

## Task 2: A2 — Drop redundant `tests/.gitignore` `test-results/` line

**Files:**
- Modify: `tests/.gitignore:5`

- [ ] **Step 1: Verify redundancy still holds**

```bash
grep -n "test-results" .gitignore tests/.gitignore
```
Expected: hit in both files. If the repo-root entry is gone, STOP and re-evaluate.

- [ ] **Step 2: Delete the line in `tests/.gitignore`**

Remove the line `test-results/`. Final content of `tests/.gitignore` becomes:

```
node_modules/
reports/
cypress/screenshots/
cypress/videos/
```

- [ ] **Step 3: Verify pristine git ignore behaviour**

Create a sentinel directory and confirm it stays ignored:

```bash
mkdir -p tests/test-results && touch tests/test-results/_sentinel
git status --short tests/test-results/
```
Expected: no output (file ignored by the repo-root rule).

Clean up: `rm -rf tests/test-results`.

- [ ] **Step 4: Commit**

```bash
git add tests/.gitignore
git commit -m "chore(tests): drop redundant test-results/ from tests/.gitignore"
```

---

## Task 3: A3 — Unify `CypressWorkspace.ts` `Promise<void>` idiom

**Files:**
- Modify: `tests/page-objects/cypress/Workspace.ts`

- [ ] **Step 1: Read full file to confirm 7 outlier methods**

```bash
cat tests/page-objects/cypress/Workspace.ts
```

Confirm methods `open`, `openFx`, `openCredit`, `openAdmin`, `clickTab`, `reload`, `setOffline`, `wait` all use the pattern:
```ts
cy.<command>(...);
return cy.wrap(undefined) as unknown as Promise<void>;
```
(Eight methods total; the canonical `cy.wrap(undefined)` site is the post-command anchor.)

- [ ] **Step 2: Convert each method to the chain-cast idiom**

Replace e.g.:
```ts
open(): Promise<void> {
  cy.visit("/");
  return cy.wrap(undefined) as unknown as Promise<void>;
}
```
with:
```ts
open(): Promise<void> {
  return cy.visit("/") as unknown as Promise<void>;
}
```

For two-command methods like `openFx`:
```ts
openFx(): Promise<void> {
  cy.visit("/");
  return cy.get(`[data-testid="${TESTIDS.shell.tab("fx")}"]`).click() as unknown as Promise<void>;
}
```
(The first `cy.visit` is queued and ordered by Cypress; the returned chain is the final command.)

For `setOffline`:
```ts
setOffline(offline: boolean): Promise<void> {
  return cy.window({ log: false }).then((win) => {
    win.dispatchEvent(new win.Event(offline ? "offline" : "online"));
  }) as unknown as Promise<void>;
}
```

For `wait`:
```ts
wait(ms: number): Promise<void> {
  return cy.wait(ms) as unknown as Promise<void>;
}
```

- [ ] **Step 3: Verify no `cy.wrap(undefined)` remains in `Workspace.ts`**

```bash
grep -n "cy.wrap(undefined)" tests/page-objects/cypress/Workspace.ts
```
Expected: no output.

- [ ] **Step 4: Run cypress e2e (both peers)**

```bash
pnpm --filter @rtc/tests test:e2e:cypress
pnpm --filter @rtc/tests test:e2e:raw-cypress
```
Expected: 48/48 in both.

- [ ] **Step 5: Commit**

```bash
git add tests/page-objects/cypress/Workspace.ts
git commit -m "refactor(tests): unify CypressWorkspace return-chain idiom"
```

---

## Task 4: B1 + B2 — Documentation polish (race-guard cross-ref + chainable docstring)

**Files:**
- Modify: `tests/scenarios/cypress/connection.ts`
- Modify: `tests/scenarios/cypress/_chainable.ts`

- [ ] **Step 1: Expand `_chainable.ts` docstring**

Replace the header block in `tests/scenarios/cypress/_chainable.ts` with:

```ts
// tests/scenarios/cypress/_chainable.ts
//
// The PO contract methods are typed as Promise<T> to share signatures with the
// Playwright-shaped tests/scenarios/*.ts layer. But the Cypress runtime returns
// a Cypress.Chainable<T>, not a real Promise — the two are intentionally
// incompatible: a Chainable enqueues onto cy.* whereas a native Promise resolves
// on the microtask queue. The PO impls return chainables cast as Promises so
// shared step bodies type-check, and this helper bridges the cast back to the
// chainable nature inside the forked tests/scenarios/cypress/ layer. Use it
// when you need .then(cb) to receive the subject and order via the cy queue.
//
// Note: .should(cb) is load-bearing for retry — switching to .then(cb) drops
// Cypress's auto-retry semantics. See setBrowserOffline + the should() call
// sites in connection.ts for why this matters.
//
// See Phase 5A.4 spec §3.3 for the fork rationale.
export const chainable = <T>(p: Promise<T>): Cypress.Chainable<T> =>
  p as unknown as Cypress.Chainable<T>;
```

- [ ] **Step 2: Add cross-ref in `connection.ts`**

In `tests/scenarios/cypress/connection.ts`, just before the existing inline comment block in `setBrowserOffline` (line ~9), add one line:

```ts
  // The .should() retry below (and in expectConnectionStatusFooterShows) is
  // load-bearing — switching to .then() loses Cypress's auto-retry. See
  // _chainable.ts for the broader rationale.
```

Leave the existing rationale block intact.

- [ ] **Step 3: Verify cypress e2e still green**

```bash
pnpm --filter @rtc/tests test:e2e:cypress
pnpm --filter @rtc/tests test:e2e:raw-cypress
```

- [ ] **Step 4: Commit**

```bash
git add tests/scenarios/cypress/connection.ts tests/scenarios/cypress/_chainable.ts
git commit -m "docs(tests): document chainable cast + .should() retry rationale"
```

---

## Task 5: C1 — Rename "trade confirmation matched" step

**Files:**
- Modify: `tests/specs/fxTrading.feature:51`
- Modify: `tests/steps/presenter/cucumber-real/fxTrading.steps.ts:64-66`
- Modify: `tests/steps/presenter/vitest-fake/fxTrading.steps.ts:57-59`

- [ ] **Step 1: Rename in feature file**

In `tests/specs/fxTrading.feature`, change line 51 from:
```
    Then at least one trade confirmation matched /rejected/i
```
to:
```
    Then at least one trade was rejected
```

- [ ] **Step 2: Rename in cucumber-real step file**

In `tests/steps/presenter/cucumber-real/fxTrading.steps.ts`, around lines 64-66, replace:
```ts
Then(
  "at least one trade confirmation matched {}",
  function(this: PresenterWorld, _pattern: string) {
    return trading.expectAtLeastOneRejection(this);
  },
);
```
with:
```ts
Then(
  "at least one trade was rejected",
  function(this: PresenterWorld) {
    return trading.expectAtLeastOneRejection(this);
  },
);
```

- [ ] **Step 3: Rename in vitest-fake step file**

In `tests/steps/presenter/vitest-fake/fxTrading.steps.ts`, around lines 57-59, the same rename. Drop the `_pattern` argument.

- [ ] **Step 4: Verify no stale references**

```bash
grep -rn "trade confirmation matched" tests/ specs/
```
Expected: no output.

- [ ] **Step 5: Run all 4 presenter peers**

```bash
pnpm --filter @rtc/tests test:presenter:cucumber-real \
  && pnpm --filter @rtc/tests test:presenter:cucumber-fake \
  && pnpm --filter @rtc/tests test:presenter:vitest-fake \
  && pnpm --filter @rtc/tests test:presenter:vitest-plain
```
Expected: 19/19 each.

- [ ] **Step 6: Commit**

```bash
git add tests/specs/fxTrading.feature \
  tests/steps/presenter/cucumber-real/fxTrading.steps.ts \
  tests/steps/presenter/vitest-fake/fxTrading.steps.ts
git commit -m "refactor(tests): rename 'trade confirmation matched' step to 'trade was rejected'"
```

---

## Task 6: C2 — Prune `emitQuotedEvent` from `WorkflowDriver`

**Files:**
- Modify: `packages/domain/src/ports/__contracts__/WorkflowPortContract.ts:9`
- Modify: `packages/domain/src/simulators/CreditRfqSimulator.contract.test.ts:67`

- [ ] **Step 1: Confirm no invariant calls `emitQuotedEvent`**

```bash
grep -rn "emitQuotedEvent" packages/domain/src
```
Expected: only the declaration in `WorkflowPortContract.ts:9` and the impl in `CreditRfqSimulator.contract.test.ts:67-69`. No `it()`-body invocation.

- [ ] **Step 2: Remove declaration**

In `packages/domain/src/ports/__contracts__/WorkflowPortContract.ts`, delete line 9:
```ts
  emitQuotedEvent(rfqId: number, quoteId: number): Promise<void>;
```

- [ ] **Step 3: Remove simulator impl**

In `packages/domain/src/simulators/CreditRfqSimulator.contract.test.ts`, delete the `emitQuotedEvent: async () => { ... }` block (around lines 67-69 — verify context with `sed -n '60,75p' packages/domain/src/simulators/CreditRfqSimulator.contract.test.ts` first).

- [ ] **Step 4: Build + typecheck + run domain tests**

```bash
pnpm --filter @rtc/domain build && pnpm --filter @rtc/domain typecheck && pnpm --filter @rtc/domain test
```
Expected: all green. If WsReal-side simulator also implements `emitQuotedEvent`, the typecheck pass at the consumer side will fail and we will discover it here. (Per spec §C2, the implementer should follow the type error to the WsReal-side `WorkflowHarness` factory and remove that property too.)

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/ports/__contracts__/WorkflowPortContract.ts \
  packages/domain/src/simulators/CreditRfqSimulator.contract.test.ts
# Add any additional WsReal-side files surfaced by the typecheck error here.
git commit -m "refactor(domain): drop unused emitQuotedEvent from WorkflowDriver"
```

---

## Task 7: C3 — Rename `workflowEventQuoted` → `workflowEventQuoteCreated`

**Files:**
- Modify: `packages/shared/src/__fixtures__/wireFrames.ts:227`
- Modify: `packages/client/src/app/adapters/wsRealWorkflow.contract.test.ts:4,29`

- [ ] **Step 1: Inspect the factory**

```bash
sed -n '225,240p' packages/shared/src/__fixtures__/wireFrames.ts
```
Confirm it emits `type: "quoteCreated"`.

- [ ] **Step 2: Rename in declaration**

In `packages/shared/src/__fixtures__/wireFrames.ts`, rename the const at line 227 from `workflowEventQuoted` to `workflowEventQuoteCreated`. Keep the same body.

- [ ] **Step 3: Update the sole consumer**

In `packages/client/src/app/adapters/wsRealWorkflow.contract.test.ts`:
- Line 4: change `workflowEventQuoted,` to `workflowEventQuoteCreated,`.
- Line 29: change `workflowEventQuoted(rfqId, quoteId)` to `workflowEventQuoteCreated(rfqId, quoteId)`.

- [ ] **Step 4: Verify no stale references**

```bash
grep -rn "workflowEventQuoted\b" packages/ tests/
```
Expected: no output.

- [ ] **Step 5: Build, typecheck, test**

```bash
pnpm --filter @rtc/shared build && pnpm --filter @rtc/client build && pnpm typecheck && pnpm --filter @rtc/client test
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/__fixtures__/wireFrames.ts packages/client/src/app/adapters/wsRealWorkflow.contract.test.ts
git commit -m "refactor(shared): rename workflowEventQuoted to workflowEventQuoteCreated"
```

---

## Task 8: D1 — `RECONNECT_DELAY_MS` becomes constructor option

**Files:**
- Modify: `packages/client/src/app/adapters/WsAdapter.ts:16,71,82`
- Modify: `packages/client/src/app/adapters/WsAdapter.test.ts`

- [ ] **Step 1: Read current constructor signature + the two use sites**

```bash
sed -n '15,90p' packages/client/src/app/adapters/WsAdapter.ts
```

- [ ] **Step 2: Add the failing test**

In `packages/client/src/app/adapters/WsAdapter.test.ts`, add a new test using fake timers (the file already has `vi.useFakeTimers()` in `beforeEach`):

```ts
it("uses the configured reconnectDelayMs for scheduling reconnect", () => {
  const ws = new WsAdapter("ws://localhost:1234", { reconnectDelayMs: 50 });
  const mockWs = (globalThis as { __lastMockWs?: MockWebSocket }).__lastMockWs!;
  mockWs.simulateClose();
  // 49ms after close: still not reconnecting (no new MockWebSocket constructed)
  vi.advanceTimersByTime(49);
  const beforeCount = MockWebSocket.constructed;
  // 1ms more crosses the 50ms boundary
  vi.advanceTimersByTime(1);
  expect(MockWebSocket.constructed).toBe(beforeCount + 1);
  ws.dispose();
});
```

(The test should reuse the existing `MockWebSocket` infrastructure already established in `WsAdapter.test.ts`. If `MockWebSocket.constructed` isn't exposed, add a `static constructed = 0` counter incremented in the constructor — minimal, additive.)

- [ ] **Step 3: Run the new test to see it fail**

```bash
pnpm --filter @rtc/client test -- WsAdapter
```
Expected: FAIL — current `WsAdapter` constructor only takes `url: string`.

- [ ] **Step 4: Implement**

In `packages/client/src/app/adapters/WsAdapter.ts`:

Replace the const declaration at line 16:
```ts
const RECONNECT_DELAY_MS = 3_000;
```
with:
```ts
const DEFAULT_RECONNECT_DELAY_MS = 3_000;

export interface WsAdapterOptions {
  reconnectDelayMs?: number;
}
```

Update constructor (find the existing `constructor(url: string)` declaration in the file):
```ts
constructor(
  private readonly url: string,
  options: WsAdapterOptions = {},
) {
  this.reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  this.connect();
}

private readonly reconnectDelayMs: number;
```

Replace the two use sites (currently `RECONNECT_DELAY_MS`) at lines 71 and 82 with `this.reconnectDelayMs`.

- [ ] **Step 5: Re-run the test**

```bash
pnpm --filter @rtc/client test -- WsAdapter
```
Expected: PASS, and all existing WsAdapter tests still pass (default 3000ms preserved).

- [ ] **Step 6: Verify no other call site passes options**

```bash
grep -rn "new WsAdapter(" packages/
```
Expected: every call passes a single string arg — they still work because `options` defaults to `{}`.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/app/adapters/WsAdapter.ts packages/client/src/app/adapters/WsAdapter.test.ts
git commit -m "feat(client): make WsAdapter reconnect delay configurable"
```

---

## Task 9: D2 — Drop `isCyElement` dead branch from `cucumber-shim`

**Files:**
- Modify: `tests/support/cypress/cucumber-shim.ts:42-44`

- [ ] **Step 1: Read context**

```bash
sed -n '30,55p' tests/support/cypress/cucumber-shim.ts
```

- [ ] **Step 2: Delete the dead branch**

Replace lines 42-44 (the `isCyElement` block) with a single explanatory line. The before:
```ts
    if (result != null && typeof (result as { isCyElement?: unknown }).isCyElement !== "undefined") {
      return result;
    }
    if (Cypress.isCy(result)) {
      return result;
    }
```
The after:
```ts
    // Cypress.isCy() returns true for any value in the Cypress chainable hierarchy
    // (Chainable, $, jQuery wrappers), so this single check covers every shape a
    // step handler can plausibly return that the preprocessor expects.
    if (Cypress.isCy(result)) {
      return result;
    }
```

- [ ] **Step 3: Run cypress e2e**

```bash
pnpm --filter @rtc/tests test:e2e:cypress
```
Expected: 48/48.

- [ ] **Step 4: Commit**

```bash
git add tests/support/cypress/cucumber-shim.ts
git commit -m "refactor(tests): remove unreachable isCyElement branch from cucumber-shim"
```

---

## Task 10: D3 — Extract `awaitPendingRpc` helper

**Files:**
- Create: `packages/client/src/app/adapters/__test__/awaitPendingRpc.ts`
- Modify: `packages/client/src/app/adapters/wsRealPricing.contract.test.ts` (2 sites)
- Modify: `packages/client/src/app/adapters/wsRealPricing.errors.test.ts` (2 sites)
- Modify: `packages/client/src/app/adapters/wsRealExecution.contract.test.ts` (1 site)
- Modify: `packages/client/src/app/adapters/wsRealExecution.errors.test.ts` (1 site)
- Modify: `packages/client/src/app/adapters/wsRealWorkflow.contract.test.ts` (1 site)
- Modify: `packages/client/src/app/adapters/wsRealWorkflow.errors.test.ts` (3 sites)

- [ ] **Step 1: Create helper**

Write `packages/client/src/app/adapters/__test__/awaitPendingRpc.ts`:

```ts
import type { FakeWsAdapter } from "./FakeWsAdapter";

/**
 * Yield to microtasks until `ws.hasPendingRpc(name)` is true, with an
 * explicit upper bound on iterations to surface stuck tests with a clear
 * error message rather than relying on Vitest's 5s default timeout.
 */
export async function awaitPendingRpc(
  ws: FakeWsAdapter,
  name: string,
  maxIterations = 1000,
): Promise<void> {
  for (let i = 0; i < maxIterations; i++) {
    if (ws.hasPendingRpc(name)) return;
    await Promise.resolve();
  }
  throw new Error(
    `Expected pending RPC "${name}" but none registered after ${maxIterations} microtask yields`,
  );
}
```

- [ ] **Step 2: Update each call site**

For each of the 10 sites (verified by `grep -rn 'while (!ws.hasPendingRpc' packages/client/`), replace the loop with the helper call. Example:

Before:
```ts
while (!ws.hasPendingRpc("rpc.executeTrade")) {
  await Promise.resolve();
}
```
After:
```ts
await awaitPendingRpc(ws, "rpc.executeTrade");
```

Add `import { awaitPendingRpc } from "./__test__/awaitPendingRpc";` to each test file.

- [ ] **Step 3: Verify no stale loops remain**

```bash
grep -rn "while (!ws.hasPendingRpc" packages/client/
```
Expected: no output.

- [ ] **Step 4: Run client tests**

```bash
pnpm --filter @rtc/client test
```
Expected: all client tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/app/adapters/__test__/awaitPendingRpc.ts \
  packages/client/src/app/adapters/wsReal*.test.ts
git commit -m "refactor(client): extract awaitPendingRpc helper with explicit iteration cap"
```

---

## Task 11: E1 — Add gate 24 (vitest-fake barrel completeness)

**Files:**
- Modify: `tests/scripts/grep-gates.ts`

- [ ] **Step 1: Read current gate file structure**

```bash
sed -n '15,75p' tests/scripts/grep-gates.ts
```
Confirm helper functions live above the `GATES` array. The pattern for adding a new gate with `customCheck` is already established (gates 21 and 22).

- [ ] **Step 2: Add helper above `GATES`**

Insert after `checkPresenterDescribePrefix()` (around line 73):

```ts
function checkVitestFakeBarrelCompleteness(): string[] {
  const failures: string[] = [];
  const stepsDir = "tests/steps/presenter/vitest-fake";
  const setupPath = "tests/support/presenter/vitest-fake/setup.ts";
  if (!existsSync(stepsDir) || !existsSync(setupPath)) return failures;
  // List *.steps.ts files (exclude non-step helpers if any appear).
  const stepFiles = require("node:fs")
    .readdirSync(stepsDir)
    .filter((f: string) => f.endsWith(".steps.ts"));
  const setupSrc = readFileSync(setupPath, "utf8");
  for (const f of stepFiles) {
    const stem = f.replace(/\.ts$/, "");
    const importMarker = `steps/presenter/vitest-fake/${stem}"`;
    if (!setupSrc.includes(importMarker)) {
      failures.push(
        `${setupPath}: missing import for ${stepsDir}/${f} (expected literal containing ${JSON.stringify(importMarker)})`,
      );
    }
  }
  return failures;
}
```

(Note: `readFileSync` is already imported at the top of the file; if not, the diff should add it.)

Caveat: the `require("node:fs")` mid-function is permissible because the helper imports already use a mixed style — but if the file uses pure ESM imports only, the implementer should hoist `readdirSync` to a top-level import. Inspect the existing imports and pick the consistent shape.

- [ ] **Step 3: Append gate 24 to the `GATES` array**

After gate 23, add:

```ts
{
  name: "24. vitest-fake/setup.ts imports every step file in tests/steps/presenter/vitest-fake/",
  pattern: "",
  paths: [],
  customCheck: checkVitestFakeBarrelCompleteness,
},
```

- [ ] **Step 4: Smoke test the gate fails when expected**

Temporarily rename `tests/support/presenter/vitest-fake/setup.ts` to make the gate trip on a missing import. Easier: comment out one of the existing imports (e.g., `connection.steps`) in `setup.ts`. Run:

```bash
pnpm --filter @rtc/tests grep-gates
```
Expected: gate 24 FAILS with a precise message naming the missing step file.

Then UN-comment the import and re-run:
```bash
pnpm --filter @rtc/tests grep-gates
```
Expected: gate 24 PASSES (along with all other gates).

- [ ] **Step 5: Commit**

```bash
git add tests/scripts/grep-gates.ts
git commit -m "feat(tests): add grep gate 24 for vitest-fake barrel completeness"
```

---

## Task 12: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full matrix**

```bash
pnpm build && pnpm typecheck && pnpm test \
  && pnpm --filter @rtc/tests test:e2e \
  && pnpm --filter @rtc/tests test:presenter:cucumber-real \
  && pnpm --filter @rtc/tests test:presenter:cucumber-fake \
  && pnpm --filter @rtc/tests test:presenter:vitest-fake \
  && pnpm --filter @rtc/tests test:presenter:vitest-plain \
  && pnpm --filter @rtc/tests grep-gates
```

Expected:
- 207 unit tests pass (137 domain + 65 client + 5 server) — note: the C2 prune may reduce these by 0 (helper not invoked) or add a small delta. The Phase 5E STATUS row should record the actual final count.
- 48/48 in each of cucumber-playwright, cucumber-cypress, raw-playwright, raw-cypress.
- 19/19 in each of cucumber-real, cucumber-fake, vitest-fake, vitest-plain.
- 24/24 grep gates pass.

- [ ] **Step 2: If anything fails, STOP and report which task introduced the regression**

The phase's commits are linear; bisect into the offending one.

---

## Task 13: G — STATUS.md grooming + Phase 5E row

**Files:**
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 1: Add Phase 5E row to the phases table**

Insert after the Phase 5D row (`| Phase 5D — Real gateway-events adapter ... |`):

```
| Phase 5E — Follow-up cleanups + STATUS.md grooming | ✅ DONE | `plans/2026-05-20-phase-5e-cleanup.md` | `<first-sha>..<last-sha>` (12 commits, +STATUS) |
```

(The SHA range will be filled in after this task's commit.)

- [ ] **Step 2: Prune RESOLVED follow-ups**

Walk each section. Mark the following items as ✅ RESOLVED with this phase's SHA range, and either compact (one line — "RESOLVED in Phase 5E, see plan") or delete. Use judgment per item:

- 5A.2 #1 (CypressWorkspace idiom) — RESOLVED, can delete
- 5A.2 #2 (cucumber-shim isCyElement guard) — RESOLVED, can delete
- 5A.2 #3 (STRINGS coverage) — RESOLVED (audit confirmed clean — no additional copy strings to extract), can delete
- 5A.3 #1 / 5A.4 #4 (waitSeconds mis-location) — RESOLVED, can delete
- 5A.3 #2 (tests/.gitignore line) — RESOLVED, can delete
- 5A.4 #1 (race-guard rationale + .should retry note) — RESOLVED, can delete
- 5A.4 #3 (chainable<T> docstring) — RESOLVED, can delete
- 5B.1 #7 ("at least one trade confirmation matched {}" step) — RESOLVED, can delete
- 5B.3 #6 (vitest-fake barrel completeness) — RESOLVED with gate 24, can delete
- 5C #2 (emitQuotedEvent prune) — RESOLVED, can delete
- 5C #4 (RPC polling explicit timeout) — RESOLVED with awaitPendingRpc helper, can delete
- 5C #5 (workflowEventQuoted naming) — RESOLVED with rename to workflowEventQuoteCreated, can delete
- 5D #2 (RECONNECT_DELAY_MS configurable) — RESOLVED, can delete

KEEP (defer-until-symptom or architectural):
- 5A.2 § all other prior items (nothing left after the three are pruned)
- 5A.4 #2 (timing-layer note) — historical, keep
- 5A.4 #5 (spec history) — preference, keep as-is
- 5B.1 #1, #2, #3, #5 — defer until symptom
- 5B.2 §all — historical notes
- 5B.3 #1, #2, #3, #4, #5 — historical or architectural
- 5B.4 #2 — architectural (Phase 5H candidate)
- 5B.4 #3 — defer until symptom
- 5B.4 #5 — deliberate, keep
- 5C #1 (WorkflowPortContract strengthening) — Phase 5G
- 5C #3 (supportsLiveAdd capability flag) — defer
- 5D #1, #3, #4, #5 — Phase 5F
- 5D #6 — defer until 3rd impl

- [ ] **Step 3: Add `Phase 5E follow-ups` section if any surface**

If implementation surfaced any new follow-ups, list them after `Phase 5D follow-ups (carry into 5E+)` as `Phase 5E follow-ups (carry into 5F+)`. Otherwise add a one-line note: "_No new follow-ups; Phase 5E pruned 13 items from previous follow-up sections._"

- [ ] **Step 4: Update test-count line**

Line 14 of STATUS.md may need updating if any tests were added/removed. If C2 removed an `emitQuotedEvent` impl that supported a test, recount. Otherwise leave as-is.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/STATUS.md
git commit -m "docs(status): record Phase 5E DONE + prune resolved follow-ups"
```

- [ ] **Step 6: Edit STATUS.md again with the SHA range**

After the commit lands, find the actual first-commit SHA of this phase (the A1 task commit) and the last (this commit). Edit the Phase 5E table row's SHA range column, then amend:

```bash
git log --oneline | head -15
# Identify start..end SHAs
git add docs/superpowers/STATUS.md
git commit --amend --no-edit
```

(`--amend` is acceptable here because the commit was created seconds ago and not pushed.)

---

## Acceptance checks (run before declaring done)

- [ ] All 13 tasks above marked complete
- [ ] `pnpm test` passes (207 expected unit tests, or whatever the new total becomes after C2)
- [ ] All 4 e2e peers green (48/48 each)
- [ ] All 4 presenter peers green (19/19 each)
- [ ] All 24 grep gates pass
- [ ] `STATUS.md` Phase 5E row present with SHA range
- [ ] No new files outside the plan's File Structure section
- [ ] No call sites of `fxLiveRates.waitSeconds`, `cy.wrap(undefined)` inside `Workspace.ts`, `workflowEventQuoted`, `emitQuotedEvent`, `RECONNECT_DELAY_MS` (module-level), or `while (!ws.hasPendingRpc` remain

---

## Notes for the implementer

- Each task commits independently. If a task introduces a regression, revert that commit only.
- Tasks 1, 8, 10, 11 are the largest in terms of LOC touched; the rest are 1-3 file changes.
- Task 6 (C2 `emitQuotedEvent` prune) may surface a WsReal-side `WorkflowHarness` factory that also implements the removed method — follow the typecheck error and remove there too.
- Task 8 (D1 `RECONNECT_DELAY_MS`) requires the `MockWebSocket` infrastructure from Phase 5D's `WsAdapter.test.ts`. Inspect that file first; if `MockWebSocket.constructed` counter is not yet present, add it (additive change, minimal).
- Task 11 (E1 gate 24) — if the existing `grep-gates.ts` uses pure ESM imports (no `require`), hoist `readdirSync` to a top-level import; do not introduce a `require()` in a pure-ESM file.
- Do not bundle multiple tasks into one commit. Reviewers will want to bisect.
