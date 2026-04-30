# Clean Architecture Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the codebase into alignment with the target architecture documented in `docs/architecture.md` (clean architecture, Dependency Rule, dumb UI, deferred technology commitment), starting with the lowest-risk mechanical refactor: renaming domain "mocks" to "simulators".

**Architecture:** The full alignment is a multi-phase effort. This document contains a *roadmap* of all phases plus a *fully-detailed plan for Phase 1* (the rename). Phases 2–5 will be authored as their own plans when the user is ready, because each is an independent subsystem that produces working software on its own.

**Tech Stack:** TypeScript, pnpm workspaces, Turborepo, Vitest (unit), Playwright (e2e). Phase 1 introduces no new dependencies and changes no behaviour.

---

## Roadmap

This is a survey of the work, in execution order. Each phase produces working software; the codebase is shippable at every commit.

### Phase 1 — Rename domain mocks to simulators (this plan)

Mechanical refactor. Renames `packages/domain/src/mock/` → `packages/domain/src/simulators/`, renames `Mock*` classes to `*Simulator`, and renames `MOCK_INSTRUMENTS` / `MOCK_DEALERS` constants to `INSTRUMENTS_CATALOG` / `DEALERS_CATALOG`. Updates the domain barrel, the client `mock-service-factory.ts`, and the server `service-container.ts`. No behaviour change. All existing tests pass unchanged (only their imports and instance names update).

Why first: contained, mechanical, sets the naming convention before later phases reference simulator types, and acts as a warm-up exercise.

### Phase 2 — Extract Use Cases from React hooks (separate plan)

Move application logic that today lives in React hooks (`detectMovement + calculateSpread` in `usePriceStream`, etc.) into vanilla-TS use case classes inside `@rtc/domain` (or an `@rtc/client/src/app/usecases/` folder, TBD during brainstorming). The use cases take ports in their constructor and return `AsyncIterable<T>` for streams or `Promise<T>` for commands. Hooks keep their signatures; their bodies become thin pass-throughs to the use cases.

Hooks affected (rough survey):
- `fx/hooks/use-price-stream.ts` → `PriceStreamUseCase`
- `fx/hooks/use-execute-trade.ts` → `ExecuteTradeUseCase`
- `fx/hooks/use-currency-pairs.ts` → `ReferenceDataUseCase`
- `fx/hooks/use-price-history.ts` → `PriceHistoryUseCase`
- `blotter/hooks/use-trade-stream.ts` → `TradeBlotterUseCase`
- `analytics/hooks/use-analytics.ts` → `AnalyticsUseCase`
- `credit/hooks/use-rfq-stream.ts` → `WorkflowEventStreamUseCase`
- `credit/hooks/use-create-rfq.ts` → `CreateRfqUseCase` (+ `CancelRfqUseCase`, `AcceptQuoteUseCase`, `PassQuoteUseCase`)
- `credit/hooks/use-instruments.ts` → `InstrumentsUseCase`
- `credit/hooks/use-dealers.ts` → `DealersUseCase`
- `connection/use-connection.ts` → `ConnectionStatusUseCase`

Hooks that are **pure UI state** (no port access, no enrichment) stay as-is: `use-notional`, `use-tile-state`, `use-rfq-state`, `use-stale-detection`, `use-throughput`. These are presentational state machines and belong in the UI layer.

### Phase 3 — Introduce Presenters and the react-rxjs hook bridge (separate plan)

Add `react-rxjs` as a client dependency. For each use case from Phase 2 that produces a stream, wrap it in a presenter that bridges `AsyncIterable<T>` → RxJS `Observable<T>` and applies UI-shaping operators. Generate hooks via `react-rxjs`'s `bind()`. UI components stop importing `useServices()` and instead call the generated hooks. The Application Layer never imports React; the UI Layer never imports `rxjs`.

Includes the **Composition Root**: a single startup function that constructs port adapters, use cases, and presenters before React renders. Retires the `ServiceProvider` React Context.

### Phase 4 — Reorganise `packages/client/src/` into `app/` and `ui/` (separate plan)

Move presenters, use cases, composition root, port adapters, and the WS transport under `packages/client/src/app/`. Move React components and react-rxjs hooks under `packages/client/src/ui/`. Update tsconfig path aliases and all relative imports. Confirm Vite still builds.

### Phase 5 — Test strategy: Gherkin specs and page-object harnesses (separate plan)

Adopt a behavioural-spec test layer in Gherkin (`tests/specs/**/*.feature`). Convert one existing Playwright test into a `.feature` file driven through page objects to validate the layering. Introduce port contract tests parameterised over simulator and `WsReal*Adapter` pairs. Existing project specs (in `docs/`) feed the Gherkin scenarios as a one-time conversion.

