# Phase 2.5: Rename files to camelCase / PascalCase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename every source file in the repo from kebab-case to camelCase (default) or PascalCase (class-per-file), so file naming is consistent with the convention agreed in the Phase 3 brainstorm.

**Architecture:** Mechanical rename in batches by package area. Each task: `git mv` a logical group of files, run sed sweeps to fix imports across the repo, run typecheck + tests, commit. No behaviour changes.

**Tech stack:** `git mv`, BSD `sed -i ''`, ripgrep, pnpm, vitest, tsc.

## Naming rule (final, decided in brainstorm)

- **PascalCase:** files whose primary export is a single class or single React component (e.g. `PricingSimulator.ts`, `LiveRatesPanel.tsx`, `ServiceProvider.tsx`).
- **camelCase:** everything else — interface/type modules, hooks, function modules, constants, files with multiple classes, providers that export several functions (e.g. `pricingPort.ts`, `useTradeStream.ts`, `creditReferenceDataSimulator.ts`).
- **Folders:** camelCase (e.g. `liveRates/`, `newRfq/`, `columnFilter/`).
- **Test files** match their source casing: `PricingSimulator.test.ts`, `notional.test.ts`.
- Single-word files already conforming stay (`quote.ts`, `rfq.ts`, `delay.ts`, `position.ts`, `tokens.ts`, `index.ts`).
- E2E specs are camelCase (no class-per-file): `creditRfq.spec.ts`.

## Filesystem caveat

Repo is on case-insensitive APFS (`git config core.ignorecase = true`).

- **Renames with structural change** (kebab → camel/Pascal): single `git mv` works because the new name differs in more than just case.
- **Pure case-only renames** (e.g. `tile.tsx` → `Tile.tsx`, `footer.tsx` → `Footer.tsx`): use the two-step workaround:
  ```bash
  git mv tile.tsx _tile.tsx
  git mv _tile.tsx Tile.tsx
  ```

## Sed sweep pattern

After renaming a batch of files, fix every relative import that references their old basenames. The codebase uses double-quoted imports throughout. Two patterns cover both extension styles (domain/shared use NodeNext `.js`; client uses extensionless):

```bash
# Replace import paths ending in the old basename, with or without .js
find packages/<package> -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/old-basename"|/newBasename"|g' \
    -e 's|/old-basename\.js"|/newBasename.js"|g' \
    {} +
```

**Scope sed to the package being renamed**, not the whole repo. Cross-package imports use the named package (`@rtc/domain`, `@rtc/shared`, etc.), so renaming a file inside one package only requires rewriting relative-import strings within that same package. Limiting the find scope also prevents accidental collisions when the same kebab string exists in two packages with different target casings (e.g. `currency-filter.ts` in domain → `currencyFilter.ts` vs `currency-filter.tsx` in client → `CurrencyFilter.tsx`, renamed in different tasks).

For each task below, the implementer should run one such `find packages/<scope> … -exec sed` invocation listing every `(old-basename, newBasename)` pair as `-e` flags. The pattern's leading `/` ensures we only match path segments (not random text containing the kebab string).

## Verification commands

After each task, run in this order:

```bash
pnpm -w typecheck     # all four packages compile
pnpm -w test          # all unit/integration tests pass (currently 106 tests)
```

Do NOT run `pnpm test:e2e` per task — Playwright is slow. Run it once at the end (Task 16).

## Commit message format

Use:
```
refactor(<scope>): rename <area> files to <camelCase|PascalCase>
```

Examples:
- `refactor(domain): rename ports to camelCase`
- `refactor(client): rename live-rates folder to liveRates and tile components to PascalCase`

---

## Tasks

### Task 0: Establish baseline

**Files:** none (verification only).

- [ ] **Step 1: Confirm working tree is clean**

Run: `git status`

Expected: clean (or only `.claude/settings.local.json`, which is gitignored).

- [ ] **Step 2: Run typecheck and tests**

Run: `pnpm -w typecheck && pnpm -w test`

Expected: all packages typecheck; all 106 unit tests pass (12 domain test files + 1 server test file).

- [ ] **Step 3: Record baseline test count**

Capture the test runner's "Test Files X passed | Tests Y passed" line. Subsequent tasks must keep these numbers identical.

- [ ] **Step 4: Note SHA**

Run: `git rev-parse HEAD`

Record the SHA so a `git diff <baseline>..HEAD` at the end of Task 16 shows the full Phase 2.5 surface area.

No commit.

---

### Task 1: Rename @rtc/domain — ports

All 8 port files are interface-only modules → camelCase.

**Renames:**

| Old path | New path |
|---|---|
| `packages/domain/src/ports/analytics-port.ts` | `packages/domain/src/ports/analyticsPort.ts` |
| `packages/domain/src/ports/blotter-port.ts` | `packages/domain/src/ports/blotterPort.ts` |
| `packages/domain/src/ports/dealer-port.ts` | `packages/domain/src/ports/dealerPort.ts` |
| `packages/domain/src/ports/execution-port.ts` | `packages/domain/src/ports/executionPort.ts` |
| `packages/domain/src/ports/instrument-port.ts` | `packages/domain/src/ports/instrumentPort.ts` |
| `packages/domain/src/ports/pricing-port.ts` | `packages/domain/src/ports/pricingPort.ts` |
| `packages/domain/src/ports/reference-data-port.ts` | `packages/domain/src/ports/referenceDataPort.ts` |
| `packages/domain/src/ports/workflow-port.ts` | `packages/domain/src/ports/workflowPort.ts` |

- [ ] **Step 1: Move all 8 port files**

```bash
cd packages/domain/src/ports
git mv analytics-port.ts analyticsPort.ts
git mv blotter-port.ts blotterPort.ts
git mv dealer-port.ts dealerPort.ts
git mv execution-port.ts executionPort.ts
git mv instrument-port.ts instrumentPort.ts
git mv pricing-port.ts pricingPort.ts
git mv reference-data-port.ts referenceDataPort.ts
git mv workflow-port.ts workflowPort.ts
cd -
```

- [ ] **Step 2: Update import paths repo-wide**

```bash
find packages/domain -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/analytics-port"|/analyticsPort"|g'  -e 's|/analytics-port\.js"|/analyticsPort.js"|g' \
    -e 's|/blotter-port"|/blotterPort"|g'  -e 's|/blotter-port\.js"|/blotterPort.js"|g' \
    -e 's|/dealer-port"|/dealerPort"|g'  -e 's|/dealer-port\.js"|/dealerPort.js"|g' \
    -e 's|/execution-port"|/executionPort"|g'  -e 's|/execution-port\.js"|/executionPort.js"|g' \
    -e 's|/instrument-port"|/instrumentPort"|g'  -e 's|/instrument-port\.js"|/instrumentPort.js"|g' \
    -e 's|/pricing-port"|/pricingPort"|g'  -e 's|/pricing-port\.js"|/pricingPort.js"|g' \
    -e 's|/reference-data-port"|/referenceDataPort"|g'  -e 's|/reference-data-port\.js"|/referenceDataPort.js"|g' \
    -e 's|/workflow-port"|/workflowPort"|g'  -e 's|/workflow-port\.js"|/workflowPort.js"|g' \
    {} +
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -w typecheck`

