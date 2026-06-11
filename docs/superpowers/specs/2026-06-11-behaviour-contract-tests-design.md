# Behaviour/contract test tier for client UI components

**Date:** 2026-06-11
**Status:** Approved (design)

## Problem

The React components in `@rtc/client` are covered only by the visual-diff tier.
Visual diffs catch pixel regressions, but they are silent about *behaviour*: if
the styling of a component is deliberately changed, its baselines are
regenerated and any behavioural regression rides along unnoticed. We want a
second, complementary tier of **sociable contract tests** with explicit
behavioural assertions.

The components are a thin layer — no business logic, no coupling beyond an
injected `AppHooks` boundary — so these tests should be easy to write.

## Goals

1. Specs read as **behaviour**, not low-level DOM manipulation.
2. All UI-library tech (React) and **testing-library specifics** are
   encapsulated in page objects / helpers. None of it leaks into the specs.
3. The specs survive a **UI-framework swap** (React → SolidJS / Vue / Svelte):
   only helper/driver code changes; specs and page objects do not.
4. After a component is re-implemented in another framework, the framework can
   be swapped in "like a plugin" and the same specs gate it.

These mirror the visual-diff tier's stated goal (ADR-001): treat a
**framework-free contract** as portable, and keep the framework-specific
surface tiny.

## Non-goals

- No assertions on colour, layout, spacing, or any paint-dependent property —
  that remains the visual-diff tier's job. Clean separation: behaviour/semantics
  → this tier (jsdom, fast); pixels → visual-diff (real browser).
- Not a full sweep of all ~30 components in this first effort. This effort
  builds the harness and a deliberately diverse **proving slice**; exhaustive
  coverage is a mechanical follow-up.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Rendering substrate | `@testing-library/react` + jsdom | It *is* RTL; fast (no browser); joins the existing `vitest run`. The `@testing-library/dom` query engine is byte-identical across the `@testing-library/{react,vue,svelte}` and `@solidjs/testing-library` family — only `render()` differs, giving the cleanest possible swap. |
| Scope | Proving slice (4 components) | Validate the whole approach across every distinct component pattern before committing to ~30 files. |
| Spec style | Query + assert | Page objects expose semantic queries + actions; specs assert with the runner's `expect()`. `expect`/`it` are vitest (the **runner**, framework-neutral), not UI-library tech, so they survive the swap. Best failure diffs; most familiar. |
| Directory / script | `tests/behaviour/` + `test:behaviour` | Sibling of `tests/visual-diff/`. Avoids overloading "contract", which already names the WsAdapter `*.contract.test.ts` files in `src/`. |
| Run wiring | Default + focused | Specs run on every `pnpm test` (fast jsdom, no browser) **and** via a focused `test:behaviour` script for the tight loop. |

## Architecture

### The central insight — one swap surface

`@testing-library/dom` queries (`getByRole`, `getByText`, `findBy…`) operate on
**raw DOM**, which React, Solid, Vue, and Svelte all produce in jsdom.
Therefore *everything except `render()` can be framework-neutral*: the specs,
the page objects, the queries, and the command recorder. The framework swap is
literally **one file** (plus the framework's own component registry, which a
port needs regardless).

### Layout

```
tests/behaviour/
  shared/                         ← NEUTRAL — zero framework/RTL imports; never changes on swap
    cases.ts                      ← caseName → { componentKey, fixtureKey?, props?, results? }
                                     reuses visual-diff/shared/fixtures.ts; adds leaf + state cases
    mount.ts                      ← mount(caseName) → typed PageObject:
                                     build recording hooks → call active driver render → wrap in page object
    recordingHooks.ts             ← buildRecordingHooks(data, results?): AppHooks whose COMMANDS
                                     record their inputs and emit canned one-shot Observables (of(...))
    activeDriver.ts               ← setDriver()/getDriver() seam (dependency inversion)
    pages/                        ← mirrors src/ui/ structure + component PascalCase
      fx/analytics/PnlValuePage.ts          ← queries a DOM root via @testing-library/dom + recorder accessors
      shell/connection/ConnectionStatusBarPage.ts
      credit/newRfq/NewRfqFormPage.ts
      fx/blotter/FxBlotterPage.ts
      index.ts                    ← componentKey → (root, recorder) => PageObject
  react/                          ← FRAMEWORK-SPECIFIC — the ONLY swap surface
    render.tsx                    ← @testing-library/react render of
                                     <ThemeProvider><HooksProvider hooks>{element}</HooksProvider></ThemeProvider>;
                                     reuses visual-diff/react/registry.tsx for fixture-driven components,
                                     plus a small prop-driven extension for leaves (e.g. PnlValue)
    setup.ts                      ← setDriver(reactDriver). Named in the behaviour vitest config's setupFiles.
  specs/                          ← NEUTRAL — the tests; mirror src/ui/ structure + component PascalCase
    fx/analytics/PnlValue.behaviour.spec.ts
    shell/connection/ConnectionStatusBar.behaviour.spec.ts
    credit/newRfq/NewRfqForm.behaviour.spec.ts
    fx/blotter/FxBlotter.behaviour.spec.ts
  vitest.config.ts                ← env jsdom; setupFiles: react/setup.ts;
                                     include: specs/**/*.behaviour.spec.ts; resolve.alias @behaviour/* → shared/*;
                                     report → reports/behaviour/ (repo test:<a>:<b> routing rule)
```

