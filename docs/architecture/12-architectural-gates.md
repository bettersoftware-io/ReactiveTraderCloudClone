[◀ 11. Key Files Reference](11-key-files-reference.md) · [Architecture Document](../architecture.md) · [13. Codebase Map ▶](13-codebase-map.md)

## 12. Architectural Gates

`tests/scripts/grep-gates.ts` encodes import-boundary rules plus a supply-chain audit — see the file for the current gate count and list (34 active gates, numbered up to 37, as of this writing — gates 12–14 were retired with Cypress on 2026-07-20 and their numbers are not reused) — enforced on every CI run. Gates use regex search — no runtime or type information — so they are fast and framework-agnostic.

| Gate | Rule |
|------|------|
| 1 | No raw `data-testid="..."` literals outside `testids.ts` (must use `TESTIDS` constants) |
| 2 | No driver imports (`@playwright/test`) in page-object contracts |
| 3 | No driver names or `data-testid` references in `.feature` spec files |
| 4 | No raw `getByTestId("...")` calls in page-object implementations (must use `TESTIDS` constants) |
| 5 | No driver imports (`@playwright/test`) in the scenarios layer |
| 6 | No `from "@playwright/test"` imports in step definition files |
| 7 | No copy-as-selector hardcoded text strings in page-object implementations (must use `STRINGS` constants) |
| 8 | No `this.page.*` calls in step definition files |
| 9 | No `from "@playwright/test"` imports in native Playwright spec bodies (allowed only in `playwright.config.ts` and `_context.ts`) |
| 10 | No direct `ctx.po.*` access in native Playwright spec bodies (allowed only in `_context.ts`) |
| 11 | No direct `page.*` calls in native Playwright spec bodies (allowed only in `_context.ts`) |
| 12–14 | *Retired (Cypress, 2026-07-20) — numbers not reused.* |
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
| 30 | No `rxjs` / `@react-rxjs` / `@rx-state` imports in `client-react-native/src/ui` (the RN dumb-UI boundary; only `src/app/adapters` may) |
| 31 | No `localStorage` / `AsyncStorage` in `client-react-native/src/ui` (persistence belongs behind `PreferencesPort`) |
| 32 | No `fetch(` / `process.env` / `import.meta.env` / `expo-constants` in `client-react-native/src/ui` (transport & config belong in the app layer) |
| 33 | No `setTimeout` / `setInterval` in `client-react-native/src/ui` (time belongs in machines/presenters; custom check) |
| 34 | No `rxjs` / `@rx-state` imports in `client-solid/src/ui` (the Solid dumb-UI boundary; only the `solid-bindings` bridge may) |
| 35 | No `local storage` in `client-solid/src/ui` (persistence belongs behind `PreferencesPort`) |
| 36 | No `fetch(` / `import.meta.env` in `client-solid/src/ui` (transport & config belong in the app layer) |
| 37 | No `setTimeout` / `setInterval` in `client-solid/src/ui` (time belongs in machines/presenters; custom check) |

Gates 26–29 (web), 30–33 (RN), and 34–37 (Solid) are the machine-readable definition of "dumb UI": no streams, no storage, no transport, no clocks. All three shipped clients now carry the same four categories of guardrail on their `src/ui` (the RN patterns are a strict superset, adding platform APIs like `AsyncStorage` and `process.env`), so the SolidJS-port contract ([§8.1](08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)) held on the existing clients throughout the port, not just the one that happened to get gated first — proven, not merely valid, since the Solid client passed its own 34–37 from day one.