Expected: PASS in all four packages. If it fails, the error tells you which import was missed — add the missing pattern to the sed sweep and re-run.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm -w test`

Expected: same 106 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "refactor(domain): rename ports to camelCase"
```

---

### Task 2: Rename @rtc/domain — simulators

7 source files. Single-class files → PascalCase. `credit-reference-data-simulator.ts` exports two classes plus two constants → camelCase. `delay.ts` already camelCase, untouched. `index.ts` keeps its name but its contents must be updated.

**Renames:**

| Old path | New path | Reason |
|---|---|---|
| `simulators/analytics-simulator.ts` | `simulators/AnalyticsSimulator.ts` | single class `AnalyticsSimulator` |
| `simulators/analytics-simulator.test.ts` | `simulators/AnalyticsSimulator.test.ts` | matches source |
| `simulators/credit-reference-data-simulator.ts` | `simulators/creditReferenceDataSimulator.ts` | exports `InstrumentSimulator`, `DealerSimulator`, `INSTRUMENTS_CATALOG`, `DEALERS_CATALOG` (multi-export) |
| `simulators/credit-reference-data-simulator.test.ts` | `simulators/creditReferenceDataSimulator.test.ts` | matches source |
| `simulators/credit-rfq-simulator.ts` | `simulators/CreditRfqSimulator.ts` | single class |
| `simulators/execution-simulator.ts` | `simulators/ExecutionSimulator.ts` | single class |
| `simulators/execution-simulator.test.ts` | `simulators/ExecutionSimulator.test.ts` | matches source |
| `simulators/pricing-simulator.ts` | `simulators/PricingSimulator.ts` | single class |
| `simulators/pricing-simulator.test.ts` | `simulators/PricingSimulator.test.ts` | matches source |
| `simulators/reference-data-simulator.ts` | `simulators/ReferenceDataSimulator.ts` | single class |
| `simulators/reference-data-simulator.test.ts` | `simulators/ReferenceDataSimulator.test.ts` | matches source |
| `simulators/trade-store-simulator.ts` | `simulators/TradeStoreSimulator.ts` | single class |
| `simulators/trade-store-simulator.test.ts` | `simulators/TradeStoreSimulator.test.ts` | matches source |

- [ ] **Step 1: Move all 13 simulator files**

```bash
cd packages/domain/src/simulators
git mv analytics-simulator.ts AnalyticsSimulator.ts
git mv analytics-simulator.test.ts AnalyticsSimulator.test.ts
git mv credit-reference-data-simulator.ts creditReferenceDataSimulator.ts
git mv credit-reference-data-simulator.test.ts creditReferenceDataSimulator.test.ts
git mv credit-rfq-simulator.ts CreditRfqSimulator.ts
git mv execution-simulator.ts ExecutionSimulator.ts
git mv execution-simulator.test.ts ExecutionSimulator.test.ts
git mv pricing-simulator.ts PricingSimulator.ts
git mv pricing-simulator.test.ts PricingSimulator.test.ts
git mv reference-data-simulator.ts ReferenceDataSimulator.ts
git mv reference-data-simulator.test.ts ReferenceDataSimulator.test.ts
git mv trade-store-simulator.ts TradeStoreSimulator.ts
git mv trade-store-simulator.test.ts TradeStoreSimulator.test.ts
cd -
```

- [ ] **Step 2: Update import paths repo-wide**

```bash
find packages/domain -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/analytics-simulator"|/AnalyticsSimulator"|g'  -e 's|/analytics-simulator\.js"|/AnalyticsSimulator.js"|g' \
    -e 's|/credit-reference-data-simulator"|/creditReferenceDataSimulator"|g'  -e 's|/credit-reference-data-simulator\.js"|/creditReferenceDataSimulator.js"|g' \
    -e 's|/credit-rfq-simulator"|/CreditRfqSimulator"|g'  -e 's|/credit-rfq-simulator\.js"|/CreditRfqSimulator.js"|g' \
    -e 's|/execution-simulator"|/ExecutionSimulator"|g'  -e 's|/execution-simulator\.js"|/ExecutionSimulator.js"|g' \
    -e 's|/pricing-simulator"|/PricingSimulator"|g'  -e 's|/pricing-simulator\.js"|/PricingSimulator.js"|g' \
    -e 's|/reference-data-simulator"|/ReferenceDataSimulator"|g'  -e 's|/reference-data-simulator\.js"|/ReferenceDataSimulator.js"|g' \
    -e 's|/trade-store-simulator"|/TradeStoreSimulator"|g'  -e 's|/trade-store-simulator\.js"|/TradeStoreSimulator.js"|g' \
    {} +
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -w typecheck`

Expected: PASS.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm -w test`

Expected: 106 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "refactor(domain): rename simulators to PascalCase (camelCase for multi-class)"
```

---

### Task 3: Rename @rtc/domain — use cases

All 6 use case files export a single class → PascalCase.

**Renames:**

| Old path | New path |
|---|---|
| `usecases/analytics-use-case.ts` | `usecases/AnalyticsUseCase.ts` |
| `usecases/analytics-use-case.test.ts` | `usecases/AnalyticsUseCase.test.ts` |
| `usecases/create-rfq-use-case.ts` | `usecases/CreateRfqUseCase.ts` |
| `usecases/create-rfq-use-case.test.ts` | `usecases/CreateRfqUseCase.test.ts` |
| `usecases/execute-trade-use-case.ts` | `usecases/ExecuteTradeUseCase.ts` |
| `usecases/execute-trade-use-case.test.ts` | `usecases/ExecuteTradeUseCase.test.ts` |
| `usecases/price-history-use-case.ts` | `usecases/PriceHistoryUseCase.ts` |
| `usecases/price-history-use-case.test.ts` | `usecases/PriceHistoryUseCase.test.ts` |
| `usecases/price-stream-use-case.ts` | `usecases/PriceStreamUseCase.ts` |
| `usecases/price-stream-use-case.test.ts` | `usecases/PriceStreamUseCase.test.ts` |
| `usecases/workflow-event-stream-use-case.ts` | `usecases/WorkflowEventStreamUseCase.ts` |
| `usecases/workflow-event-stream-use-case.test.ts` | `usecases/WorkflowEventStreamUseCase.test.ts` |

