# Login / Unlock Waiting-State Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give sign-in and session-unlock a captivating "waiting for the server" treatment that alternates between two visual variants, and fix the lock screen's missing in-flight state.

**Architecture:** A `LoginWaitVariant` preference in `@rtc/domain` cycles round-robin through two variants, persisted via `PreferencesPort` and advanced on attempt start — mirroring the boot-splash variant cycle exactly. `AuthPresenter` gains an `unlocking` flag (distinct from `status`, for reasons in Task 4) and a `waitVariant` field. Each web client renders two dumb presentational components driven purely by CSS keyframes; there is no motion math and therefore no `@rtc/motion-core` work.

**Tech Stack:** TypeScript, RxJS, React 19, SolidJS, CSS Modules, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-25-login-wait-feedback-design.md`

## Global Constraints

- **Animate only `transform` and `opacity`.** Read `docs/performance.md` before writing any keyframe. No `width`/`left` animation, no animated `filter`, no `var()` inside an animated transform.
- **SVG-child transforms never composite.** Spin the wrapping `<div>`, never the `<circle>`.
- **Base CSS must be the informative state.** Animation may only add emphasis. Power-saver freeze (`index.css:47-58`) runs one 0.01ms iteration and falls back to base CSS.
- **Every new stylesheet needs its own `@media (prefers-reduced-motion: reduce)` block.** There is **no** global reduced-motion rule in this repo — unlike the `data-power-saver="freeze"` catch-all, reduced motion is handled per-component (see `Tile.module.css`, `RfqCard.module.css`, `AmbientBackground.module.css`). Omitting the block means the animation keeps running for users who asked the OS to stop it.
- **Parity is a hard gate.** Anything added to `client-react` lands in `client-solid` in the same PR, or the shared `@rtc/ui-contract` specs fail.
- **No inline styles.** `style={{…}}` is banned by a custom ESLint AST rule. Use CSS Modules.
- **Braces on all control statements** (`useBlockStatements`) — brace-less `if` fails CI.
- **Imports use the `#/` subpath alias**, not `@/`, and never `../../`-or-deeper relative paths.
- **Run `biome ci .` before pushing** — CI checks formatting and import sort, which local `pnpm lint` does not.
- Variant string values are exactly `"handshake"` and `"reactor"`.
- Storage key is exactly `rt-login-wait-variant`.

---

### Task 1: The `LoginWaitVariant` preference, end to end

The port contract runs against every adapter, so the type, port, contract, simulator and all three adapters must land together — adding the contract test alone would red three packages.

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/ports/preferencesPort.ts`
- Modify: `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts`
- Modify: `packages/domain/src/simulators/PreferencesSimulator.ts`
- Modify: `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts`
- Modify: `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts`
- Modify: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `type LoginWaitVariant = "handshake" | "reactor"` from `@rtc/domain`
  - `const LOGIN_WAIT_VARIANTS: readonly LoginWaitVariant[]`
  - `const DEFAULT_LOGIN_WAIT_VARIANT: LoginWaitVariant` (`"handshake"`)
  - `PreferencesPort.loginWaitVariant$(): Observable<LoginWaitVariant>`
  - `PreferencesPort.setLoginWaitVariant(variant: LoginWaitVariant): void`
  - `const LOGIN_WAIT_VARIANT_STORAGE_KEY = "rt-login-wait-variant"` (exported from each adapter module)

- [ ] **Step 1: Write the failing contract tests**

In `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts`, add `loginWaitVariant` to the seed type (near the existing `bootVariant?: BootVariant;` at line 34):

```ts
  loginWaitVariant?: LoginWaitVariant;
```

Add to the imports from `../../preferences/preferences.js`:

```ts
  DEFAULT_LOGIN_WAIT_VARIANT,
  type LoginWaitVariant,
