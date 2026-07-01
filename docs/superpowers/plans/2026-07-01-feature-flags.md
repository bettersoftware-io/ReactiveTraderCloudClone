# Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a feature-flag seam to the client — a reactive `useFeatureFlag(name)` ViewModel member backed by a swappable `FeatureFlagPort` adapter — and prove it on one real runtime flag (`disableAnimations`).

**Architecture:** Mirror the existing preferences trail across four layers: a domain port (`FeatureFlagPort`, rxjs-only), an app presenter (`FeatureFlagPresenter`, a `shareReplay` passthrough), a `react-bindings` `bind` exposing `useFeatureFlag`, and client-react adapters (a dependency-free `StaticFeatureFlagAdapter` by default; an `OpenFeatureFeatureFlagAdapter` as the vendor showcase). Component selection stays in the view via a `<FeatureGate>` one-liner.

**Tech Stack:** TypeScript, RxJS, `@react-rxjs/core` (`bind`), React, Vite, Vitest, pnpm workspaces. Optional (Task 9): `@openfeature/web-sdk` + `@openfeature/flagsmith-client-provider`.

**References:** [design spec](../specs/2026-07-01-feature-flags-design.md) · [tooling research](../../research/2026-07-01-feature-flag-tooling-landscape.md) · [ADR-004](../../adr/ADR-004-viewmodel-seam-and-feature-flags.md).

## Global Constraints

- **`@rtc/domain` runtime deps: `rxjs` only.** The port is types + rxjs; no vendor SDK in domain (enforced at install).
- **Dependency flow inward only.** domain ← client-core ← react-bindings ← client-react. Adapters (incl. any vendor SDK) live in client-react.
- **`FlagName` is a closed union** (`"disableAnimations" | "newLiveRates"`) — never `string`. Unknown flags fail at compile time.
- **Replay-current streams:** `flag$` must emit synchronously on subscribe (BehaviorSubject-backed) + `distinctUntilChanged`, matching `PreferencesPort`.
- **Imports use the `#/` subpath alias**, never `../../`. Biome `noRestrictedImports` bans ≥2-up.
- **Zero lint disables.** Biome + ESLint (`lint:eslint`, `lint:eslint:types`) + stylelint must pass with no `// eslint-disable`. Run `pnpm lint` and `pnpm typecheck`, not just `biome ci`.
- **The `ViewModel` type is the completion check.** Adding `useFeatureFlag` is a compile error until the real factory AND both test harnesses (`buildFakeViewModel.ts`, `viewModelFromWorld.ts`) implement it.
- **UI render changes need BOTH committed visual golden sets regenerated** (`react/` x86 CI + `react-local/<arch>/`) plus the UI-contract coverage gate.
- **Never `git add .`** (scratch/`.env.local` leak) — add exact paths. End commit messages with the two trailers used in this repo (`Co-Authored-By:` + `Claude-Session:`).

---

### Task 1: Domain — `FeatureFlagPort`, `FlagName`, and the port contract

**Files:**
- Create: `packages/domain/src/ports/featureFlagPort.ts`
- Create: `packages/domain/src/ports/__contracts__/FeatureFlagPortContract.ts`
- Modify: `packages/domain/src/index.ts` (barrel — add the two exports)
- Test: `packages/domain/src/ports/__contracts__/FeatureFlagPortContract.ts` is itself the reusable contract; a throwaway in-memory adapter test drives it here.
- Test: `packages/domain/src/ports/__tests__/featureFlagPort.contract.test.ts`

**Interfaces:**
- Produces: `type FlagName = "disableAnimations" | "newLiveRates"`; `interface FeatureFlagPort { flag$(name: FlagName): Observable<boolean> }`; `function describeFeatureFlagPortContract(makePort: (seed: Partial<Record<FlagName, boolean>>) => FeatureFlagPort): void`.

- [ ] **Step 1: Write the failing contract test**

