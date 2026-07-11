[◀ 15. Flows](15-flows.md) · [Architecture Document](../architecture.md) · [17. The Web Client, Up Close ▶](17-web-client-up-close.md)

## 16. Trailheads

Five task recipes, each a starting point ("trailhead") for a change that touches more than one file. Every route below was walked against the working tree — file paths and the file:line evidence are in the task report, not repeated here — so treat each numbered file as a real stop, not a guess. Each recipe ends with a change-impact checklist: what to re-run, which grep gates apply, whether visual goldens move, and which inventory tables need a new row.

### 1. Add a currency pair

**Route**

1. `packages/domain/src/fx/currencyPair.ts` — append an entry to `KNOWN_CURRENCY_PAIRS` (`symbol`, `ratePrecision`, `pipsPosition`, `base`, `terms`, `defaultNotional`, `baseMid`, `typicalSpreadPips`). This is the single source of truth for FX pairs.
2. Nothing else on the pricing/reference-data path needs an edit — `ReferenceDataSimulator` and `PricingSimulator` both iterate `KNOWN_CURRENCY_PAIRS` at runtime, so a new entry there is enough to make the pair price, stream, and trade.
3. *(Optional)* `packages/domain/src/simulators/AnalyticsSimulator.ts` — `STATIC_POSITIONS` is a hand-maintained list that mirrors all nine pairs with a starting position. Add an entry here only if you want the new pair to show up with a nonzero net exposure out of the box.

**Change-impact checklist**

