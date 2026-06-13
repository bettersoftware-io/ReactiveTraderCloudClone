# Behaviour/contract test tier for client UI components

**Date:** 2026-06-11 (revised 2026-06-13)
**Status:** Approved (design)

## Problem

The React components in `@rtc/client` are covered only by the visual-diff tier.
Visual diffs catch pixel regressions, but they are silent about *behaviour*: if
the styling of a component is deliberately changed, its baselines are
regenerated and any behavioural regression rides along unnoticed. We want a
second, complementary tier of **sociable contract tests** with explicit
behavioural assertions.

The components are a thin layer — little internal logic, no coupling beyond an
injected `AppHooks` boundary — so these tests should be easy to write.

## Goals

1. Specs read as **behaviour**, not low-level DOM manipulation.
2. All UI-library tech (React) and **testing-library specifics** are
   encapsulated in page objects / helpers. None of it leaks into the specs.
3. The specs survive a **UI-framework swap** (React → SolidJS / Vue / Svelte):
   only helper/driver code changes; specs and page objects do not.
4. After a component is re-implemented in another framework, the framework can
   be swapped in "like a plugin" and the same specs gate it.
5. Support **dynamic behaviour**: assert re-renders driven by a prop change *or*
   by a hook delivering new data (the app is RxJS-stream-driven).
6. The harness is **dual-use**: the same tokens, page objects, and specs work
   for sociable-unit tests (fake data) *and* integration tests (real domain
   logic), by swapping only the source of `AppHooks`.

These mirror the visual-diff tier's stated goal (ADR-001): treat a
**framework-free contract** as portable, and keep the framework-specific
surface tiny.

## Non-goals

- No assertions on colour, layout, spacing, or any paint-dependent property —
  that remains the visual-diff tier's job. Behaviour tests assert text, roles,
  presence, structure, and recorded command/callback inputs. (E.g. FxBlotter's
  "new trade" highlight is colour-only, so we assert the row *appeared*, not
  that it flashed.)
- Not a full sweep of all ~30 components in this first effort. This effort
  builds the harness and a deliberately diverse **proving slice**; exhaustive
  coverage is a mechanical follow-up.
- Integration mode is *enabled by the design* and documented, but not built in
  this effort (YAGNI until needed).

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Rendering substrate | `@testing-library/react` + jsdom | It *is* RTL; fast (no browser); joins the existing `vitest run`. The `@testing-library/dom` query engine is byte-identical across the `@testing-library/{react,vue,svelte}` and `@solidjs/testing-library` family — only `render()` differs, giving the cleanest possible swap. |
| Component identity in specs | Neutral **tokens** (not strings, not the real component) | A spec imports a token from `@behaviour/components`; the framework driver maps the token to the concrete component. No string keys, no `cases` manifest. The token *is* "the component under test", and is unchanged on a swap. |
| Input model | Three explicit channels: `props`, `hooks`, `commands` | `props` = real component props (incl. callbacks); `hooks` = initial value **keyed by hook name** (so "which hook" is literal); `commands` = canned command results. |
| Dynamic updates | Fakes backed by **RxJS Subjects** (the "World"); page object exposes `setProps` / `emit` | Constant-returning fakes can't trigger re-renders. A Subject per hook (and one for props) lets the test push new values; each framework adapter wires the Subject into its reactivity. `rxjs` is already the shared language. |
| Spec style | Query + assert | Page objects expose semantic queries + actions + update drivers; specs assert with the runner's `expect()`/`vi.fn()` (vitest = the **runner**, framework-neutral). |
| Directory / script | `tests/behaviour/` + `test:behaviour` | Sibling of `tests/visual-diff/`. Avoids overloading "contract" (the WsAdapter `*.contract.test.ts` files in `src/`). |
| Run wiring | Default + focused | Specs run on every `pnpm test` (fast jsdom, no browser) **and** via a focused `test:behaviour` script. |
| File layout | Mirror `src/ui/` (minus `ui/`), component PascalCase, `@behaviour/*` alias | `src/ui/fx/analytics/PnlValue.tsx` → `specs/fx/analytics/PnlValue.behaviour.spec.ts` and `shared/pages/fx/analytics/PnlValuePage.ts`. Nested specs import `@behaviour/mount` etc. without `../../../` plumbing. |

## Architecture

### The central insight — one swap surface

`@testing-library/dom` queries (`getByRole`, `getByText`, `findBy…`) operate on
**raw DOM**, which React, Solid, Vue, and Svelte all produce in jsdom.
Therefore *everything except how a component is rendered/made-reactive can be
framework-neutral*: the specs, the tokens, the page objects, the queries, the
World of Subjects. The framework-specific surface is a small `<framework>/`
trio plus an `~8-line` hook adapter.