---

## Phase 1 — Rename domain mocks to simulators

### Naming rules (used by every task in this phase)

| Old name | New name |
|---|---|
| Directory `packages/domain/src/mock/` | `packages/domain/src/simulators/` |
| File `pricing-engine.ts` | `pricing-simulator.ts` |
| File `execution-engine.ts` | `execution-simulator.ts` |
| File `trade-store.ts` | `trade-store-simulator.ts` |
| File `analytics-engine.ts` | `analytics-simulator.ts` |
| File `credit-rfq-engine.ts` | `credit-rfq-simulator.ts` |
| File `reference-data-mock.ts` | `reference-data-simulator.ts` |
| File `credit-reference-data-mock.ts` | `credit-reference-data-simulator.ts` |
| File `delay.ts` | `delay.ts` (utility, unchanged) |
| Class `MockPricingEngine` | `PricingSimulator` |
| Class `MockExecutionEngine` | `ExecutionSimulator` |
| Class `MockTradeStore` | `TradeStoreSimulator` |
| Class `MockAnalyticsEngine` | `AnalyticsSimulator` |
| Class `MockCreditRfqEngine` | `CreditRfqSimulator` |
| Class `MockReferenceDataService` | `ReferenceDataSimulator` |
| Class `MockInstrumentService` | `InstrumentSimulator` |
| Class `MockDealerService` | `DealerSimulator` |
| Constant `MOCK_INSTRUMENTS` | `INSTRUMENTS_CATALOG` |
| Constant `MOCK_DEALERS` | `DEALERS_CATALOG` |

Type names (`RfqQuoteResult`, `TradeListener`) remain unchanged.

The `*.test.ts` filenames track their source files (e.g. `pricing-engine.test.ts` → `pricing-simulator.test.ts`).

### Verification command (used in every task)

```bash
pnpm build && pnpm typecheck && pnpm test
```

Expected: all packages build, no type errors, all unit tests pass. (The full e2e Playwright suite is run only at the final task, since it is slower and not affected by intermediate states.)

---

### Task 1.0: Baseline verification

**Files:** none modified.

- [ ] **Step 1: Verify clean working tree.**

  Run:
  ```bash
  git status
  ```
  Expected: `nothing to commit, working tree clean`. If not clean, stash or commit before proceeding.

- [ ] **Step 2: Verify the full build, typecheck, and unit suite pass on `main`.**

  Run:
  ```bash
  pnpm build && pnpm typecheck && pnpm test
  ```
  Expected: all four packages (`@rtc/domain`, `@rtc/shared`, `@rtc/client`, `@rtc/server`) build successfully, typecheck passes, all Vitest suites pass (no failures).

- [ ] **Step 3: Verify the e2e suite passes.**

  Run:
  ```bash
  pnpm test:e2e
  ```
  Expected: all Playwright tests pass.

- [ ] **Step 4: Snapshot the current test count.**

  Record the number of tests reported by `pnpm test` (e.g. "Tests: 87 passed"). This number must remain identical at the end of Phase 1 — the rename adds and removes no tests.

---

### Task 1.1: Rename directory `mock/` → `simulators/`

**Files:**
- Move: `packages/domain/src/mock/` → `packages/domain/src/simulators/` (all 16 files inside)
- Modify: `packages/domain/src/index.ts:48` (the re-export of the barrel)

- [ ] **Step 1: Move the directory using `git mv` to preserve history.**

  Run:
  ```bash
  git mv packages/domain/src/mock packages/domain/src/simulators
  ```
  Expected: 16 files moved (8 source + 6 test + index.ts + delay.ts). Directory `mock/` no longer exists.

- [ ] **Step 2: Update the single external import in the domain barrel.**

  Edit `packages/domain/src/index.ts`. Replace the `// Mock Backend` block (lines around 48–62) with:
  ```typescript
  // Simulators (in-memory port implementations)
  export {
    MockReferenceDataService,
    MockPricingEngine,
    MockExecutionEngine,
    MockTradeStore,
    MockAnalyticsEngine,
    MockInstrumentService,
    MockDealerService,
    MockCreditRfqEngine,
    MOCK_INSTRUMENTS,
    MOCK_DEALERS,
  } from "./simulators/index.js";
  export type { RfqQuoteResult, TradeListener } from "./simulators/index.js";
  ```
  (Class names stay `Mock*` for now — they are renamed in subsequent tasks.)