- Tests to update: `ReferenceDataSimulator.test.ts` and (if you touched step 3) `AnalyticsSimulator.test.ts` both hardcode `toHaveLength(9)` for the pair/position count — bump to the new count. (`DealerSimulator.test.ts`'s `toHaveLength(9)` is Credit dealers, not FX pairs — do not touch it.)
- `LiveRatesHead.contract.spec.ts` reads `KNOWN_CURRENCY_PAIRS.length` dynamically — no edit, just rerun.
- Grep gates: none of the 29 gates touch domain data files directly — skip.
- Visual goldens: **yes** — any panel rendering the pair list (watchlist row count, blotter filters) diffs. Regenerate both committed sets (CI-canonical `react/` + local `react-local/<arch>`) across all three visual tiers.
- UI contract coverage: rerun `test:ui:contract:coverage`; a new pair adds no new component so the percentage shouldn't move — just confirm still green.
- Inventory: none. Currency pairs are data, not modules — §13's exhaustive listings cover ports/simulators/effects folders, not data-table rows inside a file.

**Dry-run (read-only, recipe 1):** confirmed live against the tree — `packages/domain/src/fx/currencyPair.ts` exists and step 1 is a real, minimal edit point (the `KNOWN_CURRENCY_PAIRS` array); `packages/domain/src/simulators/ReferenceDataSimulator.ts` imports and directly returns that same constant (`of(KNOWN_CURRENCY_PAIRS)`), and `PricingSimulator.ts` loops `for (const pair of KNOWN_CURRENCY_PAIRS)` to seed its price walks — so the ordering (edit the constant first, nothing downstream needs touching) holds. `AnalyticsSimulator.ts`'s `STATIC_POSITIONS` is confirmed separate and hand-maintained (own literal array, not derived from `KNOWN_CURRENCY_PAIRS`). The two `toHaveLength(9)` assertions in `ReferenceDataSimulator.test.ts` and `AnalyticsSimulator.test.ts` are confirmed real and count-coupled to these arrays.

### 2. Add a port + adapter + simulator

Worked example: `PositionPort` (the equities position book) — a small, recently-added port with a clean single-purpose route.

**Route**

1. `packages/domain/src/ports/<name>Port.ts` — new interface, typically one or two `Observable`-returning methods (`positionPort.ts` is a 7-line model: `positions(): Observable<readonly EquityPosition[]>`).
2. `packages/domain/src/index.ts` — export the port type from the package barrel.
3. `packages/domain/src/simulators/<Name>Simulator.ts` — the in-memory implementation (`EquityPositionSimulator.ts`).
4. `packages/domain/src/simulators/index.ts` — export the simulator from the barrel.
5. `packages/domain/src/ports/__contracts__/<Name>PortContract.ts` (+ a `.smoke.test.ts` peer) — a parameterised happy-path suite runnable against both the simulator and the WsReal adapter.
6. `packages/client-core/src/adapters/portFactory.ts` — three edits in one file: add the port to the aggregate `Ports` type, wire the simulator into `createSimulatorPorts`, and add a `create<Name>Port(ws)` WsReal factory that sends a subscribe message and listens for the matching stream message (see recipe 3 for that message's own route).
7. `packages/client-core/src/presenters/<Name>Presenter.ts` — a thin RxJS wrapper turning the port into presenter state (`PositionsPresenter` is a short constructor taking the port).
8. `packages/client-core/src/presenters/index.ts` — export it.
9. `packages/client-core/src/composition.ts` — instantiate the presenter inside `createApp`, wired to the new port.
10. *(only if server-backed)* `packages/server/src/services/serviceContainer.ts` — construct the simulator/service on the server side and expose it on the services container.
11. *(only if server-backed)* a new effect in `packages/server/src/effects/<domain>.effects.ts` — this is recipe 3's territory.

**Change-impact checklist**

- Tests: `<Name>Simulator.test.ts` + `<Name>Simulator.contract.test.ts`, the new port contract test, and any `portFactory` adapter tests.
- Grep gate 23: contract describers under `packages/domain/src/ports/__contracts__/` may not import from `simulators/`, `@rtc/client-react`, or `@rtc/shared/__fixtures__/` — keep the new contract file clean.
- Visual goldens: only if a UI panel consumes the new port (then also follow recipe 4's checklist) — otherwise none.
- Inventory (exhaustive per Global Constraints): `packages/domain/src/ports/` and `packages/domain/src/simulators/` are both inventory folders — §13's exhaustive listing of each must gain a row.
- README: `packages/domain/README.md` folder map / "where to start reading" list.

### 3. Add a wire message

Worked example: `SUBSCRIBE_POSITIONS` / `POSITIONS` (a bulk stream message, the simplest shape) — every file its name touches, traced end to end.

**Route**

1. `packages/shared/src/protocol/messages.ts` — add the `CLIENT_MSG`/`SERVER_MSG` constant, following the existing `"subscribe.<name>"` / `"stream.<name>"` string convention.
2. `packages/shared/src/protocol/messages.test.ts` — a literal assertion pinning the wire string (`expect(SERVER_MSG.POSITIONS).toBe("stream.positions")`), so a rename is caught at the protocol boundary.
3. `packages/shared/src/fx/<name>Dto.ts` (or `credit/`, `equities/`, …) — a payload DTO, only if the message carries a shape not already covered by an existing entity type.
4. `packages/server/src/effects/<domain>.effects.ts` — a `WsEffect` built with the `stream()` sugar: subscribe on the `CLIENT_MSG`, map the port's observable to `out(SERVER_MSG.X, data)`, then add the effect to the file's exported effects array.
5. `packages/server/src/effects/<domain>.effects.test.ts` — a unit test asserting the emitted frame shape.
6. `packages/client-core/src/adapters/portFactory.ts` — the WsReal port method: `ws.send(CLIENT_MSG.SUBSCRIBE_X)` on subscribe, `ws.on(SERVER_MSG.X, ...)` to receive.
7. *(optional)* `packages/shared/src/__fixtures__/wireFrames.ts` — a shared fixture frame if other suites (fullstack smokes, contract tests) need to construct one without duplicating the shape.

**Change-impact checklist**

- Tests: `messages.test.ts`, the new/updated effect test, and the `portFactory` adapter test for the consuming port.
- Grep gates: none of the 29 name the protocol layer directly; the closest thing to a wire-format gate is the fullstack e2e smokes in the `tests` workspace — rerun `pnpm test:e2e` (or `test:e2e:no-cypress` locally) if the message is reachable end to end.
- Visual goldens: only if the message feeds a UI panel already rendering data (then follow recipe 4's checklist too).
- Inventory (exhaustive per Global Constraints): `packages/server/src/effects/` is an inventory folder — if you added an effect, §13's exhaustive effects listing must gain a row.
- README: `packages/shared/README.md` (wire protocol is its SoT) and, if you added an effect, `packages/server/README.md`.

### 4. Add a UI panel (web and/or RN)

Worked example: `PositionsPanel` (web) / the equities `PositionsBlotter` (RN) — both real, both consuming a port already wired per recipe 2.

**Route (web)**

1. A ViewModel member already exposing the data (recipe 2) — or reuse an existing one (`PositionsPanel` reuses `useAnalytics`/`useAnalyticsStaleFlag` rather than adding a new member).
2. `packages/react-bindings/src/createViewModel.ts` — if the data is genuinely new, add the field and wire it from `presenters.<name>.<name>$`.
3. `packages/client-react/src/ui/<domain>/<name>/<Name>Panel.tsx` + a co-located `.module.css` — the dumb component: `useViewModel()` for data, plain `data-testid="..."` literals in JSX are fine here (grep gate 1's "no raw `data-testid`" rule is scoped to the `tests/` package tree by design — it polices `tests/browser/page-objects/`, not `packages/*/src/ui`: the component is the *definition site* for a test-id literal, while `tests/` is the *registry-guarded consumption site* that must go through the `TESTIDS` constants; any drift between the two fails the page-object/contract tests loudly, which is why a second gate on `packages/*/src` isn't needed today. Extending gate 1's scope there is a deferred registry-relocation — see the [atomic-renames plan](../superpowers/plans/2026-07-10-atomic-testid-renames.md)).
4. `packages/client-react/src/ui/shell/layout/engine/appPanelRegistry.tsx` — register the panel id → component (one line per existing entry, e.g. `"fx-positions": () => <PositionsPanel />`).
5. `tests/browser/page-objects/contracts/testids.ts` — add the panel's canonical test-id constant. This file **is** the one place gate 1 requires the literal to live. See the [atomic-renames plan](../superpowers/plans/2026-07-10-atomic-testid-renames.md) for the deferred registry-import refactor.
6. `packages/client-react/tests/ui/contract/shared/pages/<domain>/<name>/<Name>PanelPage.ts` + a registration line in `shared/components.ts` — the page-object and its wiring for the sociable-RTL contract tier.
7. `packages/client-react/tests/ui/contract/specs/<domain>/<name>/<Name>Panel.contract.spec.ts` — the contract spec itself.
8. `packages/client-react/tests/ui/visual/react/registry.tsx` + `shared/scenarios.ts` + `shared/fixtures.ts` — register the component and its visual-scenario fixtures so all three visual tiers can render it.
9. *(optional RN)* `packages/client-react-native/src/ui/<domain>/<name>/<Name>.tsx`, wired into an existing screen (e.g. `PositionsBlotter` inside `BlottersView.tsx`) or a new route file under `packages/client-react-native/app/*.tsx` that imports a screen from `src/ui`.

**Change-impact checklist**

- Grep gates 26–29 apply to every new file under `client-react/src/ui/**`: no `rxjs`/`@react-rxjs`/`@rx-state` import, no `localStorage`, no `fetch`/`import.meta.env`, no `setTimeout`/`setInterval` — all business/timer/transport/storage logic stays behind the ViewModel seam. If the panel gets an RN counterpart (step 9), gates 30–33 apply the identical rules to `client-react-native/src/ui/**`: no `rxjs`/`@react-rxjs`/`@rx-state`, no `localStorage`/`AsyncStorage`, no `fetch`/`expo-constants`/env reads, no `setTimeout`/`setInterval`.
- Visual goldens: **always**, for any new or changed component in the registry — regenerate **both** committed sets (CI-canonical `react/` + local `react-local/<arch>`) across all three runners (playwright-ct, playwright, vitest-browser) via each tier's `:update` script.
- UI contract coverage: the ≥95% gate is CI-only but runnable locally — always run `test:ui:contract:coverage` before merging a new panel.
- Behavioural/e2e: if the panel is reachable in the default layout, the ten-suite e2e tier may need a new or extended `.feature` scenario plus step definitions.
- Inventory: §13.3 (L2 module maps) is prose-described, not exhaustive, but should gain a mention of the new panel's role; `packages/client-react/README.md` folder map.

### 5. Add a package

**Route** — what a brand-new `packages/<name>` must join, verified against the actual configs rather than assumed:

1. `packages/<name>/package.json` — must declare a `typecheck` script and a `test` (or `test:*`) script; enforced by `scripts/check-workspace-scripts.mjs` (`pnpm check:scripts`), which reads the workspace list from `pnpm-workspace.yaml`'s `packages/*` glob and requires both keys.
2. `packages/<name>/tsconfig.json`, extending `../../tsconfig.base.json` (the pattern every existing tsc-built package follows — e.g. `packages/ws-effects/tsconfig.json`). There is no root tsconfig references list to update — only `tsconfig.base.json` and `tsconfig.eslint.json` live at the repo root.
3. No `eslint.config.mjs` edit needed for a standard `src/**/*.{ts,tsx}` layout: the base config globs `**/*.{ts,tsx}` repo-wide, and `tsconfig.eslint.json` already includes `packages/*/src/**/*.ts(x)`. Only a non-standard root (like `client-react-native`'s `app/` route folder, which needed its own explicit glob lines) requires an edit here.
4. No `stylelint.config.mjs` edit needed — `lint:css` globs `packages/*/src/**/*.css` and picks up any package automatically.
5. No Biome config edit needed — it is repo-wide by design.
6. `knip.json` — add a workspace entry **only if** the package has non-standard entry points (test globs, config files, a non-`src` root). Two existing packages, `client-core` and `react-bindings`, have no entry at all and rely on knip's default TS-library heuristics; `client-react`, `client-react-native`, `domain`, `shared`, `ws-effects`, `server`, and `tests` all carry custom `entry`/`project` arrays because they have config files or non-standard roots. Run `pnpm lint:dead` after adding the package and only add an entry if it reports false-positive unused exports.
7. `.dependency-cruiser.cjs` — **not** auto-generic: its rules are hand-written per package name (regexes like `^packages/domain/src`) and now cover all 9 workspace packages — `domain`, `shared`, `client-core`, `react-bindings`, `client-react`, `client-react-native`, `client-prototype`, `server`, and `ws-effects` — via at least one pair rule apiece. A brand-new package still starts with zero coverage: if it has an import boundary worth enforcing (e.g. "must never import react"), add a `from`/`to` rule yourself — nothing does it automatically.
8. Root `package.json` — no per-package script wiring needed; `build`/`typecheck`/`test` all delegate to `turbo run <task>`, and `turbo.json`'s task graph is name/dependency-based rather than a package list (framework-blind, per the project's build-tooling principle).
9. Any consuming package's `package.json` — add the new package as a `"@rtc/<name>": "workspace:*"` dependency so pnpm's topological build order (`turbo.json`'s `"dependsOn": ["^build"]`) picks it up.

**Change-impact checklist**

- Verify in order: `pnpm install` (workspace linking) → `pnpm build` (topological) → `pnpm typecheck` → `pnpm test` → `pnpm lint:css` (if it ships CSS) → `pnpm lint:dead` (knip) → `pnpm check:scripts` → `pnpm check:deps` (dependency-cruiser) → `pnpm check:versions` (manypkg + syncpack, relevant the moment the package declares any dependency shared with another package).
- Single-dep constraint: if the package sits in the domain/ws-effects lineage, it inherits the `rxjs`-only runtime-dependency rule — pnpm strict mode enforces it at install time, not this checklist.
- Inventory: §13.2 (L1 package line map) gains a row for every package; write `packages/<name>/README.md` from the template in the Global Constraints (identity card, folder map, where to start reading, how it's used, see also).
- CI: no matrix to extend — `ci.yml` has no per-package job list; every gate above is either a repo-wide glob or a `turbo run` that already covers the new package once step 1 is done.

---
