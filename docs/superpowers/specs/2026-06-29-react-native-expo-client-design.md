# React Native (Expo) client — design

**Date:** 2026-06-29

## Goal

Add a **React Native + Expo** client (`@rtc/client-react-native`) that runs the existing FX trading app on a phone, reusing the clean-architecture core verbatim and rewriting only the platform-specific outer ring. The exercise is a demonstration: show how cleanly the domain / use-cases / ports & adapters layering survives a wholesale change of UI technology.

Two standing requirements shape every decision:

1. **Show colleagues early, then grow.** Ship a thin end-to-end vertical slice that runs on a real device first, then add features phase by phase, each independently demoable.
2. **A SolidJS client (`@rtc/client-solidjs`) is coming next.** The extraction must leave a framework-neutral seam that React, React Native, *and* Solid can all consume — so React hooks cannot be the shared bridge.

## Brainstorm decisions

1. **Code-sharing shape:** extract a framework-neutral core plus per-framework binding shells (Approach 1). No duplication of the app/presenter layer.
2. **Package names:** `@rtc/client-core` (neutral), `@rtc/react-bindings` (React family — shared by `client-react` and `client-react-native`), `@rtc/client-react-native` (the new app). Future: `@rtc/solid-bindings`, `@rtc/client-solidjs`.
3. **First demo = streaming-only.** Live FX spot tiles against the already-deployed Fly server. No execution in the skeleton.
4. **Demo loop = Expo Go + EAS Update.** Stay Expo-Go-compatible (no custom native modules) for the early phases. Colleagues scan a QR / open a link; no app-store, no build.
5. **Composition becomes dependency-injected** so the neutral core never imports a platform adapter.
6. **Test reuse:** domain/presenter unit tests + framework-neutral contract specs reused; `.feature` gherkin files reused with new (Maestro) step bindings; visual baselines are RN-specific and deferred.

---

## 1. Package topology

### The reuse boundary (three tiers)

Verified during brainstorming:
- `client-react/src/app` (38 presenters + RxJS machines + composition root + `portFactory`) imports React **nowhere** — it is pure TS + RxJS.
- The bridge hooks (`useMachine`, `useHooks`, `createAppHooks`, `HooksProvider`) import only `react` + `@react-rxjs/core` — **no DOM**. Since React Native *is* React (and `@react-rxjs/core` is renderer-agnostic), they port to RN unchanged.
- Only the **leaf** components (`<div>` + CSS Modules) are React-DOM-specific.

### New shared packages (the extraction)

- **`@rtc/client-core`** — framework-neutral. All presenters + machines, the composition wiring (as a DI factory), `portFactory`, and adapter *interfaces*. Deps: `@rtc/domain`, `@rtc/shared`, `rxjs`. **No React, no Solid, no DOM, no RN.** Consumed by every UI app.
- **`@rtc/react-bindings`** — React-family bridge. `useMachine`, `useHooks`, `createAppHooks`, `HooksProvider`. Deps: `@rtc/client-core`, `react`, `@react-rxjs/core`. **No DOM.** Consumed by `client-react` and `client-react-native`.
- *(future)* **`@rtc/solid-bindings`** — the Solid analogue (RxJS observable → signal). Not built now; the core is shaped so it slots in with zero core changes.

### App packages (thin shells — leaf components + platform adapters only)

- `client-react` *(exists)* — DOM leaves + CSS Modules; browser adapters (localStorage, browser WS / connection events).
- **`client-react-native`** *(new)* — RN primitive leaves + RN `StyleSheet`; native adapters (AsyncStorage, NetInfo).
- *(future)* `client-solidjs` — DOM leaves; reuses the **browser** adapters.

### Dependency graph (arrows = "depends on")

```
domain → shared
                ├── client-core ──────────────┐
                │      ↑         ↑             │
       react-bindings  │   solid-bindings*     │
          ↑      ↑      │         ↑            │
   client-react  client-react-native   client-solidjs*
        (DOM)        (React Native)        (DOM)*
                                    * = future, not built now
```

The dependency rule still holds: apps never depend on each other; everything flows inward to `client-core → shared → domain`.

### Why RxJS is the seam