- [ ] **Step 3: Verify everything still compiles and tests pass.**

  Run:
  ```bash
  pnpm build && pnpm typecheck && pnpm test
  ```
  Expected: all green. Internal imports inside `simulators/` use relative paths (`./pricing-engine.js` etc.) and continue to resolve.

- [ ] **Step 4: Commit.**

  ```bash
  git add packages/domain/
  git commit -m "Rename packages/domain/src/mock/ to simulators/

Directory rename with git mv to preserve history. Class names and
file basenames are renamed in subsequent commits."
  ```

---

### Task 1.2: Rename `MockPricingEngine` → `PricingSimulator` and file → `pricing-simulator.ts`

**Files:**
- Rename: `packages/domain/src/simulators/pricing-engine.ts` → `pricing-simulator.ts`
- Rename: `packages/domain/src/simulators/pricing-engine.test.ts` → `pricing-simulator.test.ts`
- Modify: `packages/domain/src/simulators/index.ts` (barrel)
- Modify: `packages/domain/src/index.ts` (re-export)
- Modify: `packages/domain/src/simulators/pricing-simulator.ts` (class name)
- Modify: `packages/domain/src/simulators/pricing-simulator.test.ts` (import + instance names)
- Modify: `packages/server/src/services/service-container.ts` (import + field type + instantiation)
- Modify: `packages/client/src/services/mock-service-factory.ts` (import + instantiation)

- [ ] **Step 1: Rename source and test files.**

  Run:
  ```bash
  git mv packages/domain/src/simulators/pricing-engine.ts packages/domain/src/simulators/pricing-simulator.ts
  git mv packages/domain/src/simulators/pricing-engine.test.ts packages/domain/src/simulators/pricing-simulator.test.ts
  ```

- [ ] **Step 2: Rename the class inside `pricing-simulator.ts`.**

  In `packages/domain/src/simulators/pricing-simulator.ts`, change `export class MockPricingEngine` to `export class PricingSimulator`. There is exactly one class declaration; change its name. Leave the type `RfqQuoteResult` and the method bodies untouched.

- [ ] **Step 3: Update the test file.**

  In `packages/domain/src/simulators/pricing-simulator.test.ts`:
  - Update the import: `import { MockPricingEngine } from "./pricing-engine.js"` → `import { PricingSimulator } from "./pricing-simulator.js"`.
  - Replace every occurrence of `MockPricingEngine` (constructor calls, type annotations) with `PricingSimulator`.

- [ ] **Step 4: Update the simulators barrel.**

  In `packages/domain/src/simulators/index.ts`, replace:
  ```typescript
  export { MockPricingEngine } from "./pricing-engine.js";
  export type { RfqQuoteResult } from "./pricing-engine.js";
  ```
  with:
  ```typescript
  export { PricingSimulator } from "./pricing-simulator.js";
  export type { RfqQuoteResult } from "./pricing-simulator.js";
  ```

- [ ] **Step 5: Update the domain barrel re-export.**

  In `packages/domain/src/index.ts`, inside the simulators block, change `MockPricingEngine` to `PricingSimulator`. (Leave the other `Mock*` names — they will be renamed in their own tasks.)

- [ ] **Step 6: Update the server service container.**

  In `packages/server/src/services/service-container.ts`:
  - Change the import line to drop `MockPricingEngine,` and add `PricingSimulator,`.
  - Change the interface field: `readonly pricing: MockPricingEngine;` → `readonly pricing: PricingSimulator;`.
  - Change the instantiation: `const pricing = new MockPricingEngine();` → `const pricing = new PricingSimulator();`.

- [ ] **Step 7: Update the client mock-service-factory.**

  In `packages/client/src/services/mock-service-factory.ts`:
  - In the import block, replace `MockPricingEngine,` with `PricingSimulator,`.
  - In `createMockServices()`, replace `const pricing = new MockPricingEngine();` with `const pricing = new PricingSimulator();`.

- [ ] **Step 8: Verify build, typecheck, and unit tests.**

  Run:
  ```bash
  pnpm build && pnpm typecheck && pnpm test
  ```
  Expected: all green. The test count is unchanged from the baseline.

- [ ] **Step 9: Commit.**

  ```bash
  git add -A
  git commit -m "Rename MockPricingEngine to PricingSimulator"
  ```

---

### Task 1.3: Rename `MockExecutionEngine` → `ExecutionSimulator` and file → `execution-simulator.ts`

