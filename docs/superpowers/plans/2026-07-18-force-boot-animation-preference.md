# Force Boot Animation Preference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted boolean preference `forceBootAnimation` (default off) that plays the boot-splash animation even when `prefers-reduced-motion: reduce` is set, surfaced as a wired toggle in the React and Solid Preferences dialogs.

**Architecture:** A new boolean preference cloned from the existing `animatedBackground` preference, threaded through the full stack (domain port → 4 adapters → `client-core` presenter → both bindings → both dialogs → `@rtc/ui-contract` harness). `BootSequence` and `BootGate` read the flag via a new `useForceBootAnimation()` view-model hook and compute an **effective** reduced-motion (`prefersReduced && !forced`); a `data-force-anim` attribute on the boot root neutralizes the reduced-motion CSS block so the canvas isn't left running-but-invisible.

**Tech Stack:** TypeScript, RxJS (`BehaviorSubject`/`shareReplay`), React 19 + `@rtc/react-bindings`, SolidJS + `@rtc/solid-bindings`, `@react-native-async-storage/async-storage`, Vitest, Playwright, `@rtc/ui-contract` sociable-RTL harness.

## Global Constraints

- **Template on `animatedBackground`, NOT `powerSaver`.** PR #245 (`worktree-power-saver-freeze-tier`) is concurrently reshaping `powerSaver` from a boolean into a three-state control; `animatedBackground` + `AnimatedBackgroundPresenter` are the stable boolean templates. Copy those.
- **Default `false`** everywhere — named const `DEFAULT_FORCE_BOOT_ANIMATION`, mirroring `DEFAULT_ANIMATED_BACKGROUND`.
- **Storage key:** `rtc-force-boot-animation` (LocalStorage adapters + RN AsyncStorage).
- **Preference key / hook / testid naming (use verbatim):** port `forceBootAnimation$()` / `setForceBootAnimation(on)`; presenter `ForceBootAnimationPresenter`; hook `useForceBootAnimation`; result type `UseForceBootAnimationResult`; testid `pref-toggle-forceBootAnimation`; boot-root attribute `data-force-anim`.
- **Dialog copy (verbatim):** label `Always play boot animation`; description `Plays the startup animation even when your system asks for reduced motion (e.g. remote desktops / VDI).`
- **No RN preferences UI** — the RN `AsyncStoragePreferencesAdapter` implements the port method (mandatory for typecheck), but no RN dialog/toggle and no change to RN's boot components.
- **No visual-golden regeneration** — default-off preserves current rendering; a forced-animation golden would be time-based/flaky, so none is added.
- **Scope is boot-splash only** — do not touch the ambient background or any other reduced-motion path.
- **Both web clients stay at parity** — every `client-react` change has a `client-solid` twin; the shared `@rtc/ui-contract` specs run against both.

---

### Task 1: Preference persistence (domain port + all four adapters + contracts)

Adds the preference to the domain port, the in-memory simulator, both LocalStorage adapters, and the RN AsyncStorage adapter, plus the shared port contract and adapter-contract seeds. Grouped into one task because adding a method to the `PreferencesPort` interface breaks every implementer's typecheck until all four implement it — the repo-wide `pnpm typecheck` must stay green at the task boundary.

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts` (add default const near `:76`)
- Modify: `packages/domain/src/ports/preferencesPort.ts` (interface, after the `animatedBackground` pair `:~40`)
- Modify: `packages/domain/src/simulators/PreferencesSimulator.ts` (seed field, subject, ctor, accessors)
- Modify: `packages/domain/src/index.ts` (export the new const)
- Modify: `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts` (seed field + 3 cases)
- Modify: `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts`
- Modify: `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts`
- Modify: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts`
- Test: `packages/domain/src/simulators/PreferencesSimulator.contract.test.ts` (runs the shared contract — no edit needed, new cases run automatically)
- Test: `packages/client-react/src/app/adapters/preferences.contract.test.ts` (seed + clearStorage list)
- Test: `packages/client-solid/src/app/adapters/preferences.contract.test.ts` (seed + clearStorage list)
- Test: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.test.ts` (round-trip)

**Interfaces:**
- Produces: `PreferencesPort.forceBootAnimation$(): Observable<boolean>` and `PreferencesPort.setForceBootAnimation(on: boolean): void`; `DEFAULT_FORCE_BOOT_ANIMATION = false`; `PreferencesSeed.forceBootAnimation?: boolean`.

- [ ] **Step 1: Add the three failing contract cases** in `PreferencesPortContract.ts`. Add `forceBootAnimation?: boolean;` to the `PreferencesSeed` interface (next to `animatedBackground?` at `:28`), then add these cases inside `describePreferencesPortContract` (after the existing `powerSaver` cases, ~`:165`):

```ts
    it("empty store emits the default forceBootAnimation=false", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.forceBootAnimation$())).toBe(false);
    });

    it("setForceBootAnimation persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: boolean[] = [];
      const sub = port.forceBootAnimation$().subscribe((on) => {
        return seen.push(on);
      });
      port.setForceBootAnimation(true);
      sub.unsubscribe();
      expect(seen).toEqual([false, true]);
    });

    it("reads back a seeded forceBootAnimation", async () => {
      const port = makeSeeded({ forceBootAnimation: true });
      expect(await firstValueFrom(port.forceBootAnimation$())).toBe(true);
    });
