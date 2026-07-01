# Phase 2 — Walking skeleton (first colleague demo) — design

**Date:** 2026-07-01

## Goal

Ship the first **on-device, colleague-facing** slice of the React Native (Expo) client: a phone running `@rtc/client-react-native` shows **live streaming FX spot tiles** fed by the already-deployed Fly server, opened in **Expo Go** via a QR / link (no app-store, no custom build). No trade execution — streaming only. This proves the entire clean-architecture port survives the platform jump: everything from the WebSocket frame to the formatted price-with-direction is reused verbatim from `@rtc/client-core`, and — for the first time — the React bridge (`@rtc/react-bindings`) runs on React Native unchanged.

This is the phase that satisfies the workstream's #1 standing success criterion: *show colleagues early, then grow.*

**Parent spec:** `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md` (§2 walking skeleton). **Prior phases:** Phase 0 (`@rtc/client-core` + `@rtc/react-bindings` extraction, PR #56) and Phase 1 (`@rtc/client-react-native` scaffold + Metro/pnpm/`#/` wiring, PR #61) are merged.

## What Phase 1 already proved (the foundation)

- `@rtc/client-react-native` (Expo Router + TS, **Expo SDK 55**) exists, integrates with every repo gate, and `expo export` bundles (verified on local arm64 **and** the first x86 CI run).
- Metro resolves the workspace packages from their built `dist` + the `#/` alias end-to-end (1554-module bundle), rendering the currency-pair list from `client-core`'s `createSimulatorPorts` → `CurrencyPairsPresenter`.

Phase 2 replaces that static list with a **live** grid against the real server, and stands up the adapters, bridge integration, UI leaves, and RN test tier.

## Key findings that shape the design (verified against `origin/main`)

- **The concrete `WsAdapter` is universal.** `packages/client-react/src/app/adapters/WsAdapter.ts` depends only on the global `WebSocket`, `JSON`, `setTimeout`, `console`, and `rxjs.ReplaySubject` — no DOM. React Native provides a global `WebSocket`, so it ports as-is.
- **The neutral WS pieces already live in `client-core`:** `IWsAdapter`, `WsConnectionEventsAdapter`, `buildWsUrl` (token via `?access=` query param — RN's WebSocket also forbids custom headers, so this is the right mechanism), and `createWsRealPorts(ws, { preferences })`.
- **The connection banner is driven by the transport, not the OS.** `WsAdapter` emits `gatewayConnected`/`gatewayDisconnected`/`reconnectAttempt`; `ConnectionStatusPresenter` consumes exactly those. NetInfo (OS online/offline — the browser's `BrowserConnectionEventsAdapter` analogue) is a *nicety*, not load-bearing for the skeleton.
- **Server:** Fly app `rtc-clone-server` (region `lhr`, internal port 4000), scale-to-zero. WS endpoint `wss://rtc-clone-server.fly.dev` with `?access=<token>`.

## Decisions

1. **Lift `WsAdapter` into `@rtc/client-core`** as the universal default transport. Move the file, export it from the barrel, re-point `client-react`'s `buildBrowserPorts` to import it, delete `client-react`'s copy. The RN app imports the *same* transport — zero duplication. Netted by the existing WS contract-test suite already in `client-core`. *(Rejected: copy ~250 lines into the RN app — DRY violation.)*
2. **Full composition via `createApp` + `react-bindings`.** The RN app builds its ports (`buildNativePorts()`), calls `createApp(...)`, and renders through `createViewModel` → `ViewModelProvider` — exercising the React bridge on RN, which is the architectural point of the phase. *(Rejected: presenter-direct wiring — skips the bridge proof.)*
3. **Defer NetInfo.** The connection banner is driven by WS gateway events (always Expo-Go-safe). NetInfo is the one dependency at real risk of not being bundled in Expo Go (which would force a dev build and break the "scan a QR, no build" promise), and it is not essential to the skeleton. Revisit when a dev build lands (Phase 3+).
4. **Simulator-fallback toggle** included — a dev `Switch` that selects the simulator-vs-real composition, so tiles animate with no network (useful on flaky conference Wi-Fi). Small and demo-friendly.
5. **EAS init/publish is the final, user-run step.** The skeleton is built and verified headlessly first; nothing blocks on the account until the demo moment. The user runs `eas login` + `eas init` (fills the `projectId`/`updates.url` placeholders committed in Phase 1) then `eas update --channel preview`.
6. **Verification split:** the controller proves everything runnable without a phone (`expo export`, unit + contract tests, a live-WS smoke against the deployed server); the user does the on-device Expo Go check and the EAS publish.

---

## 1. Package topology & the WsAdapter lift

The reuse boundary is unchanged (`domain → shared → client-core → {react-bindings} → {client-react, client-react-native}`). Phase 2's only cross-package change is the **WsAdapter lift**:

- **`@rtc/client-core`** *(modified)* — gains `src/adapters/WsAdapter.ts` (moved from `client-react`, verbatim) + a barrel export. Its existing `wsReal*.contract.test.ts` suite already covers the real-stack behavior.
- **`@rtc/client-react`** *(modified)* — `buildBrowserPorts` imports `WsAdapter` from `@rtc/client-core`; the local copy and its unit test are removed (the test moves to `client-core` if not already covered).
- **`@rtc/client-react-native`** *(the phase's work)* — new adapters, composition, UI leaves, tests.

Everything else in `client-core` (presenters, `createWsRealPorts`, `WsConnectionEventsAdapter`, `buildWsUrl`, the `reconnect$`/`incident$`/`routeIdleLifecycle` seam) is consumed as-is.

## 2. Composition — `buildNativePorts()`

A new `packages/client-react-native/src/app/buildNativePorts.ts`, the platform analogue of `buildBrowserPorts`:

- **Config in:** WS URL + token read from `expo-constants` (`Constants.expoConfig.extra`) / `process.env.EXPO_PUBLIC_*`, threaded through `buildWsUrl(url, token)`. Never hard-coded in a presenter.
- **WS (real) branch** — `new WsAdapter(buildWsUrl(url, token))` → `new WsConnectionEventsAdapter(ws)` → spread `createWsRealPorts(ws, { preferences })`; `connectionEvents.events()` returns `merge(gateway.events(), reconnect$, incident$).pipe(tap(e => routeIdleLifecycle(e, ws)))`. **No browser adapter, no NetInfo** — the merge omits the `browser.events()` source present in the web build.
- **Simulator branch** — `createSimulatorPorts({ preferences })` with `connectionEvents` wired the same shape as `buildBrowserPorts`'s simulator branch (reconnect$ → gatewayConnected), minus the browser source.
- **`preferences`** — a new `AsyncStoragePreferencesAdapter` (see §3). **`colorScheme`** — omitted; `client-core`'s `of(false)` fallback applies (no theming in the skeleton).

The app root (`packages/client-react-native/app/index.tsx` or a dedicated `AppRoot`) calls `createApp(buildNativePorts())`, builds a `ViewModel` via `createViewModel(app)`, and wraps the tree in `ViewModelProvider` — all from `@rtc/react-bindings`.

## 3. Platform adapters (new, RN-specific)

- **`AsyncStoragePreferencesAdapter`** (`src/app/adapters/AsyncStoragePreferencesAdapter.ts`) — implements `PreferencesPort`, mirroring `LocalStoragePreferencesAdapter`'s BehaviorSubject-per-axis shape. AsyncStorage is **async**, which forces one deliberate deviation from the web adapter: the port's `*$()` streams are *replay-current* (synchronous emission on subscribe — the contract that prevents a flash), but AsyncStorage can't be read synchronously in the constructor. So the adapter seeds each subject with a **default synchronously**, then fire-and-forget **hydrates** from AsyncStorage and `.next()`s the stored value; each `set*` writes through and `.next()`s. Backed by `@react-native-async-storage/async-storage` (Expo-Go-bundled). ~50–70 lines.

  **Testing note (discovered in API review):** the shared `describePreferencesPortContract` describer asserts a *seeded* value emits **synchronously** on subscribe — which an async-hydrating adapter cannot satisfy (it emits the default first, then the stored value one tick later). So the adapter is covered by **targeted unit tests** (default-then-hydrated emission, write-through, distinct-until-changed) against a mocked/in-memory AsyncStorage, NOT the full sync-seed contract describer. This is fine functionally: the skeleton renders no preference-driven UI (theming is out of scope), so `preferences` is plumbed for composition completeness only.
- **(deferred)** `NetInfoConnectionEventsAdapter` — not built this phase (Decision 3).

## 4. UI leaves (new, RN)

Dumb `<View>`/`<Text>`/`StyleSheet` components in `src/ui/`, each a consumer of a `client-core` presenter via `react-bindings` (`useViewModel` + `@react-rxjs/core` `bind`/`useStateObservable`). No business logic, no rxjs, no transport in the leaves (the same discipline the web `src/ui` enforces).

- **`SpotTile`** — one currency pair: symbol, bid & ask, spread, and directional colour (green/red) on the pip segment. It reads a single `Price` off `usePrice(pair)` and colours the pip segment by `price.movementType` (`UP`/`DOWN`/`NONE`) and shows `price.spread` (both already computed by the domain use-case — not re-implemented). The bid/ask split into prefix/pip/fractional groups follows the web `TilePrice.splitPrice(value, ratePrecision, pipsPosition)` logic. **Simplification vs web (YAGNI):** the web tile's animated *flash* comes from a separate `AnimationDirector` presenter via `useAnimationIntents`; the skeleton colours directly from `movementType` and **defers the flash animation** — colour-by-direction is enough to show liveness.
- **`TileGrid`** — a `FlatList` of `SpotTile`s keyed by symbol, from `CurrencyPairsPresenter`.
- **`ConnectionBanner`** — a compact banner reflecting `ConnectionStatusPresenter` state (connected / connecting / disconnected), with a Reconnect affordance that pushes `reconnect$` (the sole recovery path, matching the web app).
- **Simulator toggle** — a dev `Switch` in the screen chrome selecting sim-vs-real composition (re-mounts the provider with the chosen ports).

## 5. Testing

The tiers split along the same reuse boundary as the web client.

1. **Unit (node env, vitest):** `AsyncStoragePreferencesAdapter` (mocked AsyncStorage + the `PreferencesPortContract` describer), the SpotTile price/direction formatting path, and `buildNativePorts`' simulator-branch wiring (that it composes without a network).
2. **RN component tests (RNTL-local — the new pillar for this phase):** RN-local behavioral tests for the `SpotTile` leaf via `@testing-library/react-native` (RNTL) — asserting pip-segment colour by `movementType`, the formatted `spread`, and the loading state. These are RN-package-local tests (not the neutral swap), driven through the real `react-bindings` bridge with World-backed fake hooks (mirroring the `react/` swap's `viewModelFromWorld` idea, RN-locally).

   **Deferred — the renderer-neutral contract refactor.** The existing `tests/ui/contract` "neutral" layer is in fact only *DOM*-neutral (React/Solid): its `shared/pages/**` query raw DOM via `@testing-library/dom`, `MountedRoot.root` is typed `HTMLElement`, and colour assertions read CSS custom properties. A true `react-native/` swap of the SAME neutral spec would require generalizing that layer from DOM-neutral to renderer-neutral, touching the existing React tier and its ≥95% coverage gate — too big and too risky to do inside the walking-skeleton phase. It becomes its own dedicated later effort (its own spec/plan); Phase 2's RNTL-local tests are the down payment that proves RN component testing works.

   **Known risk (the phase's #1 infra unknown — the Metro-equivalent).** `@testing-library/react-native` is historically jest-based, while this repo standardizes on **vitest**. The plan resolves this FIRST, as a fail-fast spike: prefer running RNTL under vitest with a `react-native` transform/preset (keeps one runner repo-wide); if that proves intractable under Node 26 + SDK 55, fall back to a scoped **jest island** for RN component tests only (node-env unit tests stay on vitest). Whichever path, it integrates with the repo gates (biome/eslint/knip/typecheck) like every other tier. If the harness can't be stood up cleanly, surface it before building leaves against it.
3. **Live-WS smoke (local/manual — NOT a CI gate):** a small node script constructs `WsAdapter` against `wss://rtc-clone-server.fly.dev` + token, subscribes to the pricing stream, and asserts real price ticks arrive within a timeout. Proves the RN transport end-to-end with no device. Excluded from CI because the server scales to zero (cold-start) and the network dependency would flake the gate; documented as a local command.
4. **`expo export` CI smoke** (added in Phase 1) stays green — now bundling the full real-stack app.

Visual goldens and Maestro/gherkin e2e remain deferred to Phase 3–4 (parent spec §3–4).

## 6. Deploy / demo loop (user-run)

Every phase from here ends with a publishable EAS Update. For Phase 2:

1. **User:** `eas login` then `eas init` — creates the EAS project, writes the real `projectId` + `updates.url`; uncomment those fields in `app.config.ts` (Phase 1 left documented placeholders).
2. **User:** `eas update --channel preview` — publishes the JS bundle; colleagues scan the QR / open the link in **Expo Go** and see live tiles.

The WS access token is provisioned as an `EXPO_PUBLIC_WS_TOKEN` (or `extra`) value — public-client posture identical to the web app's `VITE_WS_TOKEN`.

## 7. Out of scope (Phase 2 non-goals)

Trade execution, blotter, analytics/P&L, boot/lock chrome, theming switcher, **NetInfo** (deferred to a dev-build phase), Maestro/gherkin e2e, RN visual goldens, App Store/Play submission, custom native modules (stay Expo-Go-compatible). Each later phase adds RN leaves (± one adapter) reusing presenters already in `client-core`.

## 8. Verification summary

| Proof | Who | Gate? |
|---|---|---|
| `expo export` bundles the real-stack app | controller | CI (from Phase 1) |
| Unit tests (adapter, formatting, sim wiring) | controller | CI (`pnpm test`) |
| SpotTile RN behavior tests (RNTL) + harness | controller | CI (RN test tier) |
| Full repo gauntlet stays green | controller | CI |
| Live-WS smoke vs deployed server | controller | local/manual only |
| On-device live tiles in Expo Go | **user** | manual |
| `eas init` + `eas update --channel preview` | **user** | manual |