```

Then add this block immediately after the existing `bootVariant` describe block (which ends around line 235):

```ts
  describe("loginWaitVariant", () => {
    it("empty store emits the default loginWaitVariant", async () => {
      const port = makeSeeded({});
      expect(await firstValueFrom(port.loginWaitVariant$())).toBe(
        DEFAULT_LOGIN_WAIT_VARIANT,
      );
    });

    it("setLoginWaitVariant pushes the new value to subscribers", async () => {
      const port = makeSeeded({});
      const seen: LoginWaitVariant[] = [];
      const sub = port.loginWaitVariant$().subscribe((v) => {
        seen.push(v);
      });
      port.setLoginWaitVariant("reactor");
      sub.unsubscribe();
      expect(seen).toEqual(["handshake", "reactor"]);
    });

    it("reads back a seeded loginWaitVariant", async () => {
      const port = makeSeeded({ loginWaitVariant: "reactor" });
      expect(await firstValueFrom(port.loginWaitVariant$())).toBe("reactor");
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @rtc/domain test`
Expected: FAIL — `Property 'loginWaitVariant$' does not exist on type 'PreferencesPort'`.

- [ ] **Step 3: Add the domain type, cycle list and default**

In `packages/domain/src/preferences/preferences.ts`, add after the `BootVariant` type declaration:

```ts
/** The login/unlock waiting-state visual variant. Cycles across attempts —
 * each attempt advances to the next entry (handshake → reactor → handshake …).
 * Persisted under the `rt-login-wait-variant` key (web `localStorage`, RN
 * AsyncStorage — the same constant on both). */
export type LoginWaitVariant = "handshake" | "reactor";
```

Add after the `BOOT_VARIANTS` array:

```ts
/** Login-wait variant cycle order. Advanced on attempt start by AuthPresenter. */
export const LOGIN_WAIT_VARIANTS: readonly LoginWaitVariant[] = [
  "handshake",
  "reactor",
];
```

Add next to `DEFAULT_BOOT_VARIANT`:

```ts
export const DEFAULT_LOGIN_WAIT_VARIANT: LoginWaitVariant = "handshake";
```

- [ ] **Step 4: Export from the domain barrel**

In `packages/domain/src/index.ts`, add `LoginWaitVariant` to the type export list (alongside `BootVariant`, near line 139) and `LOGIN_WAIT_VARIANTS`, `DEFAULT_LOGIN_WAIT_VARIANT` to the value export list (alongside `BOOT_VARIANTS`, near line 151).

- [ ] **Step 5: Add the port methods**

In `packages/domain/src/ports/preferencesPort.ts`, add `LoginWaitVariant` to the type imports, then add immediately after `setBootVariant`:

```ts
  /** Replay-current login-wait variant stream; emits synchronously on subscribe.
   * The cycle pointer (handshake → reactor → handshake …) is advanced by
   * AuthPresenter at each login/unlock attempt start via setLoginWaitVariant. */
  loginWaitVariant$(): Observable<LoginWaitVariant>;
  setLoginWaitVariant(variant: LoginWaitVariant): void;
```

- [ ] **Step 6: Implement in the simulator**

In `packages/domain/src/simulators/PreferencesSimulator.ts`:

Add to the seed interface (near line 35):

```ts
  loginWaitVariant?: LoginWaitVariant;
```

Add the field declaration (near line 61):

```ts
  private readonly loginWaitVariantSubject: BehaviorSubject<LoginWaitVariant>;
```

Add to the constructor (near line 91):

```ts
    this.loginWaitVariantSubject = new BehaviorSubject<LoginWaitVariant>(
      seed.loginWaitVariant ?? DEFAULT_LOGIN_WAIT_VARIANT,
    );
```

Add the methods after `setBootVariant`:

```ts
  loginWaitVariant$(): Observable<LoginWaitVariant> {
    return this.loginWaitVariantSubject.pipe(distinctUntilChanged());
  }

  setLoginWaitVariant(variant: LoginWaitVariant): void {
    this.loginWaitVariantSubject.next(variant);
  }
```

Import `DEFAULT_LOGIN_WAIT_VARIANT` and `type LoginWaitVariant` alongside the existing `DEFAULT_BOOT_VARIANT` / `BootVariant` imports.

- [ ] **Step 7: Run the domain tests**

Run: `pnpm --filter @rtc/domain test`
Expected: PASS.

- [ ] **Step 8: Implement in the React web adapter**

In `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts`:

Add the storage key next to `BOOT_VARIANT_STORAGE_KEY` (line 38):

```ts
export const LOGIN_WAIT_VARIANT_STORAGE_KEY = "rt-login-wait-variant";
```

Add the local guard next to `isBootVariant` (line 64):

```ts
function isLoginWaitVariant(value: string | null): value is LoginWaitVariant {
  return (
    value !== null && (LOGIN_WAIT_VARIANTS as readonly string[]).includes(value)
  );
}
```

Add the field next to `bootVariantSubject` (line 167):

```ts
  private readonly loginWaitVariantSubject: BehaviorSubject<LoginWaitVariant>;
```

Add to the constructor next to the `bootVariantSubject` initialiser (line 200):

```ts
    this.loginWaitVariantSubject = new BehaviorSubject<LoginWaitVariant>(
      readStored(
        LOGIN_WAIT_VARIANT_STORAGE_KEY,
        isLoginWaitVariant,
        DEFAULT_LOGIN_WAIT_VARIANT,
      ),
    );
```

Add the methods after `setBootVariant` (line 291):

```ts
  loginWaitVariant$(): Observable<LoginWaitVariant> {
    return this.loginWaitVariantSubject.pipe(distinctUntilChanged());
  }

  setLoginWaitVariant(variant: LoginWaitVariant): void {
    writeStored(LOGIN_WAIT_VARIANT_STORAGE_KEY, variant);
    this.loginWaitVariantSubject.next(variant);
  }
```

Import `LOGIN_WAIT_VARIANTS`, `DEFAULT_LOGIN_WAIT_VARIANT` and `type LoginWaitVariant` from `@rtc/domain`.

- [ ] **Step 9: Implement in the Solid web adapter**

`packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts` is structurally identical to the React one (same line numbers for `isBootVariant` at 64 and the constructor initialiser at 201). Apply the **exact same five edits** from Step 8 to it.

- [ ] **Step 10: Implement in the React Native adapter**

`packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts` hydrates asynchronously — it seeds subjects with defaults, then reads the store in `hydrate()`.

Add the storage key next to line 38:

```ts
export const LOGIN_WAIT_VARIANT_STORAGE_KEY = "rt-login-wait-variant";
```

Add the local guard next to `isBootVariant` (line 65):

```ts
function isLoginWaitVariant(value: string | null): value is LoginWaitVariant {
  return (
    value !== null && (LOGIN_WAIT_VARIANTS as readonly string[]).includes(value)
  );
}
```

Add the field next to `bootVariantSubject` (line 117):

```ts
  private readonly loginWaitVariantSubject =
    new BehaviorSubject<LoginWaitVariant>(DEFAULT_LOGIN_WAIT_VARIANT);
```

In `hydrate()`: add `loginWaitVariant` to the destructured array (next to `bootVariant`, line 148), add `AsyncStorage.getItem(LOGIN_WAIT_VARIANT_STORAGE_KEY)` to the `Promise.all` array **in the same position** (next to line 160), and add the narrowing next to line 197:

```ts
      if (isLoginWaitVariant(loginWaitVariant)) {
        this.loginWaitVariantSubject.next(loginWaitVariant);
      }
```

Add the methods after `setBootVariant` (line 289):

```ts
  loginWaitVariant$(): Observable<LoginWaitVariant> {
    return this.loginWaitVariantSubject.pipe(distinctUntilChanged());
  }

  setLoginWaitVariant(variant: LoginWaitVariant): void {
    void AsyncStorage.setItem(LOGIN_WAIT_VARIANT_STORAGE_KEY, variant).catch(
      () => {
        // Storage failures are non-fatal — the in-memory subject stays correct.
      },
    );
    this.loginWaitVariantSubject.next(variant);
  }
```

> The destructured name and the `Promise.all` entry are **positional** — a mismatch silently assigns the wrong stored value to the wrong preference. Verify the index of your new entry matches in both places.

- [ ] **Step 11: Run every affected package's tests**

Run: `pnpm --filter @rtc/domain --filter @rtc/client-react --filter @rtc/client-solid --filter @rtc/client-react-native test`
Expected: PASS in all four.

- [ ] **Step 12: Typecheck and commit**

```bash
pnpm typecheck
npx biome ci .
git add packages/domain packages/client-react packages/client-solid packages/client-react-native
git commit -m "feat(domain): add LoginWaitVariant preference with round-robin cycle"
```

---

### Task 2: `AuthPresenter` — the `unlocking` flag

The bug fix, standalone. The lock screen currently has no in-flight state at all.

**Files:**
- Modify: `packages/client-core/src/presenters/AuthPresenter.ts`
- Test: `packages/client-core/src/presenters/__tests__/AuthPresenter.test.ts`
- Modify: `packages/ui-contract/src/shared/harness/world.ts`
- Modify: `packages/ui-contract/src/visual/appData.ts`
- Modify: `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts`
- Modify: `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`
- Modify: `packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts`
- Modify: `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `AuthViewState.unlocking: boolean`.

- [ ] **Step 1: Add a deferred `AuthPort` stub**

The file's existing `fakeAuthPort(outcome)` (line 328) returns `of(outcome)`, which emits **synchronously** — `login()` would run straight through the in-flight state to the outcome, so there would be nothing to assert. These tests need a port whose resolution the test controls.

Add alongside `fakeAuthPort` in `packages/client-core/src/presenters/__tests__/AuthPresenter.test.ts`:

```ts
/** An `AuthPort` stub whose outcome the test resolves explicitly, so the
 * in-flight state is observable. `fakeAuthPort` uses `of(outcome)`, which
 * emits synchronously and skips straight past the wait state. */
function deferredAuthPort(): {
  readonly port: AuthPort;
  readonly resolve: (outcome: AuthOutcome) => void;
} {
  const subject = new Subject<AuthOutcome>();

  return {
    port: {
      login(): Observable<AuthOutcome> {
        return subject.asObservable();
      },
    },
    resolve: (outcome: AuthOutcome): void => {
      subject.next(outcome);
    },
  };
}

/** A presenter already logged in as USER and then locked — the LockScreen state. */
function lockedPresenter(): {
  readonly presenter: AuthPresenter;
  readonly resolve: (outcome: AuthOutcome) => void;
} {
  const { port, resolve } = deferredAuthPort();
  const presenter = new AuthPresenter(port, memorySessionStore());

  presenter.login("astark", "mcdc2026");
  resolve({ ok: true, token: "t", user: USER, exp: 9e12 });
  presenter.lock();

  return { presenter, resolve };
}
```

Import `Subject` and `type Observable` from `rxjs`. Use whatever in-memory `SessionStore` helper the file already defines in place of `memorySessionStore()`.

- [ ] **Step 2: Write the failing tests**

```ts
  it("unlock sets unlocking while in flight and leaves status authenticated", () => {
    const { presenter, resolve } = lockedPresenter();

    presenter.unlock("mcdc2026");

    const inFlight = latest(presenter);
    expect(inFlight.unlocking).toBe(true);
    // The whole app unmounts if status leaves "authenticated" — AuthGate
    // renders LoginScreen for any non-authenticated status.
    expect(inFlight.status).toBe("authenticated");
    expect(inFlight.locked).toBe(true);

    resolve({ ok: true, token: "t2", user: USER, exp: 9e12 });
    expect(latest(presenter).unlocking).toBe(false);
  });

  it("unlock clears unlocking on failure and stays locked", () => {
    const { presenter, resolve } = lockedPresenter();

    presenter.unlock("wrong");
    resolve({ ok: false, reason: "invalid" });

    const after = latest(presenter);
    expect(after.unlocking).toBe(false);
    expect(after.locked).toBe(true);
    expect(after.error).toBe("Invalid credentials");
  });
```

`latest(presenter)` is the file's existing synchronous state reader (line 340). Note the second `resolve` call in the first test reuses the same subject — `lockedPresenter` already consumed one emission during setup, but the subject is long-lived, so the unlock subscription receives it.

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @rtc/client-core test AuthPresenter`
Expected: FAIL — `unlocking` is `undefined`, not `true`.

- [ ] **Step 4: Add the field to the state type**

In `packages/client-core/src/presenters/AuthPresenter.ts`, add to `AuthViewState`:

```ts
  /** True while an unlock (re-authenticate) request is in flight.
   *
   * Deliberately NOT modelled as `status: "authenticating"`. AuthGate renders
   * LoginScreen whenever `status !== "authenticated"`, so reusing the status
   * would unmount the entire app mid-unlock and flash the sign-in form —
   * taking the lock overlay down with it, since LockScreen lives inside App
   * rather than in the gate. */
  readonly unlocking: boolean;
```

Add `unlocking: false` to `UNAUTHENTICATED_STATE`.

- [ ] **Step 5: Set and clear the flag**

In `login()`, add `unlocking: false` to the emitted `authenticating` state. In `handleLoginOutcome`, add `unlocking: false` to both emitted states. In `lock()`, the spread carries it through unchanged.

Replace `unlock()`'s body so it emits the in-flight state before subscribing:

```ts
  unlock(password: string): void {
    const username = this.currentUsername;

    if (username === null) {
      return;
    }

    this.subject.next({ ...this.subject.value, unlocking: true, error: null });

    this.auth.login(username, password).subscribe((outcome) => {
      this.handleUnlockOutcome(username, outcome);
    });
  }
```

In `handleUnlockOutcome`, add `unlocking: false` to **both** emitted states (success and failure).

> `handleUnlockOutcome` reads `this.subject.value` into `current` at its top. That read now happens *after* `unlock()` has already emitted `unlocking: true`, so `current.unlocking` is `true` — the explicit `unlocking: false` in each branch is what clears it. Omitting it leaves the lock screen spinning forever after a wrong password.

- [ ] **Step 6: Run the presenter tests**

Run: `pnpm --filter @rtc/client-core test AuthPresenter`
Expected: PASS.

- [ ] **Step 7: Update the six fixtures**

`AuthViewState` is constructed in six test fixtures. Add `unlocking: false` to the default auth state in each:

- `packages/ui-contract/src/shared/harness/world.ts` — the `DEFAULT_AUTH_STATE` object near line 225
- `packages/ui-contract/src/visual/appData.ts`
- `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts`
- `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`
- `packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts`
- `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts`

`world.ts`'s `authSeed: Partial<AuthViewState>` already accepts overrides, so contract specs can pass `{ unlocking: true }` without further change.

- [ ] **Step 8: Run the full test suite and commit**

```bash
pnpm test
pnpm typecheck
npx biome ci .
git add packages/client-core packages/ui-contract packages/client-react packages/client-solid
git commit -m "fix(auth): add unlocking flag so lock-screen re-auth has an in-flight state"
```

---

### Task 3: `AuthPresenter` — the variant cycle

**Files:**
- Modify: `packages/client-core/src/presenters/AuthPresenter.ts`
- Modify: `packages/client-core/src/composition.ts`
- Test: `packages/client-core/src/presenters/__tests__/AuthPresenter.test.ts`
- Modify: the same six fixtures as Task 2

**Interfaces:**
- Consumes: `LoginWaitVariant`, `LOGIN_WAIT_VARIANTS`, `DEFAULT_LOGIN_WAIT_VARIANT` (Task 1); `AuthViewState.unlocking` (Task 2).
- Produces:
  - `interface LoginWaitCycle { current: () => LoginWaitVariant; advance: (next: LoginWaitVariant) => void }`
  - `AuthViewState.waitVariant: LoginWaitVariant`
  - `AuthPresenter` constructor's 4th parameter: `cycle: LoginWaitCycle`

- [ ] **Step 1: Add a recording cycle stub**

```ts
/** A `LoginWaitCycle` pinned to `start`, recording every advance. */
function recordingCycle(start: LoginWaitVariant): {
  readonly cycle: LoginWaitCycle;
  readonly advanced: LoginWaitVariant[];
} {
  const advanced: LoginWaitVariant[] = [];

  return {
    advanced,
    cycle: {
      current: (): LoginWaitVariant => {
        return start;
      },
      advance: (next: LoginWaitVariant): void => {
        advanced.push(next);
      },
    },
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
  it("login stamps the current variant and advances the pointer on start", () => {
    const { cycle, advanced } = recordingCycle("handshake");
    const { port } = deferredAuthPort();
    const presenter = new AuthPresenter(
      port,
      memorySessionStore(),
      undefined,
      cycle,
    );

    presenter.login("astark", "mcdc2026");

    expect(latest(presenter).waitVariant).toBe("handshake");
    // Advance-on-START, not on completion: a user who reloads mid-attempt
    // must still get a different variant next time.
    expect(advanced).toEqual(["reactor"]);
  });

  it("the cycle pointer wraps reactor -> handshake", () => {
    const { cycle, advanced } = recordingCycle("reactor");
    const { port } = deferredAuthPort();
    const presenter = new AuthPresenter(
      port,
      memorySessionStore(),
      undefined,
      cycle,
    );

    presenter.login("astark", "mcdc2026");

    expect(latest(presenter).waitVariant).toBe("reactor");
    expect(advanced).toEqual(["handshake"]);
  });

  it("unlock also stamps and advances the variant", () => {
    const { cycle, advanced } = recordingCycle("reactor");
    const { port, resolve } = deferredAuthPort();
    const presenter = new AuthPresenter(
      port,
      memorySessionStore(),
      undefined,
      cycle,
    );

    presenter.login("astark", "mcdc2026");
    resolve({ ok: true, token: "t", user: USER, exp: 9e12 });
    presenter.lock();
    advanced.length = 0; // discard the login's advance; assert only the unlock's

    presenter.unlock("mcdc2026");

    expect(latest(presenter).waitVariant).toBe("reactor");
    expect(advanced).toEqual(["handshake"]);
  });
```

`deferredAuthPort`, `lockedPresenter`, `latest` and `memorySessionStore` come from Task 2. The third test rebuilds the locked state inline rather than calling `lockedPresenter()`, because it needs to inject its own cycle.

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @rtc/client-core test AuthPresenter`
Expected: FAIL — `waitVariant` is `undefined`.

- [ ] **Step 4: Add the dependency interface and state field**

In `packages/client-core/src/presenters/AuthPresenter.ts`:

```ts
import {
  type AuthOutcome,
  type AuthPort,
  LOGIN_WAIT_VARIANTS,
  type LoginWaitVariant,
  type SessionUser,
} from "@rtc/domain";

/** The persisted login-wait variant cycle. Shaped like `BootSequenceDeps` —
 * the presenter reads and advances, but never touches localStorage itself. */
export interface LoginWaitCycle {
  /** Current persisted cycle position → the variant for this attempt. */
  readonly current: () => LoginWaitVariant;
  /** Advance the persisted pointer (preferences seam; NO localStorage here). */
  readonly advance: (next: LoginWaitVariant) => void;
}
```

Add to `AuthViewState`:

```ts
  /** The wait treatment to render for the current attempt. */
  readonly waitVariant: LoginWaitVariant;
```

Add `waitVariant: DEFAULT_LOGIN_WAIT_VARIANT` to `UNAUTHENTICATED_STATE` (import `DEFAULT_LOGIN_WAIT_VARIANT` too).

- [ ] **Step 5: Add the constructor parameter and the pick helper**

Add a 4th constructor parameter, defaulted so existing call sites keep compiling until Step 6 rewires them:

```ts
    private readonly cycle: LoginWaitCycle = {
      current: () => {
        return DEFAULT_LOGIN_WAIT_VARIANT;
      },
      advance: () => {
        // no-op default: composition injects the real preferences-backed cycle
      },
    },
```

> The `now` parameter is currently 3rd with a default. Add `cycle` **after** it so the positional order stays `(auth, store, now, cycle)`.

Add the private helper:

```ts
  /** Reads the current variant and advances the persisted pointer immediately.
   * Advance-on-start mirrors createBootSequenceMachine (BootSequenceMachine.ts:44-45):
   * an attempt abandoned by a reload still flips the variant for next time. */
  private pickWaitVariant(): LoginWaitVariant {
    const variant = this.cycle.current();
    const nextIdx =
      (LOGIN_WAIT_VARIANTS.indexOf(variant) + 1) % LOGIN_WAIT_VARIANTS.length;
    this.cycle.advance(LOGIN_WAIT_VARIANTS[nextIdx]);
    return variant;
  }
```

- [ ] **Step 6: Stamp the variant in both entry points**

In `login()`, replace the emitted state with:

```ts
    this.subject.next({
      status: "authenticating",
      user: null,
      locked: false,
      error: null,
      unlocking: false,
      waitVariant: this.pickWaitVariant(),
    });
```

In `unlock()`, replace the emitted state with:

```ts
    this.subject.next({
      ...this.subject.value,
      unlocking: true,
      error: null,
      waitVariant: this.pickWaitVariant(),
    });
```

The outcome handlers spread `current` or build fresh states — add `waitVariant: this.subject.value.waitVariant` to any state they construct from scratch (i.e. the success and failure branches of `handleLoginOutcome`) so the field is never dropped.

- [ ] **Step 7: Wire it in composition**

In `packages/client-core/src/composition.ts`, replace the `auth:` presenter construction (line 305):

```ts
    // Login/lock/logout lifecycle over the injected AuthPort + SessionStore.
    // The 4th argument is the persisted login-wait variant cycle, read and
    // advanced through the preferences seam — same pattern as boot's variant.
    auth: new AuthPresenter(ports.auth, ports.sessionStore, undefined, {
      current: (): LoginWaitVariant => {
        let value!: LoginWaitVariant;
        ports.preferences
          .loginWaitVariant$()
          .pipe(take(1))
          .subscribe((v) => {
            value = v;
          });
        return value;
      },
      advance: (next: LoginWaitVariant): void => {
        ports.preferences.setLoginWaitVariant(next);
      },
    }),
```

`loginWaitVariant$()` is replay-current (BehaviorSubject-backed), so the synchronous `take(1)` read is safe — the same justification `BootPreferencePresenter.current()` documents. Ensure `take` is imported from `rxjs` and `LoginWaitVariant` from `@rtc/domain`.

- [ ] **Step 8: Add `waitVariant` to the six fixtures**

Add `waitVariant: "handshake"` to the default auth state in each of the six fixture files listed in Task 2 Step 6.

- [ ] **Step 9: Run tests, typecheck, commit**

```bash
pnpm test
pnpm typecheck
npx biome ci .
git add packages/client-core packages/ui-contract packages/client-react packages/client-solid
git commit -m "feat(auth): stamp and advance the login-wait variant on each attempt"
```

---

### Task 4: React `HandshakeConsole`

**Files:**
- Create: `packages/client-react/src/ui/shell/auth/wait/HandshakeConsole.tsx`
- Create: `packages/client-react/src/ui/shell/auth/wait/HandshakeConsole.module.css`
- Test: `packages/client-react/src/ui/shell/auth/wait/HandshakeConsole.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `function HandshakeConsole(): ReactElement`, rendering `data-testid="auth-wait-handshake"`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { HandshakeConsole } from "./HandshakeConsole";

test("renders all three handshake lines legibly at base state", () => {
  render(<HandshakeConsole />);

  const root = screen.getByTestId("auth-wait-handshake");
  expect(root).toBeInTheDocument();
  expect(root.textContent).toContain("SECURE CHANNEL OPEN");
  expect(root.textContent).toContain("CREDENTIALS SEALED");
  expect(root.textContent).toContain("AWAITING AUTH GRANT");
});

test("exposes the wait as a live region for assistive tech", () => {
  render(<HandshakeConsole />);

  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("AWAITING AUTH GRANT");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-react test HandshakeConsole`
Expected: FAIL — cannot resolve `./HandshakeConsole`.

- [ ] **Step 3: Write the component**

```tsx
import type { ReactElement } from "react";

import styles from "./HandshakeConsole.module.css";

/**
 * The `handshake` login-wait treatment: a monospace telemetry readout that
 * takes over while an auth request is in flight.
 *
 * Deliberately stateless and timer-free. The component's own lifecycle is the
 * truth signal — it mounts exactly when the request is dispatched and unmounts
 * exactly when the outcome lands — so line 1 and line 3 are accurate the
 * moment they render, and line 2's reveal is pure CSS. Nothing here claims a
 * server-side fact we cannot observe.
 */
export function HandshakeConsole(): ReactElement {
  return (
    <div
      data-testid="auth-wait-handshake"
      className={styles.console}
      role="status"
      aria-live="polite"
    >
      <div className={`${styles.line} ${styles.done}`}>
        ▸ SECURE CHANNEL OPEN
      </div>
      <div className={`${styles.line} ${styles.sealed}`}>
        ▸ CREDENTIALS SEALED
      </div>
      <div className={`${styles.line} ${styles.active}`}>
        ▸ AWAITING AUTH GRANT
        <span className={styles.caret} aria-hidden="true">
          ▌
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the stylesheet**

```css
/* The `handshake` login-wait treatment.
 *
 * PERF (docs/performance.md): only `opacity` is animated here — no transform
 * is needed at all. No filter animation, no layout-affecting property.
 *
 * FREEZE (index.css:47-58): power-saver freeze runs one 0.01ms iteration and
 * falls back to base CSS, so every line's BASE state is already its
 * informative state. The keyframes only add emphasis on top. A base of
 * `opacity: 0.3` here would render the whole console inert on exactly the
 * low-power machines where the wait is longest.
 */

.console {
  margin-top: 12px;
  padding: 10px 12px;
  text-align: left;
  background: var(--panel-head);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
}

.line {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 10px;
  line-height: 1.85;
  letter-spacing: 0.09em;
  color: var(--text-muted);
}

.done {
  color: var(--accent-positive);
}

/* Base = fully legible. The animation only fades it IN from the same colour,
 * so a frozen render still shows the line at full strength. */
.sealed {
  color: var(--accent-positive);
  animation: seal 0.5s ease-out 0.35s backwards;
}

@keyframes seal {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.active {
  color: var(--accent-primary);
}

.caret {
  margin-left: 2px;
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* No global reduced-motion rule exists in this repo — every stylesheet opts in
 * for itself. Base CSS is already the informative state, so simply dropping
 * the animations leaves the console fully readable. */
@media (prefers-reduced-motion: reduce) {
  .sealed,
  .caret {
    animation: none;
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @rtc/client-react test HandshakeConsole`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/shell/auth/wait
git commit -m "feat(client-react): add HandshakeConsole login-wait treatment"
```

---

### Task 5: React `ReactorWait`

**Files:**
- Create: `packages/client-react/src/ui/shell/auth/wait/ReactorWait.tsx`
- Create: `packages/client-react/src/ui/shell/auth/wait/ReactorWait.module.css`
- Test: `packages/client-react/src/ui/shell/auth/wait/ReactorWait.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `function ReactorWait(): ReactElement`, rendering `data-testid="auth-wait-reactor"`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { ReactorWait } from "./ReactorWait";

test("renders the status line legibly at base state", () => {
  render(<ReactorWait />);

  const root = screen.getByTestId("auth-wait-reactor");
  expect(root).toBeInTheDocument();
  expect(root.textContent).toContain("AWAITING AUTH GRANT");
});

test("exposes the wait as a live region for assistive tech", () => {
  render(<ReactorWait />);

  expect(screen.getByRole("status")).toHaveTextContent("AWAITING AUTH GRANT");
});

test("the spinning rings are decorative and hidden from assistive tech", () => {
  render(<ReactorWait />);

  const rings = screen
    .getByTestId("auth-wait-reactor")
    .querySelectorAll("svg[aria-hidden='true']");
  expect(rings.length).toBe(2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-react test ReactorWait`
Expected: FAIL — cannot resolve `./ReactorWait`.

- [ ] **Step 3: Write the component**

```tsx
import type { ReactElement } from "react";

import styles from "./ReactorWait.module.css";

/**
 * The `reactor` login-wait treatment: counter-rotating arcs, an indeterminate
 * bar, and a pulsing status line.
 *
 * The rings are wrapped in their own <div>s because the rotation animation is
 * applied to the WRAPPER, never to the <circle> — SVG-child transforms never
 * composite (docs/performance.md), so spinning the circle directly would
 * repaint every frame for the life of the request.
 */
export function ReactorWait(): ReactElement {
  return (
    <div data-testid="auth-wait-reactor" className={styles.wait}>
      <div className={styles.rings} aria-hidden="true">
        <div className={styles.ringOuter}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" className={styles.arcOuter} />
          </svg>
        </div>
        <div className={styles.ringInner}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" className={styles.arcInner} />
          </svg>
        </div>
      </div>

      <div className={styles.track} aria-hidden="true">
        <div className={styles.bar} />
      </div>

      <div className={styles.status} role="status" aria-live="polite">
        ▸ AWAITING AUTH GRANT
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the stylesheet**

```css
/* The `reactor` login-wait treatment.
 *
 * PERF (docs/performance.md):
 *  - Only `transform` and `opacity` are animated.
 *  - Rotation is applied to the wrapping DIV, never to the <circle>:
 *    SVG-child transforms never composite.
 *  - The bar slides a fixed-width child with translateX inside an
 *    overflow:hidden track. Animating `width` or `left` would trigger layout
 *    on every frame, forever, on a permanently-mounted HUD.
 *  - The glow is a STATIC drop-shadow. Animating `filter` repaints per frame.
 *
 * FREEZE (index.css:47-58): base CSS is the informative state. The status
 * line is fully legible unanimated; the keyframes only pulse it.
 */

.wait {
  margin-top: 10px;
}

.rings {
  position: relative;
  width: 64px;
  height: 64px;
  margin: 0 auto 12px;
}

.ringOuter,
.ringInner {
  position: absolute;
  inset: 0;
  will-change: transform;
}

.ringOuter svg,
.ringInner svg {
  width: 100%;
  height: 100%;
}

.ringOuter {
  animation: spin 1.4s linear infinite;
}

.ringInner {
  inset: 6px;
  animation: spin-reverse 2.3s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes spin-reverse {
  to {
    transform: rotate(-360deg);
  }
}

.arcOuter {
  fill: none;
  stroke: var(--accent-primary);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 34 130;
  /* Static, not animated — an animated filter repaints every frame. */
  filter: drop-shadow(0 0 5px var(--accent-primary));
}

.arcInner {
  fill: none;
  stroke: var(--border-strong);
  stroke-width: 1.5;
  stroke-dasharray: 10 22;
}

.track {
  position: relative;
  overflow: hidden;
  height: 2px;
  margin-top: 9px;
  background: var(--border-subtle);
  border-radius: 2px;
}

.bar {
  position: absolute;
  inset: 0;
  width: 35%;
  background: var(--accent-primary);
  border-radius: 2px;
  box-shadow: var(--glow);
  animation: slide 1.25s cubic-bezier(0.65, 0, 0.35, 1) infinite;
  will-change: transform;
}

@keyframes slide {
  from {
    transform: translateX(-105%);
  }
  to {
    transform: translateX(390%);
  }
}

.status {
  margin-top: 10px;
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--accent-primary);
  text-align: center;
  animation: pulse 1.8s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

/* No global reduced-motion rule exists in this repo — every stylesheet opts in
 * for itself. The rings and bar are decorative (aria-hidden), and the status
 * line is legible unanimated, so stopping all three loses no information. */
@media (prefers-reduced-motion: reduce) {
  .ringOuter,
  .ringInner,
  .bar,
  .status {
    animation: none;
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @rtc/client-react test ReactorWait`
Expected: PASS (all three).

- [ ] **Step 6: Verify the stylelint gate**

Run: `pnpm lint:css`
Expected: PASS. This repo runs `stylelint-declaration-strict-value` — raw colour literals are rejected, which is why every colour above is a `var(--token)`.

- [ ] **Step 7: Commit**

```bash
git add packages/client-react/src/ui/shell/auth/wait
git commit -m "feat(client-react): add ReactorWait login-wait treatment"
```

---

### Task 6: Solid `HandshakeConsole` and `ReactorWait`

**Files:**
- Create: `packages/client-solid/src/ui/shell/auth/wait/HandshakeConsole.tsx`
- Create: `packages/client-solid/src/ui/shell/auth/wait/HandshakeConsole.module.css`
- Create: `packages/client-solid/src/ui/shell/auth/wait/ReactorWait.tsx`
- Create: `packages/client-solid/src/ui/shell/auth/wait/ReactorWait.module.css`
- Test: `packages/client-solid/src/ui/shell/auth/wait/HandshakeConsole.test.tsx`
- Test: `packages/client-solid/src/ui/shell/auth/wait/ReactorWait.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `function HandshakeConsole(): JSX.Element` and `function ReactorWait(): JSX.Element`, with the **same** `data-testid` values as the React versions (`auth-wait-handshake`, `auth-wait-reactor`) — the shared contract specs key on them.

- [ ] **Step 1: Copy both stylesheets verbatim**

The CSS is framework-agnostic and must not drift.

```bash
mkdir -p packages/client-solid/src/ui/shell/auth/wait
cp packages/client-react/src/ui/shell/auth/wait/HandshakeConsole.module.css \
   packages/client-solid/src/ui/shell/auth/wait/HandshakeConsole.module.css
cp packages/client-react/src/ui/shell/auth/wait/ReactorWait.module.css \
   packages/client-solid/src/ui/shell/auth/wait/ReactorWait.module.css
```

- [ ] **Step 2: Write the failing tests**

`HandshakeConsole.test.tsx`:

```tsx
import { render, screen } from "@solidjs/testing-library";
import { expect, test } from "vitest";

import { HandshakeConsole } from "./HandshakeConsole";

test("renders all three handshake lines legibly at base state", () => {
  render(() => <HandshakeConsole />);

  const root = screen.getByTestId("auth-wait-handshake");
  expect(root).toBeInTheDocument();
  expect(root.textContent).toContain("SECURE CHANNEL OPEN");
  expect(root.textContent).toContain("CREDENTIALS SEALED");
  expect(root.textContent).toContain("AWAITING AUTH GRANT");
});

test("exposes the wait as a live region for assistive tech", () => {
  render(() => <HandshakeConsole />);

  expect(screen.getByRole("status")).toHaveTextContent("AWAITING AUTH GRANT");
});
```

`ReactorWait.test.tsx`:

```tsx
import { render, screen } from "@solidjs/testing-library";
import { expect, test } from "vitest";

import { ReactorWait } from "./ReactorWait";

test("renders the status line legibly at base state", () => {
  render(() => <ReactorWait />);

  const root = screen.getByTestId("auth-wait-reactor");
  expect(root).toBeInTheDocument();
  expect(root.textContent).toContain("AWAITING AUTH GRANT");
});

test("the spinning rings are decorative and hidden from assistive tech", () => {
  render(() => <ReactorWait />);

  const rings = screen
    .getByTestId("auth-wait-reactor")
    .querySelectorAll("svg[aria-hidden='true']");
  expect(rings.length).toBe(2);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @rtc/client-solid test wait`
Expected: FAIL — cannot resolve the modules.

- [ ] **Step 4: Write the Solid `HandshakeConsole`**

```tsx
import type { JSX } from "solid-js";

import styles from "./HandshakeConsole.module.css";

/**
 * The `handshake` login-wait treatment (Solid port of the client-react
 * component; markup and stylesheet are kept identical so the shared
 * @rtc/ui-contract specs and the visual goldens hold for both clients).
 *
 * Stateless and timer-free: the component's own lifecycle is the truth
 * signal, mounting when the request is dispatched and unmounting when the
 * outcome lands.
 */
export function HandshakeConsole(): JSX.Element {
  return (
    <div
      data-testid="auth-wait-handshake"
      class={styles.console}
      role="status"
      aria-live="polite"
    >
      <div class={`${styles.line} ${styles.done}`}>▸ SECURE CHANNEL OPEN</div>
      <div class={`${styles.line} ${styles.sealed}`}>▸ CREDENTIALS SEALED</div>
      <div class={`${styles.line} ${styles.active}`}>
        ▸ AWAITING AUTH GRANT
        <span class={styles.caret} aria-hidden="true">
          ▌
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the Solid `ReactorWait`**

```tsx
import type { JSX } from "solid-js";

import styles from "./ReactorWait.module.css";

/**
 * The `reactor` login-wait treatment (Solid port of the client-react
 * component; markup and stylesheet kept identical).
 *
 * Rotation is applied to the wrapping <div>, never to the <circle> — SVG-child
 * transforms never composite (docs/performance.md).
 */
export function ReactorWait(): JSX.Element {
  return (
    <div data-testid="auth-wait-reactor" class={styles.wait}>
      <div class={styles.rings} aria-hidden="true">
        <div class={styles.ringOuter}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" class={styles.arcOuter} />
          </svg>
        </div>
        <div class={styles.ringInner}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" class={styles.arcInner} />
          </svg>
        </div>
      </div>

      <div class={styles.track} aria-hidden="true">
        <div class={styles.bar} />
      </div>

      <div class={styles.status} role="status" aria-live="polite">
        ▸ AWAITING AUTH GRANT
      </div>
    </div>
  );
}
```

> Solid uses `class`, not `className`; the JSX return type is `JSX.Element` from `solid-js`, not `ReactElement`. Everything else — markup, testids, ARIA — is byte-identical to the React version by design.

- [ ] **Step 6: Run the tests and commit**

```bash
pnpm --filter @rtc/client-solid test wait
npx biome ci .
git add packages/client-solid/src/ui/shell/auth/wait
git commit -m "feat(client-solid): port HandshakeConsole and ReactorWait"
```

---

### Task 7: Wire into `LoginScreen` and `LockScreen` in both clients, with shared contract specs

Both clients and the shared specs land together — a contract spec added before the Solid wiring exists would red `client-solid`.

**Files:**
- Modify: `packages/client-react/src/ui/shell/auth/LoginScreen.tsx`
- Modify: `packages/client-react/src/ui/shell/auth/LoginScreen.module.css`
- Modify: `packages/client-react/src/ui/shell/lock/LockScreen.tsx`
- Modify: `packages/client-react/src/ui/shell/lock/LockScreen.module.css`
- Modify: `packages/client-solid/src/ui/shell/auth/LoginScreen.tsx`
- Modify: `packages/client-solid/src/ui/shell/auth/LoginScreen.module.css`
- Modify: `packages/client-solid/src/ui/shell/lock/LockScreen.tsx`
- Modify: `packages/client-solid/src/ui/shell/lock/LockScreen.module.css`
- Create: `packages/ui-contract/src/shared/pages/shell/auth/AuthWaitPage.ts`
- Modify: `packages/ui-contract/src/shared/pages/shell/auth/LoginScreenPage.ts`
- Modify: `packages/ui-contract/src/shared/pages/shell/lock/LockScreenPage.ts`
- Modify: `packages/ui-contract/src/specs/shell/auth/LoginScreen.contract.spec.ts`
- Modify: `packages/ui-contract/src/specs/shell/auth/AuthGate.contract.spec.ts`
- Create: `packages/ui-contract/src/specs/shell/lock/LockScreen.wait.contract.spec.ts`

**Interfaces:**
- Consumes: `HandshakeConsole` / `ReactorWait` (Tasks 4–6); `AuthViewState.unlocking` (Task 2); `AuthViewState.waitVariant` (Task 3).
- Produces: `waitVariant()` and `hasWait()` accessors on `LoginScreenPage` and `LockScreenPage`.

- [ ] **Step 1: Add the page-object accessors**

Add to **both** `LoginScreenPage.ts` and `LockScreenPage.ts`:

```ts
  /** True when either login-wait treatment is on screen. */
  hasWait(): boolean {
    return this.waitVariant() !== null;
  }

  /** Which wait treatment is rendered: "handshake", "reactor", or null. */
  waitVariant(): "handshake" | "reactor" | null {
    const scope = within(this.root);

    if (scope.queryByTestId("auth-wait-handshake") !== null) {
      return "handshake";
    }

    if (scope.queryByTestId("auth-wait-reactor") !== null) {
      return "reactor";
    }

    return null;
  }
```

- [ ] **Step 2: Write the failing contract specs**

Add to `packages/ui-contract/src/specs/shell/auth/LoginScreen.contract.spec.ts`:

```ts
  it("shows no wait treatment when idle", () => {
    const page = mount(LoginScreen, { auth: { status: "unauthenticated" } });
    expect(page.hasWait()).toBe(false);
  });

  it("shows the handshake treatment while authenticating on that variant", () => {
    const page = mount(LoginScreen, {
      auth: { status: "authenticating", waitVariant: "handshake" },
    });
    expect(page.waitVariant()).toBe("handshake");
  });

  it("shows the reactor treatment while authenticating on that variant", () => {
    const page = mount(LoginScreen, {
      auth: { status: "authenticating", waitVariant: "reactor" },
    });
    expect(page.waitVariant()).toBe("reactor");
  });
```

Create `packages/ui-contract/src/specs/shell/lock/LockScreen.wait.contract.spec.ts` with the same three cases, mounting `LockScreen` with `{ locked: true, unlocking: true, waitVariant: … }` and `{ locked: true, unlocking: false }` for the idle case. Follow the existing `LockScreen.contract.spec.ts` for the import and `describe` scaffolding.

Add the regression test to `AuthGate.contract.spec.ts`:

```ts
  it("keeps the app mounted while an unlock is in flight", () => {
    // Regression: modelling the unlock wait as status "authenticating" would
    // make AuthGate swap the whole app for LoginScreen mid-unlock.
    const page = mount(AuthGate, {
      auth: { status: "authenticated", locked: true, unlocking: true },
    });
    expect(page.showsChildren()).toBe(true);
    expect(page.showsLogin()).toBe(false);
  });
```

`showsChildren()` and `showsLogin()` are the accessors `AuthGatePage` already exposes; the harness mounts a sentinel child with `data-testid="auth-gate-child"`.

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @rtc/client-react test contract && pnpm --filter @rtc/client-solid test contract`
Expected: FAIL in both — `hasWait()` returns false while authenticating.

- [ ] **Step 4: Wire the React `LoginScreen`**

Add the imports and a switch on the variant, replacing the `<button>` block:

```tsx
import { HandshakeConsole } from "./wait/HandshakeConsole";
import { ReactorWait } from "./wait/ReactorWait";
```

Inside the component, after `const authenticating = …`:

```tsx
  const submitLabel = authenticating ? "AUTHENTICATING" : "AUTHENTICATE ▸";
```

Then, replacing the existing button and adding the treatment beneath it:

```tsx
          <button
            type="submit"
            data-testid="login-submit"
            className={
              authenticating ? `${styles.submit} ${styles.busy}` : styles.submit
            }
            disabled={authenticating}
          >
            {submitLabel}
          </button>

          {authenticating && state.waitVariant === "handshake" ? (
            <HandshakeConsole />
          ) : null}
          {authenticating && state.waitVariant === "reactor" ? (
            <ReactorWait />
          ) : null}
```

Wrap the two `<label>` fields in a `<div>` that carries `styles.recede` when `authenticating`, so the form dims:

```tsx
          <div className={authenticating ? styles.recede : undefined}>
            {/* the two existing <label className={styles.field}> blocks */}
          </div>
```

- [ ] **Step 5: Extend the React `LoginScreen.module.css`**

```css
/* Form recedes while a request is in flight, so the wait treatment leads.
 * Only `opacity` — no layout, no paint beyond the composited layer. */
.recede {
  display: flex;
  flex-direction: column;
  gap: 14px;
  opacity: 0.35;
  transition: opacity 0.3s ease-out;
}

/* Sweeping highlight on the busy submit button.
 * PERF: translateX on a pseudo-element inside overflow:hidden. The BASE state
 * already reads AUTHENTICATING, so the sweep is pure emphasis and a frozen
 * render is still informative (index.css:47-58). */
.busy {
  position: relative;
  overflow: hidden;
  opacity: 0.85;
}

.busy::after {
  position: absolute;
  inset: 0;
  width: 40%;
  content: "";
  background: linear-gradient(
    90deg,
    transparent,
    var(--bg-overlay),
    transparent
  );
  animation: sweep 1.15s linear infinite;
  will-change: transform;
}

@keyframes sweep {
  from {
    transform: translateX(-250%);
  }
  to {
    transform: translateX(400%);
  }
}

/* Per-stylesheet opt-in; there is no global reduced-motion rule. The button
 * already reads AUTHENTICATING at base, so dropping the sweep loses nothing. */
@media (prefers-reduced-motion: reduce) {
  .recede {
    transition: none;
  }

  .busy::after {
    animation: none;
  }
}
```

- [ ] **Step 6: Wire the React `LockScreen`**

Apply the same pattern, driven by `state.unlocking` rather than `state.status`:

```tsx
import { HandshakeConsole } from "../auth/wait/HandshakeConsole";
import { ReactorWait } from "../auth/wait/ReactorWait";
```

```tsx
  const { unlocking } = state;
```

Give the submit button the `styles.busy` class and the label `unlocking ? "AUTHENTICATING" : "AUTHENTICATE"`, add `disabled={unlocking}`, wrap the password field in the `styles.recede` div, and render the two treatments on `unlocking && state.waitVariant === …`. Copy the `.recede`, `.busy`, `::after` and `@keyframes sweep` rules from Step 5 into `LockScreen.module.css`.

- [ ] **Step 7: Wire both Solid screens**

Apply Steps 4–6 to `packages/client-solid/src/ui/shell/auth/LoginScreen.tsx` and `packages/client-solid/src/ui/shell/lock/LockScreen.tsx`, and copy the CSS additions into their `.module.css` files verbatim.

Solid differences: `class` not `className`; state is a signal, so read it as `state().status`, `state().unlocking`, `state().waitVariant`; prefer `<Show when={…}>` over the `? :` ternaries for the conditional treatments. The existing Solid `LoginScreen.tsx:81` already reads `state().status === "authenticating"` — follow that idiom.

- [ ] **Step 8: Run the contract specs against both clients**

Run: `pnpm --filter @rtc/client-react test contract && pnpm --filter @rtc/client-solid test contract`
Expected: PASS in both. Identical spec files running green against both frameworks is the parity gate.

- [ ] **Step 9: Full gauntlet and commit**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm lint:css
npx biome ci .
git add packages/client-react packages/client-solid packages/ui-contract
git commit -m "feat(web): render the login-wait treatments on LoginScreen and LockScreen"
```

---

### Task 8: Visual scenarios and goldens

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts`
- Modify: `packages/ui-contract/src/visual/appData.ts` (if the scenario needs new seed state)
- Modify: `packages/ui-contract/src/visual/scenarioActions.ts` (if the scenario needs an action)
- Goldens: `packages/ui-contract/goldens/react/**`, `packages/ui-contract/goldens/react-local/**`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: four goldens — login × {handshake, reactor}, lock × {handshake, reactor}.

- [ ] **Step 1: Add the four scenarios**

Follow the existing scenario shape in `packages/ui-contract/src/visual/scenarios.ts`. Each seeds the auth state directly:

```ts
  {
    name: "login-wait-handshake",
    fullPage: true,
    auth: { status: "authenticating", waitVariant: "handshake" },
  },
  {
    name: "login-wait-reactor",
    fullPage: true,
    auth: { status: "authenticating", waitVariant: "reactor" },
  },
  {
    name: "lock-wait-handshake",
    fullPage: true,
    auth: {
      status: "authenticated",
      locked: true,
      unlocking: true,
      waitVariant: "handshake",
    },
  },
  {
    name: "lock-wait-reactor",
    fullPage: true,
    auth: {
      status: "authenticated",
      locked: true,
      unlocking: true,
      waitVariant: "reactor",
    },
  },
```

> **`waitVariant` must be seeded explicitly, never read from the cycling pointer.** A scenario driven by the live cycle alternates between runs and flips its own golden every other capture — which presents as an intermittent flake but is deterministic misuse.

> These are full-screen overlays, so `fullPage: true` is required. Without it the capture is clipped to the viewport and can produce zero golden output.

- [ ] **Step 2: Confirm animations are frozen for capture**

Verify the runner still passes `animations: "disabled"` (referenced at `packages/ui-contract/src/visual/scenarios.ts:558`). Playwright pins infinite animations to their **first frame** — which, per the base-CSS rule, is the fully legible state.

- [ ] **Step 3: Generate the goldens for both buckets**

```bash
pnpm goldens:regen     # emulated linux/amd64 container → goldens/react/ (the CI bucket)
pnpm goldens:verify    # re-runs in-container and confirms the tree is clean
```

Both buckets are required: `react/` (CI x86, generated in the emulated `linux/amd64` container — proven byte-identical to CI, 30/30) and `react-local/` (native arch, produced by running the visual tier locally).

Only `client-react` writes goldens; `client-solid` asserts against the same PNGs.

- [ ] **Step 4: Verify the goldens assert clean for both clients**

Run the visual tier for `client-react` and then `client-solid`. Expected: PASS for both, 4 new scenarios each.

If `client-solid` diffs against a `client-react`-generated golden, the markup or CSS has drifted between Tasks 4–6 — fix the drift, do not regenerate a second golden.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-contract
git commit -m "test(visual): add login/lock wait-state scenarios and goldens"
```

---

### Task 9: Status tracking and docs

**Files:**
- Modify: `docs/STATUS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Add the React Native pending entry**

Add an entry to `docs/STATUS.md` following the file's existing format, recording:

- The React Native UI port of both wait treatments is pending. The CSS does not transfer; it needs a Reanimated (and possibly Skia) implementation of the two variants.
- RN surfaces to touch: `packages/client-react-native/src/ui/shell/auth/LoginScreen.tsx`, `packages/client-react-native/src/ui/shell/lock/LockScreen.tsx`, and `useHoldToUnlock.ts`.
- The RN **preferences adapter** already ships (Task 1) — only the UI is outstanding.
- Link the spec: `docs/superpowers/specs/2026-07-25-login-wait-feedback-design.md`.

- [ ] **Step 2: Verify doc links and commit**

```bash
pnpm check:doc-links
git add docs/STATUS.md
git commit -m "docs(status): log the pending React Native login-wait port"
```

---

## Final verification

- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm lint` and `pnpm lint:css`
- [ ] `npx biome ci .` — format and import sort, which `pnpm lint` does not cover
- [ ] `pnpm check:doc-links`
- [ ] `pnpm test:e2e`
- [ ] **Manual compositor check.** Run `pnpm dev:react`, sign in with `astark` / `mcdc2026`, and record a performance trace across the wait. Confirm **zero `compositeFailed` events** — the pre-merge requirement in `docs/performance.md`. Repeat for the reactor variant (reload to advance the cycle).
- [ ] **Manual freeze check.** Set power-saver to `freeze` via the header ⌁ control and confirm both treatments remain fully legible with motion stopped.
- [ ] **Manual reduced-motion check.** Enable the OS "reduce motion" setting (macOS: System Settings → Accessibility → Display → Reduce motion) and confirm both treatments stop animating and stay legible. This exercises the per-stylesheet `@media` blocks — there is no global rule to fall back on.

Then follow `.claude/skills/shipping-repo-changes/SKILL.md`: push, open one PR for the whole branch, loop on `gh run list --workflow CI` until green for your HEAD SHA, triage catch-up risk, merge with `--merge`, and remove the worktree.