```ts
// packages/domain/src/ports/__tests__/featureFlagPort.contract.test.ts
import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";
import { describe } from "vitest";
import type { FeatureFlagPort, FlagName } from "../featureFlagPort.js";
import { describeFeatureFlagPortContract } from "../__contracts__/FeatureFlagPortContract.js";

/** Minimal in-memory adapter used only to exercise the contract. */
function makeInMemoryPort(seed: Partial<Record<FlagName, boolean>>): FeatureFlagPort {
  const subjects = new Map<FlagName, BehaviorSubject<boolean>>();
  const subjectFor = (name: FlagName): BehaviorSubject<boolean> => {
    let s = subjects.get(name);
    if (!s) {
      s = new BehaviorSubject<boolean>(seed[name] ?? false);
      subjects.set(name, s);
    }
    return s;
  };
  return {
    flag$(name: FlagName): Observable<boolean> {
      return subjectFor(name).pipe(distinctUntilChanged());
    },
  };
}

describe("FeatureFlagPort contract (in-memory)", () => {
  describeFeatureFlagPortContract(makeInMemoryPort);
});
```

- [ ] **Step 2: Run it, verify it fails (modules missing)**

Run: `pnpm --filter @rtc/domain test featureFlagPort`
Expected: FAIL — cannot find `../featureFlagPort.js` / `../__contracts__/FeatureFlagPortContract.js`.

- [ ] **Step 3: Write the port**

```ts
// packages/domain/src/ports/featureFlagPort.ts
import type { Observable } from "rxjs";

/** Closed set of flag names — unknown flags fail at compile time (cf. WorkspaceTab, PanelId). */
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

- [ ] **Step 4: Write the reusable contract describer**

```ts
// packages/domain/src/ports/__contracts__/FeatureFlagPortContract.ts
import { firstValueFrom, take, toArray } from "rxjs";
import { expect, it } from "vitest";
import type { FeatureFlagPort, FlagName } from "../featureFlagPort.js";

/**
 * Behavioural contract every FeatureFlagPort adapter must satisfy. Call from a
 * `describe` block, passing a factory that seeds initial flag values.
 */
export function describeFeatureFlagPortContract(
  makePort: (seed: Partial<Record<FlagName, boolean>>) => FeatureFlagPort,
): void {
  it("emits the current value synchronously on subscribe", async () => {
    const port = makePort({ disableAnimations: true });
    const first = await firstValueFrom(port.flag$("disableAnimations"));
    expect(first).toBe(true);
  });

  it("defaults an unseeded flag to false", async () => {
    const port = makePort({});
    expect(await firstValueFrom(port.flag$("newLiveRates"))).toBe(false);
  });

  it("does not re-emit unchanged values (distinctUntilChanged)", async () => {
    const port = makePort({ disableAnimations: false });
    const emissions = firstValueFrom(
      port.flag$("disableAnimations").pipe(take(1), toArray()),
    );
    expect(await emissions).toEqual([false]);
  });
}
```

- [ ] **Step 5: Export both from the domain barrel**

Add to `packages/domain/src/index.ts` (alongside the other `ports/*` re-exports):

```ts
export type { FeatureFlagPort, FlagName } from "./ports/featureFlagPort.js";
export { describeFeatureFlagPortContract } from "./ports/__contracts__/FeatureFlagPortContract.js";
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm --filter @rtc/domain test featureFlagPort`
Expected: PASS (3 tests).

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @rtc/domain typecheck`
```bash
git add packages/domain/src/ports/featureFlagPort.ts \
  packages/domain/src/ports/__contracts__/FeatureFlagPortContract.ts \
  packages/domain/src/ports/__tests__/featureFlagPort.contract.test.ts \
  packages/domain/src/index.ts
git commit -m "feat(domain): FeatureFlagPort + FlagName + port contract

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015G3xCubytN5crGpiYGjSK2"
```

---

### Task 2: App presenter — `FeatureFlagPresenter` + composition wiring

**Files:**
- Create: `packages/client-core/src/presenters/FeatureFlagPresenter.ts`
- Modify: `packages/client-core/src/presenters/index.ts` (barrel export)
- Modify: `packages/client-core/src/adapters/portFactory.ts` (`AppPorts` + `PortFactoryDeps` + both factory returns)
- Modify: `packages/client-core/src/composition.ts` (`Presenters` interface + `createApp`)
- Test: `packages/client-core/src/presenters/__tests__/FeatureFlagPresenter.test.ts`

**Interfaces:**
- Consumes: `FeatureFlagPort`, `FlagName` (Task 1).
- Produces: `class FeatureFlagPresenter { constructor(port: FeatureFlagPort); flag$(name: FlagName): Observable<boolean> }`; `AppPorts.featureFlags: FeatureFlagPort`; `PortFactoryDeps.featureFlags: FeatureFlagPort`; `Presenters.featureFlags: FeatureFlagPresenter`.

- [ ] **Step 1: Write the failing presenter test**

```ts
// packages/client-core/src/presenters/__tests__/FeatureFlagPresenter.test.ts
import { BehaviorSubject, firstValueFrom, type Observable } from "rxjs";
import { describe, expect, it } from "vitest";
import type { FeatureFlagPort, FlagName } from "@rtc/domain";
import { FeatureFlagPresenter } from "../FeatureFlagPresenter.js";

function portWith(value: boolean): FeatureFlagPort {
  const subject = new BehaviorSubject<boolean>(value);
  return { flag$: (_name: FlagName): Observable<boolean> => subject };
}

describe("FeatureFlagPresenter", () => {
  it("passes the port's current flag value through", async () => {
    const presenter = new FeatureFlagPresenter(portWith(true));
    expect(await firstValueFrom(presenter.flag$("disableAnimations"))).toBe(true);
  });

  it("shares one subscription across consumers (shareReplay)", async () => {
    const presenter = new FeatureFlagPresenter(portWith(false));
    const stream = presenter.flag$("newLiveRates");
    expect(await firstValueFrom(stream)).toBe(false);
    expect(await firstValueFrom(stream)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @rtc/client-core test FeatureFlagPresenter`
Expected: FAIL — cannot find `../FeatureFlagPresenter.js`.

- [ ] **Step 3: Write the presenter (verbatim shape of ViewModePreferencePresenter)**

```ts
// packages/client-core/src/presenters/FeatureFlagPresenter.ts
import { type Observable, shareReplay } from "rxjs";
import type { FeatureFlagPort, FlagName } from "@rtc/domain";

/** App-layer presenter for feature flags — a thin replay passthrough that keeps
 * flag evaluation out of the UI, mirroring ViewModePreferencePresenter. */