**Files:**
- Rename: `packages/domain/src/simulators/execution-engine.ts` → `execution-simulator.ts`
- Rename: `packages/domain/src/simulators/execution-engine.test.ts` → `execution-simulator.test.ts`
- Modify: `packages/domain/src/simulators/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/simulators/execution-simulator.ts` (class name)
- Modify: `packages/domain/src/simulators/execution-simulator.test.ts` (import + instance names)
- Modify: `packages/domain/src/simulators/trade-store.ts` (uses `MockExecutionEngine` as a type/parameter — confirm with grep)
- Modify: `packages/domain/src/simulators/trade-store.test.ts` (likely instantiates execution engine)
- Modify: `packages/server/src/services/service-container.ts`
- Modify: `packages/client/src/services/mock-service-factory.ts`

- [ ] **Step 1: Rename source and test files.**

  ```bash
  git mv packages/domain/src/simulators/execution-engine.ts packages/domain/src/simulators/execution-simulator.ts
  git mv packages/domain/src/simulators/execution-engine.test.ts packages/domain/src/simulators/execution-simulator.test.ts
  ```

- [ ] **Step 2: Rename the class inside `execution-simulator.ts`.**

  Change `export class MockExecutionEngine` to `export class ExecutionSimulator`. Type `TradeListener` is unchanged.

- [ ] **Step 3: Update the test file.**

  In `execution-simulator.test.ts`:
  - Import: `import { MockExecutionEngine } from "./execution-engine.js"` → `import { ExecutionSimulator } from "./execution-simulator.js"`.
  - Replace all `MockExecutionEngine` references with `ExecutionSimulator`.

- [ ] **Step 4: Find every other usage and update.**

  Run:
  ```bash
  grep -rn "MockExecutionEngine\|execution-engine" packages --include="*.ts" --include="*.tsx" | grep -v "/dist/"
  ```
  Expected hits: `simulators/index.ts`, `simulators/trade-store.ts`, `simulators/trade-store.test.ts`, `domain/src/index.ts`, `server/src/services/service-container.ts`, `client/src/services/mock-service-factory.ts`. Update each:
  - In `simulators/index.ts`: replace the export with `export { ExecutionSimulator } from "./execution-simulator.js";` and `export type { TradeListener } from "./execution-simulator.js";`.
  - In `simulators/trade-store.ts`: update both the import path (`./execution-engine.js` → `./execution-simulator.js`) and the type/identifier (`MockExecutionEngine` → `ExecutionSimulator`). Also update the constructor parameter type if it appears.
  - In `simulators/trade-store.test.ts`: update import path and identifier.
  - In `domain/src/index.ts`: replace `MockExecutionEngine` with `ExecutionSimulator` in the simulators export block.
  - In `server/src/services/service-container.ts`: replace import, interface field type, and instantiation.
  - In `client/src/services/mock-service-factory.ts`: replace import and instantiation.

- [ ] **Step 5: Verify build, typecheck, and unit tests.**

  Run:
  ```bash
  pnpm build && pnpm typecheck && pnpm test
  ```
  Expected: all green; test count unchanged.

- [ ] **Step 6: Commit.**

  ```bash
  git add -A
  git commit -m "Rename MockExecutionEngine to ExecutionSimulator"
  ```

---

### Task 1.4: Rename `MockTradeStore` → `TradeStoreSimulator` and file → `trade-store-simulator.ts`

**Files:**
- Rename: `packages/domain/src/simulators/trade-store.ts` → `trade-store-simulator.ts`
- Rename: `packages/domain/src/simulators/trade-store.test.ts` → `trade-store-simulator.test.ts`
- Modify: `packages/domain/src/simulators/trade-store-simulator.ts` (class name)
- Modify: `packages/domain/src/simulators/trade-store-simulator.test.ts` (import + instance names)
- Modify: `packages/domain/src/simulators/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/server/src/services/service-container.ts`
- Modify: `packages/client/src/services/mock-service-factory.ts`

- [ ] **Step 1: Rename files.**

  ```bash
  git mv packages/domain/src/simulators/trade-store.ts packages/domain/src/simulators/trade-store-simulator.ts
  git mv packages/domain/src/simulators/trade-store.test.ts packages/domain/src/simulators/trade-store-simulator.test.ts
  ```

- [ ] **Step 2: Rename the class.**

  In `trade-store-simulator.ts`, change `export class MockTradeStore` to `export class TradeStoreSimulator`.

- [ ] **Step 3: Update the test file.**

  In `trade-store-simulator.test.ts`:
  - Update import path: `./trade-store.js` → `./trade-store-simulator.js`.
  - Replace `MockTradeStore` with `TradeStoreSimulator` everywhere.