### Layout

```
tests/behaviour/
  shared/                         ← NEUTRAL — zero framework/RTL imports; unchanged on swap
    harness/
      component.ts                ← ComponentToken, MountedComponent base, PageContext, component()
      world.ts                    ← HookValues, createWorld(): per-hook BehaviorSubjects + command log
      activeDriver.ts             ← BehaviourDriver interface + setDriver/getDriver seam
    mount.ts                      ← mount(token, { props, hooks, commands }) → page object; cleanup
    components.ts                 ← the neutral tokens (PnlValue, ConnectionStatusBar, …)
    pages/                        ← page objects; mirror src/ui/ + component PascalCase
      fx/analytics/PnlValuePage.ts
      shell/connection/ConnectionStatusBarPage.ts
      fx/blotter/FxBlotterPage.ts
      credit/newRfq/NewRfqFormPage.ts
  react/                          ← FRAMEWORK-SPECIFIC — the ONLY swap surface
    registry.tsx                  ← Map<token, (props) => ReactElement>
    hooksFromWorld.ts             ← reactHooks(world): AppHooks via useSyncExternalStore (re-render on push)
    render.tsx                    ← reactDriver: ThemeProvider + HooksProvider(reactHooks) + PropsHost(props subject)
    setup.ts                      ← setDriver(reactDriver) + afterEach(cleanup)
  specs/                          ← NEUTRAL — the tests; mirror src/ui/ + component PascalCase
    fx/analytics/PnlValue.behaviour.spec.ts
    shell/connection/ConnectionStatusBar.behaviour.spec.ts
    fx/blotter/FxBlotter.behaviour.spec.ts
    credit/newRfq/NewRfqForm.behaviour.spec.ts
  vitest.config.ts                ← focused test:behaviour runner (jsdom; setupFiles react/setup.ts; @behaviour alias)
  README.md
```

### Reused from the visual-diff tier
- `visual-diff/shared/fixtures.ts`, `appData.ts` — the data values (instruments,
  dealers, trades, etc.) are imported by specs that need a populated world.

### Input model — three channels

```ts
mount(Token, {
  props?,      // real component props, INCLUDING callbacks (onCreated: vi.fn())
  hooks?,      // initial value per hook, keyed by hook name (Partial<HookValues>)
  commands?,   // canned results for command hooks (createRfq → 555)
})
```

The returned page object carries **queries** and **update drivers**:

```ts
page.statusText()                       // query (DOM, via @testing-library/dom)
page.setProps({ value: 12_500 })        // push new props → re-render (same instance)
page.emit({ useConnectionStatus: X })   // push new hook data → re-render (same instance)
page.createdRfq()                       // input recorded by the faked useCreateRfq command
```

### How updates re-render — and why it's swap-safe

The neutral `World` holds one `BehaviorSubject` per hook value; `mount` also wraps
`props` in a `BehaviorSubject`. The test pushes via `setProps`/`emit` (`subject.next`).
Each framework adapter subscribes idiomatically:

- **React** (`react/hooksFromWorld.ts`): `useSyncExternalStore` subscribes the
  consuming component to the Subject and re-renders *only that component* on each
  push — preserving its instance/refs (so FxBlotter's `seenTradeIds` ref survives
  a streamed update). A tiny `PropsHost` does the same for the props Subject.
- **Solid**: `from(subject)` → signal.
- **Vue**: a `ref` updated from the subscription, provided via `provide/inject`.
- **Svelte**: a store set from the subscription, passed via `setContext`.

The spec only ever calls `emit`/`setProps` (neutral `.next()`). The single new
per-framework file is `hooksFromWorld` (~8 lines) in each `<framework>/` trio.

### Example spec (identical on every framework)

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@behaviour/mount";
import { ConnectionStatusBar } from "@behaviour/components";
import { ConnectionStatus } from "@rtc/domain";