```

- [ ] **Step 2: Run the contract to confirm it fails (does not compile)**

Run: `pnpm --filter @rtc/domain typecheck`
Expected: FAIL — `Property 'forceBootAnimation$' does not exist on type 'PreferencesPort'` (and `setForceBootAnimation`). This compile error is the red state.

- [ ] **Step 3: Add the default const** in `packages/domain/src/preferences/preferences.ts`, immediately after `export const DEFAULT_ANIMATED_BACKGROUND = true;` (`:76`):

```ts
/** Force the boot-splash animation to play even under prefers-reduced-motion.
 * Default false: absent an explicit opt-in, honour the accessibility signal. */
export const DEFAULT_FORCE_BOOT_ANIMATION = false;
```

Then export it from `packages/domain/src/index.ts` alongside `DEFAULT_ANIMATED_BACKGROUND` (find that export and add `DEFAULT_FORCE_BOOT_ANIMATION` next to it).

- [ ] **Step 4: Add the port members** in `packages/domain/src/ports/preferencesPort.ts`, immediately after `setAnimatedBackground(on: boolean): void;`:

```ts
  /** Force the boot-splash animation to run even under
   * `prefers-reduced-motion: reduce`; default false. Boot-splash-scoped — does
   * not affect the ambient background or any other reduced-motion path. */
  forceBootAnimation$(): Observable<boolean>;
  setForceBootAnimation(on: boolean): void;
```

- [ ] **Step 5: Implement in the simulator** `packages/domain/src/simulators/PreferencesSimulator.ts`:
  - Add `forceBootAnimation?: boolean;` to `PreferencesSeed` (next to `animatedBackground?` at `:26`).
  - Add the import: extend the existing `@rtc/domain` preferences import (or the local `../preferences/preferences.js` import that already brings in `DEFAULT_ANIMATED_BACKGROUND`) with `DEFAULT_FORCE_BOOT_ANIMATION`.
  - Add the subject field near `animatedBg` (`:46`):

```ts
  private readonly forceBootAnimationSubject: BehaviorSubject<boolean>;
```

  - Seed it in the constructor, right after the `animatedBg` seed (`:68-70`):

```ts
    this.forceBootAnimationSubject = new BehaviorSubject<boolean>(
      seed.forceBootAnimation ?? DEFAULT_FORCE_BOOT_ANIMATION,
    );
```

  - Add the accessors after `setAnimatedBackground` (`:118`):

```ts
  forceBootAnimation$(): Observable<boolean> {
    return this.forceBootAnimationSubject.pipe(distinctUntilChanged());
  }

  setForceBootAnimation(on: boolean): void {
    this.forceBootAnimationSubject.next(on);
  }
```

- [ ] **Step 6: Implement in `client-react` LocalStorage adapter** `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts`:
  - Add to the imports (the block importing `DEFAULT_ANIMATED_BACKGROUND` at `:7`): `DEFAULT_FORCE_BOOT_ANIMATION`.
  - Add the storage-key const after `ANIMATED_BG_STORAGE_KEY` (`:28`):

```ts
export const FORCE_BOOT_ANIMATION_STORAGE_KEY = "rtc-force-boot-animation";
```

  - Add the subject field near `animatedBg` (`:127`):

```ts
  private readonly forceBootAnimationSubject: BehaviorSubject<boolean>;
```

  - Seed it in the constructor after the `animatedBg` seed (`:153-155`):

```ts
    this.forceBootAnimationSubject = new BehaviorSubject<boolean>(
      readBool(FORCE_BOOT_ANIMATION_STORAGE_KEY, DEFAULT_FORCE_BOOT_ANIMATION),
    );
```

  - Add the accessors after `setAnimatedBackground` (`:218`):

```ts
  forceBootAnimation$(): Observable<boolean> {
    return this.forceBootAnimationSubject.pipe(distinctUntilChanged());
  }

  setForceBootAnimation(on: boolean): void {
    writeStored(FORCE_BOOT_ANIMATION_STORAGE_KEY, on ? "true" : "false");
    this.forceBootAnimationSubject.next(on);
  }
