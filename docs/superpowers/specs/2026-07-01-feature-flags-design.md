# Feature Flags — implementation design (realising ADR-004 Decision 2)

**Status:** Draft, 2026-07-01
**Decision reference:** [ADR-004 §2 "feature-flag layering"](../../adr/ADR-004-viewmodel-seam-and-feature-flags.md)
(layering already Accepted; this spec settles the ADR's four open follow-ups).
**Tooling reference:** [Feature-flag tooling landscape (2026)](../../research/2026-07-01-feature-flag-tooling-landscape.md)
(the "why Flagsmith-behind-OpenFeature" evidence base).
**Architecture reference:** `docs/architecture.md` §3.6 "No DI in the UI"; the
preferences trail (`PreferencesPort` → `ViewModePreferencePresenter` → `bind`).

## Goal

Add feature flags to the client along the seam ADR-004 already fixed, so that:

- a flag **value** is a reactive `useFeatureFlag(name)` member of the
  framework-neutral `ViewModel`, consumed by destructuring only;
- the flag **source** is a `FeatureFlagPort` adapter chosen at the composition
  root (a dependency-free static adapter by default; an OpenFeature-backed
  adapter — Flagsmith first — as the "real vendor" showcase, with ConfigCat /
  GrowthBook as one-line drop-ins);
- the component **choice** stays in the view (a `<FeatureGate>` one-liner);
- and the whole thing is proven end-to-end on **one real runtime flag**.

This mirrors the existing preferences pattern verbatim across four layers, so the
value ports to SolidJS through the same bridge as every other ViewModel member.

## Scope decisions (settling ADR-004's open follow-ups)

ADR-004 explicitly deferred four questions to "the feature-flag implementation
plan." This spec settles them:

1. **`FeatureFlagPort` source/adapter** → ship **two**: a dependency-free
   `StaticFeatureFlagAdapter` (default) and an `OpenFeatureFeatureFlagAdapter`
   backed by Flagsmith. ConfigCat / GrowthBook are documented drop-ins, not built.
2. **Infra alone vs. with a first flag** → **with one real flag** (`disableAnimations`),
   proven through the visual + contract golden tiers in both states.
3. **`<FeatureGate>` vs. inline ternary** → introduce a thin **`<FeatureGate>`**
   helper (there is more than one prospective flag; a named seam removes cleanly).
4. **`FlagName`** → a **closed union** (`"disableAnimations" | "newLiveRates"`),
   so unknown flags fail at compile time, mirroring `WorkspaceTab` / `PanelId`.

## Non-goals

- **Building the boot-time React-vs-SolidJS selection (ADR-004 §2c).**
  Documented here (see "Boot-time track"), **not built** — there is no SolidJS
  client yet, so a real selector would choose between one bundle and a placeholder.
  It ships when the SolidJS port begins.
- **Standing up a live Flagsmith instance / remote dashboard as part of this
  work.** The `OpenFeatureFeatureFlagAdapter` is written and unit-tested against a
  provider, but wiring a running Flagsmith environment + `.env` keys is an
  operational follow-up; the default build path uses the static adapter.
- Building the ConfigCat or GrowthBook adapters (documented drop-ins only).
- Any remote-config / A-B / targeting capability beyond a boolean flag.

## Architecture — four layers, mirroring the preferences trail

### §1 Domain — `@rtc/domain` (rxjs-only)

`packages/domain/src/ports/featureFlagPort.ts`:

```ts
import type { Observable } from "rxjs";

/** Closed union — unknown flags fail at compile time (cf. WorkspaceTab, PanelId). */
export type FlagName = "disableAnimations" | "newLiveRates";

/**
 * Evaluates feature flags. `flag$` is replay-current (BehaviorSubject-backed):
 * a subscriber receives the current value synchronously on subscribe — the same
 * contract PreferencesPort uses to prevent a flash on load.
 */
export interface FeatureFlagPort {
  flag$(name: FlagName): Observable<boolean>;
}
```

Plus `packages/domain/src/ports/__contracts__/FeatureFlagPortContract.ts` — a
describer (like `PreferencesPortContract`) that any adapter must pass: synchronous
initial emission, and `distinctUntilChanged` semantics. Export both from the
domain index.

### §2 App presenter — `@rtc/client-core`

`packages/client-core/src/presenters/FeatureFlagPresenter.ts` — a verbatim copy of
`ViewModePreferencePresenter`'s shape:

```ts
import { type Observable, shareReplay } from "rxjs";
import type { FeatureFlagPort, FlagName } from "@rtc/domain";

export class FeatureFlagPresenter {
  constructor(private readonly port: FeatureFlagPort) {}

  flag$(name: FlagName): Observable<boolean> {
    return this.port.flag$(name).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
```

Wiring in `packages/client-core/src/composition.ts`:

- add `featureFlags: FeatureFlagPort` to `AppPorts` (the `portFactory` type);
- add `featureFlags: FeatureFlagPresenter` to the `Presenters` interface;
- construct it in `createApp`: `featureFlags: new FeatureFlagPresenter(ports.featureFlags)`.

### §3 ViewModel bind — `@rtc/react-bindings`

In `packages/react-bindings/src/createViewModel.ts`:

- add one member to the `ViewModel` type:
  `useFeatureFlag: (name: FlagName) => boolean;`
- bind it exactly like the parameterised `usePrice` / `useAnimationIntents`:
  `const [useFeatureFlag] = bind((name: FlagName) => presenters.featureFlags.flag$(name), false);`
- return `useFeatureFlag` from the factory.

The `ViewModel` type is implemented by the real factory **and** both test
harnesses, so adding this member is a compile error until every implementation
plus the visual `appData.ts` fixture and the contract `world.ts` provide it —
coverage is compiler-forced (ADR-004 "Consequences").

### §4 Adapters — `@rtc/client-react`

Both implement `FeatureFlagPort`; the composition root selects by env
(`VITE_FLAGS_PROVIDER=static | openfeature`, defaulting to `static`).

- **`StaticFeatureFlagAdapter`** (default, zero-dependency) — a
  `BehaviorSubject`-per-flag map seeded synchronously from a default
  `Record<FlagName, boolean>` config, with an optional `localStorage` /
  `import.meta.env` override read on construction. Structurally a copy of
  `LocalStoragePreferencesAdapter` (same `readStored`/`writeStored`/graceful-catch
  pattern, same `distinctUntilChanged` on read). Enables a dev overlay to flip
  flags live with no service.
- **`OpenFeatureFeatureFlagAdapter`** (the showcase) — wraps
  `@openfeature/web-sdk`. `flag$(name)` returns an Observable that emits the
  current `client.getBooleanValue(name, false)` and re-emits on the client's
  provider-configuration-changed / flag-change events (bridging OpenFeature's
  event emitter into RxJS). The concrete provider is set once at composition:
  `OpenFeature.setProvider(new FlagsmithClientProvider({ environmentID }))`.
  **Swapping to ConfigCat / GrowthBook is a one-line provider change here** — the
  port, presenter, ViewModel, UI, and tests are untouched.

### §5 View — `@rtc/client-react` UI

- `packages/client-react/src/ui/.../FeatureGate.tsx` — the only framework-specific
  piece; a one-liner that reads the flag through the seam:

  ```tsx
  export function FeatureGate({ flag, on, off }: FeatureGateProps): ReactNode {
    const { useFeatureFlag } = useViewModel();
    return useFeatureFlag(flag) ? on : off;
  }
  ```

  SolidJS would get its own equivalent one-liner; the flag *value* it reads is
  framework-neutral.
- **One real runtime swap:** gate the ambient animated-background / Motion One
  choreography on `disableAnimations` at a single parent seam, keeping both
  states rendered by sibling files. (Open item: confirm `disableAnimations` vs a
  `newLiveRates` V1/V2 tile as the first swap — see below.)

### Test harnesses (compiler-forced by the `ViewModel` type)

- `tests/ui/visual/react/buildFakeViewModel.ts` — add `useFeatureFlag` reading the
  visual `appData.ts` fixture;
- `tests/ui/contract/react/viewModelFromWorld.ts` — add `useFeatureFlag` reading
  `world.ts` state (so contract specs mount either branch via `mountWith`);
- regenerate the visual goldens (both committed sets) for **both** flag states of
  the real swap.

## Boot-time track — documented only (ADR-004 §2c)

The React-vs-SolidJS flag is **decide-once-at-startup**, not runtime state, so it
does **not** flow through the ViewModel. It is resolved *before* the app bundle
loads:

- resolve one flag at the **edge / `index.html`** — for Flagsmith, a single keyed
  `GET https://edge.api.flagsmith.com/api/v1/flags/` returns an evaluated value;
  or an OpenFeature **server-SDK / OFREP** call in an edge function;
- the chosen framework's entry bundle is then loaded; the UI never sees the flag;
- the future SolidJS client binds the same OpenFeature Web SDK for its *runtime*
  flags, preserving the single-adapter showcase.

This is captured so the boundary is settled; no code lands for it in this spec.
See the tooling research doc's "Boot-time evaluation" section for the verified
mechanics and caveats.

## Showcase framing (why this is worth building here)

The port makes `Static ↔ Flagsmith ↔ ConfigCat ↔ GrowthBook` interchangeable at a
single composition line, with zero change to domain, ViewModel, UI, or tests —
the concrete demonstration of dependency inversion this project exists to show.
The flag value ports to SolidJS unchanged; only the `<FeatureGate>` one-liner is
framework-specific.

## Open items for the plan / user

- **First runtime swap:** `disableAnimations` (gates ambient motion — matches the
  use case the user named) **vs.** a `newLiveRates` V1/V2 tile. Default:
  `disableAnimations` (smaller, no new component variant).
- **Flagship vendor:** Flagsmith (spec default) vs. ConfigCat. Behind the port
  this is a late, cheap decision.
- **Ship the OpenFeature adapter with a live environment now, or land the static
  adapter + the OpenFeature adapter's unit tests and defer the live Flagsmith
  wiring** to an operational follow-up. Default: the latter.

## Sequencing (inward-out, one PR)

domain port + contract → client-core presenter + composition wiring →
react-bindings `useFeatureFlag` + type → client-react static adapter →
`<FeatureGate>` + the one real swap → OpenFeature adapter (unit-tested) → test
harness updates + regenerated goldens. Each layer compiles before the next; the
`ViewModel` type is the completion check.