Presenters expose state as `Observable<T>`. That is the framework-neutral contract every reactive UI consumes: React via `@react-rxjs/core`, Solid via its `from()` observable→signal interop. "Support React, React Native, and Solid" therefore reduces to **one neutral core + three tiny binding shells + N sets of leaf components**. The core never knows which framework is downstream.

### Two principles baked in from the start

1. **Composition is dependency-injected.** Today `composition.ts` constructs `BrowserConnectionEventsAdapter` etc. *internally*; that cannot live in a neutral package. The extraction inverts it: `client-core` exposes a composition that **receives** adapter instances (or factories); each app builds its own platform adapters and injects them. This is the trickiest part of the refactor and is fenced by the existing test suite.
2. **Adapters are platform-scoped, not framework-scoped.** Browser adapters are identical for `client-react` and a future `client-solidjs`, so they stay framework-free classes now and are earmarked for a future `@rtc/web-adapters` package *if and when* Solid lands (YAGNI until then). RN adapters live in `client-react-native`. `WsAdapter` is likely universal (WebSocket exists in browser and RN) and may sink into `client-core` as a default.

---

## 2. Walking skeleton (first phone demo)

**Goal of the slice:** a colleague opens Expo Go and sees **live streaming FX spot prices** on a real device, fed by the already-deployed server. No execution yet. It proves the entire port survives the platform jump.

Trace through the rings (✅ reused as-is / 🔁 swapped adapter / 🆕 new RN leaf):

| Ring | Component | Status |
|---|---|---|
| Transport | `WsAdapter` → deployed Fly server (`rtc-clone-server.fly.dev`, WS token auth) | ✅ WebSocket is universal; token injected via config |
| Ports | `PricingPort`, `ReferenceDataPort` | ✅ |
| Presenters | `PriceStreamPresenter`, `CurrencyPairsPresenter`, `ConnectionStatusPresenter` | ✅ from `client-core` |
| Bridge | `useMachine` / `useHooks` | ✅ from `react-bindings` |
| Prefs persistence | `PreferencesPort` adapter | 🔁 `AsyncStoragePreferencesAdapter` (new, ~30 lines) |
| Connectivity | `ConnectionEventsPort` adapter | 🔁 RN `NetInfo` adapter (new, ~30 lines) |
| Leaf UI | `SpotTile` (price, bid/ask, spread, ▲▼ flash), `TileGrid`, connection banner | 🆕 RN (`<View>` / `<Text>`, RN `StyleSheet`) |
| Shell | one screen, Expo Router | 🆕 minimal |

The entire *new* code for the first demo is **~2 adapter files + a handful of RN leaf components + one screen**. Everything from the WebSocket frame to the formatted price-with-direction is reused verbatim from `client-core`.

### Decisions inside the slice

1. **Start against the deployed server**, not a local one — so the demo works on a colleague's phone over cellular with no laptop in the loop. The RN `WsAdapter` points at the Fly endpoint; the WS auth token is read via `expo-constants` and threaded through the composition config (never hard-coded in a presenter).
2. **Simulator fallback for offline/dev.** `client-core` already exposes `createSimulatorPorts` (neutral domain simulators). The RN app gets the same dev toggle the web app has, so tiles animate with no network — useful on flaky conference Wi-Fi.

### Explicit non-goals for the skeleton

No execution, no blotter, no analytics, no boot/lock chrome, no theming switcher. Each is a later phase adding leaves (± one adapter) and reusing presenters already in `client-core`.

---

## 3. Test reuse across platforms

The test tiers split along the same reuse boundary.

1. **Domain + presenter/machine unit tests → reused verbatim.** They test framework-neutral code, so they *move with* `client-core` and keep running under vitest. Most of the current ~1085 tests.
2. **Contract specs (`*.contract.spec.ts`) → reused as the cross-framework pillar.** Already framework-neutral with a `react/` swap-trio. The neutral specs move to a shared home; `client-react-native` supplies a **`react-native/` swap** using `@testing-library/react-native`. The same behavioral spec validates the RN leaves.
3. **Gherkin `.feature` files → reused verbatim; new step bindings.** The `.feature` prose is platform-agnostic. New step definitions drive the RN app via **Maestro** (YAML flows, first-class Expo Go support, no native build) — chosen over Detox (needs a dev build + more setup). The runner differs on device; the behavioral contract (`.feature` text) is shared.
4. **Visual goldens → structure & scenarios port, pixels don't.** RN renders natively, not via DOM, so `client-react-native` gets its **own** committed baseline set; the suite layout and scenario list carry over. Deferred out of the skeleton.