```

- [ ] **Step 7: Implement in `client-solid` LocalStorage adapter** — apply the identical edits from Step 6 to `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts` (the file is byte-identical to the react one; same anchors).

- [ ] **Step 8: Implement in the RN AsyncStorage adapter** `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts`. Follow its existing seed-synchronously-then-`hydrate()` pattern (mirror the `powerSaver` member there):
  - Add the storage-key const next to the others (~`:28`): `const FORCE_BOOT_ANIMATION_STORAGE_KEY = "rtc-force-boot-animation";`
  - Add a `forceBootAnimationSubject: BehaviorSubject<boolean>` seeded `DEFAULT_FORCE_BOOT_ANIMATION` (import it from `@rtc/domain`).
  - In the async `hydrate()` block that reads each key from AsyncStorage (near the `powerSaver` hydrate ~`:155-159`), read `FORCE_BOOT_ANIMATION_STORAGE_KEY`, parse `=== "true"`, and `.next(...)` the subject.
  - Add `forceBootAnimation$()` (`return this.forceBootAnimationSubject.pipe(distinctUntilChanged());`) and `setForceBootAnimation(on)` (write `AsyncStorage.setItem(FORCE_BOOT_ANIMATION_STORAGE_KEY, on ? "true" : "false")` then `.next(on)`), mirroring the adapter's existing `powerSaver` accessors exactly.

- [ ] **Step 9: Seed the new key in the two web adapter contract tests.** In `packages/client-react/src/app/adapters/preferences.contract.test.ts` and its `client-solid` twin: add `FORCE_BOOT_ANIMATION_STORAGE_KEY` to the import from the adapter, add a `localStorage.setItem(FORCE_BOOT_ANIMATION_STORAGE_KEY, ...)` line in the `makeSeeded` seeding block wherever `forceBootAnimation` is truthy (mirror how `POWER_SAVER_STORAGE_KEY` is seeded there), and add `FORCE_BOOT_ANIMATION_STORAGE_KEY` to the `clearStorage` key list so tests don't leak state.

- [ ] **Step 10: Add an RN adapter round-trip test** in `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.test.ts`, mirroring its existing `powerSaver` round-trip test:

```ts
  it("persists and re-hydrates forceBootAnimation", async () => {
    const adapter = new AsyncStoragePreferencesAdapter();
    adapter.setForceBootAnimation(true);
    await flushAsync(); // however the file awaits AsyncStorage writes
    const rehydrated = new AsyncStoragePreferencesAdapter();
    await rehydrated.hydrate();
    expect(await firstValueFrom(rehydrated.forceBootAnimation$())).toBe(true);
  });
```

(Match the exact helper names — `flushAsync`/`hydrate`/constructor — used by the neighbouring `powerSaver` test in that file.)

- [ ] **Step 11: Run all Task-1 tests + typecheck to green**

Run: `pnpm --filter @rtc/domain test && pnpm --filter @rtc/client-react test -- preferences.contract && pnpm --filter @rtc/client-solid test -- preferences.contract && pnpm --filter @rtc/client-react-native test -- AsyncStoragePreferencesAdapter && pnpm typecheck`
Expected: PASS (all contract cases green; repo-wide typecheck green).

- [ ] **Step 12: Commit**

```bash
git add packages/domain packages/client-react/src/app/adapters packages/client-solid/src/app/adapters packages/client-react-native/src/app/adapters
git commit -m "feat(domain): add forceBootAnimation preference (port + 4 adapters + contract)"
```

---

### Task 2: `ForceBootAnimationPresenter` + composition wiring

**Files:**
- Create: `packages/client-core/src/presenters/ForceBootAnimationPresenter.ts`
- Modify: `packages/client-core/src/composition.ts` (import `:20`, interface field `:113`, construct + record `:272`)
- Test: `packages/client-core/src/presenters/__tests__/ForceBootAnimationPresenter.test.ts`

**Interfaces:**
- Consumes: `PreferencesPort.forceBootAnimation$()` / `setForceBootAnimation` (Task 1).
- Produces: `AppPresenters.forceBootAnimation: ForceBootAnimationPresenter` with `enabled$: Observable<boolean>`, `set(on: boolean): void`, `toggle(current: boolean): void`.

- [ ] **Step 1: Write the failing presenter test** `packages/client-core/src/presenters/__tests__/ForceBootAnimationPresenter.test.ts` (mirror `AnimatedBackgroundPresenter.test.ts`):

```ts
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import { ForceBootAnimationPresenter } from "../ForceBootAnimationPresenter";