describe("ConnectionStatusBar", () => {
  it("labels a connected session", () => {
    expect(
      mount(ConnectionStatusBar, { hooks: { useConnectionStatus: ConnectionStatus.CONNECTED } })
        .statusText(),
    ).toBe("Connected");
  });

  it("reflects a live connection drop", () => {
    const bar = mount(ConnectionStatusBar, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    bar.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED }); // stream pushes new data
    expect(bar.statusText()).toBe("Disconnected");
  });
});
```

No `render`, `getByTestId`, `fireEvent`, `act`, `container`, or `@testing-library/*`
import appears in any spec. Those live in page objects (testing-library/dom +
`user-event` — both DOM-level, hence neutral) and the single `react/` trio.

### Page-object conventions

- Prefer **semantic queries** (`getByRole`, `getByText`, `getByLabelText`) over
  `getByTestId`; fall back to `data-testid` only for non-semantic containers
  (`connection-status`, `blotter-table`). Used testids become an explicit part
  of the cross-framework contract — the ported component must reproduce them.
- Actions use `@testing-library/user-event` (real DOM events; framework-neutral),
  return promises; post-action assertions use `findBy…` (auto-retry) rather than
  framework-specific `act()`/flush.
- Page objects extend a neutral `MountedComponent<P>` base providing `setProps`
  and `emit`; "outcome" accessors (e.g. `createdRfq()`) read the command log.

### Dual use — sociable unit and integration

The driver's only output is an `AppHooks` handed to `HooksProvider`. So the same
tokens/pages/specs serve two modes:

- **Sociable unit (this effort):** `AppHooks` built from the fake `World`
  (Subjects). Drive updates with `emit`/`setProps`; assert recorded commands.
- **Integration (future, same harness):** hand the provider the *real*
  `createAppHooks(presenters)` — real presenters fed by the domain `simulators`
  rather than a live WebSocket. Drive updates by advancing the domain; the page
  object reads the resulting DOM. `emit`/`createdRfq` are unit-mode conveniences;
  the **query** methods are valid in both modes, which is why they stay separate.

## Proving slice — 4 components, 4 distinct patterns (each incl. one dynamic test)

| Component | Pattern proven | Behaviour asserted (incl. dynamic) |
|---|---|---|
| **PnlValue** | Pure-prop leaf | `+`/`-` sign; `k`/`m` formatting thresholds; **`setProps` re-renders the new value** |
| **ConnectionStatusBar** | Hook-connected display | Each `ConnectionStatus` → label; **`emit` of a new status updates the label** |
| **FxBlotter** | Sociable list/table | One row per trade; empty state; **`emit` of an extra trade appends a row (same instance)** |
| **NewRfqForm** | Sociable interaction + command spy | Submit disabled until valid; **valid submit records the right `CreateRfqInput`**; confirmation appears; max-quantity blocks submit |

## Dependencies

Dev dependencies to add to `@rtc/client`: `@testing-library/react`,
`@testing-library/dom`, `@testing-library/user-event`. (`vitest`, `jsdom`,
`@vitejs/plugin-react`, `rxjs` already present; `useSyncExternalStore` is a React
built-in.)

## Wiring

- `tests/behaviour/vitest.config.ts`: `environment: "jsdom"`,
  `include: ["tests/behaviour/specs/**/*.behaviour.spec.ts"]`,
  `setupFiles: ["./tests/behaviour/react/setup.ts"]`, `root` pinned to the
  package dir, `resolve.alias` `@behaviour` → `tests/behaviour/shared`, HTML
  report to `reports/behaviour/report/index.html` (per the repo's
  `test:<a>:<b> => reports/<a>/<b>/` rule).
- `package.json` script: `"test:behaviour": "vitest run -c tests/behaviour/vitest.config.ts"`.
- Default run: the root `vitest.config.ts` gains the react plugin, the
  `@behaviour` alias, the behaviour `setupFiles`, and the behaviour specs in
  `include`, so `pnpm test` runs them too.

## The swap, concretely

To bring up a SolidJS port: write `tests/behaviour/solid/{registry,hooksFromWorld,render,setup}.{ts,tsx}`
(~30 lines; uses `@solidjs/testing-library`, which re-exports the same
`@testing-library/dom` queries) and change one line —
`setupFiles: ["…/react/setup.ts"]` → `["…/solid/setup.ts"]`. `specs/`,
`shared/components.ts` (tokens), `shared/pages/**`, `shared/harness/**`,
`shared/mount.ts` are untouched.

Expect a parity punch-list, not day-one green — the first Solid run's failures
*are* the behavioural-parity report.

## Risks / open points

- **Testid contract:** a few testids are part of the portable contract;
  documented as such, reproduced by ports.
- **`act` warnings:** mitigated by `findBy…` assertions, `useSyncExternalStore`
  (proper external-store subscription), and `afterEach` unmount.
- **Parametric query hooks** (`usePrice(pair)`, `usePriceHistory(symbol)`,
  `useQuotesForRfq(rfqId)`) are not exercised by the slice; the React adapter
  returns static empties for them, with a keyed-source extension left for when a
  component that streams them (e.g. Tile) is added.