- [ ] **Step 4: Find every other usage and update.**

  Run:
  ```bash
  grep -rn "MockTradeStore\|trade-store" packages --include="*.ts" --include="*.tsx" | grep -v "/dist/" | grep -v "trade-store-simulator"
  ```
  Expected hits: `simulators/index.ts`, `domain/src/index.ts`, `server/src/services/service-container.ts`, `client/src/services/mock-service-factory.ts`. Update each:
  - `simulators/index.ts`: `export { TradeStoreSimulator } from "./trade-store-simulator.js";`
  - `domain/src/index.ts`: replace `MockTradeStore` with `TradeStoreSimulator` in simulators export block.
  - `server/src/services/service-container.ts`: import, field type (`readonly blotter: TradeStoreSimulator`), instantiation.
  - `client/src/services/mock-service-factory.ts`: import + instantiation.

- [ ] **Step 5: Verify and commit.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test
  git add -A
  git commit -m "Rename MockTradeStore to TradeStoreSimulator"
  ```
  Expected: all green; test count unchanged.

---

### Task 1.5: Rename `MockAnalyticsEngine` → `AnalyticsSimulator` and file → `analytics-simulator.ts`

**Files:**
- Rename: `packages/domain/src/simulators/analytics-engine.ts` → `analytics-simulator.ts`
- Rename: `packages/domain/src/simulators/analytics-engine.test.ts` → `analytics-simulator.test.ts`
- Modify: `packages/domain/src/simulators/analytics-simulator.ts` (class name)
- Modify: `packages/domain/src/simulators/analytics-simulator.test.ts` (import + identifier)
- Modify: `packages/domain/src/simulators/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/server/src/services/service-container.ts`
- Modify: `packages/client/src/services/mock-service-factory.ts`

- [ ] **Step 1: Rename files.**

  ```bash
  git mv packages/domain/src/simulators/analytics-engine.ts packages/domain/src/simulators/analytics-simulator.ts
  git mv packages/domain/src/simulators/analytics-engine.test.ts packages/domain/src/simulators/analytics-simulator.test.ts
  ```

- [ ] **Step 2: Rename the class inside `analytics-simulator.ts`.**

  Change `export class MockAnalyticsEngine` to `export class AnalyticsSimulator`.

- [ ] **Step 3: Update the test file.**

  In `analytics-simulator.test.ts`:
  - Import path: `./analytics-engine.js` → `./analytics-simulator.js`.
  - Replace `MockAnalyticsEngine` with `AnalyticsSimulator` everywhere.

- [ ] **Step 4: Update consumers.**

  Run:
  ```bash
  grep -rn "MockAnalyticsEngine\|analytics-engine" packages --include="*.ts" --include="*.tsx" | grep -v "/dist/" | grep -v "analytics-simulator"
  ```
  Expected hits: `simulators/index.ts`, `domain/src/index.ts`, `server/src/services/service-container.ts`, `client/src/services/mock-service-factory.ts`. In each:
  - `simulators/index.ts`: `export { AnalyticsSimulator } from "./analytics-simulator.js";`
  - `domain/src/index.ts`: replace `MockAnalyticsEngine` with `AnalyticsSimulator`.
  - `server/src/services/service-container.ts`: import, field type, instantiation.
  - `client/src/services/mock-service-factory.ts`: import + instantiation.

- [ ] **Step 5: Verify and commit.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test
  git add -A
  git commit -m "Rename MockAnalyticsEngine to AnalyticsSimulator"
  ```
  Expected: all green; test count unchanged.

---

### Task 1.6: Rename `MockReferenceDataService` → `ReferenceDataSimulator` and file → `reference-data-simulator.ts`

**Files:**
- Rename: `packages/domain/src/simulators/reference-data-mock.ts` → `reference-data-simulator.ts`
- Rename: `packages/domain/src/simulators/reference-data-mock.test.ts` → `reference-data-simulator.test.ts`
- Modify: `packages/domain/src/simulators/reference-data-simulator.ts` (class name)
- Modify: `packages/domain/src/simulators/reference-data-simulator.test.ts` (import + identifier)
- Modify: `packages/domain/src/simulators/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/server/src/services/service-container.ts`
- Modify: `packages/client/src/services/mock-service-factory.ts`

- [ ] **Step 1: Rename files.**

  ```bash
  git mv packages/domain/src/simulators/reference-data-mock.ts packages/domain/src/simulators/reference-data-simulator.ts
  git mv packages/domain/src/simulators/reference-data-mock.test.ts packages/domain/src/simulators/reference-data-simulator.test.ts
  ```

- [ ] **Step 2: Rename the class.**

  In `reference-data-simulator.ts`, change `export class MockReferenceDataService` to `export class ReferenceDataSimulator`.

