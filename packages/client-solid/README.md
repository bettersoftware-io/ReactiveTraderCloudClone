# @rtc/client-solid — SolidJS UI

SolidJS 2 + RxJS + Vite client, at full parity with `@rtc/client-react`. Same clean-architecture seam: components read ALL data through `useViewModel()` (`ViewModel` interface, from `@rtc/solid-bindings` instead of `@rtc/react-bindings`); production wires presenters via `@rx-state/core`'s `state()`, tests inject fakes through `ViewModelProvider`. This package is the empirical proof of [§8.1](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port): a genuinely different reactive framework, running the same behaviour, verified by the same tests.

| | |
|---|---|
| **Ring** | ④ Frameworks & Drivers (`src/ui`, plus the view in `src/main.tsx` and the tree mount in `src/app`); the page's composition root and the ③ platform adapters are in `@rtc/web-boot` — per [§1.3.1](../../docs/architecture/01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring) |
| **Runtime deps** | `@rtc/core-api`, `@rtc/web-boot`, `@rtc/core-logic`, `@rtc/domain`, `@rtc/motion-core`, `@rtc/boot-splash`, `@rtc/layout-dockview`, `@rtc/solid-bindings`, `solid-js`, `@solidjs/web` (Solid 2's DOM renderer, JSX types and `render`), `rxjs` (`package.json` `dependencies`). `@rtc/client-core-rxjs` and `@rx-state/core` are `devDependencies`, for tests. The app reaches all three cores, each a lazy chunk, and the ports (`@rtc/client-adapters`) through `@rtc/web-boot`. No file under `src` imports `rxjs`; it is a listed dependency, and `@rtc/web-boot` (`buildBrowserPorts.ts`) is where it is imported — never in `src/ui` (machine-enforced, gate 34). |
| **Consumed by** | Nothing in-workspace — like `client-react-native`, it is a leaf app and *not* a `tests` (`@rtc/tests`) workspace dependency; its own suites (contract + the visual tier) run entirely in-package. |
| **Must never import** | `rxjs` / `@rx-state` in `src/ui` (gate 34); `local storage` in `src/ui` (gate 35); `fetch(` / `import.meta.env` in `src/ui` (gate 36); `setTimeout` / `setInterval` in `src/ui` (gate 37) — the exact same four-gate shape as `client-react`'s 26–29, re-numbered for this package, see [§12](../../docs/architecture/12-architectural-gates.md#12-architectural-gates). |

## Folder map

| Path | What lives here |
|---|---|
| `src/main.tsx` | Entry point: the `@rtc/web-boot/fonts` import (the font manifest), `createSolidView` (the Solid part of the page: `createSolidTreeMount` over `#root`, and a second reactive root on `#core-swap-overlay` that renders `CoreSwapOverlay` (`src/ui/shell/core/`)) and one `startWebClient({ appId, rootId, env, createView })` call from `@rtc/web-boot` -- the same load-time core selection as `client-react` (`?core=`, stored Preferences choice, `VITE_CORE_IMPL`, then `rxjs`), the same ports built once, the same core host, which renders `<AppRoot composition demoAccounts><App /></AppRoot>` and swaps the core in place when Preferences picks another. While a swap is under way the overlay is shown and `#root` is `inert` (`@rtc/web-boot`'s `coreSwapCover.ts`). It is the only file under `src/` that reads `import.meta.env`, tests aside (grep gate 53) |
| `src/AppRoot.tsx` | UI root of one composition — builds the `ViewModel` from the host's composition and supplies `ViewModelProvider` + theme + `BootGate` |
| `src/app/` | The tree mount (`solidTreeMount.ts`): one reactive root's `mount` / `unmount` / `destroy` for the core host, disposing a partly built root before it rethrows a first-render error. The browser platform adapters, the core host, the core selection and the page's composition root (`startWebClient`) live in `@rtc/web-boot` |
| `src/ui/` | Dumb SolidJS UI (Ring ④) — every component reads data through `useViewModel()`; gates 34–37 keep it framework-swappable, same discipline `client-react`'s gates 26–29 enforce there |
| `src/ui/fx/`, `src/ui/credit/`, `src/ui/equities/` | Per-domain panels, blotters, and tickets — same domain split as `client-react` |
| `src/ui/ops/` | Ops dashboard — health KPIs, service topology, sessions, live event log |
| `src/ui/shell/` | Chrome, layout engine, boot sequence, theme, lock screen, connection overlay, power-saver |
| `tests/setup/` | jsdom test-environment polyfills (e.g. local-storage shim for Node 26), ported from `client-react` |
| `tests/ui/contract/solid/` | This client's half of the ui-contract swap-trio — the Solid `UiContractDriver` (see "Full parity, concretely" below) |
| `tests/ui/visual/solid/` | This client's `@ui-visual` render target — registry, `VisualScenario`, `buildFakeViewModel` |
| `tests/parity/cssParity.test.ts` | Byte-compares this package's CSS Modules against `client-react`'s, so the "ported verbatim" claim is a passing test, not a one-time manual check |

## Where to start reading

1. `src/main.tsx` — the entry point; same `@rtc/web-boot/fonts` import and `startWebClient` call as `client-react`'s, with Solid's view in place of React's.
2. `packages/web-boot/src/coreHost.ts` then `src/AppRoot.tsx` — where the chosen core is composed over the page's ports (the host, framework-free) and meets Solid (no `useRef`/StrictMode concern here — Solid's setup runs once, by construction).
3. `packages/web-boot/src/buildBrowserPorts.ts` — real-WS-vs-simulator port wiring, shared by both web clients.
4. `src/ui/App.tsx` — the dumb top-level UI tree, structurally identical to `client-react`'s `App.tsx`.
5. `tests/parity/cssParity.test.ts` — read this before touching any `.module.css` file in this package: it is the enforcement mechanism behind "ported verbatim."

## Full parity, concretely

"Full parity" is not a claim in a document — it is three passing test suites, each asserting against `client-react`'s own artifacts rather than this package's:

- **Contract parity** — the components under `src/ui` are exercised by the *same* shared `*.contract.spec.ts` files from `@rtc/ui-contract` that verify `client-react`. This package supplies only its half of the swap-trio (`tests/ui/contract/solid/`, registering a Solid `UiContractDriver`); the spec files themselves are an unmodified `devDependency` import.
- **Visual parity** — the surviving `playwright` assertion tier is **assert-only**: this package owns **no golden images of its own**. Its `snapshotDir` points at `packages/ui-contract/goldens/playwright/__screenshots__/`, so a passing run is a direct pixel match against goldens generated only from React's renders, across the full theme matrix (5 skins × dark/light). Passing `--update-snapshots` (or `-u` in any form) to this package's visual config throws — goldens are owned by `client-react`; regenerate them there. (A 2026-07-20 test-tooling bake-off retired this package's `playwright-ct` URL-navigation fallback and its `vitest-browser` assertion tier; `vitest-browser` survives only as the coverage instrument, `test:ui:visual:vitest-browser:solid:coverage` — see [§9.7's Outcome](../../docs/architecture/09-test-strategy.md#97-visual-golden-tiers) and [ADR-001's Outcome section](../client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md).)
- **Behavioural parity** — the shared Gherkin `.feature` suites run against this client the same way they run against `client-react`, through a Solid implementation of the same page-object interfaces.

Full synthesis of how these three mechanisms share one source of truth, plus the live pass/fail scoreboard and what each tier has actually caught: [§21 Cross-Framework Testing](../../docs/architecture/21-cross-framework-testing.md).

## CSS Modules: ported verbatim

Every `.module.css` file in `src/ui` is a byte-for-byte copy of `client-react`'s — the CSS-Modules migration deliberately left zero inline styles and semantic `data-*` state hooks precisely so markup/styling could survive a framework swap unchanged ([§8.1](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)). `tests/parity/cssParity.test.ts` enforces this as a running test, not a one-time port: it fails if this package's CSS drifts from `client-react`'s.

## Dev server

```bash
pnpm dev:solid           # this package alone (Vite) → http://localhost:5473 — simulator mode, no server; alias of dev:solid:sim
pnpm dev:solid:ws:local  # connected to an already-running local `pnpm dev:ws` (ws://localhost:4000)
pnpm dev:solid:ws:remote # connected to the deployed server (wss://rtc-clone-server.fly.dev)
pnpm dev:solid:fs        # full stack: starts the WS server + this client together
```
5173 is `client-react`'s port, 5273 is `client-prototype`'s; 5473 is this package's, following the same convention.

## Scripts

| script | purpose |
|---|---|
| `dev` | Vite dev server |
| `build` | Vite build |
| `typecheck` | src + node + ui-contract + ui-visual tsconfigs |
| `test` | Vitest (jsdom): app-tier + co-located unit tests |
| `test:ui:contract` | ui contract tier — the shared `@rtc/ui-contract` specs, driven through this package's Solid swap-trio |
| `test:ui:contract:coverage` | coverage gate over the combined `src/ui` surface, same shape as `client-react`'s |
| `test:ui:visual:vitest-browser:solid:coverage` | the visual-reach coverage instrument (istanbul over `src/ui` while every scenario renders; pixel assert compiled out) |
| `test:ui:visual` / `test:ui:visual:solid` | the visual tier, assert-only against `client-react`'s goldens |
| `test:ui:visual:playwright:solid[:ui]` | The CI-asserted tier — plain Playwright over a Vite host, reusing `client-react`'s `visual.spec.ts` verbatim |
| `clean` / `clean:deep` | remove build/test artifacts (/ + node_modules) |

## Solid 2 and this port

The client runs on Solid 2 (`solid-js` 2, `@solidjs/web`, `@solidjs/vite-plugin`
3; migrated from Solid 1.9 on 2026-11-22). The rules that shape its code, each
backed by Solid's own dev diagnostics (dev builds print `[CODE] message`; the
repair guide is `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`)
and by `eslint-plugin-solid`'s `v2` config:

**Writes apply at the next microtask.** A burst of writes in one turn lands in
one flush, which is exactly the UI half of the core's "a burst is delivered in
one turn" guarantee (`@rtc/solid-bindings`' `toSignal` forwards each emission
as a write). Code never reads its own write back in the same turn. Tests apply
writes before asserting: the contract driver's `flushSync`/`flushAsync` call
`flush()`, `tests/setup/flush-after-each-event.ts` makes Testing Library's
`eventWrapper` flush after every fired event (what a browser's task boundary
between two input events does), and the page objects that call a hook's
handlers directly wrap them in `tests/ui/pages/thenFlush.ts`.

