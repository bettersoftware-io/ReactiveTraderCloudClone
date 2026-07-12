# UI contract test tier

Sociable React Testing Library tests with explicit behavioural assertions,
complementing the pixel-only `tests/ui/visual/` tier. They assert text, roles,
structure, recorded command/callback inputs, and dynamic re-renders — never
colour or layout (that stays the visual tier's job).

## Layers

- `specs/` — the tests. Mirror `src/ui/` (minus `ui/`) with component PascalCase
  (`specs/fx/analytics/PnlValue.contract.spec.ts`). Import only
  `@ui-contract/mount`, `@ui-contract/components` (tokens), and `@rtc/domain` types.
  **No React / testing-library imports.**
- `@rtc/ui-contract` (`packages/ui-contract/src/shared/`) — the framework-neutral
  harness, extracted to its own workspace package so a future `client-solid`
  package can consume it without depending on `client-react`. The `@ui-contract`
  alias (see `vitest.config.ts`) resolves into it through the workspace symlink:
  - `harness/world.ts` — a `BehaviorSubject` per hook (the controllable "World")
    plus a command log; `createWorld()`.
  - `harness/component.ts` — `ComponentToken`, the `MountedComponent` page-object
    base (`setProps`/`emit`/`commandLog`), and `component()`.
  - `harness/activeDriver.ts` — the `setDriver`/`getDriver` seam.
  - `mount.ts` — `mount(token, { props, hooks, commands })`.
  - `components.ts` — the neutral tokens.
  - `pages/` — page objects querying raw DOM via `@testing-library/dom`.
- `react/` — **the only framework-specific surface** (still lives in this package):
  - `registry.tsx` — token → React element.
  - `viewModelFromWorld.ts` — `reactViewModel(world)` via `useSyncExternalStore`
    (re-renders the consuming component on each `emit`/`setProps`).
  - `render.tsx` — the driver (providers + a `PropsHost` for the props subject).
  - `setup.ts` — registers the driver via `setDriver`.

## Input channels

`mount(Token, { props?, hooks?, commands? })`:
- `props` — real component props, including callbacks (`onCreated: vi.fn()`).
- `hooks` — initial value per hook, keyed by hook name (`{ useTrades: [...] }`).
- `commands` — canned command results (`{ createRfq: 555 }`).

Drive updates via the returned page object: `page.setProps({...})`,
`page.emit({ useTrades: [...] })`; read recorded commands via accessors like
`page.createdRfq()`.

## Running

- `pnpm --filter @rtc/client-react test` — runs these with the unit suite (jsdom).
- `pnpm --filter @rtc/client-react test:ui:contract` — focused runner (neutral specs
  only, no coverage); HTML report at `reports/ui/contract/report/index.html`.
- `pnpm --filter @rtc/client-react test:ui:contract:coverage` — the **≥95% coverage
  gate** (statements / branches / functions / lines). Runs via a dedicated
  `vitest.coverage.config.ts` that adds the co-located `src/ui/**/*.test.{ts,tsx}`
  unit tests to the include set, so coverage reflects the **combined** `src/ui`
  surface of both Phase-2 test styles (these sociable contract specs **and** the
  co-located hook/util unit tests) — not just this tier. The plain
  `test:ui:contract` runner above stays pure. HTML report at
  `reports/ui/contract/coverage/index.html`. **CI enforces this gate** (the
  "UI contract coverage gate" step in `.github/workflows/ci.yml`).

## Swapping the UI framework (e.g. SolidJS)

1. Add a `solid/` trio — `registry.tsx` (token → Solid element),
   `viewModelFromWorld.ts` (`from(subject)` → signal), `render.tsx`
   (`@solidjs/testing-library`, which re-exports the same `@testing-library/dom`
   queries), and `setup.ts`.
2. Point the vitest config's `setupFiles` at `solid/setup.ts`.

`specs/`, and everything in `@rtc/ui-contract` (`components.ts` (tokens),
`pages/**`, `harness/**`, `mount.ts`) are untouched. The first Solid run's
failures are the behavioural-parity punch-list.

## Dual use: sociable unit and integration

The driver's only output is an `ViewModel` handed to `ViewModelProvider`. This tier
uses **fake** hooks built from the `World`. The same tokens, page objects, and
specs can drive an **integration** test by handing the provider the real
`createViewModel(presenters)` (real presenters fed by the domain `simulators`):
the query methods are valid in both modes; `emit`/`setProps`/`createdRfq` are
unit-mode conveniences. (Integration mode is supported by the design but not yet
built.)