describe("ForceBootAnimationPresenter", () => {
  it("exposes the port's replay-current flag (default false)", async () => {
    const prefs = new PreferencesSimulator();
    const presenter = new ForceBootAnimationPresenter(prefs);
    expect(await firstValueFrom(presenter.enabled$)).toBe(false);
  });

  it("set(true) writes through to the port", async () => {
    const prefs = new PreferencesSimulator();
    const presenter = new ForceBootAnimationPresenter(prefs);
    presenter.set(true);
    expect(await firstValueFrom(prefs.forceBootAnimation$())).toBe(true);
  });

  it("toggle(current) flips the stored value", async () => {
    const prefs = new PreferencesSimulator();
    const presenter = new ForceBootAnimationPresenter(prefs);
    presenter.toggle(false);
    expect(await firstValueFrom(prefs.forceBootAnimation$())).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rtc/client-core test -- ForceBootAnimationPresenter`
Expected: FAIL — cannot find module `../ForceBootAnimationPresenter`.

- [ ] **Step 3: Create the presenter** `packages/client-core/src/presenters/ForceBootAnimationPresenter.ts` (clone of `AnimatedBackgroundPresenter.ts`):

```ts
import { type Observable, shareReplay } from "rxjs";

import type { PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the force-boot-animation preference. Exposes the
 * replay-current enabled flag and the write/toggle operations. When on, the
 * boot splash plays even under prefers-reduced-motion.
 */
export class ForceBootAnimationPresenter {
  readonly enabled$: Observable<boolean>;

  constructor(private readonly preferences: PreferencesPort) {
    this.enabled$ = preferences
      .forceBootAnimation$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  set(on: boolean): void {
    this.preferences.setForceBootAnimation(on);
  }

  /** Flip on↔off relative to the supplied current value. */
  toggle(current: boolean): void {
    this.set(!current);
  }
}
```

- [ ] **Step 4: Wire it into `composition.ts`:**
  - Add `ForceBootAnimationPresenter` to the presenter import block (near `AnimatedBackgroundPresenter` at `:20`).
  - Add the field to the `AppPresenters` interface, after `animatedBackground: AnimatedBackgroundPresenter;` (`:113`):

```ts
  forceBootAnimation: ForceBootAnimationPresenter;
```

  - Add it to the returned presenters record, next to `animatedBackground: new AnimatedBackgroundPresenter(ports.preferences),` (`:272`):

```ts
    forceBootAnimation: new ForceBootAnimationPresenter(ports.preferences),
```

- [ ] **Step 5: Run to verify green**

Run: `pnpm --filter @rtc/client-core test -- ForceBootAnimationPresenter && pnpm --filter @rtc/client-core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client-core
git commit -m "feat(client-core): ForceBootAnimationPresenter + composition wiring"
```

---

### Task 3: Bindings (`useForceBootAnimation`) + `@rtc/ui-contract` harness seam

Adds the hook to both bindings AND the ui-contract harness/seams in one task: the moment the `ViewModel` interface gains `useForceBootAnimation`, both `viewModelFromWorld` seams must implement it or the client test typechecks fail.

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts` (result type `:116`, interface member `:214`, wiring `:373`, hook `:693`)
- Modify: `packages/solid-bindings/src/createViewModel.ts` (result type `:142`, interface member `:240`, wiring `:405`, hook `:729`)
- Modify: `packages/ui-contract/src/shared/harness/world.ts` (CommandLog `:197`, World field `:244`, createWorld param `:357` + init `:525` + record `:630` + command init `:615`)
- Modify: `packages/ui-contract/src/shared/mount.ts` (MountOptions `:57`, createWorld arg `:226`)
- Modify: `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts` (`:380`)
- Modify: `packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts` (`:377`)
- Test: `packages/solid-bindings/src/createViewModel.streams.test.tsx` (add a case after `:178`)

**Interfaces:**
- Consumes: `presenters.forceBootAnimation` (Task 2).
- Produces: `ViewModel.useForceBootAnimation(): UseForceBootAnimationResult` where react `{ enabled: boolean; setEnabled: (on: boolean) => void; toggle: () => void }` and solid `{ enabled: Accessor<boolean>; setEnabled; toggle }`. `MountOptions.forceBootAnimation?: boolean`. `World.forceBootAnimation: BehaviorSubject<boolean>`; `CommandLog.forceBootAnimationSets: boolean[]`. `PreferencesModalPage` accessors are added in Task 5.

- [ ] **Step 1: Write the failing Solid streams test** in `packages/solid-bindings/src/createViewModel.streams.test.tsx`, after the `usePowerSaver` case (`:178`), mirroring it:

```ts
  it("useForceBootAnimation defaults off and toggle() flips it", () => {
    const { vm, presenters } = makeVm(); // use the same harness the powerSaver test uses
    const hook = createRoot(() => {
      return vm.useForceBootAnimation();
    });
    expect(hook.enabled()).toBe(false);
    hook.toggle();
    // presenter.set(!false) → port write → stream re-emits true
    expect(hook.enabled()).toBe(true);
  });
```

(Match the exact local helpers — `makeVm`/`createRoot`/assertion style — of the neighbouring `usePowerSaver` test.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rtc/solid-bindings test -- createViewModel.streams`
Expected: FAIL — `vm.useForceBootAnimation is not a function`.

- [ ] **Step 3: Implement in `react-bindings/src/createViewModel.ts`:**
  - Add the result type after `UsePowerSaverResult` (`:126`):

```ts
interface UseForceBootAnimationResult {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
}
```

  - Add the interface member after `usePowerSaver: () => UsePowerSaverResult;` (`:216`):

```ts
  /** Force the boot-splash animation to play under reduced motion — enabled flag plus write/toggle intents. */
  useForceBootAnimation: () => UseForceBootAnimationResult;
```

  - Add the wiring after the `setPowerSaver` block (`:385`):

```ts
  const [useForceBootAnimationValue] = bind(
    presenters.forceBootAnimation.enabled$,
    false,
  );

  function setForceBootAnimation(on: boolean): void {
    presenters.forceBootAnimation.set(on);
  }
```

  - Add the hook impl after the `usePowerSaver` hook (`:712`):

```ts
    useForceBootAnimation: () => {
      const enabled = useForceBootAnimationValue();
      return {
        enabled,
        setEnabled: setForceBootAnimation,
        toggle: () => {
          return presenters.forceBootAnimation.toggle(enabled);
        },
      };
    },
```

- [ ] **Step 4: Implement in `solid-bindings/src/createViewModel.ts`:**
  - Add the result type after `UsePowerSaverResult` (`:153`):

```ts
interface UseForceBootAnimationResult {
  enabled: Accessor<boolean>;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
}
```

  - Add the interface member after `usePowerSaver: () => UsePowerSaverResult;` (`:242`):

```ts
  /** Force the boot-splash animation to play under reduced motion — enabled flag plus write/toggle intents. */
  useForceBootAnimation: () => UseForceBootAnimationResult;
```

  - Add the wiring after the `setPowerSaver` block (`:416`):

```ts
  const forceBootAnimationState = state(
    presenters.forceBootAnimation.enabled$,
    false,
  );

  function setForceBootAnimation(on: boolean): void {
    presenters.forceBootAnimation.set(on);
  }
```

  - Add the hook impl after the `usePowerSaver` hook (`:750`):

```ts
    useForceBootAnimation: () => {
      const enabled = toSignal(forceBootAnimationState);

      return {
        enabled,
        setEnabled: setForceBootAnimation,
        toggle: () => {
          presenters.forceBootAnimation.toggle(enabled());
        },
      };
    },
```

- [ ] **Step 5: Extend the ui-contract `world.ts`:**
  - Add to `CommandLog` after `powerSaverSets: boolean[];` (`:197`):

```ts
  /** Each value written through useForceBootAnimation().setEnabled/toggle, in order. */
  forceBootAnimationSets: boolean[];
```

  - Add to the `World` interface after `readonly powerSaver: BehaviorSubject<boolean>;` (`:244`):

```ts
  /** Reactive force-boot-animation preference backing useForceBootAnimation. */
  readonly forceBootAnimation: BehaviorSubject<boolean>;
```

  - Add the `createWorld` param after `powerSaverSeed?: boolean,` (`:357`): `forceBootAnimationSeed?: boolean,`.
  - Init after the `powerSaver` subject (`:525`): `const forceBootAnimation = new BehaviorSubject<boolean>(forceBootAnimationSeed ?? false);`.
  - Add `forceBootAnimationSets: [],` to the commands init (near `:615`) and `forceBootAnimation,` to the returned record (near `:630`).

- [ ] **Step 6: Extend `mount.ts`:**
  - Add to `MountOptions` after the `powerSaver?` field (`:58`):

```ts
  /** Seed the initial force-boot-animation preference (useForceBootAnimation); defaults to false. */
  forceBootAnimation?: boolean;
```

  - Thread it into the `createWorld(...)` call after `opts.powerSaver,` (`:226`): `opts.forceBootAnimation,`.

- [ ] **Step 7: Implement the seam in both `viewModelFromWorld.ts` files.** React (`packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts`, after the `usePowerSaver` seam `:391`):

```ts
    useForceBootAnimation: () => {
      const enabled = useSubject(world.forceBootAnimation);
      return {
        enabled,
        setEnabled: (on: boolean) => {
          world.commands.forceBootAnimationSets.push(on);
          world.forceBootAnimation.next(on);
        },
        toggle: () => {
          const next = !world.forceBootAnimation.value;
          world.commands.forceBootAnimationSets.push(next);
          world.forceBootAnimation.next(next);
        },
      };
    },
```

  Solid (`packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts`, after the `usePowerSaver` seam `:388`) — identical but `const enabled = wrapSubject(world.forceBootAnimation);` (match the react/solid subject-wrapping helper each file already uses).

- [ ] **Step 8: Run to verify green**

Run: `pnpm --filter @rtc/solid-bindings test -- createViewModel.streams && pnpm --filter @rtc/react-bindings typecheck && pnpm --filter @rtc/solid-bindings typecheck && pnpm --filter @rtc/ui-contract typecheck && pnpm typecheck`
Expected: PASS (repo-wide typecheck green — the `ViewModel` interface is fully implemented in both real bindings and both test seams).

- [ ] **Step 9: Commit**

```bash
git add packages/react-bindings packages/solid-bindings packages/ui-contract packages/client-react/tests packages/client-solid/tests
git commit -m "feat(bindings): useForceBootAnimation hook + ui-contract harness seam"
```

---

### Task 4: Boot override — `BootSequence` + `BootGate` + CSS (both web clients)

Wire the flag into the boot components so the animation runs under reduced motion when forced, and neutralize the reduced-motion CSS. Task 3 already gave the harness seam the hook, so the existing boot contract specs stay green.

**Files:**
- Modify: `packages/client-react/src/ui/shell/boot/BootSequence.tsx`
- Modify: `packages/client-react/src/ui/shell/boot/BootGate.tsx`
- Modify: `packages/client-react/src/ui/shell/boot/BootSequence.module.css`
- Modify: `packages/client-solid/src/ui/shell/boot/BootSequence.tsx`
- Modify: `packages/client-solid/src/ui/shell/boot/BootGate.tsx`
- Modify: `packages/client-solid/src/ui/shell/boot/BootSequence.module.css`
- Test: `packages/client-react/src/ui/shell/boot/BootSequence.test.tsx` (add forced-under-reduced-motion cases)
- Test: `packages/client-solid/src/ui/shell/boot/BootSequence.test.tsx` (add the same)

**Interfaces:**
- Consumes: `useViewModel().useForceBootAnimation()` (Task 3).
- Produces: boot root carries `data-force-anim="true"|"false"`; the JS canvas gate uses effective reduced-motion (`prefersReduced && !forced`).

- [ ] **Step 1: Write the failing react test.** In `packages/client-react/src/ui/shell/boot/BootSequence.test.tsx` (which already mocks `getContext` via `makeCtxStub` and spies `requestAnimationFrame`), add cases that stub `matchMedia` to report reduced-motion and vary the forced flag. The test renders `BootSequence` inside a `ViewModelContext` whose `useForceBootAnimation()` returns the desired flag (extend the file's existing ViewModel stub with a `useForceBootAnimation` returning `{ enabled, setEnabled: vi.fn(), toggle: vi.fn() }`):

```ts
  it("runs the rAF loop under reduced motion when forced", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true, // prefers-reduced-motion: reduce
    } as MediaQueryList);
    renderBootSequence({ forceBootAnimation: true }); // helper wires the VM stub
    expect(rafSpy).toHaveBeenCalled();
  });

  it("does NOT run the rAF loop under reduced motion when not forced", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    renderBootSequence({ forceBootAnimation: false });
    expect(rafSpy).not.toHaveBeenCalled();
  });
```

(Use the file's real spy names — `rafSpy`, `getContextSpy` — and add a small `renderBootSequence({ forceBootAnimation })` helper that builds the VM stub with the flag.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rtc/client-react test -- BootSequence`
Expected: FAIL — the "when forced" case fails because the current code returns before the rAF loop under reduced motion (`rafSpy` not called).

- [ ] **Step 3: Implement the react `BootSequence.tsx` change:**
  - Read the hook at the top, next to `useBootSequence`:

```tsx
  const { useBootSequence, useForceBootAnimation } = useViewModel();
  const { state, skip } = useBootSequence(onDone);
  const forced = useForceBootAnimation().enabled;
```

  - Change the reduced-motion early-return inside the effect (`:34-40`) to use the effective value, and add `forced` to the dependency array:

```tsx
    const prefersReduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (prefersReduced && !forced) {
      return;
    }
```

  ```tsx
  }, [state.variant, forced]);
  ```

  - Add `data-force-anim` to the root div (`:95-99`):

```tsx
    <div
      data-testid="boot-sequence"
      data-done={state.done ? "true" : "false"}
      data-variant={state.variant}
      data-force-anim={forced ? "true" : "false"}
      className={styles.boot}
    >
```

- [ ] **Step 4: Implement the react `BootGate.tsx` change** — read the hook and gate the reduced-motion dismissal on it:

```tsx
  const { useBootGate, useForceBootAnimation } = useViewModel();
  const { visible, dismiss } = useBootGate();
  const forced = useForceBootAnimation().enabled;

  function handleDone(): void {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Reduced motion (and NOT forced): the splash jump-cuts to opacity 0 with
    // no transition, so no transitionend arrives — dismiss it directly. When
    // forced, the transition is restored (see BootSequence.module.css) and
    // handleTransitionEnd dismisses instead.
    if (reduce && !forced) {
      dismiss();
    }
  }
```

- [ ] **Step 5: Neutralize the reduced-motion CSS when forced** in `packages/client-react/src/ui/shell/boot/BootSequence.module.css`. Replace the `@media (prefers-reduced-motion: reduce)` block (`:116-128`) so each rule excludes the forced root:

```css
@media (prefers-reduced-motion: reduce) {
  .boot:not([data-force-anim="true"]) {
    transition: none;
  }

  .boot:not([data-force-anim="true"]) .canvas {
    display: none;
  }

  .boot:not([data-force-anim="true"]) .fill {
    transition: none;
  }
}
```

- [ ] **Step 6: Apply the Solid twins** — the same three edits to `packages/client-solid/src/ui/shell/boot/BootSequence.tsx` (hook read; effective-reduce inside `createEffect`; `data-force-anim` on the root div `:106-111`), `packages/client-solid/src/ui/shell/boot/BootGate.tsx` (hook read + `reduce && !forced`), and `packages/client-solid/src/ui/shell/boot/BootSequence.module.css` (identical CSS scoping). Solid note: read `const forced = useForceBootAnimation().enabled;` — in Solid `enabled` is an `Accessor<boolean>`, so use `forced()` at the read sites (`!forced()` in the effect, `forced() ? "true" : "false"` on the attribute, `reduce && !forced()` in BootGate). The `createEffect` will re-run when `forced()` changes because it reads the signal.

- [ ] **Step 7: Add the Solid test** — mirror Step 1's two cases in `packages/client-solid/src/ui/shell/boot/BootSequence.test.tsx` (it already has the `makeCtxStub` + rAF-spy harness and a `ViewModelContext` stub; extend the stub with `useForceBootAnimation` returning `{ enabled: () => flag, setEnabled, toggle }`).

- [ ] **Step 8: Run both clients' boot tests to green**

Run: `pnpm --filter @rtc/client-react test -- BootSequence && pnpm --filter @rtc/client-solid test -- BootSequence && pnpm --filter @rtc/ui-contract test -- boot`
Expected: PASS (new forced cases green; existing boot contract specs still green via the Task-3 seam).

- [ ] **Step 9: Commit**

```bash
git add packages/client-react/src/ui/shell/boot packages/client-solid/src/ui/shell/boot
git commit -m "feat(boot): force boot animation under reduced motion when forceBootAnimation is on"
```

---

### Task 5: Preferences dialog toggle + ui-contract spec (both web clients)

**Files:**
- Modify: `packages/client-react/src/ui/shell/prefs/PreferencesModal.tsx` (`:23`, `:73-80`)
- Modify: `packages/client-solid/src/ui/shell/prefs/PreferencesModal.tsx` (twin)
- Modify: `packages/ui-contract/src/shared/pages/shell/prefs/PreferencesModalPage.ts` (accessors)
- Modify: `packages/ui-contract/src/specs/shell/prefs/PreferencesModal.contract.spec.ts` (new case)

**Interfaces:**
- Consumes: `useForceBootAnimation` (Task 3); `MountOptions.forceBootAnimation` + `world.commands.forceBootAnimationSets` (Task 3).
- Produces: `PreferencesModalPage.forceBootAnimationOn()`, `.toggleForceBootAnimation()`, `.forceBootAnimationSets()`.

- [ ] **Step 1: Write the failing ui-contract spec case** in `packages/ui-contract/src/specs/shell/prefs/PreferencesModal.contract.spec.ts`, mirroring the animated-background case:

```ts
  it("force-boot-animation toggle reflects the preference and writes it on toggle", async () => {
    const page = mount(PreferencesModal, { forceBootAnimation: true });
    expect(page.forceBootAnimationOn()).toBe(true);
    await page.toggleForceBootAnimation();
    expect(page.forceBootAnimationSets()).toEqual([false]);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rtc/ui-contract test -- PreferencesModal`
Expected: FAIL — `page.forceBootAnimationOn is not a function`.

- [ ] **Step 3: Add the page-object accessors** in `PreferencesModalPage.ts` (mirror `powerSaverOn`/`togglePowerSaver`/`powerSaverSets` at `:47-65`):

```ts
  forceBootAnimationOn(): boolean {
    return (
      within(this.root)
        .getByTestId("pref-toggle-forceBootAnimation")
        .getAttribute("data-on") === "true"
    );
  }

  async toggleForceBootAnimation(): Promise<void> {
    await userEvent.click(
      within(this.root).getByTestId("pref-toggle-forceBootAnimation"),
    );
  }

  forceBootAnimationSets(): boolean[] {
    return this.commandLog().forceBootAnimationSets;
  }
```

(Match the file's exact `within`/`userEvent`/`this.root`/`this.commandLog()` idioms.)

- [ ] **Step 4: Add the wired toggle to the react `PreferencesModal.tsx`:**
  - Destructure the hook (`:23`): `const { useAnimatedBackground, usePowerSaver, useForceBootAnimation } = useViewModel();`
  - Read it next to the others (`:26`): `const { enabled: forceBootAnimation, toggle: toggleForceBootAnimation } = useForceBootAnimation();`
  - Add the `<PrefToggle>` in the DISPLAY column, after the Animated-background toggle (`:88`):

```tsx
              <PrefToggle
                label="Always play boot animation"
                description="Plays the startup animation even when your system asks for reduced motion (e.g. remote desktops / VDI)."
                on={forceBootAnimation}
                onToggle={toggleForceBootAnimation}
                testid="pref-toggle-forceBootAnimation"
              />
```

- [ ] **Step 5: Apply the Solid twin** in `packages/client-solid/src/ui/shell/prefs/PreferencesModal.tsx` — same three edits (destructure `useForceBootAnimation`, read `enabled`/`toggle`, add the `<PrefToggle>` row with identical label/description/testid). Solid `enabled` is an accessor, so pass `on={forceBootAnimation()}` matching how the sibling `powerSaver` row is passed in the Solid file.

- [ ] **Step 6: Run the spec against both frameworks to green**

Run: `pnpm --filter @rtc/ui-contract test -- PreferencesModal`
Expected: PASS (the spec runs against both the react and solid swap via the trio).

- [ ] **Step 7: Commit**

```bash
git add packages/client-react/src/ui/shell/prefs packages/client-solid/src/ui/shell/prefs packages/ui-contract/src/shared/pages packages/ui-contract/src/specs/shell/prefs
git commit -m "feat(prefs): wired 'Always play boot animation' toggle (react + solid) + contract spec"
```

---

### Task 6: Playwright e2e — reduced-motion proof (both web clients)

The real end-to-end witness: with `prefers-reduced-motion: reduce` emulated, the pref forces the boot canvas to render. This is exactly the tier that caught PR #241's Solid boot/auth regression, so it is treated as first-class.

**Files:**
- Create: `tests/browser/playwright/specs/force-boot-animation.spec.ts` (match the repo's actual spec dir/layout — confirm against a sibling boot/prefs spec before writing)
- Possibly modify: `tests/browser/playwright/playwright.config.ts` (only if the new spec must be listed; Solid runs must NOT be excluded — this spec must pass on both)

**Interfaces:**
- Consumes: the running client with `forceBootAnimation` persisted in localStorage under `rtc-force-boot-animation`, and the `data-force-anim` / `[data-testid="boot-sequence"] canvas` DOM produced by Task 4.

- [ ] **Step 1: Write the e2e spec.** Emulate reduced motion, seed the preference in localStorage before load, reload, and assert the boot canvas is visible; then assert the inverse (pref off → canvas hidden). Use the repo's existing boot-spec helpers (how it waits for `[data-testid="boot-sequence"]`, how it seeds localStorage — mirror a sibling spec):

```ts
import { expect, test } from "@playwright/test";

test.describe("force boot animation", () => {
  test.use({ reducedMotion: "reduce" });

  test("pref OFF under reduced motion: canvas is hidden", async ({ page }) => {
    await page.goto("/"); // splash plays
    const canvas = page.locator('[data-testid="boot-sequence"] canvas');
    // Under reduced motion + not forced, the canvas is display:none.
    await expect(canvas).toBeHidden();
  });

  test("pref ON under reduced motion: canvas renders", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("rtc-force-boot-animation", "true");
    });
    await page.goto("/");
    const boot = page.locator('[data-testid="boot-sequence"]');
    await expect(boot).toHaveAttribute("data-force-anim", "true");
    await expect(
      page.locator('[data-testid="boot-sequence"] canvas'),
    ).toBeVisible();
  });
});
```

(Confirm the base URL / boot-visibility waiting idioms against an existing spec — e.g. how `?nosplash` or a boot spec drives the splash — and adjust selectors accordingly.)

- [ ] **Step 2: Run the e2e for both clients**

Run: `pnpm test:e2e` (or the repo's react+solid e2e entry — confirm how a single new spec is run against both client targets; the orchestrator lives in `tests/`).
Expected: PASS on both react and solid targets.

- [ ] **Step 3: Commit**

```bash
git add tests/browser/playwright
git commit -m "test(e2e): forceBootAnimation renders the splash canvas under reduced motion (react + solid)"
```

---

### Task 7: Boot README docs + full gauntlet

**Files:**
- Modify: `packages/client-react/src/ui/shell/boot/README.md` (and the Solid boot README if one exists)

- [ ] **Step 1: Document the override** in the boot README: the two suppression gates (`prefers-reduced-motion` and the `!ctx` no-2D-context floor), the `forceBootAnimation` preference and its `data-force-anim` mechanism, that it takes effect on the next boot / via the account-menu ⟳ Reboot HUD row, and that the `!ctx` floor cannot be forced (no 2D surface to draw on).

- [ ] **Step 2: Run the full gauntlet.** Everything must be green before the PR (the memory note: boot/auth changes can pass contract yet break e2e — run e2e for BOTH clients):

Run (from repo root):
```bash
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm lint          # biome + eslint (both configs) + stylelint
pnpm check:doc-links
pnpm knip
```
Also run the CI-only UI-contract coverage gate (≥95%) for BOTH react and solid, per the repo's coverage script, since this touched UI.

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add packages/client-react/src/ui/shell/boot/README.md
git commit -m "docs(boot): document the forceBootAnimation override + reduced-motion gates"
```

- [ ] **Step 4: Ship** — follow the `shipping-repo-changes` skill: push the branch, open the PR, poll `gh run list --workflow CI` until the run for HEAD is `completed`+`success`. **Rule 3 note:** PR #245 (power-saver freeze tier) overlaps this change's files (`preferencesPort.ts`, `PreferencesSimulator.ts`, both LocalStorage adapters, `PreferencesModal.tsx`, both `createViewModel.ts`, the ui-contract harness). If it has merged to `origin/main` by the time this branch is green, catch up (`git merge origin/main`, resolve the additive conflicts, re-run the CI loop) before merging. Merge with `--merge`; then move this item from STATUS's "🔴 Designed, not built" to done (remove it) and clean up the worktree.

## Self-Review

**Spec coverage:**
- Preference `forceBootAnimation` default false — Task 1 (domain const + port + simulator). ✓
- Override mechanism across the three consumers (JS gate, dismissal path, CSS) — Task 4. ✓
- No-flash synchronous seed — inherited from the LocalStorage adapter's `readBool` seed (Task 1 Step 6); no extra work. ✓
- `!ctx` hard floor left intact — Task 4 changes only the reduced-motion return, not the `!ctx` guard; documented in Task 7. ✓
- Full plumbing (4 adapters, presenter, both bindings, both dialogs, ui-contract harness) — Tasks 1–3, 5. ✓
- RN implements port, no RN UI — Task 1 Step 8/10; no RN boot/dialog task exists. ✓
- UI toggle label/description/testid — Task 5, verbatim from Global Constraints. ✓
- Testing: domain unit + contract (T1), presenter unit (T2), solid streams (T3), boot rAF-gate tests (T4), ui-contract spec (T5), Playwright reduced-motion proof (T6). ✓
- No golden regeneration — stated in Global Constraints; no golden task. ✓

**Placeholder scan:** e2e selectors and the RN/streams test helper names are marked "confirm against sibling" rather than invented — these are deliberate "match the existing idiom" instructions, not TODOs, because the exact local helper names must be read at implementation time. All code steps show concrete code.

**Type consistency:** `forceBootAnimation$` / `setForceBootAnimation` / `ForceBootAnimationPresenter` / `useForceBootAnimation` / `UseForceBootAnimationResult` / `forceBootAnimationSets` / `forceBootAnimation` (World field + mount option) / `data-force-anim` / `pref-toggle-forceBootAnimation` used consistently across all tasks. Solid `enabled` is an `Accessor<boolean>` (called as `forced()` / `forceBootAnimation()`); react `enabled` is a plain `boolean`. ✓