- [ ] **Step 1: Move all 12 use case files**

```bash
cd packages/domain/src/usecases
git mv analytics-use-case.ts AnalyticsUseCase.ts
git mv analytics-use-case.test.ts AnalyticsUseCase.test.ts
git mv create-rfq-use-case.ts CreateRfqUseCase.ts
git mv create-rfq-use-case.test.ts CreateRfqUseCase.test.ts
git mv execute-trade-use-case.ts ExecuteTradeUseCase.ts
git mv execute-trade-use-case.test.ts ExecuteTradeUseCase.test.ts
git mv price-history-use-case.ts PriceHistoryUseCase.ts
git mv price-history-use-case.test.ts PriceHistoryUseCase.test.ts
git mv price-stream-use-case.ts PriceStreamUseCase.ts
git mv price-stream-use-case.test.ts PriceStreamUseCase.test.ts
git mv workflow-event-stream-use-case.ts WorkflowEventStreamUseCase.ts
git mv workflow-event-stream-use-case.test.ts WorkflowEventStreamUseCase.test.ts
cd -
```

- [ ] **Step 2: Update import paths repo-wide**

```bash
find packages/domain -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/analytics-use-case"|/AnalyticsUseCase"|g'  -e 's|/analytics-use-case\.js"|/AnalyticsUseCase.js"|g' \
    -e 's|/create-rfq-use-case"|/CreateRfqUseCase"|g'  -e 's|/create-rfq-use-case\.js"|/CreateRfqUseCase.js"|g' \
    -e 's|/execute-trade-use-case"|/ExecuteTradeUseCase"|g'  -e 's|/execute-trade-use-case\.js"|/ExecuteTradeUseCase.js"|g' \
    -e 's|/price-history-use-case"|/PriceHistoryUseCase"|g'  -e 's|/price-history-use-case\.js"|/PriceHistoryUseCase.js"|g' \
    -e 's|/price-stream-use-case"|/PriceStreamUseCase"|g'  -e 's|/price-stream-use-case\.js"|/PriceStreamUseCase.js"|g' \
    -e 's|/workflow-event-stream-use-case"|/WorkflowEventStreamUseCase"|g'  -e 's|/workflow-event-stream-use-case\.js"|/WorkflowEventStreamUseCase.js"|g' \
    {} +
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "refactor(domain): rename use cases to PascalCase"
```

---

### Task 4: Rename @rtc/domain — entities

The remaining kebab-cased domain modules. None of these are class-per-file; all export types/functions/constants → camelCase.

**Renames:**

| Old path | New path |
|---|---|
| `connection/connection-status.ts` | `connection/connectionStatus.ts` |
| `connection/connection-status.test.ts` | `connection/connectionStatus.test.ts` |
| `credit/credit-trade.ts` | `credit/creditTrade.ts` |
| `fx/currency-filter.ts` | `fx/currencyFilter.ts` |
| `fx/currency-filter.test.ts` | `fx/currencyFilter.test.ts` |
| `fx/currency-pair.ts` | `fx/currencyPair.ts` |

- [ ] **Step 1: Move 6 entity files**

```bash
cd packages/domain/src
git mv connection/connection-status.ts connection/connectionStatus.ts
git mv connection/connection-status.test.ts connection/connectionStatus.test.ts
git mv credit/credit-trade.ts credit/creditTrade.ts
git mv fx/currency-filter.ts fx/currencyFilter.ts
git mv fx/currency-filter.test.ts fx/currencyFilter.test.ts
git mv fx/currency-pair.ts fx/currencyPair.ts
cd -
```

- [ ] **Step 2: Update import paths repo-wide**

```bash
find packages/domain -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/connection-status"|/connectionStatus"|g'  -e 's|/connection-status\.js"|/connectionStatus.js"|g' \
    -e 's|/credit-trade"|/creditTrade"|g'  -e 's|/credit-trade\.js"|/creditTrade.js"|g' \
    -e 's|/currency-filter"|/currencyFilter"|g'  -e 's|/currency-filter\.js"|/currencyFilter.js"|g' \
    -e 's|/currency-pair"|/currencyPair"|g'  -e 's|/currency-pair\.js"|/currencyPair.js"|g' \
    {} +
```