- [ ] **Step 3: Update the test file.**

  In `reference-data-simulator.test.ts`:
  - Import path: `./reference-data-mock.js` → `./reference-data-simulator.js`.
  - Replace `MockReferenceDataService` with `ReferenceDataSimulator` everywhere.

- [ ] **Step 4: Update consumers.**

  Run:
  ```bash
  grep -rn "MockReferenceDataService\|reference-data-mock" packages --include="*.ts" --include="*.tsx" | grep -v "/dist/" | grep -v "reference-data-simulator" | grep -v "credit-reference-data"
  ```
  Expected hits: `simulators/index.ts`, `domain/src/index.ts`, `server/src/services/service-container.ts`, `client/src/services/mock-service-factory.ts`. In each:
  - `simulators/index.ts`: `export { ReferenceDataSimulator } from "./reference-data-simulator.js";`
  - `domain/src/index.ts`: replace `MockReferenceDataService` with `ReferenceDataSimulator`.
  - `server/src/services/service-container.ts`: import, field type, instantiation.
  - `client/src/services/mock-service-factory.ts`: import + instantiation.

- [ ] **Step 5: Verify and commit.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test
  git add -A
  git commit -m "Rename MockReferenceDataService to ReferenceDataSimulator"
  ```
  Expected: all green; test count unchanged.

---

### Task 1.7: Rename credit reference data — classes and constants

This file holds `MockInstrumentService`, `MockDealerService`, `MOCK_INSTRUMENTS`, `MOCK_DEALERS`. All four are renamed in one task because they live in the same file and are commonly imported together.

**Files:**
- Rename: `packages/domain/src/simulators/credit-reference-data-mock.ts` → `credit-reference-data-simulator.ts`
- Rename: `packages/domain/src/simulators/credit-reference-data-mock.test.ts` → `credit-reference-data-simulator.test.ts`
- Modify: barrels
- Modify: `packages/domain/src/simulators/credit-rfq-engine.ts` (uses `MOCK_DEALERS` — confirm with grep)
- Modify: `packages/server/src/services/service-container.ts`
- Modify: `packages/client/src/services/mock-service-factory.ts`

- [ ] **Step 1: Rename files.**

  ```bash
  git mv packages/domain/src/simulators/credit-reference-data-mock.ts packages/domain/src/simulators/credit-reference-data-simulator.ts
  git mv packages/domain/src/simulators/credit-reference-data-mock.test.ts packages/domain/src/simulators/credit-reference-data-simulator.test.ts
  ```

- [ ] **Step 2: Rename classes and constants inside `credit-reference-data-simulator.ts`.**

  - `export class MockInstrumentService` → `export class InstrumentSimulator`
  - `export class MockDealerService` → `export class DealerSimulator`
  - `export const MOCK_INSTRUMENTS` → `export const INSTRUMENTS_CATALOG`
  - `export const MOCK_DEALERS` → `export const DEALERS_CATALOG`
  - Update any internal references in this file (e.g. the classes likely close over the constants).

- [ ] **Step 3: Update the test file.**

  In `credit-reference-data-simulator.test.ts`:
  - Import path: `./credit-reference-data-mock.js` → `./credit-reference-data-simulator.js`.
  - Replace `MockInstrumentService` → `InstrumentSimulator`, `MockDealerService` → `DealerSimulator`, `MOCK_INSTRUMENTS` → `INSTRUMENTS_CATALOG`, `MOCK_DEALERS` → `DEALERS_CATALOG` throughout.

- [ ] **Step 4: Update credit-rfq-engine.**

  In `packages/domain/src/simulators/credit-rfq-engine.ts`:
  - Update import path: `./credit-reference-data-mock.js` → `./credit-reference-data-simulator.js`.
  - Replace `MOCK_DEALERS` with `DEALERS_CATALOG` (and any other renamed identifier this file imports).

- [ ] **Step 5: Update the simulators barrel.**

  In `packages/domain/src/simulators/index.ts`, replace the credit-reference-data export line with:
  ```typescript
  export {
    InstrumentSimulator,
    DealerSimulator,
    INSTRUMENTS_CATALOG,
    DEALERS_CATALOG,
  } from "./credit-reference-data-simulator.js";
  ```

- [ ] **Step 6: Update the domain barrel re-export.**

  In `packages/domain/src/index.ts`, inside the simulators block, replace `MockInstrumentService, MockDealerService, MOCK_INSTRUMENTS, MOCK_DEALERS` with `InstrumentSimulator, DealerSimulator, INSTRUMENTS_CATALOG, DEALERS_CATALOG`.

- [ ] **Step 7: Update the server service container.**

  In `packages/server/src/services/service-container.ts`:
  - Replace imports: `MockInstrumentService`, `MockDealerService`, `MOCK_DEALERS` → `InstrumentSimulator`, `DealerSimulator`, `DEALERS_CATALOG`.
  - Field types: `instruments: InstrumentSimulator`, `dealers: DealerSimulator`.
  - Instantiations: `new InstrumentSimulator()`, `new DealerSimulator()`, `new MockCreditRfqEngine(DEALERS_CATALOG)` (the engine rename is Task 1.8 — leave `MockCreditRfqEngine` for now and only update its constant argument).

- [ ] **Step 8: Update the client mock-service-factory.**

  In `packages/client/src/services/mock-service-factory.ts`:
  - Replace imports: `MockInstrumentService`, `MockDealerService`, `MOCK_DEALERS` → `InstrumentSimulator`, `DealerSimulator`, `DEALERS_CATALOG`.
  - Instantiations: `new InstrumentSimulator()`, `new DealerSimulator()`, and the workflow `new MockCreditRfqEngine(DEALERS_CATALOG)`.

- [ ] **Step 9: Verify and commit.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test
  git add -A
  git commit -m "Rename credit reference data simulators and constants

MockInstrumentService -> InstrumentSimulator
MockDealerService -> DealerSimulator
MOCK_INSTRUMENTS -> INSTRUMENTS_CATALOG
MOCK_DEALERS -> DEALERS_CATALOG"
  ```
  Expected: all green; test count unchanged.

