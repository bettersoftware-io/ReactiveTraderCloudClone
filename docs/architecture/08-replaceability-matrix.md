[◀ 7. Communication Patterns](07-communication-patterns.md) · [Architecture Document](../architecture.md) · [9. Test Strategy ▶](09-test-strategy.md)

## 8. Replaceability Matrix

This is the load-bearing section: the architecture's value comes from the cost-of-change for each technology being bounded and well-understood.

Columns folded to three so the table stays readable at GitHub's narrow column width (`Currently` is merged into the component name; `Contract that must hold` and `Tests that verify` share one cell under *Verified:*).

| Component (current) | Cost to replace | Contract & verification |
|---|---|---|
| **UI framework**<br>React 19 (web) / React Native (mobile) / SolidJS (web) | ~1 dev-week (rewrite one UI package) — **empirically calibrated twice**: by the RN client (reused core + bindings verbatim), then by `@rtc/client-solid` (~52+ components mechanically rewritten, CSS Modules byte-copied, zero `@rtc/domain`/`@rtc/client-core` changes) | `ViewModel` hook signatures and intent callbacks. No business logic in components.<br>*Verified:* Behavioural specs (Gherkin) + visual goldens + UI contract suite, all unchanged |
| **State streams ↔ UI bridge**<br>`@rtc/react-bindings` (react-rxjs) / `@rtc/solid-bindings` (`@rx-state/core` → signal) | ~1 dev-day — **done**: `@rtc/solid-bindings` shipped at ~980 LOC, on par with `@rtc/react-bindings`'s ~930 | `Observable<T>`/`StateObservable<T>` -> framework-native reactive primitive; same `ViewModel` member list.<br>*Verified:* UI contract tests (84 shared spec files, shared verbatim by both bindings packages), unchanged |
| **State streams**<br>RxJS + `@rx-state/core` | High -- swap touches ports, simulators, use cases, presenters, machines together | Boundary stream type matches across all layers.<br>*Verified:* Use-case tests + port contract tests + presenter-direct e2e peers |
| **Use cases**<br>Vanilla TS + RxJS | N/A (this is the domain) | *Verified:* Unit tests over use cases with simulator ports |
| **Boundary stream type**<br>RxJS `Observable<T>` | Very high (this is the spine) | -- |
| **Port adapters (transport)**<br>WebSocket-backed factories in `client-core` | ~1 dev-week per adapter family | Implements port interface.<br>*Verified:* Contract tests parameterised over adapter (simulator + WsReal) |
| **Server dispatch framework**<br>`@rtc/ws-effects` | ~1 dev-week (it is one package; effects are pure stream transforms) | `WsEffect = (in$, ctx) => out$`; wire protocol in `@rtc/shared`.<br>*Verified:* Marble tests + fullstack smokes |
| **View-layer motion math**<br>`@rtc/motion-core` | ~1 dev-day per consumer (pure functions; no framework/DOM coupling to unwind) | `flipDeltas`/`coalesceOrder`/`computeRankDirections`/`sameOrder` signatures + easing/duration constants.<br>*Verified:* Unit tests in `packages/motion-core` (`flip.test.ts`, `rankGlide.test.ts`) |
| **Server host**<br>Node.js + `ws` | ~2 dev-days (`toSocket` is the only ws-coupled file) | `Socket` interface (`messages$`, `send`, `closed$`).<br>*Verified:* Fullstack smokes |
| **Wire format**<br>JSON over WS | High (both ends change together) | DTOs + `CLIENT_MSG`/`SERVER_MSG` in `@rtc/shared`.<br>*Verified:* DTO round-trip tests + wire-frame fixtures + e2e |
| **Build tooling**<br>Vite (web) · Metro/Expo (mobile) | ~1 dev-day | Bundles the client package, serves dev |
| **Unit test runner**<br>Vitest (+ jest-expo for RN components) | ~1 dev-day | Same test files runnable.<br>*Verified:* The tests themselves (proven: the presenter suite runs under cucumber-js *and* vitest) |
| **E2E driver**<br>Playwright (CI) + Cypress (local) | ~3 dev-days per new driver | Page Object interfaces unchanged; only implementations are added.<br>*Verified:* Behavioural specs (Gherkin) drive all drivers via one shared step tree |
| **Behavioural spec language**<br>Gherkin | High (rewrite specs) | -- |
| **Build orchestration**<br>pnpm + Turborepo | ~1 dev-day | Build graph: domain -> shared/ws-effects/motion-core -> core -> bindings -> clients/server |