> Note: a kebab `currency-filter.tsx` also exists in `packages/client/src/fx/live-rates/` and is imported relatively by sibling client files. The sed above is scoped to `packages/domain` only, so it won't touch the client file. Client renames the file in Task 12.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "refactor(domain): rename entity modules to camelCase"
```

---

### Task 5: Rename @rtc/shared — DTOs

All 8 DTO files are interface-only modules → camelCase.

**Renames:**

| Old path | New path |
|---|---|
| `shared/src/credit/dealer-dto.ts` | `shared/src/credit/dealerDto.ts` |
| `shared/src/credit/instrument-dto.ts` | `shared/src/credit/instrumentDto.ts` |
| `shared/src/credit/workflow-dto.ts` | `shared/src/credit/workflowDto.ts` |
| `shared/src/fx/analytics-dto.ts` | `shared/src/fx/analyticsDto.ts` |
| `shared/src/fx/blotter-dto.ts` | `shared/src/fx/blotterDto.ts` |
| `shared/src/fx/execution-dto.ts` | `shared/src/fx/executionDto.ts` |
| `shared/src/fx/pricing-dto.ts` | `shared/src/fx/pricingDto.ts` |
| `shared/src/fx/reference-data-dto.ts` | `shared/src/fx/referenceDataDto.ts` |

- [ ] **Step 1: Move 8 DTO files**

```bash
cd packages/shared/src
git mv credit/dealer-dto.ts credit/dealerDto.ts
git mv credit/instrument-dto.ts credit/instrumentDto.ts
git mv credit/workflow-dto.ts credit/workflowDto.ts
git mv fx/analytics-dto.ts fx/analyticsDto.ts
git mv fx/blotter-dto.ts fx/blotterDto.ts
git mv fx/execution-dto.ts fx/executionDto.ts
git mv fx/pricing-dto.ts fx/pricingDto.ts
git mv fx/reference-data-dto.ts fx/referenceDataDto.ts
cd -
```

- [ ] **Step 2: Update import paths repo-wide**

```bash
find packages/shared -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/dealer-dto"|/dealerDto"|g'  -e 's|/dealer-dto\.js"|/dealerDto.js"|g' \
    -e 's|/instrument-dto"|/instrumentDto"|g'  -e 's|/instrument-dto\.js"|/instrumentDto.js"|g' \
    -e 's|/workflow-dto"|/workflowDto"|g'  -e 's|/workflow-dto\.js"|/workflowDto.js"|g' \
    -e 's|/analytics-dto"|/analyticsDto"|g'  -e 's|/analytics-dto\.js"|/analyticsDto.js"|g' \
    -e 's|/blotter-dto"|/blotterDto"|g'  -e 's|/blotter-dto\.js"|/blotterDto.js"|g' \
    -e 's|/execution-dto"|/executionDto"|g'  -e 's|/execution-dto\.js"|/executionDto.js"|g' \
    -e 's|/pricing-dto"|/pricingDto"|g'  -e 's|/pricing-dto\.js"|/pricingDto.js"|g' \
    -e 's|/reference-data-dto"|/referenceDataDto"|g'  -e 's|/reference-data-dto\.js"|/referenceDataDto.js"|g' \
    {} +
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "refactor(shared): rename DTOs to camelCase"
```

---

### Task 6: Rename @rtc/server

`ThroughputService` is a class-per-file → PascalCase. `service-container.ts` exports an interface + factory function → camelCase. `ws-handler.ts` exports a function → camelCase.

**Renames:**

| Old path | New path | Reason |
|---|---|---|
| `server/src/services/throughput-service.ts` | `server/src/services/ThroughputService.ts` | single class |
| `server/src/services/__tests__/throughput-service.test.ts` | `server/src/services/__tests__/ThroughputService.test.ts` | matches source |
| `server/src/services/service-container.ts` | `server/src/services/serviceContainer.ts` | interface + function |
| `server/src/ws/ws-handler.ts` | `server/src/ws/wsHandler.ts` | function module |

> Folder `__tests__` is a vitest convention with leading/trailing underscores; it is not kebab-case and stays as-is.

- [ ] **Step 1: Move 4 server files**

```bash
cd packages/server/src
git mv services/throughput-service.ts services/ThroughputService.ts
git mv services/__tests__/throughput-service.test.ts services/__tests__/ThroughputService.test.ts
git mv services/service-container.ts services/serviceContainer.ts
git mv ws/ws-handler.ts ws/wsHandler.ts
cd -
```

- [ ] **Step 2: Update import paths repo-wide**

```bash
find packages/server -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/throughput-service"|/ThroughputService"|g'  -e 's|/throughput-service\.js"|/ThroughputService.js"|g' \
    -e 's|/service-container"|/serviceContainer"|g'  -e 's|/service-container\.js"|/serviceContainer.js"|g' \
    -e 's|/ws-handler"|/wsHandler"|g'  -e 's|/ws-handler\.js"|/wsHandler.js"|g' \
    {} +
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "refactor(server): rename services and ws handler"
```

---

### Task 7: Rename @rtc/client — services

`WsAdapter` is a class-per-file → PascalCase. `ServiceProvider` exports a React component as primary identity (with companion `useServices` hook) → PascalCase. The two factory files export functions → camelCase.

**Renames:**

| Old path | New path | Reason |
|---|---|---|
| `client/src/services/ws-adapter.ts` | `client/src/services/WsAdapter.ts` | single class |
| `client/src/services/service-provider.tsx` | `client/src/services/ServiceProvider.tsx` | primary export is React component |
| `client/src/services/mock-service-factory.ts` | `client/src/services/mockServiceFactory.ts` | function module |
| `client/src/services/real-service-factory.ts` | `client/src/services/realServiceFactory.ts` | function module |

- [ ] **Step 1: Move 4 service files**

```bash
cd packages/client/src/services
git mv ws-adapter.ts WsAdapter.ts
git mv service-provider.tsx ServiceProvider.tsx
git mv mock-service-factory.ts mockServiceFactory.ts
git mv real-service-factory.ts realServiceFactory.ts
cd -
```

- [ ] **Step 2: Update import paths repo-wide**

```bash
find packages/client -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/ws-adapter"|/WsAdapter"|g' \
    -e 's|/service-provider"|/ServiceProvider"|g' \
    -e 's|/mock-service-factory"|/mockServiceFactory"|g' \
    -e 's|/real-service-factory"|/realServiceFactory"|g' \
    {} +
```

> Client imports don't carry `.js` extensions, so only the bare patterns are needed.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "refactor(client): rename services (WsAdapter, ServiceProvider, factories)"
```

---

### Task 8: Rename @rtc/client — admin, analytics, layout

React components → PascalCase. Hook files → camelCase (with `use` prefix). Layout files (`footer.tsx`, `header.tsx`, `workspace.tsx`) need the **two-step case-only rename** because only the first letter changes.

**Renames:**

| Old path | New path |
|---|---|
| `client/src/admin/admin-panel.tsx` | `client/src/admin/AdminPanel.tsx` |
| `client/src/admin/hooks/use-throughput.ts` | `client/src/admin/hooks/useThroughput.ts` |
| `client/src/analytics/analytics-panel.tsx` | `client/src/analytics/AnalyticsPanel.tsx` |
| `client/src/analytics/hooks/use-analytics.ts` | `client/src/analytics/hooks/useAnalytics.ts` |
| `client/src/analytics/pair-pnl-bars.tsx` | `client/src/analytics/PairPnlBars.tsx` |
| `client/src/analytics/pnl-chart.tsx` | `client/src/analytics/PnlChart.tsx` |
| `client/src/analytics/pnl-value.tsx` | `client/src/analytics/PnlValue.tsx` |
| `client/src/analytics/position-bubbles.tsx` | `client/src/analytics/PositionBubbles.tsx` |
| `client/src/layout/footer.tsx` | `client/src/layout/Footer.tsx` (case-only) |
| `client/src/layout/header.tsx` | `client/src/layout/Header.tsx` (case-only) |
| `client/src/layout/workspace.tsx` | `client/src/layout/Workspace.tsx` (case-only) |

- [ ] **Step 1: Move admin and analytics files (structural change, single git mv)**

```bash
cd packages/client/src
git mv admin/admin-panel.tsx admin/AdminPanel.tsx
git mv admin/hooks/use-throughput.ts admin/hooks/useThroughput.ts
git mv analytics/analytics-panel.tsx analytics/AnalyticsPanel.tsx
git mv analytics/hooks/use-analytics.ts analytics/hooks/useAnalytics.ts
git mv analytics/pair-pnl-bars.tsx analytics/PairPnlBars.tsx
git mv analytics/pnl-chart.tsx analytics/PnlChart.tsx
git mv analytics/pnl-value.tsx analytics/PnlValue.tsx
git mv analytics/position-bubbles.tsx analytics/PositionBubbles.tsx
cd -
```

- [ ] **Step 2: Move layout files (case-only, two-step)**

```bash
cd packages/client/src/layout
git mv footer.tsx _footer.tsx && git mv _footer.tsx Footer.tsx
git mv header.tsx _header.tsx && git mv _header.tsx Header.tsx
git mv workspace.tsx _workspace.tsx && git mv _workspace.tsx Workspace.tsx
cd -
```

