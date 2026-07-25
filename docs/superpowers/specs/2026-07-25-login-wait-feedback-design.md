# Login / unlock "waiting for server" feedback — design

**Date:** 2026-07-25
**Status:** Approved, not yet implemented
**Scope:** `@rtc/client-react`, `@rtc/client-solid`, `@rtc/client-core`, `@rtc/domain`, `@rtc/ui-contract`
**Deferred:** the `@rtc/client-react-native` **UI** (tracked in `docs/STATUS.md`).
Its preferences **adapter** is still in scope — see [Blast radius](#preference-key--8-files) for why.

## Problem

When the server is slow to answer a sign-in, the app gives the user no
meaningful signal that anything is happening.

`AuthPresenter.login()` already models the wait correctly — it pushes
`status: "authenticating"` (`packages/client-core/src/presenters/AuthPresenter.ts:71`).
The gap is entirely in the view layer: all three clients render that state as
nothing more than a disabled button (`opacity: 0.6; cursor: not-allowed`,
`LoginScreen.module.css:103`), and the label still reads `AUTHENTICATE ▸`. On a
slow link the screen looks frozen.

The lock screen is worse. `AuthPresenter.unlock()`
(`AuthPresenter.ts:117`) never enters an in-flight state at all, so
re-authenticating from `LockScreen` has **zero** feedback — not even the dimmed
button.

## Goals

1. Give the login wait a visually captivating, on-brand treatment.
2. Alternate between two distinct treatments across attempts, the way the boot
   splash cycles its scene variants.
3. Fix the lock screen's missing in-flight state.
4. Hold the line on the repo's rendering-performance rules and on
   React/Solid parity.

## Non-goals

- React Native. The CSS does not transfer; it needs a Reanimated/Skia
  implementation. Logged in `docs/STATUS.md` as pending.
- Any change to the authentication protocol, timing, or error handling.
- A user-facing setting to pin the variant. The preference key this design adds
  makes one cheap later, but no settings UI is in scope.

## The two treatments

Selected from four live mockups. Both render in the app's existing theme
tokens; neither introduces new colours.

### `handshake` (mockup B)

The credential form recedes to low opacity and a monospace telemetry readout
takes over beneath it, in a bordered panel using `--accent-primary` on
`rgba(0,224,255,0.05)`:

```
▸ SECURE CHANNEL OPEN
▸ CREDENTIALS SEALED
▸ AWAITING AUTH GRANT ▌
```

Line 3 carries a blinking caret for the duration of the wait.

### `reactor` (mockup D)

Two counter-rotating arcs spin up around the existing `HudLogo` hex emblem
while it pulses; the submit button carries a sweeping highlight; a slim
indeterminate bar runs beneath it; a pulsing `▸ AWAITING AUTH GRANT` status
line sits below that. The form dims, as in `handshake`.

## Architecture

### Layer 1 — `@rtc/domain`: the variant cycle

Mirrors `BOOT_VARIANTS` exactly. In
`packages/domain/src/preferences/preferences.ts`:

```ts
export type LoginWaitVariant = "handshake" | "reactor";

export const LOGIN_WAIT_VARIANTS: readonly LoginWaitVariant[] = [
  "handshake",
  "reactor",
];

export const DEFAULT_LOGIN_WAIT_VARIANT: LoginWaitVariant = "handshake";
```

Note that domain exports the **list and default only, not a type guard** — matching
`BOOT_VARIANTS`. Each persistence adapter defines its own local
`isLoginWaitVariant(value: string | null)` narrowing against the exported list,
exactly as all three already do for `isBootVariant`
(e.g. `LocalStoragePreferencesAdapter.ts:64`). Duplicated, but consistent with
the established pattern; unifying the guards is a separate concern.

`PreferencesPort` (`packages/domain/src/ports/preferencesPort.ts`) gains the
matching pair, alongside the existing `bootVariant$` / `setBootVariant`:

```ts
loginWaitVariant$(): Observable<LoginWaitVariant>;
setLoginWaitVariant(variant: LoginWaitVariant): void;
```

### Layer 2 — `@rtc/client-core`: `AuthPresenter`

`AuthViewState` gains two fields:

```ts
readonly unlocking: boolean;
readonly waitVariant: LoginWaitVariant;
```

`unlocking` must be a **separate flag, not a `status` value.** `AuthGate`
renders `LoginScreen` whenever `status !== "authenticated"`
(`packages/client-react/src/ui/shell/auth/AuthGate.tsx:20`). Reusing
`status: "authenticating"` for the unlock path would therefore unmount the
entire app mid-unlock and flash the full-screen sign-in form — taking the lock
overlay down with it, since `LockScreen` lives inside `App` rather than in the
gate. `unlocking` sits alongside the existing `locked` flag, which exists for
exactly this reason, and leaves `status` at `"authenticated"` so the app stays
mounted underneath.

The presenter takes one new injected dependency, shaped like
`BootSequenceDeps`:

```ts
export interface LoginWaitCycle {
  /** Current persisted cycle position → the variant for this attempt. */
  readonly current: () => LoginWaitVariant;
  /** Advance the persisted pointer (preferences seam; NO localStorage here). */
  readonly advance: (next: LoginWaitVariant) => void;
}
```

Both `login()` and `unlock()` read `current()`, write the result into state,
and **advance the pointer immediately** — advance-on-start, matching
`createBootSequenceMachine` (`BootSequenceMachine.ts:44-45`). Advancing on
completion instead would trap an impatient user who reloads mid-attempt on a
single variant forever.

`composition.ts` wires `LoginWaitCycle` to the preferences seam, exactly as it
already does for `bootPreference` (`composition.ts:430`). The presenter itself
never touches `localStorage`.

Both outcome handlers (`handleLoginOutcome`, `handleUnlockOutcome`) clear
`unlocking`.

### Layer 3 — views: per framework, CSS ported verbatim

Two components per web client — `HandshakeConsole` and `ReactorWait` — each
with its own `*.module.css`, rendered by both `LoginScreen` and `LockScreen`
when the relevant wait flag is set.

**No new shared package, and no `@rtc/motion-core` work.** There is no motion
*math* here — both treatments are declarative markup plus CSS keyframes. That
puts this on the "CSS Modules port verbatim to Solid" precedent, not the
`@rtc/boot-splash` extraction precedent; `boot-splash` was extracted to share a
5.3k-LOC canvas engine, and there is no equivalent engine to share. Per
ADR-005 this is view-layer presentation, not an autonomous async fold, so it
stays out of `client-core`.

**The console needs no timing logic whatsoever.** The component mounts exactly
when the request is dispatched and unmounts exactly when the outcome lands, so
its own lifecycle is the truth signal:

| Line | Source | Truthful? |
|---|---|---|
| `SECURE CHANNEL OPEN` | static on mount | Yes — the request has been dispatched |
| `CREDENTIALS SEALED` | CSS-delayed emphasis | Flavour, claims no specific fact |
| `AWAITING AUTH GRANT` | static, active + blinking caret | Yes — for the whole wait |

No `setInterval`, no RxJS machine, nothing to fake-time in tests. This
satisfies the "real phases where they exist, flavour elsewhere" requirement at
zero instrumentation cost.

## Rendering-performance constraints

Per `docs/performance.md` — mandatory reading for any animation in this repo,
because the app is a permanently-animated HUD where per-frame main-thread work
compounds forever.

1. **Animate only `transform` and `opacity`.** Both treatments comply.
2. **The indeterminate bar slides a fixed-width child** via `translateX` inside
   an `overflow: hidden` track. Animating `width` or `left` would trigger
   layout every frame.
3. **The glow is static.** Animating `filter: drop-shadow` repaints every
   frame; `--glow` stays a fixed `box-shadow`.
4. **The reactor ring spins the wrapping `<div>`, never the `<circle>`.**
   `docs/performance.md` records that SVG-child transforms never composite.
5. **No `var()` inside an animated transform.**

Steady-state must show zero `compositeFailed` events in a trace.

## Degraded modes

### Power-saver `freeze`

`index.css:47-58` neutralises motion with
`animation-duration: 0.01ms; animation-iteration-count: 1` — deliberately not
`animation: none`, so `forwards` end-states resolve and `animationend`
listeners do not hang.

The consequence is a **binding design rule**:

> **Base CSS must be the informative state; animation may only add emphasis on
> top of it.**

An animation without `forwards` runs one instant iteration and the element
falls back to its base CSS. So a console line whose base is
`opacity: 0.35` muted grey would render dim and inert under freeze — reading as
"nothing is happening" precisely on the low-power machines where the wait is
longest. Every line must therefore be legible at its base, with the keyframes
only brightening or advancing it. The same rule forbids the button sweep from
being what makes the label readable.

### `prefers-reduced-motion`

Both treatments degrade to their static base state, which by the rule above is
already fully informative — but **not automatically.** Unlike the
`data-power-saver="freeze"` catch-all, this repo has **no global
reduced-motion rule**; it is handled per-component (`Tile.module.css`,
`RfqCard.module.css`, `AmbientBackground.module.css` each carry their own
block). Every stylesheet added by this work must therefore include its own
`@media (prefers-reduced-motion: reduce)` block disabling its animations.
Omitting it leaves the motion running for users who asked the OS to stop it.

## Testing

### Contract tier (`@rtc/ui-contract`)

New specs run automatically against both frameworks via the swap-trio:

- `LoginScreen` renders the wait treatment while `status === "authenticating"`.
- `LoginScreen` renders the variant named by `waitVariant`.
- `LockScreen` renders the wait treatment while `unlocking` is true.
- `AuthGate` keeps the app mounted while `unlocking` is true — the regression
  test for the trap described above.

### Unit tier (`client-core`)

- `unlock()` sets `unlocking: true` and leaves `status: "authenticated"`.
- `unlock()` clears `unlocking` on both success and failure.
- `login()` and `unlock()` each advance the cycle pointer on start.
- The pointer wraps `reactor → handshake`.

### Visual tier

Two new scenarios per treatment (login + lock).

> **Scenarios must pin the variant explicitly and never read the cycling
> pointer.** A scenario driven by the live cycle would alternate between runs
> and flip its own golden every other capture — presenting as an intermittent
> flake that is actually deterministic misuse.

Pinning is free because the variant arrives through the injected preferences
seam. Playwright's existing `animations: "disabled"`
(`packages/ui-contract/src/visual/scenarios.ts:558`) then freezes loops at
their first frame, which the base-CSS rule guarantees is legible.

Goldens must be regenerated for **both** buckets of the dual set (CI-x86 and
local-arch).

## Blast radius

### Preference key — 8 files

| File | Change |
|---|---|
| `packages/domain/src/preferences/preferences.ts` | type, list, default, guard |
| `packages/domain/src/index.ts` | exports |
| `packages/domain/src/ports/preferencesPort.ts` | port methods |
| `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts` | shared adapter contract |
| `packages/domain/src/simulators/PreferencesSimulator.ts` | subject + seed option |
| `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts` | persistence |
| `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts` | persistence |
| `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts` | persistence |

The React Native **adapter** must be updated even though the RN **UI** is
deferred: adding methods to the `PreferencesPort` interface fails typecheck for
every implementor that lacks them.

> **`PreferencesPortContract` does NOT run against the React Native adapter.**
> Its three consumers are `client-react`, `client-solid` and the domain
> simulator; RN is covered instead by a hand-rolled
> `AsyncStoragePreferencesAdapter.test.ts` with explicit per-preference cases
> (its `bootVariant` block is driven off `BOOT_VARIANTS`). So the RN adapter
> needs **its own tests written by hand** — the shared contract will not catch
> a regression there. This matters most for `hydrate()`, whose destructuring
> and `Promise.all` entries are positional: a misaligned index silently
> assigns the wrong stored value to the wrong preference.

### `AuthViewState` shape — fixtures

`packages/ui-contract/src/shared/harness/world.ts`,
`packages/ui-contract/src/visual/appData.ts`, and the four per-client fixture
builders (`viewModelFromWorld.ts` and `buildFakeViewModel.ts` in each of
`client-react` and `client-solid`).

## Risks and costs

- **The preference plumbing is the bulk of the work, not the animation.** The
  CSS is roughly 120 lines; threading a new key through port, contract,
  simulator and three adapters is larger. Accepted deliberately: an in-memory
  counter would serve `handshake` on every fresh page load, since login
  normally happens once per load, and `reactor` would only appear after a
  failed password.
- **Golden regeneration across the dual set** for four new scenarios.
- **Parity discipline.** Anything added to `client-react` must land in
  `client-solid` in the same PR, or the shared contract specs fail.

## Follow-up

`docs/STATUS.md` gains a pending entry for the React Native port of both
treatments, including the `unlocking` flag's RN surfaces
(`client-react-native/src/ui/shell/lock/LockScreen.tsx` and
`useHoldToUnlock.ts`).
