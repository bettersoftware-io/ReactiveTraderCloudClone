[◀ 9. Test Strategy](09-test-strategy.md) · [Architecture Document](../architecture.md) · [11. Key Files Reference ▶](11-key-files-reference.md)

## 10. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **RxJS `Observable<T>` at every boundary** | RxJS is the explicit dependency exception in `@rtc/domain`, chosen because (a) the team already uses RxJS in the client and server, (b) `defer` + operators give per-subscription state and UI-shaping cheaply, and (c) one stream type across ports / use cases / presenters removes the `AsyncIterable -> Observable` interop seam. The cost is binding the spine to RxJS; behavioural tests still validate behaviour after a hypothetical swap. |
| **Closure-in-`defer` for stateful pipes** | Use cases that need per-subscription state (`previousMid`, rolling buffer, ...) wrap the pipeline in `defer(() => { let state; return source$.pipe(...); })`. Each subscriber gets a fresh closure -- same isolation a function-scoped `let` gave the earlier `AsyncIterable` version. |
| **react-rxjs as the UI bridge** | Tiny library, easy to replicate for SolidJS/Svelte/etc. UI sees only hook contracts, never `Observable<T>`. |
| **No DI in the UI tree** | Composition Root constructs the graph at startup. UI imports already-bound hooks. No `ServiceProvider` Context. |
| **Use cases own enrichment, not hooks** | `detectMovement + calculateSpread` and similar live in `PriceStreamUseCase`, so a UI rewrite cannot lose them. |
| **Streaming-first data model** | Real-time financial data naturally flows as streams, not snapshots + polling. |
| **Simulators in the domain (not "mocks")** | Production code that stands in for an external venue. Same port interfaces; adapters are swapped at the Composition Root. |
| **WebSocket + RPC pattern** | Subscriptions for data, RPC with correlation IDs for commands -- clean separation, multiplexed over one connection. |
| **SoW markers** | Ensures consistent state after reconnect without full re-fetch. |
| **Pure domain with one dep (rxjs)** | Fully testable, portable; pnpm strict mode enforces that the only `dependencies` entry in `@rtc/domain/package.json` is `rxjs`. |
| **AbortController per subscription** | Graceful cleanup when WebSocket closes -- all active streams are cancelled. |
| **Behavioural specs in Gherkin** | One source of truth for expected behaviour, runnable from multiple test drivers. Survives driver and framework swaps. |
| **Don't abstract React or RxJS behind portability shims** | Wrapping them produces leaky facades; instead keep their layers thin and rely on behavioural tests to make regeneration cheap. |
| **React Compiler instead of manual memoization** | The compiler auto-memoizes at build time, so the UI carries no `useMemo`/`useCallback`. Its lint half (`eslint-plugin-react-hooks` `recommended-latest`, scoped to `src`) guards the Rules-of-React purity the compiler needs. One provisional exception: `react-hooks/refs` is scoped off for the two StrictMode build-once-ref seam files (`useMachine.ts`, `AppRoot.tsx`). Full rationale and the revisit note in [ADR-003](../adr/ADR-003-react-compiler-and-manual-memoization.md). |
| **Application core extracted to `@rtc/client-core`** | The RN client forced the "could be promoted later" IOU: presenters, machines, WsAdapter, and port factories moved out of `client-react` into a framework-free package. The extraction cost nothing at the UI call sites because components only ever imported the hook bridge — the payoff of the original layering. |
| **One ViewModel seam, not per-service DI** ([ADR-004](../adr/ADR-004-viewmodel-seam-and-feature-flags.md)) | A single flat `ViewModel` interface (~60 `use*` members) built once at each client's `AppRoot` and delivered through one context. Implemented by production code and two test harnesses; forbidden from carrying JSX. It is simultaneously the DI surface, the test seam, and the SolidJS-port contract. |
| **`@rx-state/core` in the core, `@react-rxjs/core` in the bindings** | react-rxjs is used *split into its two halves*: the framework-neutral `state()`/`StateObservable` primitive lives in `client-core` (machines can hold defaulted shareable state with no React), while `bind()` lives only in `react-bindings`. A Solid port pairs the same core half with new bindings. |
| **State machines as `Machine<TState, TIntents>`** | Per-component lifecycles (tile execution, order ticket, RFQ countdown, boot sequence) are framework-neutral objects `{ state$, intents, dispose }` bridged by `useMachine` — one per mount, StrictMode-safe deferred dispose. Keeps imperative choreography out of both the UI and the global stream graph. |
| **Declarative WS effects (`@rtc/ws-effects`)** | The server's dispatch is data-flow, not control-flow: 24 pure `(in$, ctx) => out$` transforms merged over one shared inbound stream, with four layers of error isolation. The framework is rxjs-only and domain-blind, so it is itself swappable — and marble-testable without a socket. |
| **Per-platform code = adapters only** | Adding a platform means a switch file (`buildNativePorts`), a preferences adapter, a color-scheme adapter, and dumb UI. Everything else is imported. This is the enforced definition of "thin client shell". |
| **RN charts precompute geometry in pure functions** | `react-native-svg` draws what vitest-tested pure helpers (`buildCandles`, `buildGauge`, ...) computed. The paint layer stays dumb and the math stays unit-testable without a device. |
| **Design prototypes are production-isolated** | `@rtc/client-prototype` (React port) and the standalone HTML artifact exist for design comprehension and fidelity comparison; neither may import `@rtc/*` runtime packages, so design iteration can never leak into the product graph. |