- [ ] **Step 3: Update import paths repo-wide**

```bash
find packages/client -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/admin-panel"|/AdminPanel"|g' \
    -e 's|/use-throughput"|/useThroughput"|g' \
    -e 's|/analytics-panel"|/AnalyticsPanel"|g' \
    -e 's|/use-analytics"|/useAnalytics"|g' \
    -e 's|/pair-pnl-bars"|/PairPnlBars"|g' \
    -e 's|/pnl-chart"|/PnlChart"|g' \
    -e 's|/pnl-value"|/PnlValue"|g' \
    -e 's|/position-bubbles"|/PositionBubbles"|g' \
    -e 's|/layout/footer"|/layout/Footer"|g' \
    -e 's|/layout/header"|/layout/Header"|g' \
    -e 's|/layout/workspace"|/layout/Workspace"|g' \
    {} +
```

> Layout files use prefix-anchored patterns to avoid collateral damage from the very common bare words `footer`, `header`, `workspace` appearing elsewhere.

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 5: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/
git commit -m "refactor(client): rename admin, analytics, layout to PascalCase / camelCase"
```

---

### Task 9: Rename @rtc/client — blotter (incl folder rename `column-filter` → `columnFilter`)

Mix: React components → PascalCase, function/state modules → camelCase. The `column-filter` folder gets renamed to `columnFilter`.

**Folder rename:**

`client/src/blotter/column-filter/` → `client/src/blotter/columnFilter/`

**File renames inside `blotter/`:**

| Old path | New path |
|---|---|
| `blotter-columns.ts` | `blotterColumns.ts` (multi-export) |
| `blotter-header.tsx` | `BlotterHeader.tsx` |
| `blotter-row.tsx` | `BlotterRow.tsx` |
| `column-filter/date-filter.tsx` | `columnFilter/DateFilter.tsx` |
| `column-filter/filter-state.ts` | `columnFilter/filterState.ts` |
| `column-filter/number-filter.tsx` | `columnFilter/NumberFilter.tsx` |
| `column-filter/set-filter.tsx` | `columnFilter/SetFilter.tsx` |
| `column-sort.ts` | `columnSort.ts` |
| `csv-export.ts` | `csvExport.ts` |
| `fx-blotter.tsx` | `FxBlotter.tsx` |
| `hooks/use-trade-stream.ts` | `hooks/useTradeStream.ts` |
| `quick-filter.tsx` | `QuickFilter.tsx` |

- [ ] **Step 1: Rename the column-filter folder first**

```bash
cd packages/client/src/blotter
git mv column-filter columnFilter
cd -
```

- [ ] **Step 2: Move all blotter files**

```bash
cd packages/client/src/blotter
git mv blotter-columns.ts blotterColumns.ts
git mv blotter-header.tsx BlotterHeader.tsx
git mv blotter-row.tsx BlotterRow.tsx
git mv columnFilter/date-filter.tsx columnFilter/DateFilter.tsx
git mv columnFilter/filter-state.ts columnFilter/filterState.ts
git mv columnFilter/number-filter.tsx columnFilter/NumberFilter.tsx
git mv columnFilter/set-filter.tsx columnFilter/SetFilter.tsx
git mv column-sort.ts columnSort.ts
git mv csv-export.ts csvExport.ts
git mv fx-blotter.tsx FxBlotter.tsx
git mv hooks/use-trade-stream.ts hooks/useTradeStream.ts
git mv quick-filter.tsx QuickFilter.tsx
cd -
```

- [ ] **Step 3: Update import paths repo-wide**

```bash
find packages/client -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/blotter-columns"|/blotterColumns"|g' \
    -e 's|/blotter-header"|/BlotterHeader"|g' \
    -e 's|/blotter-row"|/BlotterRow"|g' \
    -e 's|/column-filter/date-filter"|/columnFilter/DateFilter"|g' \
    -e 's|/column-filter/filter-state"|/columnFilter/filterState"|g' \
    -e 's|/column-filter/number-filter"|/columnFilter/NumberFilter"|g' \
    -e 's|/column-filter/set-filter"|/columnFilter/SetFilter"|g' \
    -e 's|/column-filter/|/columnFilter/|g' \
    -e 's|/column-sort"|/columnSort"|g' \
    -e 's|/csv-export"|/csvExport"|g' \
    -e 's|/fx-blotter"|/FxBlotter"|g' \
    -e 's|/use-trade-stream"|/useTradeStream"|g' \
    -e 's|/quick-filter"|/QuickFilter"|g' \
    {} +
```

> The eighth `-e` (`column-filter/` → `columnFilter/`) is a safety net for any folder-level path import (e.g. barrel index) that the per-file lines didn't catch.

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 5: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/
git commit -m "refactor(client): rename blotter files and column-filter folder"
```

---

### Task 10: Rename @rtc/client — connection

Connection components → PascalCase. Hook → camelCase.

**Renames:**

| Old path | New path |
|---|---|
| `client/src/connection/connection-overlay.tsx` | `client/src/connection/ConnectionOverlay.tsx` |
| `client/src/connection/connection-provider.tsx` | `client/src/connection/ConnectionProvider.tsx` |
| `client/src/connection/connection-status-bar.tsx` | `client/src/connection/ConnectionStatusBar.tsx` |
| `client/src/connection/use-connection.ts` | `client/src/connection/useConnection.ts` |

- [ ] **Step 1: Move 4 connection files**

```bash
cd packages/client/src/connection
git mv connection-overlay.tsx ConnectionOverlay.tsx
git mv connection-provider.tsx ConnectionProvider.tsx
git mv connection-status-bar.tsx ConnectionStatusBar.tsx
git mv use-connection.ts useConnection.ts
cd -
```

- [ ] **Step 2: Update import paths repo-wide**

```bash
find packages/client -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/connection-overlay"|/ConnectionOverlay"|g' \
    -e 's|/connection-provider"|/ConnectionProvider"|g' \
    -e 's|/connection-status-bar"|/ConnectionStatusBar"|g' \
    -e 's|/use-connection"|/useConnection"|g' \
    {} +
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "refactor(client): rename connection files to PascalCase / camelCase"
```

---

### Task 11: Rename @rtc/client — credit (folders + files)

Three folder renames (`new-rfq` → `newRfq`, `rfq-tiles` → `rfqTiles`, `sell-side` → `sellSide`) plus many file renames.

**Folder renames:**

- `client/src/credit/new-rfq/` → `client/src/credit/newRfq/`
- `client/src/credit/rfq-tiles/` → `client/src/credit/rfqTiles/`
- `client/src/credit/sell-side/` → `client/src/credit/sellSide/`

**File renames (within renamed folders, paths reflect post-folder-rename):**