### File layout conventions

- **Specs and page objects mirror `src/ui/`** (dropping the `ui/` prefix) and keep
  each component's PascalCase: `src/ui/fx/analytics/PnlValue.tsx` →
  `specs/fx/analytics/PnlValue.behaviour.spec.ts` and
  `shared/pages/fx/analytics/PnlValuePage.ts`. This is a deliberate deviation
  from the flat, lowercase visual-diff tier (`tile.spec.tsx`); with ~30 specs
  eventually, one-per-component navigability is worth it.
- **Path alias `@behaviour/*` → `tests/behaviour/shared/*`** (tsconfig `paths` +
  vitest `resolve.alias`). Nested specs import `@behaviour/mount`,
  `@behaviour/cases` regardless of depth — no `../../../` plumbing leaking into
  specs, reinforcing goal #2.

### What is reused vs new

Reused from the visual-diff tier **unchanged**:
- `visual-diff/shared/fixtures.ts`, `appData.ts` — the data manifest.
- `visual-diff/react/registry.tsx` — componentKey → React element for
  fixture-driven components. The behaviour `react/render.tsx` imports it and only
  adds prop-driven leaves not present in the screenshot registry.

New (behaviour tier):
- Neutral: `cases.ts`, `mount.ts`, `recordingHooks.ts`, `activeDriver.ts`,
  `pages/*`, `specs/*`.
- React: `render.tsx`, `setup.ts`.

### Data flow of `mount(caseName)`

1. Look up the case → `{ componentKey, fixtureKey?, props?, results? }`.
2. `data = fixtures[fixtureKey]` (or empty data for prop-only leaves).
3. `recorder` + `hooks = buildRecordingHooks(data, results)` — query hooks read
   from `data`; command hooks push their inputs into `recorder` and return
   `of(cannedResult)` so callers' `firstValueFrom(...)` resolves.
4. `getDriver().render(componentKey, { props, hooks })` → `{ root, unmount }`.
5. `pages[componentKey](root, recorder)` → typed page object.
6. Return the page object. (`mount` is typed via the `cases` map so
   `mount("connection-status/connected")` returns a `ConnectionStatusBarPage`.)

`mount` is registered for automatic cleanup (`afterEach` unmount) in the tier
setup.

### How a spec looks

```ts
import { mount } from "@behaviour/mount";
import { ConnectionStatus, Direction } from "@rtc/domain"; // ubiquitous language, not UI tech

it("labels a connected session", () => {
  const bar = mount("connection-status/connected");
  expect(bar.statusText()).toBe("Connected");
});

it("submits a valid RFQ with the entered details", async () => {
  const form = mount("new-rfq/ready");
  await form.chooseInstrument("Apple Inc 4.5% 2030");
  await form.setQuantity(1_000_000);
  await form.setDirection(Direction.Buy);
  await form.submit();
  expect(form.createdRfq()).toMatchObject({ quantity: 1_000_000, direction: Direction.Buy });
  await form.shouldShowConfirmation();
});
```

No `render`, `getByTestId`, `fireEvent`, `act`, `container`, or `@testing-library/*`
import appears in any spec. Those live in page objects (testing-library/dom
queries + `user-event` — both DOM-level, hence neutral) and the single
`react/render.tsx`.

### Page-object conventions