**Effects split compute from apply.** `createEffect(compute, apply)`: every
reactive read goes in `compute`, which is what the effect tracks; `apply` runs
the side effect and is untracked, and a reactive read there dev-warns
(`STRICT_READ_UNTRACKED … in an effect callback`) because it would never
re-run the effect. The apply receives the previous compute value as its second
argument, which is how the bookkeeping effects (new-trade flash, RFQ cascades,
the dock reset counter) get their "previous" baseline — undefined on the first
run, so they fall back to the current value (`previous ?? current`). Effects
never compare, so an effect whose apply must not re-run on an equal value
reads a `createMemo` in its compute (`ModalShell`, `JarvisOverlay`). Mount-time
work is `onSettled` (a returned function is its cleanup), not `onMount`.

**Imperative callers read plain copies.** The dock engine pulls panel titles,
maximize scopes and the docked set through callbacks, and `ChartPanel`'s
paging handlers run from `CandleChart`'s effects — both from inside an apply
phase, where a reactive read is untracked and warns. Each keeps a plain copy
refreshed by a `createRenderEffect` (render effects run before every user
effect of the same flush, so the copy is never stale when read).
`SceneCanvas` takes its scene as a prop read in the compute phase instead of
inside the `draw` closure, so a new scene repaints.

**No writes in owned scopes.** A signal write in a component body, a memo or
an effect's compute throws in dev. Writes live in event handlers, effect
applies and `onSettled`; the bindings' bridge signal keeps the guard too (see
its README). A test writes from outside the root it built, as a handler
would.