| Old path | New path |
|---|---|
| `credit/blotter/credit-blotter.tsx` | `credit/blotter/CreditBlotter.tsx` |
| `credit/credit-workspace.tsx` | `credit/CreditWorkspace.tsx` |
| `credit/hooks/use-create-rfq.ts` | `credit/hooks/useCreateRfq.ts` |
| `credit/hooks/use-dealers.ts` | `credit/hooks/useDealers.ts` |
| `credit/hooks/use-instruments.ts` | `credit/hooks/useInstruments.ts` |
| `credit/hooks/use-rfq-stream.ts` | `credit/hooks/useRfqStream.ts` |
| `credit/newRfq/dealer-selection.tsx` | `credit/newRfq/DealerSelection.tsx` |
| `credit/newRfq/instrument-search.tsx` | `credit/newRfq/InstrumentSearch.tsx` |
| `credit/newRfq/new-rfq-form.tsx` | `credit/newRfq/NewRfqForm.tsx` |
| `credit/newRfq/quantity-input.tsx` | `credit/newRfq/QuantityInput.tsx` |
| `credit/rfqTiles/quote-card.tsx` | `credit/rfqTiles/QuoteCard.tsx` |
| `credit/rfqTiles/rfq-card.tsx` | `credit/rfqTiles/RfqCard.tsx` |
| `credit/rfqTiles/rfq-filter-tabs.tsx` | `credit/rfqTiles/RfqFilterTabs.tsx` |
| `credit/rfqTiles/rfq-tiles-panel.tsx` | `credit/rfqTiles/RfqTilesPanel.tsx` |
| `credit/sellSide/sell-side-panel.tsx` | `credit/sellSide/SellSidePanel.tsx` |
| `credit/sellSide/trade-ticket.tsx` | `credit/sellSide/TradeTicket.tsx` |

- [ ] **Step 1: Rename the three folders first**

```bash
cd packages/client/src/credit
git mv new-rfq newRfq
git mv rfq-tiles rfqTiles
git mv sell-side sellSide
cd -
```

- [ ] **Step 2: Move all credit files**

```bash
cd packages/client/src/credit
git mv blotter/credit-blotter.tsx blotter/CreditBlotter.tsx
git mv credit-workspace.tsx CreditWorkspace.tsx
git mv hooks/use-create-rfq.ts hooks/useCreateRfq.ts
git mv hooks/use-dealers.ts hooks/useDealers.ts
git mv hooks/use-instruments.ts hooks/useInstruments.ts
git mv hooks/use-rfq-stream.ts hooks/useRfqStream.ts
git mv newRfq/dealer-selection.tsx newRfq/DealerSelection.tsx
git mv newRfq/instrument-search.tsx newRfq/InstrumentSearch.tsx
git mv newRfq/new-rfq-form.tsx newRfq/NewRfqForm.tsx
git mv newRfq/quantity-input.tsx newRfq/QuantityInput.tsx
git mv rfqTiles/quote-card.tsx rfqTiles/QuoteCard.tsx
git mv rfqTiles/rfq-card.tsx rfqTiles/RfqCard.tsx
git mv rfqTiles/rfq-filter-tabs.tsx rfqTiles/RfqFilterTabs.tsx
git mv rfqTiles/rfq-tiles-panel.tsx rfqTiles/RfqTilesPanel.tsx
git mv sellSide/sell-side-panel.tsx sellSide/SellSidePanel.tsx
git mv sellSide/trade-ticket.tsx sellSide/TradeTicket.tsx
cd -
```

- [ ] **Step 3: Update import paths repo-wide**

```bash
find packages/client -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/credit-blotter"|/CreditBlotter"|g' \
    -e 's|/credit-workspace"|/CreditWorkspace"|g' \
    -e 's|/use-create-rfq"|/useCreateRfq"|g' \
    -e 's|/use-dealers"|/useDealers"|g' \
    -e 's|/use-instruments"|/useInstruments"|g' \
    -e 's|/use-rfq-stream"|/useRfqStream"|g' \
    -e 's|/new-rfq/dealer-selection"|/newRfq/DealerSelection"|g' \
    -e 's|/new-rfq/instrument-search"|/newRfq/InstrumentSearch"|g' \
    -e 's|/new-rfq/new-rfq-form"|/newRfq/NewRfqForm"|g' \
    -e 's|/new-rfq/quantity-input"|/newRfq/QuantityInput"|g' \
    -e 's|/rfq-tiles/quote-card"|/rfqTiles/QuoteCard"|g' \
    -e 's|/rfq-tiles/rfq-card"|/rfqTiles/RfqCard"|g' \
    -e 's|/rfq-tiles/rfq-filter-tabs"|/rfqTiles/RfqFilterTabs"|g' \
    -e 's|/rfq-tiles/rfq-tiles-panel"|/rfqTiles/RfqTilesPanel"|g' \
    -e 's|/sell-side/sell-side-panel"|/sellSide/SellSidePanel"|g' \
    -e 's|/sell-side/trade-ticket"|/sellSide/TradeTicket"|g' \
    -e 's|/dealer-selection"|/DealerSelection"|g' \
    -e 's|/instrument-search"|/InstrumentSearch"|g' \
    -e 's|/new-rfq-form"|/NewRfqForm"|g' \
    -e 's|/quantity-input"|/QuantityInput"|g' \
    -e 's|/quote-card"|/QuoteCard"|g' \
    -e 's|/rfq-card"|/RfqCard"|g' \
    -e 's|/rfq-filter-tabs"|/RfqFilterTabs"|g' \
    -e 's|/rfq-tiles-panel"|/RfqTilesPanel"|g' \
    -e 's|/sell-side-panel"|/SellSidePanel"|g' \
    -e 's|/trade-ticket"|/TradeTicket"|g' \
    -e 's|/new-rfq/|/newRfq/|g' \
    -e 's|/rfq-tiles/|/rfqTiles/|g' \
    -e 's|/sell-side/|/sellSide/|g' \
    {} +
```