### 10.1 RxJS `Observable<T>` as the boundary stream type

**Problem.** Ports, use cases, presenters, and the UI bridge all need one shared stream shape. Without it, every layer boundary needs its own conversion, and per-subscription state (a rolling buffer, a "previous mid" for movement detection) has nowhere clean to live.

**Choice.** `@rtc/domain`'s ports and use cases return RxJS `Observable<T>` everywhere, and `rxjs` is the package's sole permitted runtime dependency (`packages/domain/package.json`'s only `dependencies` entry), enforced at install time by pnpm strict mode. `defer(() => { let state; return source$.pipe(...) })` gives each subscriber a fresh closure for stateful pipelines.

**Alternatives rejected.** The domain boundary was originally `AsyncIterable<T>` / `Promise<T>` — deliberately chosen early on to keep the domain framework-free — and was implemented that way through Phase 2. It was replaced in Phase 2.6 specifically because every port crossing needed a hand-written `AsyncIterable -> Observable` interop seam once presenters (RxJS-based, for react-rxjs) entered the picture; collapsing to one stream type end-to-end removed that seam entirely.

**Cost accepted.** The domain is no longer dependency-free — RxJS is now load-bearing at the spine, and a future RxJS swap (e.g. to `effect-ts`) touches every port, simulator, use case, and presenter at once ([§8 Replaceability Matrix](08-replaceability-matrix.md#8-replaceability-matrix) rates it "very high" cost). Behavioural tests, not layer isolation, are what would make that swap safe.

### 10.2 Ports declared in the domain, adapters implementing them outside it

**Problem.** Use cases need real data (pricing, execution, reference data) without knowing whether it comes from a WebSocket, an in-memory simulator, or something else — and without the domain depending on any of those outer-layer technologies.

**Choice.** Port interfaces (`PricingPort`, `ExecutionPort`, `WorkflowPort`, and fifteen others) are declared inside `@rtc/domain/src/ports/`, next to the use cases that consume them. Concrete implementations — `WsAdapter`/`portFactory` in `@rtc/client-core` and the simulators in `@rtc/domain/src/simulators/` — live in outer rings and are selected at the Composition Root. This is dependency inversion: the interface lives with the code that needs it, not the code that implements it, so the source-code arrow still points inward while data flows outward at runtime ([§1.3.1](01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring)).

**Alternatives rejected.** The natural alternative — defining port shapes next to each adapter (a `WsPricingPort` beside `WsAdapter`, a separate shape beside the simulator) — was rejected because it re-couples the use case to whichever adapter's shape it imports, defeating the swap.

**Cost accepted.** Every new port needs a contract test parameterised over all its adapters ([§9.6](09-test-strategy.md#96-port-contract-test-layer)) to keep the promise honest — an interface alone doesn't guarantee behavioural parity between adapters.

### 10.3 The ViewModel seam as the UI's single DI surface ([ADR-004](../adr/ADR-004-viewmodel-seam-and-feature-flags.md))

**Problem.** A dumb UI needs *some* way to reach reactive state and intents without importing RxJS, presenters, or ports directly — and that doorway needs to be narrow enough that a full UI-framework rewrite (React → SolidJS) only has to satisfy one contract.

**Choice.** One flat interface, `ViewModel` (~60 `use*` members), built once per client at `AppRoot` by `createViewModel(presenters, machines, commands)` and delivered through a single `ViewModelProvider` / `useViewModel()` pair in `@rtc/react-bindings/src/createViewModel.ts`. It is simultaneously the DI surface, the test seam (implemented again by `buildFakeViewModel` and `viewModelFromWorld`), and the SolidJS-port contract ([§3.6](03-uml-class-diagrams.md#36-the-viewmodel-seam)).

**Alternatives rejected.** Per-service DI (a `PricingService` context, an `ExecutionService` context, ...) was rejected — many seams to keep framework-neutral instead of one, and no single place to enforce "no JSX crosses this line." `useHooks`/`AppHooks`, the seam's original name, was renamed for the same reason ADR-004 documents: the old name described the *shape* returned (hooks), not the *role* (a view-model), and read as permissive exactly where the architecture wants a constraint.

**Cost accepted.** Every new capability is a compile-time addition to one large interface, which must be implemented by production code and both test harnesses simultaneously — friction that ADR-004 treats as the feature: the type forces full coverage.

### 10.4 Dumb UI, enforced by grep gates rather than convention

**Problem.** "Dumb UI" ([§1.2 rule 3](01-overview.md#12-architectural-principles)) is easy to state and easy to erode one `localStorage.getItem` or one stray `import { interval } from "rxjs"` at a time, especially across two client packages maintained by different people over time.

**Choice.** The rule is machine-checked, not just documented: four grep gates in `tests/scripts/grep-gates.ts` (gates 26–29, see [§12](12-architectural-gates.md)) ban `rxjs`/`@react-rxjs`/`@rx-state` imports, `localStorage`, `fetch`/`import.meta.env`, and `setTimeout`/`setInterval` inside `client-react/src/ui`, running on every CI push. Business logic (enrichment like `detectMovement` + `calculateSpread`) is pinned inside use cases, not hooks, so a UI rewrite cannot silently lose it.

**Alternatives rejected.** Relying on code review and CLAUDE.md prose alone was the default before the gates existed, and was rejected as insufficient — the same class of leak (a component reaching past the ViewModel for "just one" convenience) is exactly the kind of drift that only shows up once a framework swap is attempted and half the components turn out not to be portable.

**Cost accepted.** Grep gates are regex-based, not type-aware — they are fast and framework-agnostic but can be evaded by obfuscation (they are a safety net for honest mistakes, not an adversarial boundary) and must be kept in sync by hand whenever a new banned import pattern is identified.

### 10.5 Simulators as production code, not test mocks

**Problem.** The clone needs to run standalone — demoable, testable, deployable — without a live upstream venue, while still proving that the "real adapter" and "no adapter" code paths are behaviourally identical.

**Choice.** `@rtc/domain/src/simulators/` (`PricingSimulator`, `AnalyticsSimulator`, `CreditRfqSimulator`, and others) implement the exact same port interfaces as the WebSocket-backed adapters and are selected at the Composition Root like any other adapter — they are ring-③ gateways, not test doubles ([§1.3.1](01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring)). The same port-contract test suite ([§9.6](09-test-strategy.md#96-port-contract-test-layer)) runs against both the simulator and the `WsReal` implementation, so "swap in real data" is provably a config change, not a rewrite.

**Alternatives rejected.** The natural alternative — hand-rolled mocks living under `__mocks__/` or `test/fixtures/`, used only by the test suite, with a separate "real" implementation for production — was rejected because it lets the two diverge silently; a mock only has to satisfy assertions, not the port contract, so it can drift from reality without any test failing.

**Cost accepted.** Simulators must be written to the same quality bar as a real adapter (correct SoW semantics, realistic timing, RFQ lifecycle) rather than the minimal shape a test needs, which is more upfront work than a throwaway stub.

### 10.6 Declarative WS effects (`@rtc/ws-effects`) over a server `switch`

**Problem.** A WebSocket server dispatching on message type tends to accumulate as an ever-growing `switch`/`if` chain mixing wire parsing, business dispatch, and error handling in one place — hard to test without a real socket and hard to keep each message type isolated from the others' failures.

**Choice.** The server's dispatch is expressed as pure data-flow: 24 effects, each a `WsEffect = (in$, ctx) => out$` transform, merged over one shared inbound stream in `@rtc/server/src/effects/` (`fx.effects.ts`, `credit.effects.ts`, `equities.effects.ts`, `admin.effects.ts`), built on the standalone `@rtc/ws-effects` package (`combineEffects`, `createWsListener`, `rpc`, `stream`). The framework is rxjs-only and domain-blind, so effects are marble-testable without a socket, and one effect throwing cannot take down another (four layers of error isolation).

**Alternatives rejected.** A conventional `switch (msg.type)` dispatcher inside the socket handler — the natural alternative for a Node `ws` server — was rejected because it couples parsing, routing, and business logic in one file and forces integration-level testing (a real socket) to exercise any single message type.

**Cost accepted.** Contributors must learn one more small abstraction (`WsEffect`, `combineEffects`) beyond plain `ws` before they can add a message type — offset by `@rtc/ws-effects` itself being swappable (~1 dev-week, [§8](08-replaceability-matrix.md#8-replaceability-matrix)) since it depends on nothing but rxjs.

### 10.7 pnpm workspaces + Turborepo for the monorepo

**Problem.** Nine packages plus a `tests` workspace share a strict dependency graph (`domain` → `shared`/`ws-effects` → `client-core` → `react-bindings` → clients/`server`) that must build in topological order, and the single-runtime-dependency rule on `@rtc/domain` needs enforcement at install time, not just code review.

**Choice.** pnpm workspaces (`pnpm-workspace.yaml`: `packages/*` + `tests`) for install/linking, with Turborepo (`turbo.json`) driving topological `build`/`typecheck`/`test` across the graph. pnpm's strict, non-hoisted `node_modules` is what makes "the only entry in `@rtc/domain/package.json` `dependencies` is `rxjs`" a real, install-time-enforced guarantee rather than a convention that a stray transitive import could quietly violate.

**Alternatives rejected.** A single flat package (no workspace boundaries) would have made the "only `rxjs` in domain" rule unenforceable — anything importable anywhere is importable in domain. Nx was the natural workspace-tooling alternative to Turborepo; it wasn't adopted, and CLAUDE.md's requirement that Turborepo stay "framework-blind (task names + dependency graph only)" reflects a preference for the lighter of the two orchestrators available at the time this was set up.

**Cost accepted.** Nine packages means nine `package.json`s, nine `tsconfig`s, and cross-package changes that ripple through the build graph in dependency order rather than landing in one file — more ceremony than a single-package repo for the sake of a graph the dependency rule can actually be enforced against.

### 10.8 CSS Modules, with inline styles banned by lint

**Problem.** Inline `style={{...}}` props are easy to reach for, framework-specific (they don't survive a React → SolidJS port unchanged), and defeat CSS's own cascade/specificity tooling — the opposite of what the UI layer's swap contract needs.

**Choice.** Static styling lives in co-located `*.module.css` files (84 across `@rtc/client-react/src` today); a root ESLint `no-restricted-syntax` rule (`eslint.config.mjs`, the `inlineStyleProp` block appended to the client-`src` config) statically bans any `JSXAttribute[name.name='style']` carrying an object literal in production UI code, with `// eslint-disable-next-line` plus an inline reason as the only escape hatch — reserved for genuinely runtime-computed values via CSS custom properties.

**Alternatives rejected.** Leaving inline styles as a case-by-case code-review judgment call — the state before this rule existed — was rejected because it doesn't scale across two (soon three) UI packages and doesn't produce a machine-checkable guarantee that markup/styling ports verbatim to a new framework the way CSS Modules classnames do.

**Cost accepted.** A small category of legitimately dynamic, per-instance values (an animated position, a computed color) can't use a static class and must go through the CSS-custom-property escape hatch, which reads slightly more verbosely than an inline style would have.

### 10.9 Visual goldens as the cross-framework rendering contract ([ADR-001](../../packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md))

**Problem.** Behavioural specs and UI-contract tests prove the *hooks and DOM structure* survive a framework swap, but neither proves that the *pixels* do — and pixel fidelity is exactly what a design-driven trading UI is judged on.

**Choice.** Playwright Component Testing (`@playwright/experimental-ct-react`, bundled via Vite) screenshots the UI against an injected fake `ViewModel`, writing committed PNGs under `__screenshots__/` — in-repo, not in a cloud diffing service — so a future SolidJS port can point the *same* runner at the *same* baseline directory and treat any pixel diff as a parity punch-list. Two golden sets are committed per tier (canonical `react/` on pinned x86 CI, `react-local/<platform>-<arch>/` for local review) because screenshot rasterization is font/OS-dependent; a third tier (Vitest browser mode) diffs against the same goldens.

**Alternatives rejected.** A cloud SaaS diffing service (Chromatic/Percy/Applitools) was rejected — it stores baselines off-repo behind an account, breaking both the cross-framework-contract property and the repo's offline-checkout philosophy. jsdom/happy-dom-based snapshotting was rejected outright: neither engine paints, so it cannot catch a real layout or paint regression.

**Cost accepted.** Every intentional UI change must regenerate *both* committed golden sets (the x86 set via a CI workflow, the local set via each runner's `:update` script) — no single command updates both, and `experimental-ct-react` itself is an unstable API surface across Playwright releases.

### 10.10 A dedicated `tests` workspace running ten parallel e2e suites

**Problem.** Proving the behavioural-spec-survives-a-swap claim from [§1.2 rule 4](01-overview.md#12-architectural-principles) needs more than one driver exercising the specs — otherwise "framework-agnostic" is asserted, not demonstrated, and a driver-specific bug (a Cypress queue quirk, a Playwright timing assumption) could hide inside the only implementation that runs.

**Choice.** `@rtc/tests` is its own top-level pnpm workspace member (`pnpm-workspace.yaml`), separate from any client or server package, orchestrating **ten suites** via `tests/scripts/run-all.ts`: eight browser/presenter peers binding the same Gherkin `.feature` files through six different binding styles (Cucumber+Playwright, Cucumber+Cypress, native Playwright, native Cypress, plus four presenter-direct peers spanning real timers, fake timers, and three test-runner combinations), and two full-stack smokes that boot a real server ([§9.5](09-test-strategy.md#95-ten-suite-e2e-stack-4-browser-peers--4-presenter-peers--2-fullstack-smokes)). Keeping it a peer workspace rather than folding e2e into `client-react`/`server` lets it depend on built artifacts from *both* without either depending back on test tooling.

**Alternatives rejected.** A single browser driver (just Playwright, the CI-gating choice) was rejected as the sole e2e tier — the four presenter-direct peers exist specifically to prove the same specs validate the application layer with zero UI framework, closing the loop on the swap claim rather than assuming it.

**Cost accepted.** Ten suites is real CI wall-clock and maintenance surface — mitigated by `RTC_E2E_MAX_PARALLEL`, a Cypress de-gate on CI (`RTC_E2E_SKIP_CYPRESS=1`), and the presenter-direct fake-timer peers running ~19× faster than their real-timer counterpart, but every new scenario still touches multiple step-definition trees.

### 10.11 Continuous UI without fighting the framework

**Problem.** A permanently-animated HUD over a live data stream needs two things a transactional-store architecture makes miserable once business logic lives inside components: per-frame values (a drag delta, a glide position) that can't afford a dispatched render on every tick, and components that must keep existing past their own logical removal — a panel stays mounted while it maximizes away, a strip stays interactive while it glides shut.

**Choice.** `createLayoutMachine` (`packages/client-core/src/presenters/LayoutMachine.ts:98-100`) folds five layout intents through an rxjs `scan` reducer (`LayoutMachine.ts:135`) and exposes the result as a `state$` stream; its own doc comment calls it a mirror of "the NotionalMachine intent-driven precedent" (`LayoutMachine.ts:94-97`). `InhouseLayoutEngine` (`packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx`) only renders that state, resolving panels through a `PanelRegistry` id→component map (`panelRegistry.ts:5-8`) instead of importing them directly — the registry is the UI↔engine seam. Steady-state motion (the maximize glide, the FLIP grid reflow in `useFlipGrid.ts:4-12`) stays compositor-only `transform`/`opacity` per [`docs/performance.md`](../performance.md)'s one-sentence rule, so continuous motion never re-enters the render loop the machine already keeps quiet. The store is Redux-*shaped* — `LayoutMachine`'s own reducer looks like one — but the *surface* it exposes is a stream, so render granularity belongs to the renderer, not the store.

**Alternatives rejected.** Redux with the reducer logic embedded in components was rejected — it's the shape LayoutMachine's own reducer resembles, but keeping that logic in components ties render granularity back to store dispatch. Driving continuous motion through an animation library that writes React state every frame was rejected for the same reason gates 26–29 exist ([§12](12-architectural-gates.md)): state, streams, and clocks belong in machines/presenters, not components — a per-frame `setState` is a render storm by another name. Keeping layout state in component state was rejected outright — a panel removed from its parent's JSX during dispatch can't finish gliding shut, forcing the ghost-component hacks this design avoids.

**Cost accepted.** Two packages to touch for one shell feature — a machine change in `client-core`, a renderer change in `client-react` — instead of one component file. `InhouseLayoutEngine.tsx` names its own exception: "the ONE framework-coupled spot in the app" (`InhouseLayoutEngine.tsx:26-31`), confined there so a SolidJS port re-implements only this file, and the split holds only as long as gates 26–33 ([§12](12-architectural-gates.md)) keep enforcing it. The advice to colocate state with the component that renders it is, for this shell, backwards on purpose.

See [§17](17-web-client-up-close.md#17-the-web-client-up-close) for the mechanism-level walkthrough — the component tree, the layout system, and the motion toolbox this decision produced.

---