---

### Task 1.8: Rename `MockCreditRfqEngine` → `CreditRfqSimulator` and file → `credit-rfq-simulator.ts`

**Files:**
- Rename: `packages/domain/src/simulators/credit-rfq-engine.ts` → `credit-rfq-simulator.ts`
- Rename: `packages/domain/src/simulators/credit-rfq-engine.test.ts` → `credit-rfq-simulator.test.ts` *(only if a test file exists — see Step 0)*
- Modify: `packages/domain/src/simulators/credit-rfq-simulator.ts` (class name)
- Modify: `packages/domain/src/simulators/credit-rfq-simulator.test.ts` (import + identifier — if it exists)
- Modify: `packages/domain/src/simulators/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/server/src/services/service-container.ts`
- Modify: `packages/client/src/services/mock-service-factory.ts`

- [ ] **Step 0: Confirm whether a test file exists.**

  Run:
  ```bash
  ls packages/domain/src/simulators/credit-rfq-engine*
  ```
  Expected: at least the source file. If a `credit-rfq-engine.test.ts` exists, also rename it. (Today: only the source file exists; the test step is conditional.)

- [ ] **Step 1: Rename source (and test if present).**

  ```bash
  git mv packages/domain/src/simulators/credit-rfq-engine.ts packages/domain/src/simulators/credit-rfq-simulator.ts
  ```
  If a test file exists, also:
  ```bash
  git mv packages/domain/src/simulators/credit-rfq-engine.test.ts packages/domain/src/simulators/credit-rfq-simulator.test.ts
  ```

- [ ] **Step 2: Rename the class.**

  In `credit-rfq-simulator.ts`, change `export class MockCreditRfqEngine` to `export class CreditRfqSimulator`.

- [ ] **Step 3: Update consumers.**

  Run:
  ```bash
  grep -rn "MockCreditRfqEngine\|credit-rfq-engine" packages --include="*.ts" --include="*.tsx" | grep -v "/dist/" | grep -v "credit-rfq-simulator"
  ```
  Expected hits: `simulators/index.ts`, `domain/src/index.ts`, `server/src/services/service-container.ts`, `client/src/services/mock-service-factory.ts`. In each:
  - `simulators/index.ts`: `export { CreditRfqSimulator } from "./credit-rfq-simulator.js";`
  - `domain/src/index.ts`: replace `MockCreditRfqEngine` with `CreditRfqSimulator`.
  - `server/src/services/service-container.ts`: import, field type (`workflow: CreditRfqSimulator`), instantiation (`new CreditRfqSimulator(DEALERS_CATALOG)`).
  - `client/src/services/mock-service-factory.ts`: import + instantiation.