> The first block of patterns handles full-path imports (e.g. `./new-rfq/dealer-selection`) where both folder and file changed. The second block handles bare file names (e.g. `./dealer-selection` from a sibling). The third block (folder-only patterns) catches any remaining folder references such as barrel imports.

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 5: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/
git commit -m "refactor(client): rename credit folders and files (newRfq, rfqTiles, sellSide)"
```

---

### Task 12: Rename @rtc/client — fx (folder + many files)

One folder rename (`live-rates` → `liveRates`) plus 8 fx hook renames plus the 10-file `tile/` subtree plus the 2 `live-rates/*.tsx` siblings. `tile.tsx` requires the **two-step case-only rename**.

**Folder rename:**

`client/src/fx/live-rates/` → `client/src/fx/liveRates/`

**File renames (paths reflect post-folder-rename):**

| Old path | New path |
|---|---|
| `fx/hooks/use-currency-pairs.ts` | `fx/hooks/useCurrencyPairs.ts` |
| `fx/hooks/use-execute-trade.ts` | `fx/hooks/useExecuteTrade.ts` |
| `fx/hooks/use-notional.ts` | `fx/hooks/useNotional.ts` |
| `fx/hooks/use-price-history.ts` | `fx/hooks/usePriceHistory.ts` |
| `fx/hooks/use-price-stream.ts` | `fx/hooks/usePriceStream.ts` |
| `fx/hooks/use-rfq-quote.ts` | `fx/hooks/useRfqQuote.ts` |
| `fx/hooks/use-rfq-state.ts` | `fx/hooks/useRfqState.ts` |
| `fx/hooks/use-tile-state.ts` | `fx/hooks/useTileState.ts` |
| `fx/liveRates/currency-filter.tsx` | `fx/liveRates/CurrencyFilter.tsx` |
| `fx/liveRates/live-rates-panel.tsx` | `fx/liveRates/LiveRatesPanel.tsx` |
| `fx/liveRates/view-toggle.tsx` | `fx/liveRates/ViewToggle.tsx` |
| `fx/liveRates/tile/rfq-countdown.tsx` | `fx/liveRates/tile/RfqCountdown.tsx` |
| `fx/liveRates/tile/tile-chart.tsx` | `fx/liveRates/tile/TileChart.tsx` |
| `fx/liveRates/tile/tile-confirmation.tsx` | `fx/liveRates/tile/TileConfirmation.tsx` |
| `fx/liveRates/tile/tile-execution.tsx` | `fx/liveRates/tile/TileExecution.tsx` |
| `fx/liveRates/tile/tile-header.tsx` | `fx/liveRates/tile/TileHeader.tsx` |
| `fx/liveRates/tile/tile-notional.tsx` | `fx/liveRates/tile/TileNotional.tsx` |
| `fx/liveRates/tile/tile-price.tsx` | `fx/liveRates/tile/TilePrice.tsx` |
| `fx/liveRates/tile/tile-rfq.tsx` | `fx/liveRates/tile/TileRfq.tsx` |
| `fx/liveRates/tile/tile.tsx` | `fx/liveRates/tile/Tile.tsx` (case-only) |

- [ ] **Step 1: Rename the folder first**

```bash
cd packages/client/src/fx
git mv live-rates liveRates
cd -
```

- [ ] **Step 2: Move fx hook files**

```bash
cd packages/client/src/fx/hooks
git mv use-currency-pairs.ts useCurrencyPairs.ts
git mv use-execute-trade.ts useExecuteTrade.ts
git mv use-notional.ts useNotional.ts
git mv use-price-history.ts usePriceHistory.ts
git mv use-price-stream.ts usePriceStream.ts
git mv use-rfq-quote.ts useRfqQuote.ts
git mv use-rfq-state.ts useRfqState.ts
git mv use-tile-state.ts useTileState.ts
cd -
```

- [ ] **Step 3: Move liveRates panel/toggle/filter files**

```bash
cd packages/client/src/fx/liveRates
git mv currency-filter.tsx CurrencyFilter.tsx
git mv live-rates-panel.tsx LiveRatesPanel.tsx
git mv view-toggle.tsx ViewToggle.tsx
cd -
```

- [ ] **Step 4: Move liveRates/tile files (kebab → Pascal: single git mv each)**

```bash
cd packages/client/src/fx/liveRates/tile
git mv rfq-countdown.tsx RfqCountdown.tsx
git mv tile-chart.tsx TileChart.tsx
git mv tile-confirmation.tsx TileConfirmation.tsx
git mv tile-execution.tsx TileExecution.tsx
git mv tile-header.tsx TileHeader.tsx
git mv tile-notional.tsx TileNotional.tsx
git mv tile-price.tsx TilePrice.tsx
git mv tile-rfq.tsx TileRfq.tsx
cd -
```

- [ ] **Step 5: Move tile.tsx (case-only, two-step)**

```bash
cd packages/client/src/fx/liveRates/tile
git mv tile.tsx _tile.tsx && git mv _tile.tsx Tile.tsx
cd -
```

- [ ] **Step 6: Update import paths repo-wide**

```bash
find packages/client -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/use-currency-pairs"|/useCurrencyPairs"|g' \
    -e 's|/use-execute-trade"|/useExecuteTrade"|g' \
    -e 's|/use-notional"|/useNotional"|g' \
    -e 's|/use-price-history"|/usePriceHistory"|g' \
    -e 's|/use-price-stream"|/usePriceStream"|g' \
    -e 's|/use-rfq-quote"|/useRfqQuote"|g' \
    -e 's|/use-rfq-state"|/useRfqState"|g' \
    -e 's|/use-tile-state"|/useTileState"|g' \
    -e 's|/live-rates/currency-filter"|/liveRates/CurrencyFilter"|g' \
    -e 's|/live-rates/live-rates-panel"|/liveRates/LiveRatesPanel"|g' \
    -e 's|/live-rates/view-toggle"|/liveRates/ViewToggle"|g' \
    -e 's|/live-rates-panel"|/LiveRatesPanel"|g' \
    -e 's|/view-toggle"|/ViewToggle"|g' \
    -e 's|/tile/rfq-countdown"|/tile/RfqCountdown"|g' \
    -e 's|/tile/tile-chart"|/tile/TileChart"|g' \
    -e 's|/tile/tile-confirmation"|/tile/TileConfirmation"|g' \
    -e 's|/tile/tile-execution"|/tile/TileExecution"|g' \
    -e 's|/tile/tile-header"|/tile/TileHeader"|g' \
    -e 's|/tile/tile-notional"|/tile/TileNotional"|g' \
    -e 's|/tile/tile-price"|/tile/TilePrice"|g' \
    -e 's|/tile/tile-rfq"|/tile/TileRfq"|g' \
    -e 's|/tile/tile"|/tile/Tile"|g' \
    -e 's|/rfq-countdown"|/RfqCountdown"|g' \
    -e 's|/tile-chart"|/TileChart"|g' \
    -e 's|/tile-confirmation"|/TileConfirmation"|g' \
    -e 's|/tile-execution"|/TileExecution"|g' \
    -e 's|/tile-header"|/TileHeader"|g' \
    -e 's|/tile-notional"|/TileNotional"|g' \
    -e 's|/tile-price"|/TilePrice"|g' \
    -e 's|/tile-rfq"|/TileRfq"|g' \
    -e 's|/live-rates/|/liveRates/|g' \
    {} +
```

> Note about `currency-filter`: in client this is a UI component (PascalCase). The existing `domain/src/fx/currency-filter.ts` (already renamed in Task 4 to `currencyFilter.ts`) is imported as `@rtc/domain` not as a relative path, so no collision.
>
> Note about bare `tile`: I deliberately do NOT add a generic `s|/tile"|/Tile"|g` rule here because `liveRates/tile/` is a folder name and we want it to STAY lowercase. The targeted `/tile/tile"` → `/tile/Tile"` rule on line 21 handles only the file rename.

- [ ] **Step 7: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 8: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/
git commit -m "refactor(client): rename fx hooks, liveRates folder, and tile components"
```

---

### Task 13: Rename @rtc/client — stale, theme

**Renames:**

| Old path | New path |
|---|---|
| `client/src/stale/stale-indicator.tsx` | `client/src/stale/StaleIndicator.tsx` |
| `client/src/stale/use-stale-detection.ts` | `client/src/stale/useStaleDetection.ts` |
| `client/src/theme/theme-provider.tsx` | `client/src/theme/ThemeProvider.tsx` |
| `client/src/theme/theme-toggle.tsx` | `client/src/theme/ThemeToggle.tsx` |

- [ ] **Step 1: Move 4 files**

```bash
cd packages/client/src
git mv stale/stale-indicator.tsx stale/StaleIndicator.tsx
git mv stale/use-stale-detection.ts stale/useStaleDetection.ts
git mv theme/theme-provider.tsx theme/ThemeProvider.tsx
git mv theme/theme-toggle.tsx theme/ThemeToggle.tsx
cd -
```

- [ ] **Step 2: Update import paths repo-wide**

```bash
find packages/client -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  -exec sed -i '' \
    -e 's|/stale-indicator"|/StaleIndicator"|g' \
    -e 's|/use-stale-detection"|/useStaleDetection"|g' \
    -e 's|/theme-provider"|/ThemeProvider"|g' \
    -e 's|/theme-toggle"|/ThemeToggle"|g' \
    {} +
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm -w test` — Expected: 106 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "refactor(client): rename stale and theme files"
```

---

### Task 14: Rename E2E specs

E2E specs are not class-per-file → camelCase.

**Renames:**

| Old path | New path |
|---|---|
| `client/e2e/credit-rfq.spec.ts` | `client/e2e/creditRfq.spec.ts` |
| `client/e2e/fx-live-rates.spec.ts` | `client/e2e/fxLiveRates.spec.ts` |
| `client/e2e/fx-rfq.spec.ts` | `client/e2e/fxRfq.spec.ts` |
| `client/e2e/fx-trading.spec.ts` | `client/e2e/fxTrading.spec.ts` |

(Single-word specs `analytics.spec.ts`, `blotter.spec.ts`, `connection.spec.ts`, `theme.spec.ts` already conform.)

- [ ] **Step 1: Move 4 spec files**

```bash
cd packages/client/e2e
git mv credit-rfq.spec.ts creditRfq.spec.ts
git mv fx-live-rates.spec.ts fxLiveRates.spec.ts
git mv fx-rfq.spec.ts fxRfq.spec.ts
git mv fx-trading.spec.ts fxTrading.spec.ts
cd -
```

- [ ] **Step 2: Search for any internal references**

Run: `rg -n "credit-rfq|fx-live-rates|fx-rfq|fx-trading" packages/client/e2e packages/client/playwright.config.ts`

Expected: zero matches. Playwright auto-discovers `.spec.ts` files in the `e2e/` folder and there are no inter-spec imports.

If any matches appear, update them with sed similarly to other tasks.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm -w typecheck` — Expected: PASS. (Tsconfig.node.json includes the e2e folder so renamed specs must still typecheck.)

- [ ] **Step 4: Verify unit tests still pass**

Run: `pnpm -w test` — Expected: 106 tests pass. (E2E run is deferred to Task 16.)

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "refactor(client/e2e): rename spec files to camelCase"
```

---

### Task 15: Sweep for stragglers

Catch anything missed.

- [ ] **Step 1: Search for any remaining kebab-cased TS/TSX filenames in source**

Run:

```bash
find packages -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" \
  | grep -E "/[a-z]+(-[a-z]+)+\.(ts|tsx)$" || echo "CLEAN"
```

Expected: prints `CLEAN`. If any kebab-cased files remain, rename them following the same pattern (single class → PascalCase, otherwise camelCase) plus a sed sweep for imports.

- [ ] **Step 2: Search for any remaining kebab-cased folders in source**

Run:

```bash
find packages -type d \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.turbo/*" -not -path "*/__tests__*" \
  | grep -E "/[a-z]+(-[a-z]+)+/?$" || echo "CLEAN"