export class FeatureFlagPresenter {
  constructor(private readonly port: FeatureFlagPort) {}

  flag$(name: FlagName): Observable<boolean> {
    return this.port
      .flag$(name)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
```

- [ ] **Step 4: Export from the presenters barrel**

Add to `packages/client-core/src/presenters/index.ts`:
```ts
export { FeatureFlagPresenter } from "./FeatureFlagPresenter.js";
```

- [ ] **Step 5: Add the port to `AppPorts` + `PortFactoryDeps` + both factories**

In `packages/client-core/src/adapters/portFactory.ts`:
- add `FeatureFlagPort` to the `@rtc/domain` type import block;
- in `interface AppPorts`, after `preferences: PreferencesPort;` add:
  ```ts
  featureFlags: FeatureFlagPort;
  ```
- in `interface PortFactoryDeps`, after `preferences: PreferencesPort;` add:
  ```ts
  featureFlags: FeatureFlagPort;
  ```
- in the object returned by `createSimulatorPorts`, after `preferences: deps.preferences,` add `featureFlags: deps.featureFlags,`;
- do the same in `createWsRealPorts`'s returned object.

- [ ] **Step 6: Construct the presenter in `createApp`**

In `packages/client-core/src/composition.ts`:
- add `FeatureFlagPresenter` to the `#/presenters/index` import block;
- in `interface Presenters`, add `featureFlags: FeatureFlagPresenter;`;
- in the `presenters` object literal in `createApp`, add:
  ```ts
  featureFlags: new FeatureFlagPresenter(ports.featureFlags),
  ```

- [ ] **Step 7: Run presenter test + typecheck**

Run: `pnpm --filter @rtc/client-core test FeatureFlagPresenter`
Expected: PASS.
Run: `pnpm --filter @rtc/client-core typecheck`
Expected: FAIL — every `PortFactoryDeps`/`AppPorts` construction site now lacks `featureFlags`. That is expected and fixed in Task 5 (platform wiring). Leave client-core's own tests green (they build ports via helpers updated next).

> NOTE: if client-core's own port-factory tests construct `PortFactoryDeps` inline, update those call sites here to pass `featureFlags: <in-memory adapter from Task 1's pattern>` so this task ends green in isolation; browser/native wiring is Task 5.

- [ ] **Step 8: Commit**

```bash
git add packages/client-core/src/presenters/FeatureFlagPresenter.ts \
  packages/client-core/src/presenters/index.ts \
  packages/client-core/src/presenters/__tests__/FeatureFlagPresenter.test.ts \
  packages/client-core/src/adapters/portFactory.ts \
  packages/client-core/src/composition.ts
git commit -m "feat(client-core): FeatureFlagPresenter + wire featureFlags port

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015G3xCubytN5crGpiYGjSK2"
```

---

### Task 3: `StaticFeatureFlagAdapter` (default, zero-dependency)

**Files:**
- Create: `packages/client-react/src/app/adapters/StaticFeatureFlagAdapter.ts`
- Test: `packages/client-react/src/app/adapters/__tests__/StaticFeatureFlagAdapter.test.ts`

**Interfaces:**
- Consumes: `FeatureFlagPort`, `FlagName`, `describeFeatureFlagPortContract` (Task 1).
- Produces: `class StaticFeatureFlagAdapter implements FeatureFlagPort { constructor(defaults: Record<FlagName, boolean>); setFlag(name: FlagName, on: boolean): void }`; `const DEFAULT_FLAGS: Record<FlagName, boolean>`.

- [ ] **Step 1: Write the failing test (drives the shared contract + the dev-override setter)**

```ts
// packages/client-react/src/app/adapters/__tests__/StaticFeatureFlagAdapter.test.ts
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { describeFeatureFlagPortContract, type FlagName } from "@rtc/domain";
import { DEFAULT_FLAGS, StaticFeatureFlagAdapter } from "../StaticFeatureFlagAdapter.js";

describe("StaticFeatureFlagAdapter contract", () => {
  describeFeatureFlagPortContract((seed: Partial<Record<FlagName, boolean>>) =>
    new StaticFeatureFlagAdapter({ ...DEFAULT_FLAGS, ...seed }),
  );
});

describe("StaticFeatureFlagAdapter dev override", () => {
  it("re-emits when setFlag flips a value", async () => {
    const adapter = new StaticFeatureFlagAdapter(DEFAULT_FLAGS);
    const values: boolean[] = [];
    const sub = adapter.flag$("disableAnimations").subscribe((v) => values.push(v));
    adapter.setFlag("disableAnimations", true);
    sub.unsubscribe();
    expect(values).toEqual([false, true]);
  });

  it("ships all flags off by default", async () => {
    const adapter = new StaticFeatureFlagAdapter(DEFAULT_FLAGS);
    expect(await firstValueFrom(adapter.flag$("newLiveRates"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @rtc/client-react test:app StaticFeatureFlagAdapter`
Expected: FAIL — cannot find `../StaticFeatureFlagAdapter.js`.

- [ ] **Step 3: Write the adapter (mirrors LocalStoragePreferencesAdapter)**

```ts
// packages/client-react/src/app/adapters/StaticFeatureFlagAdapter.ts
import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";
import type { FeatureFlagPort, FlagName } from "@rtc/domain";

/** Every known flag, defaulting OFF. New flags are added to FlagName (domain)
 * and here in lockstep — the Record type makes an omission a compile error. */
export const DEFAULT_FLAGS: Record<FlagName, boolean> = {
  disableAnimations: false,
  newLiveRates: false,
};

/**
 * Dependency-free FeatureFlagPort: a BehaviorSubject per flag seeded from a
 * static defaults map. `setFlag` supports a dev overlay flipping flags at
 * runtime with no service. Structurally a copy of LocalStoragePreferencesAdapter.
 */
export class StaticFeatureFlagAdapter implements FeatureFlagPort {
  private readonly subjects: Record<FlagName, BehaviorSubject<boolean>>;

  constructor(defaults: Record<FlagName, boolean>) {
    this.subjects = {
      disableAnimations: new BehaviorSubject<boolean>(defaults.disableAnimations),
      newLiveRates: new BehaviorSubject<boolean>(defaults.newLiveRates),
    };
  }

  flag$(name: FlagName): Observable<boolean> {
    return this.subjects[name].pipe(distinctUntilChanged());
  }

  setFlag(name: FlagName, on: boolean): void {
    this.subjects[name].next(on);
  }
}
```

- [ ] **Step 4: Run test + typecheck, verify pass**

Run: `pnpm --filter @rtc/client-react test:app StaticFeatureFlagAdapter`
Expected: PASS (contract 3 + override 2).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react/src/app/adapters/StaticFeatureFlagAdapter.ts \
  packages/client-react/src/app/adapters/__tests__/StaticFeatureFlagAdapter.test.ts
git commit -m "feat(client-react): StaticFeatureFlagAdapter (default FeatureFlagPort)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015G3xCubytN5crGpiYGjSK2"
```

---

### Task 4: `useFeatureFlag` ViewModel member + both test harnesses

This task lands the `ViewModel` type member and its three implementations together, because the type will not compile until all three exist.

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts` (type + bind + return)
- Modify: `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`
- Modify: `packages/client-react/tests/ui/visual/shared/appData.ts` (add optional `flags` field)
- Modify: `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts`
- Modify: `packages/client-react/tests/ui/contract/shared/harness/world.ts` (add flag subjects)

**Interfaces:**
- Consumes: `presenters.featureFlags.flag$` (Task 2); `FlagName` (Task 1).
- Produces: `ViewModel.useFeatureFlag: (name: FlagName) => boolean`.

- [ ] **Step 1: Add the member to the `ViewModel` type**

In `packages/react-bindings/src/createViewModel.ts`, add `FlagName` to the `@rtc/domain` import, and add to `interface ViewModel`:
```ts
  /** Reactive feature-flag value — false until the port emits; consumed by
   * destructuring, never imported directly (ADR-004 §2a). */
  useFeatureFlag: (name: FlagName) => boolean;
```

- [ ] **Step 2: Bind + return it in `createViewModel`**

After the preferences binds, add:
```ts
  const [useFeatureFlag] = bind(
    (name: FlagName) => presenters.featureFlags.flag$(name),
    false,
  );
```
and add `useFeatureFlag,` to the returned object literal.

- [ ] **Step 3: Run react-bindings typecheck, verify it FAILS on the harnesses**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: FAIL — `buildFakeViewModel` and `viewModelFromWorld` do not satisfy `ViewModel` (missing `useFeatureFlag`). This proves the type forces coverage.

- [ ] **Step 4: Implement `useFeatureFlag` in the visual fake**

In `packages/client-react/tests/ui/visual/shared/appData.ts`, add to `interface AppData` (near `animatedBackground`):
```ts
  /** Feature-flag values (useFeatureFlag); any omitted flag defaults to false. */
  flags?: Partial<Record<FlagName, boolean>>;
```
(add `FlagName` to the `@rtc/domain` import).

In `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`, alongside `useViewModePreference`, add:
```ts
    useFeatureFlag: (name) => data.flags?.[name] ?? false,
```

- [ ] **Step 5: Implement `useFeatureFlag` in the contract World**

In `packages/client-react/tests/ui/contract/shared/harness/world.ts`, add a reactive backing store next to `animatedBackground`:
```ts
  /** Reactive feature-flag values backing useFeatureFlag. */
  readonly flags: Map<FlagName, BehaviorSubject<boolean>>;
```
seed it in the World factory (default all-false, lazily created), exposing a helper `flagSubject(name: FlagName): BehaviorSubject<boolean>` that creates-on-demand with `false`.

In `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts`, alongside `useAnimatedBackground`, add:
```ts
    useFeatureFlag: (name) => useSubject(world.flagSubject(name)),
```

- [ ] **Step 6: Typecheck + run the harness unit tests**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: PASS.
Run: `pnpm --filter @rtc/client-react test:ui:contract`
Expected: PASS (existing specs unaffected — every flag defaults false).

- [ ] **Step 7: Commit**

```bash
git add packages/react-bindings/src/createViewModel.ts \
  packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts \
  packages/client-react/tests/ui/visual/shared/appData.ts \
  packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts \
  packages/client-react/tests/ui/contract/shared/harness/world.ts
git commit -m "feat(react-bindings): useFeatureFlag ViewModel member + test harnesses

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015G3xCubytN5crGpiYGjSK2"
```

---

### Task 5: Platform wiring — inject the static adapter through `PortFactoryDeps`

This closes the Task 2 typecheck gap at the browser/native composition roots.

**Files:**
- Modify: the client-react composition entry that builds `PortFactoryDeps` (grep: `createSimulatorPorts(` / `createWsRealPorts(` call sites, e.g. `packages/client-react/src/app/buildBrowserPorts.ts` — confirm exact path before editing).
- Test: extend the nearest existing composition test that constructs those deps.

**Interfaces:**
- Consumes: `StaticFeatureFlagAdapter`, `DEFAULT_FLAGS` (Task 3); `PortFactoryDeps.featureFlags` (Task 2).

- [ ] **Step 1: Locate the deps-construction site**

Run: `grep -rn "createSimulatorPorts\|createWsRealPorts\|PortFactoryDeps\|preferences:" packages/client-react/src --include=*.ts`
Identify where `{ preferences: new LocalStoragePreferencesAdapter() }` (or equivalent) is assembled.

- [ ] **Step 2: Add the feature-flag adapter alongside preferences**

At each such site, construct once and inject:
```ts
import { StaticFeatureFlagAdapter, DEFAULT_FLAGS } from "#/app/adapters/StaticFeatureFlagAdapter";
// ...
const featureFlags = new StaticFeatureFlagAdapter(DEFAULT_FLAGS);
const deps = { preferences, featureFlags };
```
(Env-selected provider — `import.meta.env.VITE_FLAGS_PROVIDER === "openfeature"` — is added in Task 9; default stays static.)

- [ ] **Step 3: Typecheck the whole client**

Run: `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-core typecheck`
Expected: PASS (the Task 2 gap is now closed).

- [ ] **Step 4: Run the composition/app test suite**

Run: `pnpm --filter @rtc/client-react test:app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add <the edited composition file(s)> <the edited test>
git commit -m "feat(client-react): inject StaticFeatureFlagAdapter at composition root

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015G3xCubytN5crGpiYGjSK2"
```

---

### Task 6: `<FeatureGate>` component

**Files:**
- Create: `packages/client-react/src/ui/common/FeatureGate.tsx`
- Test: `packages/client-react/tests/ui/contract/featureGate.contract.spec.ts` (+ the `react/` swap file if the tier requires one — follow the existing contract-trio convention)

**Interfaces:**
- Consumes: `useViewModel().useFeatureFlag` (Task 4); `FlagName` (Task 1).
- Produces: `function FeatureGate({ flag, on, off }: { flag: FlagName; on: ReactNode; off: ReactNode }): ReactNode`.

- [ ] **Step 1: Write the failing contract spec**

```ts
// mounts FeatureGate through the fake ViewModel, asserts it renders `on` when the
// flag is true and `off` when false. Use mountWith({ flags: { disableAnimations: true } }).
// (Model on an existing *.contract.spec.ts in tests/ui/contract/.)
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @rtc/client-react test:ui:contract featureGate`
Expected: FAIL — cannot find `FeatureGate`.

- [ ] **Step 3: Write the component**

```tsx
// packages/client-react/src/ui/common/FeatureGate.tsx
import type { ReactNode } from "react";
import { useViewModel } from "@rtc/react-bindings";
import type { FlagName } from "@rtc/domain";

/** Declarative flag switch — the ONLY framework-specific piece of the feature-flag
 * seam. Reads the flag value through the ViewModel; renders `on` or `off`. Keep the
 * switch at exactly one seam per flag so removing a flag = delete the loser + the gate. */
export function FeatureGate({
  flag,
  on,
  off,
}: {
  flag: FlagName;
  on: ReactNode;
  off: ReactNode;
}): ReactNode {
  const { useFeatureFlag } = useViewModel();
  return useFeatureFlag(flag) ? on : off;
}
```

- [ ] **Step 4: Run test + typecheck, verify pass**

Run: `pnpm --filter @rtc/client-react test:ui:contract featureGate && pnpm --filter @rtc/client-react typecheck`
Expected: PASS.

- [ ] **Step 5: Commit** (add the component + spec; trailers as above).

---

### Task 7: The real swap — gate `AmbientBackground` on `disableAnimations` + regenerate goldens

**Files:**
- Modify: `packages/client-react/src/ui/App.tsx:21` (wrap the `<AmbientBackground />` mount)
- Regenerate: both visual golden sets; refresh UI-contract coverage.

**Interfaces:**
- Consumes: `FeatureGate` (Task 6); `AmbientBackground` (existing).

- [ ] **Step 1: Apply the one-seam swap**

In `packages/client-react/src/ui/App.tsx`, replace `<AmbientBackground />` with:
```tsx
<FeatureGate flag="disableAnimations" on={null} off={<AmbientBackground />} />
```
(add the `FeatureGate` import via `#/ui/common/FeatureGate`). When the flag is ON, animated chrome is not mounted; default (false) renders exactly as today, so existing goldens are unchanged.

- [ ] **Step 2: Verify default render is byte-identical**

Run: `pnpm --filter @rtc/client-react test:ui:visual:react` (or the arm64-local script per the dual-set memory)
Expected: PASS with no golden diffs (flag defaults false → AmbientBackground still mounts).

- [ ] **Step 3: Add a golden for the flag-ON state**

Add a visual case that mounts with `flags: { disableAnimations: true }` (via the fake ViewModel `appData` override) asserting `ambient-background` is absent. Generate its golden into BOTH committed sets.

- [ ] **Step 4: Run the full UI tiers + contract coverage gate**

Run: `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-react test:ui:contract:coverage`
Expected: PASS; contract coverage ≥95%.

- [ ] **Step 5: Commit** (App.tsx + new golden files in both sets + any new spec; trailers as above).

---

### Task 8 (optional / operational): `OpenFeatureFeatureFlagAdapter` — the vendor showcase

Deferred from the default build path; land the adapter + unit tests now, wire a live Flagsmith environment later.

**Files:**
- Modify: `packages/client-react/package.json` (add `@openfeature/web-sdk`, `@openfeature/flagsmith-client-provider`)
- Create: `packages/client-react/src/app/adapters/OpenFeatureFeatureFlagAdapter.ts`
- Test: `packages/client-react/src/app/adapters/__tests__/OpenFeatureFeatureFlagAdapter.test.ts` (drive `describeFeatureFlagPortContract` against an in-memory OpenFeature provider)

**Interfaces:**
- Consumes: `FeatureFlagPort`, `FlagName`, `describeFeatureFlagPortContract` (Task 1).
- Produces: `class OpenFeatureFeatureFlagAdapter implements FeatureFlagPort` wrapping an `@openfeature/web-sdk` `Client`; `flag$` emits `getBooleanValue(name, false)` and re-emits on `ProviderEvents.ConfigurationChanged`.

- [ ] **Step 1: Verify dep freshness before adding** — `pnpm outdated -r`; confirm the OpenFeature packages are the latest *acceptable* versions (respect the 24h `minimumReleaseAge` cooldown). Record the versions.
- [ ] **Step 2: Write the failing contract test** against an in-memory OpenFeature provider seeded from the contract's `seed` map.
- [ ] **Step 3: Run it, verify it fails** (`test:app OpenFeatureFeatureFlagAdapter`).
- [ ] **Step 4: Write the adapter** — subscribe bridge: emit initial `getBooleanValue`, add a `ProviderEvents.ConfigurationChanged` listener re-emitting the current value, remove it on unsubscribe.
- [ ] **Step 5: Run test + typecheck, verify pass.**
- [ ] **Step 6: Add env selection** in the Task 5 composition site: `VITE_FLAGS_PROVIDER === "openfeature"` → construct `OpenFeatureFeatureFlagAdapter` (after `OpenFeature.setProvider(new FlagsmithClientProvider({ environmentID: import.meta.env.VITE_FLAGSMITH_ENV_KEY }))`); else the static adapter.
- [ ] **Step 7: Commit** (package.json + lockfile + adapter + test + composition; trailers as above).

---

## Self-Review

**Spec coverage:** §1 domain → Task 1. §2 presenter + composition → Task 2. §3 ViewModel bind → Task 4. §4 static adapter → Task 3; OpenFeature adapter → Task 8; composition selection → Tasks 5 + 8. §5 view (`FeatureGate` + real swap) → Tasks 6 + 7. Test harnesses → Task 4 (member) + Task 7 (goldens). Boot-time track → documented only (no task, per spec non-goal). ✓ All build sections covered.

**Placeholder scan:** the only intentionally-open item is the exact composition file path in Task 5 (Vite-entry-specific), with a grep to resolve it — not a code placeholder. Task 6/7 test bodies reference the existing contract-trio convention rather than pasting a full unfamiliar harness; the implementer follows a co-located example. No `TBD`/"handle edge cases".

**Type consistency:** `FlagName`, `FeatureFlagPort.flag$`, `FeatureFlagPresenter.flag$`, `AppPorts.featureFlags`, `PortFactoryDeps.featureFlags`, `Presenters.featureFlags`, `ViewModel.useFeatureFlag`, `StaticFeatureFlagAdapter(defaults)/setFlag`, `DEFAULT_FLAGS`, `describeFeatureFlagPortContract(makePort)` are used identically across tasks. ✓

**Ordering note:** Task 2 intentionally leaves the cross-package typecheck red until Task 5 closes it — flagged in Task 2 Step 7. Domain (1), presenter (2), static adapter (3), and ViewModel member (4) are each independently testable; Task 5 is the integration seam.