- [ ] **Step 4: Verify and commit.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test
  git add -A
  git commit -m "Rename MockCreditRfqEngine to CreditRfqSimulator"
  ```
  Expected: all green; test count unchanged.

---

### Task 1.9: Sweep — verify no `Mock*` or `MOCK_*` identifiers remain in source

This is a safety net. Phase 1 should leave zero `Mock` references in domain/server/client source code. (The word "mock" may legitimately appear in test fixture names or comments — this sweep targets identifiers.)

**Files:** none modified unless leftovers are found.

- [ ] **Step 1: Grep for residual class names.**

  Run:
  ```bash
  grep -rn "Mock\(Pricing\|Execution\|Trade\|Analytics\|CreditRfq\|Reference\|Instrument\|Dealer\)" packages --include="*.ts" --include="*.tsx" | grep -v "/dist/"
  ```
  Expected: **no output**. If any line is reported, fix it — replace with the corresponding `*Simulator` name.

- [ ] **Step 2: Grep for residual constant names.**

  Run:
  ```bash
  grep -rn "MOCK_INSTRUMENTS\|MOCK_DEALERS" packages --include="*.ts" --include="*.tsx" | grep -v "/dist/"
  ```
  Expected: **no output**. If any line is reported, replace with `INSTRUMENTS_CATALOG` / `DEALERS_CATALOG`.

- [ ] **Step 3: Grep for residual file paths in import strings.**

  Run:
  ```bash
  grep -rn "from \"\./.*-engine\|from \"\./.*-mock\"" packages --include="*.ts" --include="*.tsx" | grep -v "/dist/"
  ```
  Expected: **no output**. (Imports should now reference `*-simulator.js`.)

- [ ] **Step 4: Confirm `mock-service-factory.ts` is the only "mock" name in client.**

  Run:
  ```bash
  grep -rn "mock" packages/client/src --include="*.ts" --include="*.tsx"
  ```
  Expected: hits limited to the file `mock-service-factory.ts` (filename + its imports/exports of `createMockServices` / `Services` type) and any test fixture comments. The factory file itself is renamed in Phase 3 when the Composition Root replaces it. Do **not** rename it in Phase 1.

- [ ] **Step 5: If any leftovers were fixed, run verification and commit.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test
  git add -A
  git commit -m "Sweep up residual Mock identifiers from rename phase"
  ```
  Expected: all green; test count unchanged. If no leftovers were found, skip the commit.

---

### Task 1.10: Final verification — full suite including e2e

**Files:** none modified.

- [ ] **Step 1: Run unit and e2e suites.**

  Run:
  ```bash
  pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e
  ```
  Expected: all packages build, typecheck passes, all unit tests pass, all Playwright e2e tests pass. Test count from Task 1.0 baseline is preserved.

- [ ] **Step 2: Confirm clean working tree.**

  Run:
  ```bash
  git status
  ```
  Expected: `nothing to commit, working tree clean`.

- [ ] **Step 3: Inspect the commit log for Phase 1.**

  Run:
  ```bash
  git log --oneline main..HEAD
  ```
  Expected: 7–9 commits, one per rename task plus the directory move (and possibly a sweep commit). All messages start with "Rename" or "Sweep".

- [ ] **Step 4: Update `docs/architecture.md` §11 to remove the "(today: `mock/`)" caveat.**

  In `docs/architecture.md`, find the row in the Key Files Reference table:
  ```
  | **Simulators** | `packages/domain/src/simulators/*.ts` (today: `mock/`) | In-memory port impls |
  ```
  Replace with:
  ```
  | **Simulators** | `packages/domain/src/simulators/*.ts` | In-memory port impls |
  ```

- [ ] **Step 5: Commit the doc update.**

  ```bash
  git add docs/architecture.md
  git commit -m "Drop today: mock/ caveat from architecture.md after rename"
  ```

- [ ] **Step 6: Phase 1 complete. Report.**

  Output to user: number of commits, total test count (must match baseline), and a one-line summary. Do not push without explicit user instruction.

---

## Out of scope for this plan

- Extracting use cases from React hooks (Phase 2 — separate plan).
- Introducing presenters and the react-rxjs hook bridge (Phase 3 — separate plan).
- Composition Root and retiring `ServiceProvider` Context (also Phase 3).
- Reorganising `packages/client/src/` into `app/` and `ui/` subtrees (Phase 4).
- Gherkin specs and page-object harnesses (Phase 5).
- Renaming `mock-service-factory.ts` to `composition.ts` — this happens in Phase 3 when the Composition Root replaces it, not now.
- Any change in behaviour, dependency, or test count.

## Next steps after Phase 1

When the user is ready, brainstorm Phase 2 (Use Cases) and write its plan. The Phase 2 plan will:
- pick the boundary between domain-side and client-side use cases,
- list each hook + its target use case (from the Roadmap survey above),
- one task per use case extraction, with TDD: write failing use-case test → make it pass → migrate hook to call the use case → existing hook test still passes,
- preserve every existing hook signature so React components are untouched.