- Prefer **semantic queries** (`getByRole`, `getByText`, `getByLabelText`) over
  `getByTestId`; fall back to `data-testid` only for non-semantic containers
  (e.g. `connection-status`, `blotter-table`). Testids that are used become an
  explicit part of the cross-framework contract — the Solid port must reproduce
  them.
- Actions use `@testing-library/user-event` (real DOM events; framework-neutral)
  and return promises.
- Post-action assertions use `findBy…` (auto-retry) rather than framework-specific
  `act()`/flush, so React's async updates settle without leaking framework
  knowledge into the neutral layer.
- "Outcome" accessors that observe a command (e.g. `createdRfq()`) read from the
  `recorder`, not the DOM.

### Command recorder (sociable boundary)

These are **sociable** tests: real child components render (NewRfqForm renders
the real InstrumentSearch/DealerSelection/QuantityInput; FxBlotter renders the
real header/rows/filter). The only fake is at the `AppHooks` seam.

`buildRecordingHooks` wraps each command hook so it records inputs and emits a
canned result, e.g.:

```ts
useCreateRfq: () => (input) => { recorder.createRfq.push(input); return of(results.createRfq ?? 1); }
```

This matches the real contract (`useCreateRfq()` returns
`(input) => Observable<number>`, consumed via `firstValueFrom`).

## Proving slice — 4 components, 4 distinct patterns

| Component | Pattern proven | Representative behaviour asserted |
|---|---|---|
| **PnlValue** | Pure-prop leaf; no hooks/providers/testid | `+`/`-` sign by value; `k`/`m` formatting at the 1e3 / 1e6 thresholds |
| **ConnectionStatusBar** | Hooks-connected display; parametrized states | Each `ConnectionStatus` renders its expected label |
| **NewRfqForm** | Sociable interaction + command spy + async | Submit disabled until valid; valid submit records the right `CreateRfqInput`; confirmation appears |
| **FxBlotter** | Sociable list/table; collection + empty state | One row per trade; header present; "No trades yet" when empty |

## Dependencies

Dev dependencies to add to `@rtc/client`:
- `@testing-library/react`
- `@testing-library/dom`
- `@testing-library/user-event`

(`vitest`, `jsdom`, `@vitejs/plugin-react` already present.)

## Wiring

- `tests/behaviour/vitest.config.ts`: `environment: "jsdom"`,
  `include: ["tests/behaviour/specs/**/*.behaviour.spec.ts"]`,
  `setupFiles: ["tests/behaviour/react/setup.ts"]`,
  `resolve.alias` `@behaviour/*` → `tests/behaviour/shared/*`, HTML report to
  `reports/behaviour/report/index.html` (per the repo's
  `test:<a>:<b> => reports/<a>/<b>/` rule).
- `package.json` script: `"test:behaviour": "vitest run -c tests/behaviour/vitest.config.ts"`.
- Default run: extend the root `vitest.config.ts` `include` (or add the behaviour
  specs to it) so `pnpm test` also runs them. They are fast jsdom tests with no
  browser, so they belong in the default safety net.

## The swap, concretely

To bring up a SolidJS port:
1. Write `tests/behaviour/solid/render.tsx` and `solid/setup.ts` (and the Solid
   component registry, which the Solid port needs anyway).
2. Change **one line** in the behaviour vitest config:
   `setupFiles: ["…/react/setup.ts"]` → `["…/solid/setup.ts"]`.

Specs, page objects, the recorder, and `cases.ts` are untouched. The
`@testing-library/dom` queries are identical because `@solidjs/testing-library`
re-exports them.

Expect a parity punch-list, not day-one green — exactly as ADR-001 notes for the
visual tier. The first Solid run's failures *are* the behavioural-parity report.

## Risks / open points

- **Testid contract:** semantic queries are preferred, but a few testids are part
  of the portable contract. Documented as such; the Solid port reproduces them.
- **NewRfqForm `setTimeout(onCreated, 1500)`:** the confirmation-then-callback
  path uses a real timer. The confirmation assertion uses `findBy…` (no fake
  timers needed); asserting the `onCreated` callback fired, if tested, will use
  vitest fake timers within the page object/spec, kept out of the neutral query
  path.
- **act warnings:** mitigated by `findBy…`-based assertions and the tier's
  `afterEach` unmount; no framework `act()` in neutral code.
```
