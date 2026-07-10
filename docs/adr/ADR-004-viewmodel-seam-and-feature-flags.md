# ADR-004: The ViewModel seam (renaming the UI DI boundary) and feature-flag layering

**Status:** Two decisions, two states.
- **Decision 1 — rename the DI seam to `ViewModel`:** Accepted; implementation planned
  (`docs/superpowers/plans/2026-06-30-viewmodel-seam-rename.md`).
- **Decision 2 — feature-flag layering:** Accepted as architecture; **no code yet**
  (Proposed). Recorded here so the boundary is settled before the first flag is added.

> **Update (2026-07-07).** Decision 1 **shipped** — in a stronger shape than this ADR
> planned: the seam became its own package, **`@rtc/react-bindings`**
> (`createViewModel`, `useViewModel`, `ViewModelProvider`, `ViewModelContext`,
> `useMachine`), rather than a `src/ui/viewModel/` directory inside `client-react`.
> The `Presenters` input type moved with the application-core extraction to
> `packages/client-core/src/composition.ts`. Path references below are the ADR's
> point-in-time record; the live description is
> [architecture.md §3.6](../architecture/03-uml-class-diagrams.md#36-the-viewmodel-seam).

> Sibling decision records. ADR-001 lives co-located with its concern at
> `packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md`;
> [ADR-002](./ADR-002-layout-management-port.md) covers layout management;
> [ADR-003](./ADR-003-react-compiler-and-manual-memoization.md) covers the React
> Compiler. This ADR is UI-layer-specific but names a cross-cutting seam every
> component imports, so it lives here under `docs/adr/`.

## Context

The dumb UI obtains **all** of its reactive data and intents through a single
dependency-injection seam:

- `createAppHooks(presenters, machines, commands)` builds an `AppHooks` bundle — a
  flat record of ~50 React hooks (`usePrice`, `useTrades`, `useIncident`, …) that
  adapt the application layer (presenters + RxJS machines + commands) into the hook
  shape the UI consumes. See `packages/client-react/src/ui/viewModel/createViewModel.ts`.
- `HooksContext` (`React.createContext<AppHooks | null>(null)`) carries that bundle.
- `HooksProvider` is the composition-root injector; only `AppRoot.tsx` and test
  harnesses mount it.
- `useHooks()` is the accessor every dumb component calls
  (`const { usePrice, useStaleFlag } = useHooks()` — e.g. `fx/liveRates/tile/Tile.tsx`).

This is the seam that keeps `architecture.md §3.6 "No DI in the UI"` honest: a
component imports **only** the accessor and the bundle's *type* — never react-rxjs,
never rxjs, never a concrete presenter or adapter.

The names are weak for two distinct reasons:

1. **`useHooks` is tautological.** Every custom hook is "a hook"; the name describes
   the *shape* of what's returned, not its *role*. Every sibling hook is role-named
   (`useTheme`, `useSession`) — `useHooks` is the odd one out.
2. **The trio is inconsistent with its own type.** The type is already `AppHooks`,
   but the accessor/context/provider say `Hooks`. The type chose a better word than
   its accessor.

## Decision 1 — rename the seam to `ViewModel`

Rename the concept to express its **role**, using the widely-known MVVM vocabulary
that already maps onto this architecture (the dumb *view* binds to a *view-model*
that exposes state + intents):

| Before | After |
|---|---|
| type `AppHooks` | type `ViewModel` |
| `createAppHooks(...)` | `createViewModel(...)` |
| `HooksContext` | `ViewModelContext` |
| `HooksProvider` (prop `hooks`) | `ViewModelProvider` (prop `viewModel`) |
| `useHooks()` | `useViewModel()` |
| dir `src/ui/hooks/` | dir `src/ui/viewModel/` |
| test fakes `buildFakeHooks` / `reactHooks` | `buildFakeViewModel` / `reactViewModel` |

It is treated as the application's **single app-wide ViewModel layer**:
`useViewModel()` returns "the ViewModel," and `usePrice`/`useIncident`/etc. are its
members. This keeps the name singular and honest (one app-wide surface), avoiding the
clumsier plural `useViewModels`.

### Why `ViewModel` and not the alternatives

- **vs. keeping `useHooks` / aligning to `useAppHooks`:** both still name the *shape*
  (it returns hooks), not the role. `ViewModel` is the only candidate that says what
  the thing is *for*. (The low-risk `useAppHooks` alignment was considered and
  rejected in favour of the more descriptive rename — option "B" in the originating
  discussion.)
- **vs. `usePresenters`:** actively misleading. `createViewModel` *takes* a
  `Presenters` type as input (`packages/client-react/src/app/composition.ts`); the
  bundle is the React-hook *adapter over* presenters + machines + commands, not the
  presenters themselves.
- **vs. `useDependencies`:** names the *mechanism* (DI), repeating the original sin in
  a subtler form. It is also permissive exactly where we want a constraint — see
  Decision 2's "guardrail" point.

## Decision 2 — feature-flag layering

A feature flag is **not one thing**. Separate three concerns; they live in three
layers:

| Concern | Example | Layer / home |
|---|---|---|
| flag **value** | `true` / `false` | application → **ViewModel member** |
| flag **client/SDK** | the thing that fetches/evaluates flags | composition root, behind a port |
| **component choice** | `<TileV2 />` vs `<TileV1 />` | the **view** (JSX) |

### 2a. The flag *value* is a ViewModel member

A flag value is reactive presentation state — identical in kind to the existing
`useViewModePreference` / `useAnimatedBackground`. It enters the UI through the same
seam as everything else and is consumed by destructuring, **never** by direct import:

```tsx
// a dumb component — NO direct import of any flag machinery
const { useFeatureFlag } = useViewModel();
const newRates = useFeatureFlag("newLiveRates");
return newRates ? <LiveRatesPanelV2 /> : <LiveRatesPanel />;
```

It is produced inside `createViewModel` by mirroring the preferences pattern exactly
(`PreferencesPort` → `ViewModePreferencePresenter` → `bind`):

```ts
// domain port (packages/domain/src/ports/) — boundary is Observable<boolean>
interface FeatureFlagPort { flag$(name: FlagName): Observable<boolean>; }

// app presenter (thin shareReplay passthrough, like ViewModePreferencePresenter)
class FeatureFlagPresenter {
  constructor(private readonly port: FeatureFlagPort) {}
  flag$(name: FlagName) {
    return this.port.flag$(name).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}

// createViewModel — one parameterized bind, exactly like usePrice / useAnimationIntents
const [useFeatureFlag] = bind((name: FlagName) => presenters.featureFlags.flag$(name), false);
```

The composition root (`AppRoot.tsx` → `createApp` in `composition.ts`) binds
`FeatureFlagPort` to whatever source fits — a static map, localStorage (like
`LocalStoragePreferencesAdapter`), or a remote-config adapter later. The UI never
knows which.

### 2b. The component *choice* stays in the view

Render selection is framework-specific JSX and must **not** flow through the
ViewModel (components are not ViewModel state). For a single swap, an inline ternary
at the parent is cleanest. For several swaps, a thin declarative gate that itself
reads the flag through `useViewModel()`:

```tsx
<FeatureGate flag="newLiveRates" on={<LiveRatesPanelV2 />} off={<LiveRatesPanel />} />
```

Keep both versions as separate sibling files (matches the one-component-per-file
direction), and keep the switch at exactly one seam per flag so removing the flag
later is: delete the loser + delete the gate.

### 2c. The "decide once at startup" alternative

If a flag's choice is **boot/build-time static** (never flips at runtime), there is a
second, equally-decoupled option: let the **composition root** pick the
implementation and register it — the app already has a `PanelRegistry` for exactly
this kind of startup-time selection — so the UI never sees the flag at all.

- **Runtime-flippable flag** → ViewModel path (2a + 2b). Both branches stay mounted-
  capable; the value can change and re-render.
- **Decide-once-at-startup flag** → composition-root selection. The choice is made
  before the tree renders; the UI receives only the chosen implementation.

Both keep components decoupled; they differ only in *when* the choice is made. Do
**not** inject component instances through the ViewModel (e.g. a
`useLiveRatesComponent()` returning a component) — that drags JSX into the
framework-neutral layer and breaks the SolidJS port.

### Why this layering (the guardrail argument)

The specific name `useViewModel` *is* the enforcement mechanism. A `boolean` getter
reads correctly under `useViewModel()`; injecting an infrastructure SDK
(`useFeatureFlagClient()`) or a component (`useLiveRatesComponent()`) reads
*obviously wrong* at the call site. A generic `useDependencies` would swallow both
silently. Litmus test for "does this belong in the ViewModel": if a component would
have to `import` it to use it, it's a coupling leak; if it arrives via
`const { x } = useViewModel()`, it's correctly behind the seam.

## Consequences

- **The type is the single source of truth.** `ViewModel` (née `AppHooks`) is
  implemented by the real factory **and** by two test harnesses
  (`tests/ui/visual/react/buildFakeViewModel.ts`, `tests/ui/contract/react/viewModelFromWorld.ts`).
  Adding any member (e.g. `useFeatureFlag`) is a compile error until all three
  implementations — plus the visual `appData.ts` fixture and the contract
  `world.ts` — provide it. This is a feature: the type forces full coverage.
- **Portability is preserved (the SolidJS-port contract).** The flag *value* lives in
  the framework-neutral ViewModel layer and ports through the same bridge as every
  other member. Only the thin render switch is framework-specific — and it's a
  one-liner per framework, kept at one seam, not buried.
- **Testability falls out for free.** Because the flag value is ViewModel state, the
  contract/visual tiers inject it via the fake ViewModel (`mountWith` / `buildFake…`)
  — both branches are testable by providing `useFeatureFlag → true/false`, with no
  global flag-SDK mocking. Goldens can be generated for both states.
- **Rename is a pure refactor.** No render output changes, so both committed visual
  golden sets and the full e2e suite stay byte-identical and act as the safety net.

## Follow-up (to revisit)

- The `FeatureFlagPort` source/adapter (static map vs. localStorage vs. remote),
  whether to ship flag *infrastructure* alone or with a first concrete flag, and
  whether to introduce a `<FeatureGate>` helper vs. inline ternaries are **open
  product decisions** deferred to the feature-flag implementation plan — they are not
  settled by this ADR (which fixes only the *layering*).
- `FlagName` is expected to be a closed union/enum (not arbitrary strings) so unknown
  flags fail at compile time, mirroring how `WorkspaceTab` / `PanelId` are typed.