**The default is a live read.** A read that feeds rendered output belongs in
the JSX (or in an accessor/`createMemo` the JSX calls), where it is tracked; a
value copied to a `const` at setup is the bug `STRICT_READ_UNTRACKED` and
`solid/reactivity` exist to catch. `<For>`/`<Show>` callback arguments are read
in the JSX, never at the top of the callback. Where a prop is a callback,
forward it (`function finishBoot() { props.onDone(); }`) rather than capturing
it, so the read happens when it fires.

**`untrack` marks a deliberate snapshot, nothing else.** In a component body
it silences `STRICT_READ_UNTRACKED`, so it is only correct where the value must
never follow its source — and the site names, in one line, the invariant that
keeps it correct. `grep -rn "untrack(" packages/client-solid/src | grep -v import`
lists every site. They fall into two groups:

- **Hook-seed.** `Tile.tsx` (`seedPair` → `useStaleFlag` / `useNotional` /
  `useTileExecution` / `useRfqTile`), `BlotterRow.tsx` (`useRowHighlight`),
  `RfqCard.tsx` (`useRfqCountdown`'s `creationTimestamp`), `App.tsx`
  (`useLayout`'s and `useDockedPanelIds`' tab), `UserRow.tsx`
  (`useAccountAction`'s id), `OrderTicket.tsx` (`useOrderTicket`'s symbol),
  `AppRoot.tsx` (the composition), `ViewMenu`/`LayoutPresetsSection` (the tab).
- **Deliberate, for a behavioural reason.** `RfqCountdown`/`RfqCard` drive ONE
  mount-time CSS keyframe fast-forwarded by a negative delay, and a per-tick
  rewrite re-triggers it every tick; the blotter filter popovers
  (`DateFilter`/`SetFilter`/`NumberFilter`) and `OwnKeySection`'s forms seed
  editing signals the user then owns, so a live read would clobber half-typed
  input; `useRankGlide` seeds `committed` once (it follows the candidate only
  through its coalescing effect); `App.tsx`'s `untrack(dockedPanels)` keeps one
  uniform identity across a merge.

**The seam takes accessors.** Every `@rtc/solid-bindings` ViewModel hook whose
body is nothing but a keyed subscription — `usePrice`, `usePriceHistory`,
`useQuotesForRfq`, `useAnimationIntents`, `useEquityQuote`, `useCandles`,
`useCandleBackfill`, `useDepth`, `useJarvisPanelData` — takes each key as
`T | Accessor<T>`, independently per key. The accessor form re-subscribes when
the key's resolved **value** changes — not on every read of it (see
`toKeyedSignal`). Write `usePrice(() => props.pair)` and there is no snapshot
to justify. The hooks that stay **value-only** are the ones that build
something on the key rather than subscribe to it: `useStaleFlag`,
`useRowHighlight`, `useNotional`, `useRfqCountdown`, `useTileExecution`,
`useRfqTile`, `useOrderTicket`, `useBootSequence` (per-mount machines —
re-keying would dispose and rebuild one) and `useLayout` (a composition-root
singleton per tab).

**Attributes are presence/absence.** Solid 2 writes `false` as "remove the
attribute" and `true` as an empty one, so every `aria-*` state and
`data-stale` spell out `"true"`/`"false"` (the JSX types reject a boolean on an
enumerated `aria-*` attribute; `solid/no-boolean-enumerated-attribute` too),
and built-in attributes are lowercase (`tabindex`, `colspan`, `maxlength`,
`novalidate`, `inputmode`).

**Lint.** `eslint-plugin-solid` runs its `v2` config over this package and the
bindings. There are no `eslint-disable` directives for its rules, in `src/` and
`tests/` alike, and adding one is a review defect.

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [`@rtc/client-react`'s README](../client-react/README.md) — the package this one mirrors component-for-component
- [`@rtc/solid-bindings`'s README](../solid-bindings/README.md) — the bindings bridge this package sits on
- [`@rtc/ui-contract`'s README](../ui-contract/README.md) — the shared contract + visual scenario manifest both clients consume
- [§8.1 The Multi-Client Proof & the SolidJS Port](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)
- [`packages/client-react/tests/ui/visual/README.md`](../client-react/tests/ui/visual/README.md) — the visual-tier design this package asserts against
