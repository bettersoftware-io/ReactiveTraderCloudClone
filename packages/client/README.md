# @rtc/client — React UI

React + RxJS + Vite client. Clean-architecture seam: components read ALL data
through `useHooks()` (`AppHooks` interface); production wires presenters via
`@react-rxjs/core`, tests inject fakes through `HooksProvider`.

## Scripts

| script | purpose | report (under `reports/`) |
|---|---|---|
| `dev` | Vite dev server | — |
| `build` / `build-types` | Vite build + `.d.ts` emit | — |
| `typecheck` | app + node + ui-visual + ui-contract tsconfigs | — |
| `test:app` | **app tier** — Vitest (jsdom): presenters, adapters (`src/app`) | `app/` |
| `test:ui:contract` | **ui contract tier** — sociable RTL specs over `src/ui` | `ui/contract/` |
| `test:ui:contract:coverage` | **≥95% coverage gate** — combined `src/ui` surface (contract specs + co-located unit tests) | `ui/contract/coverage/` |
| `test` | **default** — Vitest (jsdom): union of app + ui-contract (72 files / 406 tests) | `unit/` |
| `test:ui:visual` | **visual tier** — every runner × every framework variant present, in parallel | per-runner, below |
| `test:ui:visual:react` | all visual runners, react only | per-runner, below |
| `test:ui:visual:playwright-ct:react[:update\|:ui]` | Tier 1 — Playwright Component Testing | `ui/visual/playwright-ct/react/` |
| `test:ui:visual:playwright:react[:update\|:ui]` | Tier 2 — plain Playwright over a Vite host page | `ui/visual/playwright/react/` |
| `test:ui:visual:vitest-browser:react[:update]` | Tier 3 — Vitest browser mode (`toMatchScreenshot`) | `ui/visual/vitest-browser/react/` |
| `clean` / `clean:deep` | remove build/test artifacts (/ + node_modules) | — |

Script naming: `test:ui:visual:<runner>:<framework>` — the framework axis exists
because the goldens + `tests/ui/visual/shared/` fixtures are the portability contract
for re-implementing this UI in another framework (e.g. SolidJS) with
pixel-parity; a future `:solid` runner is discovered by `tests/ui/visual/run-all.ts`
automatically.

Caching: from the repo root, `pnpm test` runs through Turborepo and is
**cached** — an instant `>>> FULL TURBO` pass is a log replay because no input
changed; `pnpm test --force` re-runs for real. `pnpm test:ui:visual` is never
cached (`cache: false` in `turbo.json`). Invoked directly
(`pnpm --filter @rtc/client test`), scripts bypass turbo — always fresh, but
workspace deps (`@rtc/domain`, `@rtc/shared`) are not auto-built; run
`pnpm build` at the root first on a fresh checkout. See "Caching" in the root
README. The unit report under `reports/unit/` is a declared turbo output, so a cached
replay *restores* it — fresh reports need `--force` too.

## Test portfolio

The default `pnpm test` runs the **union** of two co-resident tiers (72 files /
406 tests, report under `reports/unit/`); each tier also has a focused runner:

**App tier (`pnpm test:app`)** — co-located `src/app/**/*.test.ts(x)`: presenter
streams (`src/app/presenters/__tests__/`), WS adapters incl. real-gateway
contract tests (`src/app/adapters/`). No browser, no screenshots. Report under
`reports/app/`.

**UI contract tier (`pnpm test:ui:contract`)** — framework-neutral sociable
React Testing Library specs over `src/ui` (`tests/ui/contract/`): they assert
text, roles, structure, recorded command inputs, and dynamic re-renders — the
behavioural counterpart to the pixel-only visual tier, and the second
framework-swap portability pillar. Reports under `reports/ui/contract/`.

`test:ui:contract:coverage` is the **≥95% coverage gate** (statements / branches /
functions / lines) over the whole `src/ui` surface. It measures the **combined**
coverage of the two Phase-2 test styles — the neutral sociable contract specs
**and** the co-located `src/ui/**/*.test.{ts,tsx}` unit tests (hook/util edge
cases) — via a dedicated `vitest.coverage.config.ts`, so the percentage reflects
true coverage rather than just the contract tier. The plain `test:ui:contract`
runner stays pure (neutral specs only). The HTML report lands at
`reports/ui/contract/coverage/index.html`. **CI enforces the gate** (the
"UI contract coverage gate" step in `.github/workflows/ci.yml`). See
[`tests/ui/contract/README.md`](tests/ui/contract/README.md).

**Visual tier (`pnpm test:ui:visual`)** — screenshots of components and full pages
rendered against injected fake data via the `HooksProvider` seam; no server,
no presenters. Three runners share one scenario manifest
(`tests/ui/visual/shared/scenarios.ts`); goldens are committed in TWO sets per runner —
`react/` (CI, x86) and `react-local/<platform>-<arch>/` (fast local
feedback). UI changes require regenerating BOTH sets
(`:update` scripts locally; the `update-visual-goldens` workflow for the CI
set). Full details: ADR + layout in
[`tests/ui/visual/README.md`](tests/ui/visual/README.md).

**Browser e2e, presenter integration, and full-stack smokes** — NOT here;
they live in the [`tests/`](../../tests/README.md) workspace package.