The contract-spec tier is load-bearing for this exercise: once `client-solidjs` lands, three swap implementations (`react/`, `react-native/`, `solid/`) all satisfy one neutral spec set — the cleanest evidence the UI layer is genuinely interchangeable. This aligns with the existing project record that visual goldens + contract specs are the React→Solid portability contract.

---

## 4. Expo toolchain, deploy & phasing

### Toolchain

Latest Expo SDK + **Expo Router** (file-based screens) + TypeScript. Hard constraint for early phases: **stay Expo-Go-compatible** — no custom native modules. Everything the skeleton needs (`WebSocket`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `expo-constants`) is Expo-Go-safe, so colleagues never need a custom build.

### The one real toolchain risk — pnpm + Metro

Metro (RN's bundler) doesn't speak pnpm's symlinked strict `node_modules` out of the box, and must resolve the workspace packages (`client-core`, `react-bindings`, `domain`, `shared`) **and** the repo's `#/` subpath aliases. The fix is known but deliberate: Metro `watchFolders` → workspace root, `resolver.nodeModulesPaths`, and an alias resolver for `#/`. Metro transpiles the packages' **TS source directly** (no Vite/tsc prebuild needed for the JS path), so it points at sources. Do **not** switch pnpm to `node-linker=hoisted`. Phase 1 exists to fail fast on this plumbing, before any feature work.

### Deploy / demo loop

**EAS Update** publishes the JS bundle to a channel; colleagues open it in **Expo Go** via QR / link. New versions push in seconds — no app store, no rebuild. Every phase ends with a publishable update, so "show colleagues" is a continuous capability.

### Phasing

Each phase is independently mergeable; demo capability exists from Phase 2 on.

- **Phase 0 — Extraction (no visible change).** Carve out `@rtc/client-core` + `@rtc/react-bindings`; invert `composition.ts` to dependency injection; re-point `client-react`. **Gate: the full existing suite stays green** — that green proves nothing leaked. The architectural heart of the project.
- **Phase 1 — Expo scaffold + monorepo wiring.** Create `packages/client-react-native`, Expo Router + TS, solve the Metro / pnpm / alias config, and render *something* from `client-core` (e.g. the currency-pair list off the simulator port) to prove resolution end-to-end. Init the EAS project.
- **Phase 2 — Walking skeleton → first demo.** Live `SpotTile` grid vs. the deployed Fly server, `AsyncStorage` + `NetInfo` adapters, connection banner, simulator fallback toggle. Unit + a contract spec for `SpotTile`. **Publish EAS Update — first colleague showing.**
- **Phase 3+ — Incremental features**, each = RN leaves + reused presenters (± one adapter), ending in a publishable update: execution + blotter → analytics / P&L (where the `d3-*` / `motion` DOM-coupled stragglers get handled) → theming (skin × mode) → shell chrome (boot / lock) → credit RFQ → equities. Maestro/gherkin e2e and RN visual baselines fold in around Phase 3–4.

### Known straggler

A few later-phase presenters pull `d3-selection` / `d3-drag` (DOM-coupled) and `motion` for the analytics force-graph and animated background. The skeleton presenters (pricing, execution, blotter) don't touch them, so the first slice extracts cleanly; the DOM-coupled bits are factored behind a port or reduced to pure-math (`d3-force` is already pure) when their feature reaches its mobile phase.

---

## 5. Out of scope

- No App Store / Google Play submission (EAS Update + Expo Go only for now).
- No custom native modules while early phases stay Expo-Go-compatible.
- No `@rtc/web-adapters` package or `@rtc/solid-bindings` / `client-solidjs` yet — the seam is left ready, not built.
- No change to `server` or `domain` public contracts; this is purely additive plus the `client-react` internal extraction.