**How this is achieved**: every "Cost" above assumes the rest of the system stays put. That is only true because (a) inner layers never import outer-layer types, (b) ports are dependency-inverted, and (c) behavioural tests are written against behaviour, not implementation.

### 8.1 The Multi-Client Proof & the SolidJS Port

The replaceability matrix used to be a theory. The React Native client turned it into a first measurement: **adding an entire second platform required zero changes to `@rtc/domain`, `@rtc/shared`, `@rtc/client-core`, or `@rtc/react-bindings`** — only a new UI package with two platform adapters. The SolidJS port is a second, independent measurement of the same claim, this time across a genuinely different reactive framework (not just a different render target for React): `@rtc/client-solid` shipped with full contract, visual, and behavioural parity against `@rtc/client-react`, and it required the same zero changes below the `ViewModel` contract. The animation below cycles through the three clients; note what never moves.

![Animated diagram cycling React web, React Native, and SolidJS clients above an unchanged client-core, domain and shared stack, joined by the ViewModel contract](framework-swap.svg)

**Why the RN client was cheap** — the checklist of what it actually had to build:

```mermaid
flowchart TD
    subgraph new["What client-react-native wrote (new code)"]
        n1["RN screens & components<br/>(dumb, react-native-svg charts)"]
        n2["buildNativePorts.ts<br/>(EXPO_PUBLIC_SERVER_URL switch)"]
        n3["AsyncStoragePreferencesAdapter"]
        n4["AppearanceColorSchemeAdapter"]
        n5["rnThemeTokens<br/>(token subset, context delivery)"]
        n6["expo-router tabs + AppRoot"]
    end
    subgraph reused["What it imported verbatim"]
        r1["@rtc/client-core — every presenter,<br/>machine, WsAdapter, port factory"]
        r2["@rtc/react-bindings — the whole<br/>ViewModel (React is React)"]
        r3["@rtc/domain — entities, use cases,<br/>simulators (device-local Mode A!)"]
    end
    new -->|"plugs into"| reused
```

**The SolidJS port** (`@rtc/client-solid`, shipped) followed the same recipe with one extra step — since Solid is *not* React, it needed its own bindings package:

1. **`@rtc/solid-bindings`** (~1 dev-day, as estimated): maps `StateObservable` → Solid signal. `@rx-state/core` (already framework-neutral, already in `client-core`) is the same primitive react-rxjs's `bind()` consumes, so this is the `solid-rxjs` analogue the design always assumed. Implements the same `ViewModel` member list; `useMachine`'s Solid counterpart is a `createMachine`-style per-component primitive using `onCleanup` instead of a StrictMode-deferred dispose (Solid has no StrictMode double-invoke to guard against).
2. **`@rtc/client-solid`** (~1 dev-week per the estimate; ~52+ components mechanically rewritten in practice): the dumb components, rewritten. CSS Modules ported verbatim — the CSS-modules migration deliberately left zero inline styles and semantic `data-*` state hooks precisely so markup/styling survived the swap unchanged.
3. **Verification, all pre-existing, all green**: the framework-neutral UI-contract specs (84 shared `*.contract.spec.ts` files / 607 tests, run against a `solid/` swap-trio next to `react/` — same specs, same assertions, a different DOM renderer underneath), the visual goldens (three tiers, each **assert-only** against `client-react`'s own `__screenshots__/react/` trees — `client-solid` owns no goldens of its own, so a pixel match is a genuine cross-framework proof, not a self-comparison), and the Gherkin behavioural suites (page objects get a Solid implementation; specs unchanged).

What ADR-004 forbade existed **for** this: no JSX through the ViewModel, no framework types below the bindings, no `rxjs` in UI files. Every one of those bans was a gate (26--29), which is why the Solid port could be executed without any of them needing to bend.

### 8.2 The Custom-Hook Surface

The "~1 dev-week to swap the UI framework" figure in the matrix above rests on a claim worth making explicit and measurable, because it is where a React codebase most often leaks framework lock-in. **A React hook is a React-only primitive** — `useState`, `useEffect`, `useLayoutEffect`, the rules-of-hooks call ordering — with no equivalent concept in Solid, Svelte, or Vue (Solid runs its logic once and tracks signals; there is no re-render, no dependency array, no hook ordering). So *every genuine custom hook is React-specific code a framework swap must re-author*. The swap is bounded only if that surface is deliberately kept small. It is.

A component in this app calls two kinds of `useX`, and only one of them is React-specific work:

- **ViewModel-provided hooks** — `useLayout`, `useOrderTicket`, `useBootSequence`, `useSession`, `useBootGate`, `useMetrics`, and their siblings all arrive through `useViewModel()` from `@rtc/react-bindings`. Each is a *thin binding* over a framework-free RxJS machine or presenter in `@rtc/client-core` (e.g. `useLayout` is one line: `useMachine(() => machines.layout(tab))`). The behaviour lives outside React entirely, so the Solid port re-implements only the ~1-line binding once in `@rtc/solid-bindings` (§8.1 step 1) — never the logic. These do not count against the swap budget.
- **Standalone UI hooks** — hooks actually *defined* inside `@rtc/client-react/src/ui`. This is the whole React-specific surface a Solid port must re-author, and the entire set is **seven**:

| Hook | Lines | Kind | What a Solid port re-writes |
|---|---:|---|---|
| `useFxView` | 17 | Context reader | Trivial — reads a tab-scoped context seam (Solid `useContext` equivalent) |
| `useCreditView` | 20 | Context reader | Trivial — same |
| `useTheme` | 13 | Context reader | Trivial — same |
| `useTickFlash` | 43 | Pure derived state | Low — a value derived from current vs previous input; the pure logic ports verbatim |
| `useNewestOrderId` | 62 | Pure derived state | Low — an id-set diff; the pure `newestUnseenId` helper ports verbatim |
| `useFlipGrid` | 301 | DOM-imperative animation | Average — a thin WAAPI/`ResizeObserver` shell; its FLIP math already lives in `@rtc/motion-core` |
| `useRankGlide` | 244 | DOM-imperative animation | Average — same shape; `coalesceOrder`/`computeRankDirections` already live in `@rtc/motion-core` |

Read the table by kind, not by line count. **Three of the seven are thin context readers** — no logic at all, just a `useContext` call plus a provider-presence guard. **Two more are small pure-derived-state helpers** (`useTickFlash`, `useNewestOrderId`) whose actual computation is framework-agnostic and moves to Solid untouched. That leaves **only two hooks of genuine complexity** — the FLIP animation pair — and even their line counts overstate the port cost: those are mostly DOM plumbing and doc comments, because the *algorithms* (`flipDeltas`, `coalesceOrder`, `computeRankDirections`, `sameOrder`) were extracted into the framework-free `@rtc/motion-core` package precisely so both clients share one implementation ([ADR-005](../adr/ADR-005-ui-logic-placement.md)). What a Solid port rewrites for those two is a thin imperative shell over identical shared functions, not the motion logic itself.

So the React-specific hook surface a framework swap confronts is: three trivial readers, two small pure helpers, and two thin animation shells over shared math. That deliberately-tiny surface — not optimism — is why the React Native client reused `client-core` and `react-bindings` verbatim, and why the "UI framework — ~1 dev-week" row is a measurement rather than a hope.

---

