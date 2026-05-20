# Phase 5E — Follow-up Cleanups + STATUS.md Grooming

**Date:** 2026-05-19
**Status:** Spec
**Predecessors:** Phases 5A.2 / 5A.3 / 5A.4 / 5B.1 / 5B.2 / 5B.3 / 5B.4 / 5C / 5D (all DONE)

## Goal

Close every actionable follow-up across phases 5A.2 → 5D that does **not** require its own architectural brainstorm. After 5E, `STATUS.md` should list only the truly architectural items remaining (handled separately as Phases 5F/5G/5H) plus the "defer until symptom" items (Phase 5I — tracked, not scheduled).

## Non-Goals

- Connection lifecycle refactor (5D #1, #3, #4, #5) — defer to Phase 5F (separate brainstorm).
- `WorkflowPortContract` strengthening (5C #1) — defer to Phase 5G (separate brainstorm).
- Step-tree de-duplication (5B.3 #3 / 5B.4 #2) — defer to Phase 5H (separate brainstorm).
- "Defer until symptom" items (5B.1 #1/#2/#3/#5, 5B.2 #1, 5B.4 #3, 5D #6) — leave annotated in STATUS.md; no work this phase.

## Scope

### A. Test-organization mechanicals

A1. **`waitSeconds` relocation** — Move `waitSeconds` from `tests/scenarios/fxLiveRates.ts:65` and `tests/scenarios/cypress/fxLiveRates.ts:74` into `tests/scenarios/common.ts` and `tests/scenarios/cypress/common.ts` respectively. Rationale: `waitSeconds` wraps `ctx.po.workspace.wait` and has no FX-Live-Rates-specific semantics.

   Importers to update (verified by grep, scenario-side only — presenter-side `waitSeconds` is a separate world method and unaffected):
   - Playwright fork: `tests/steps/fxLiveRates.steps.ts:53` (import + call site change `fxLiveRates.waitSeconds` → `common.waitSeconds`), plus raw spec bodies in `tests/raw/playwright/blotter.spec.ts` (6 calls), `fxLiveRates.spec.ts:49`, `fxTrading.spec.ts:45`. These currently import as `import * as fxLiveRates from "../../scenarios/fxLiveRates"`.
   - Cypress fork: `tests/raw/cypress/blotter.spec.ts` (6 calls), `fxLiveRates.spec.ts:56`, `fxTrading.spec.ts:50`. Same `import * as fxLiveRates` shape.
   
   Approach: Add `waitSeconds` export to `common.ts` in each fork. Add import-and-call updates in each importer. Remove `waitSeconds` from `fxLiveRates.ts` in each fork. Note: importers using `import * as fxLiveRates from "..."` need an additional `import * as common from "../../scenarios/common"` and call-site rename — the change is mechanical but touches 8 files.

A2. **`tests/.gitignore` `test-results/` redundancy** — Delete `test-results/` from `tests/.gitignore` (the repo-root `.gitignore:6` already covers it). Defense-in-depth entry is harmless but inconsistent.

A3. **`CypressWorkspace.ts` idiom unification** — Replace the seven `cy.wrap(undefined) as unknown as Promise<void>` returns in `tests/page-objects/cypress/Workspace.ts` with `return <last-cy-chain> as unknown as Promise<void>`. The pattern matches every other Cypress PO (`ThemeToggle.ts`, etc.) — `Workspace.ts` is the lone outlier from Task 10 of Phase 5A.2.

### B. Documentation polish

B1. **§3.3 race-guard rationale durability** — `tests/scenarios/cypress/connection.ts:8-30` already has the rationale inline. Add a one-liner cross-reference to `tests/scenarios/cypress/_chainable.ts` explaining that the `.should()` retry form is load-bearing (switching to `.then()` loses Cypress's auto-retry). Carry-over from Phase 5A.4 follow-up #1.

B2. **`chainable<T>` helper docstring expansion** — `tests/scenarios/cypress/_chainable.ts` comment is brief. Expand to explicitly state: PO contract is `Promise<T>` for Playwright shape, but the Cypress runtime IS a `Chainable<T>` — the cast is the bridge at the §3.3 fork layer. Carry-over from Phase 5A.4 follow-up #3.

### C. Step/factory hygiene

C1. **"at least one trade confirmation matched {}" step rename** — `tests/steps/presenter/cucumber-real/fxTrading.steps.ts:64` discards its `_pattern` argument and unconditionally calls `expectAtLeastOneRejection`. Rename step text to `at least one trade was rejected` (drops the pattern arg) — matches actual behavior.

   Files to update (verified by grep):
   - `tests/specs/fxTrading.feature:51` (the sole feature-file usage)
   - `tests/steps/presenter/cucumber-real/fxTrading.steps.ts:64` (also serves cucumber-fake, which imports cucumber-real's step tree via `cucumber-presenter-fake.js`)
   - `tests/steps/presenter/vitest-fake/fxTrading.steps.ts:57`
   - `tests/presenter-tests/vitest-plain/fxTrading.test.ts:43` is unaffected — it calls `trading.expectAtLeastOneRejection(w)` directly, no Gherkin step text involved.

   Carry-over from Phase 5B.1 follow-up #7.

C2. **`emitQuotedEvent` prune** — Remove `emitQuotedEvent(rfqId, quoteId): Promise<void>` from `WorkflowDriver` (`packages/domain/src/ports/__contracts__/WorkflowPortContract.ts:9`) and its simulator implementation (`packages/domain/src/simulators/CreditRfqSimulator.contract.test.ts:67`). No invariant calls it. (5C #1's strengthening could re-introduce it; that's 5G's call.) Carry-over from Phase 5C follow-up #2.

C3. **`workflowEventQuoted` factory rename** — The factory at `packages/shared/src/__fixtures__/wireFrames.ts:227` emits `type: "quoteCreated"`, not `quoteQuoted`. Rename to `workflowEventQuoteCreated` to match payload. Sole call site to update: `packages/client/src/app/adapters/wsRealWorkflow.contract.test.ts:4` (import) and `:29` (call). Carry-over from Phase 5C follow-up #5.

### D. Adapter hygiene

D1. **`RECONNECT_DELAY_MS` configurable** — Change `packages/client/src/app/adapters/WsAdapter.ts:16` from module-level const `RECONNECT_DELAY_MS = 3_000` to a constructor option (with `3_000` default). Updates the two use sites at lines 71 and 82. No call-site changes needed in `buildDefaultPorts` (current `new WsAdapter(url)` keeps default). Tests can pass smaller values to skip reconnect waits. Carry-over from Phase 5D follow-up #2.

D2. **`cucumber-shim` `isCyElement` guard removal** — Remove the `isCyElement` duck-type check at `tests/support/cypress/cucumber-shim.ts:42-44`. `Cypress.isCy(result)` on the next line (`:45`) handles all relevant cases. Either delete entirely, or replace with a comment explaining what runtime case it was thought to defend. Per Phase 5A.2 follow-up #2, the first branch is not a documented Cypress API and is unreachable in practice. Resolution: delete the dead branch + add a one-line comment above `Cypress.isCy` noting it handles all chainable cases.

D3. **RPC polling explicit timeout** — The ten `while (!ws.hasPendingRpc(...)) await Promise.resolve()` loops in `packages/client/src/app/adapters/wsReal*.test.ts` rely on Vitest's 5s default for safety. Extract a helper:
   ```ts
   async function awaitPendingRpc(
     ws: FakeWsAdapter,
     name: string,
     maxIterations = 1000,
   ): Promise<void> {
     for (let i = 0; i < maxIterations; i++) {
       if (ws.hasPendingRpc(name)) return;
       await Promise.resolve();
     }
     throw new Error(`Expected pending RPC "${name}" but none registered after ${maxIterations} microtask yields`);
   }
   ```
   Place in `packages/client/src/app/adapters/__test__/awaitPendingRpc.ts`. Update all ten call sites. Carry-over from Phase 5C follow-up #4.

### E. New grep gate

E1. **`vitest-fake/setup.ts` barrel completeness gate** — Add gate 24 to `tests/scripts/grep-gates.ts` that counts `*.steps.ts` files in `tests/steps/presenter/vitest-fake/` and matches them against `import "../../../steps/presenter/vitest-fake/<name>.steps"` lines in `tests/support/presenter/vitest-fake/setup.ts`. Fail if counts diverge. Smoke-test by temporarily renaming a step file and verifying the gate trips. Carry-over from Phase 5B.3 follow-up #6.

### F. STRINGS coverage expansion → close as no-op

F1. **STRINGS audit confirms clean** — Audit run during spec writing (`grep` over `tests/page-objects/` for raw copy-as-selector patterns) found no remaining cases beyond what `creditRfq` already covers. The "Enter" string in `LiveRatesTile.ts:79` is a key press, not display text. Update STATUS.md to mark Phase 5A.2 follow-up #3 RESOLVED with audit citation. Carry-over from Phase 5A.2 follow-up #3.

### G. STATUS.md grooming

G1. **Confirm-and-prune** — Walk every "RESOLVED", "note only", "deliberate", or "historical" entry across all phase-follow-up sections in `docs/superpowers/STATUS.md` and either:
   - Delete entries fully RESOLVED (e.g., 5B.1 #6 + 5B.4 #1 already RESOLVED; 5B.4 #4 already RESOLVED).
   - Keep "defer until symptom" entries (they're load-bearing — future contributors need the signal).
   - Keep historical notes (e.g., 5B.3 #4 plan-template drift) as audit trail.
   - For 5A.2 #1, #2, #3 / 5A.3 #1, #2 / 5A.4 #1, #3 / 5B.1 #7 / 5B.3 #6 / 5C #2, #4, #5 / 5D #2 — mark RESOLVED with this phase's SHA range and remove from active follow-up list.

G2. **Add Phase 5E row** to the phases table with status DONE + SHA range.

G3. **Add Phase 5E follow-ups section** if any surface during execution.

## Out of scope (deferred)

- Phase 5F: Connection lifecycle refactor (`WsAdapter.ts` split, `reconnectAttempt` event, double-`gatewayDisconnected` gating, `SimulatorReconnectAdapter`).
- Phase 5G: `WorkflowPortContract` strengthening (require ID round-trips or close as won't-fix).
- Phase 5H: Step-tree de-duplication across the four presenter peers.
- Phase 5I: Defer-until-symptom items (no work; tracked).

## Acceptance criteria

- All 23 grep gates pass + new gate 24 passes.
- 207 unit tests pass.
- All 4 e2e peers (cucumber-playwright, cucumber-cypress, raw-playwright, raw-cypress) pass 48/48.
- All 4 presenter peers (cucumber-real, cucumber-fake, vitest-fake, vitest-plain) pass 19/19.
- STATUS.md follow-up sections shrink: every actionable mechanical item resolved or marked RESOLVED with SHA.
- No new test additions other than the spec-required ones (no over-engineering).

## Notes

- Each item is independent; tasks parallelize within the plan but commit sequentially.
- Estimated ~13 commits.
- No new architectural decisions — all items are mechanical or trivially decidable from existing context.
