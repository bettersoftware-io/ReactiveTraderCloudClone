# @rtc/client — React UI

React + RxJS + Vite client. Clean-architecture seam: components read ALL data
through `useHooks()` (`AppHooks` interface); production wires presenters via
`@react-rxjs/core`, tests inject fakes through `HooksProvider`.

## Scripts

| script | purpose |
|---|---|
| `dev` | Vite dev server |
| `build` / `build-types` | Vite build + `.d.ts` emit |
| `typecheck` | app + node + visual tsconfigs |
| `test` | **unit tier** — Vitest (jsdom): presenters, adapters |
| `test:visual` | **visual tier** — every runner × every framework variant present, in parallel |
| `test:visual:react` | all visual runners, react only |
| `test:visual:playwright-ct:react[:update\|:ui]` | Tier 1 — Playwright Component Testing |
| `test:visual:playwright:react[:update\|:ui]` | Tier 2 — plain Playwright over a Vite host page |
| `test:visual:vitest-browser:react[:update]` | Tier 3 — Vitest browser mode (`toMatchScreenshot`) |
| `clean` / `clean:deep` | remove build/test artifacts (/ + node_modules) |

Script naming: `test:visual:<runner>:<framework>` — the framework axis exists
because the goldens + `visual/shared/` fixtures are the portability contract
for re-implementing this UI in another framework (e.g. SolidJS) with
pixel-parity; a future `:solid` runner is discovered by `visual/run-all.ts`
automatically.

## Test portfolio

**Unit (`pnpm test`)** — `src/**/*.test.ts(x)`: presenter streams
(`src/app/presenters/__tests__/`), WS adapters incl. real-gateway contract
tests (`src/app/adapters/`). No browser, no screenshots.

**Visual (`pnpm test:visual`)** — screenshots of components and full pages
rendered against injected fake data via the `HooksProvider` seam; no server,
no presenters. Three runners share one scenario manifest
(`visual/shared/scenarios.ts`); goldens are committed in TWO sets per runner —
`react/` (CI, x86) and `react-local/<platform>-<arch>/` (fast local
feedback). UI changes require regenerating BOTH sets
(`:update` scripts locally; the `update-visual-goldens` workflow for the CI
set). Full details: ADR + layout in [`visual/README.md`](visual/README.md).

**Browser e2e, presenter integration, and full-stack smokes** — NOT here;
they live in the [`tests/`](../../tests/README.md) workspace package.