```

Expected: `CLEAN`. (`__tests__` is exempt — vitest convention.)

- [ ] **Step 3: Search for any remaining kebab strings in import paths**

Run:

```bash
rg -n 'from "[^"]*/[a-z]+-[a-z]' packages/ -g '!node_modules' -g '!dist' -g '!.turbo' || echo "CLEAN"
```

Expected: `CLEAN`. Any hit indicates a rename was made but the corresponding import sweep missed it. Fix and add to the appropriate prior task's sed list (post-hoc cleanup also acceptable in a small commit here).

- [ ] **Step 4: If stragglers were fixed, commit**

```bash
git add packages/
git commit -m "refactor: sweep remaining kebab-case filenames and import paths"
```

(If Steps 1–3 all printed CLEAN, no commit.)

---

### Task 16: Final verification

Verify the full surface, including E2E. Push only when user confirms.

- [ ] **Step 1: Diff against baseline**

```bash
git diff <baseline-SHA-from-Task-0>..HEAD --stat
```

Expected: ~100 file renames plus the import-path edits in any file that referenced them.

- [ ] **Step 2: Run all checks**

```bash
pnpm -w build
pnpm -w typecheck
pnpm -w test
```

Expected: all PASS, 106 tests pass.

- [ ] **Step 3: Run E2E tests**

```bash
pnpm test:e2e
```

Expected: 40 E2E tests pass.

- [ ] **Step 4: Update STATUS doc**

Edit `docs/superpowers/STATUS.md`:
- Mark Phase 2.5 row in the phases table as ✅ DONE with this plan's path and the commit range from Task 1 to Task 16.
- Bump the "Last updated" date.

Commit:

```bash
git add docs/superpowers/STATUS.md
git commit -m "docs: mark Phase 2.5 complete in STATUS"
```

- [ ] **Step 5: Hand off**

Tell the user:
- "Phase 2.5 complete. N commits ahead of origin/main. Ready to push when SSH is fixed."
- "Phase 3 spec at `docs/superpowers/specs/2026-05-01-phase-3-presenters-react-rxjs-design.md` references many of the renamed paths and needs to be updated; that's the next session's first task."
