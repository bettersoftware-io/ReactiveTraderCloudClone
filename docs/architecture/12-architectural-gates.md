[◀ 11. Key Files Reference](11-key-files-reference.md) · [Architecture Document](../architecture.md) · [13. Codebase Map ▶](13-codebase-map.md)

## 12. Architectural Gates

`tests/scripts/grep-gates.ts` encodes 28 import-boundary rules plus a supply-chain audit (29 gates total), enforced on every CI run. Gates use regex search — no runtime or type information — so they are fast and framework-agnostic.

| Gate | Rule |
|------|------|
| 1 | No raw `data-testid="..."` literals outside `testids.ts` (must use `TESTIDS` constants) |
| 2 | No driver imports (`@playwright/test`, `cypress`, `@badeball`) in page-object contracts |
| 3 | No driver names or `data-testid` references in `.feature` spec files |
| 4 | No raw `getByTestId("...")` calls in page-object implementations (must use `TESTIDS` constants) |
| 5 | No driver imports (`@playwright/test`, `"cypress"`, `@badeball`) in the scenarios layer |
| 6 | No `from "@playwright/test"` imports in step definition files |
| 7 | No copy-as-selector hardcoded text strings in page-object implementations (must use `STRINGS` constants) |
| 8 | No `this.page.*` calls in step definition files |
| 9 | No `from "@playwright/test"` imports in native Playwright spec bodies (allowed only in `playwright.config.ts` and `_context.ts`) |
| 10 | No direct `ctx.po.*` access in native Playwright spec bodies (allowed only in `_context.ts`) |
| 11 | No direct `page.*` calls in native Playwright spec bodies (allowed only in `_context.ts`) |
| 12 | No driver imports (`"cypress"`, `@badeball`, `@playwright/test`) in native Cypress spec bodies (allowed only in `cypress.config.ts` and `_context.ts`) |
| 13 | No direct `ctx.po.*` access in native Cypress spec bodies (allowed only in `_context.ts`) |
| 14 | No direct `cy.*` calls in native Cypress spec bodies (allowed only in `_context.ts`) |
| 15 | No driver imports in presenter step/scenario/support files (excludes the vitest-quickpickle-fake-timers peer) |
| 16 | No DOM or page references (`getByTestId`, `page.*`, `cy.*`) in presenter step/scenario files |
| 17 | `createApp` / `createSimulatorPorts` may only appear in `presenter/scenarios/_buildApp.ts` |
| 18 | No RxJS `timeout` keyword in presenter `_shared/` scenarios (must use `w.awaitFirstWithin`) |
| 19 | No vitest or qpickle-loader imports in the `cucumber` (real-timers), `cucumber-fake-timers`, or shared presenter scenarios |
| 20 | No Gherkin loader imports (`quickpickle`, `@cucumber/cucumber`) inside `tests/presenter/vitest-fake-timers/` |
| 21 | `@presenter` scenario count per `.feature` file must equal `it()` block count in the matching `vitest-fake-timers/*.test.ts` file (custom check) |
| 22 | Every `describe(...)` title in `tests/presenter/vitest-fake-timers/` must begin with `"@presenter Feature: "` |
| 23 | Contract describers in `packages/domain/src/ports/__contracts__/` may not import from `simulators/`, `@rtc/client-react`, or `@rtc/shared/__fixtures__/` |
| 24 | `vitest-quickpickle-fake-timers/setup.ts` must import every step file in `tests/presenter/vitest-quickpickle-fake-timers/steps/` (barrel completeness) |
| 25 | No high/critical advisories in production dependencies (`pnpm audit --prod`, non-blocking when the audit cannot run) |
| 26 | No `rxjs` / `@react-rxjs` / `@rx-state` imports in `client-react/src/ui` (the dumb-UI boundary; only the bindings bridge may) |
| 27 | No `localStorage` in `client-react/src/ui` (persistence belongs behind `PreferencesPort`) |
| 28 | No `fetch(` / `import.meta.env` in `client-react/src/ui` (transport & config belong in the app layer) |
| 29 | No `setTimeout` / `setInterval` in `client-react/src/ui` (time belongs in machines/presenters; custom check) |

Gates 26–29 are the machine-readable definition of "dumb UI": no streams, no storage, no transport, no clocks. They are what keeps the SolidJS-port contract ([§8.1](08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-plan)) valid without anyone watching.
