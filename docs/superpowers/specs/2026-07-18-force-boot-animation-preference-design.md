# Force Boot Animation — Preference Design

**Status:** approved design, implementation not yet started (plan to follow).
**Date:** 2026-07-18
**Scope:** web clients (`@rtc/client-react`, `@rtc/client-solid`) + the shared
stack (`@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`,
`@rtc/solid-bindings`, `@rtc/ui-contract`). `@rtc/client-react-native`
implements the new port method (mandatory for typecheck) but gains **no** new
preferences UI.

## Problem

On low-capability remote desktops (the motivating case: **Citrix NDS with no
GPU**), the boot splash renders only its central chrome — the wordmark, the
boot-log lines, and the progress bar — while the animated part (the `<canvas>`
scene) never appears. This reads as a nice "performance auto-detection", but
that framing is inaccurate: **there is no hardware-performance auto-detection
anywhere in this codebase.** No FPS sampler, no `deviceMemory` /
`hardwareConcurrency` probe, no `compositeFailed`-driven downgrade.

The boot splash animation is suppressed by exactly two gates in
`BootSequence.tsx`:

1. **`prefers-reduced-motion: reduce`** (`BootSequence.tsx:34-40`) — an early
   `return` from the canvas-setup `useEffect`, skipping the entire rAF loop.
   There is a matching CSS rule (`BootSequence.module.css:116-128`) that also
   sets `.canvas { display: none }` (and strips the `.boot`/`.fill`
   transitions) under the same media query.
2. **No 2D canvas context** (`BootSequence.tsx:45-49`,
   `canvas.getContext("2d")` → `null`) — the `// jsdom / no-GPU: render chrome
   only` branch.

On a Citrix/VDI desktop the observed symptom is almost certainly gate **#1**:
VDI stacks advertise `prefers-reduced-motion: reduce` to the browser because
the remote OS disables animations to conserve bandwidth. What the user
experiences as "performance adaptation" is the app honouring an accessibility
signal the remote desktop sends on their behalf.

The user wants a **Preferences dialog option to force the splash animation to
run anyway** on such hardware.

## Goals

- A persisted, discoverable boolean preference — **`forceBootAnimation`**,
  default `false` — that makes the boot splash play **even when
  `prefers-reduced-motion: reduce` is set**.
- Full React + Solid parity (same shared `@rtc/ui-contract` spec passes against
  both), following the existing `powerSaver` / `animatedBackground` preference
  template exactly.
- Default-off so that, absent an explicit opt-in, the app continues to respect
  the accessibility signal.
- No visual-golden regeneration (default-off preserves current output).

## Non-goals

- **Not** a general "ignore reduced-motion everywhere" switch. The override is
  scoped to the boot splash only; the ambient background and all other
  decorative motion continue to honour `prefers-reduced-motion`. (Explicitly
  chosen during brainstorming.)
- **No** hardware auto-detection is added (none exists today, and none is
  introduced) — this is a manual override, like every other preference.
- **No** RN preferences UI. RN boot is native and the motivating case is a web
  VDI concern; the RN AsyncStorage adapter implements the new port method only
  because the shared `PreferencesPort` interface requires it.
- **No** header quick-toggle. The splash has already painted by the time the
  header chrome exists, so a live quick-toggle (as power-saver has) would be
  pointless here. The Preferences dialog is the only surface.
- **No** server / protocol changes.

## The one case this cannot fix

If `canvas.getContext("2d")` genuinely returns `null` (gate #2 — no 2D drawing
surface at all), nothing can force the animation, because there is no surface to
draw on. This is unlikely on Citrix (a 2D canvas software-renders without a
GPU), but it is the hard floor and will be documented in the boot README. The
`forceBootAnimation` preference overrides gate #1 only; gate #2 is a genuine
capability gap and is left intact.

## Design

### 1. The override mechanism (the interesting part)

Both `BootGate` and `BootSequence` currently read `prefers-reduced-motion`
directly. Each will additionally read the new preference via a
`useForceBootAnimation()` hook and compute an **effective** reduced-motion:

```ts
const forced = useForceBootAnimation().enabled;
const prefersReduced =
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const reduce = prefersReduced && !forced;
```

Three consumers must all agree on `reduce`, or the animation runs invisibly:

- **`BootSequence.tsx` (JS gate).** The `reduce` early-return at `:34-40`
  becomes `if (reduce) return;` using the *effective* value. When forced, the
  canvas/rAF loop runs even under reduced-motion. (The `!ctx` guard at `:45-49`
  is untouched — gate #2 stays.)
- **`BootGate.tsx` (dismissal path).** `BootGate` selects its dismissal path
  from reduced-motion — transition-end listener vs. a direct `handleDone`. It
  uses the same *effective* `reduce` so a forced boot dismisses via the normal
  opacity transition, exactly like a non-reduced-motion boot.
- **CSS (`BootSequence.module.css`).** The
  `@media (prefers-reduced-motion: reduce)` block must become inert when forced,
  or `.canvas { display: none }` hides the running canvas. The `.boot` root
  element carries a data attribute reflecting the *forced* state — e.g.
  `data-force-anim="true"` — and the media-query selectors are scoped to exclude
  it:

  ```css
  @media (prefers-reduced-motion: reduce) {
    .boot:not([data-force-anim="true"]) { /* .boot transition: none */ }
    .boot:not([data-force-anim="true"]) .canvas { display: none; }
    .boot:not([data-force-anim="true"]) .fill { transition: none; }
  }
  ```

  (Exact selector shape is an implementation detail; the requirement is: under
  reduced-motion **and** forced, the canvas is visible and transitions behave
  normally.) This `data-force-anim` attribute is also the jsdom-testable
  observable (see Testing).

**No-flash guarantee.** The LocalStorage adapter seeds its preference
`BehaviorSubject` synchronously at construction (via `readBool`), so
`useForceBootAnimation()` returns the persisted value on the very first frame —
essential, because the boot splash is the first thing painted.

### 2. Preference plumbing (the mandatory blast radius)

A new `@rtc/domain` boolean preference ripples through every adapter and both
bindings. Template throughout: `animatedBackground` (which uses a named
`DEFAULT_*` const) for the domain default, and `PowerSaverPresenter` for the
presenter/binding shape.

**Domain (`packages/domain/src/`):**
- `preferences/preferences.ts` — add `DEFAULT_FORCE_BOOT_ANIMATION = false`
  (named const, mirroring `DEFAULT_ANIMATED_BACKGROUND`).
- `ports/preferencesPort.ts` — add `forceBootAnimation$(): Observable<boolean>`
  and `setForceBootAnimation(on: boolean): void`.
- `ports/__contracts__/PreferencesPortContract.ts` — add `forceBootAnimation?:
  boolean` to `PreferencesSeed`, plus three contract cases mirroring
  power-saver: default emits `false`; `setForceBootAnimation` persists +
  pushes; a seeded value reads back.
- `simulators/PreferencesSimulator.ts` — backing `BehaviorSubject`, seed field
  (`seed.forceBootAnimation ?? false`), and the two accessors.
- `index.ts` — export `DEFAULT_FORCE_BOOT_ANIMATION`.

**Adapters (all four PreferencesPort implementations):**
- `client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts` — storage
  key `rtc-force-boot-animation`, `readBool(...)` seed, subject, accessors.
- `client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts` — identical.
- `client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts` —
  key + subject + async hydrate block + accessors (RN's seed-then-`hydrate()`
  pattern). No RN UI consumes it.
- `PreferencesSimulator` (above) is the fourth.
- Adapter contract tests: `client-react` + `client-solid`
  `app/adapters/preferences.contract.test.ts` — seed the new key, extend the
  `clearStorage` list.

**client-core (`packages/client-core/src/`):**
- `presenters/ForceBootAnimationPresenter.ts` — a structural clone of
  `AnimatedBackgroundPresenter`: `enabled$` (`shareReplay({bufferSize:1,
  refCount:true})`), `set(on)`, `toggle(current)`.
- `composition.ts` — import it, add a `forceBootAnimation` field to the
  `AppPresenters` interface, construct it from `ports.preferences`, and return
  it in the presenters record.

**Bindings:**
- `react-bindings/src/createViewModel.ts` — `UseForceBootAnimationResult`
  (`{ enabled; setEnabled; toggle }`), the `useForceBootAnimation` interface
  member, the `bind(presenters.forceBootAnimation.enabled$, false)` wiring, and
  the hook impl (mirror `usePowerSaver`).
- `solid-bindings/src/createViewModel.ts` — same shape, using `state(...)` /
  `toSignal` as the Solid bindings do.

### 3. UI surface (Preferences dialog, React + Solid)

- `client-react/src/ui/shell/prefs/PreferencesModal.tsx` — destructure
  `useForceBootAnimation` from `useViewModel()` and render a **wired**
  `<PrefToggle>` in the **DISPLAY** column (near "Animated background" /
  "Power saver"):
  - **label:** `Always play boot animation`
  - **description:** `Plays the startup animation even when your system asks for
    reduced motion (e.g. remote desktops / VDI).`
  - **testid:** `pref-toggle-forceBootAnimation`
- `client-solid/src/ui/shell/prefs/PreferencesModal.tsx` — mirror.

`PrefToggle` (`role="switch"`, `aria-checked`, `data-on`, `data-testid`) is
reused unchanged; no CSS-module changes needed for the row itself.

### 4. When it takes effect

The splash paints before the user can open Preferences, so the toggle governs
the **next** boot. Two ways to see it immediately after toggling:
1. Reload the page.
2. The existing account-menu **"⟳ Reboot HUD"** row
   (`BootGatePresenter.reboot()`), which re-raises `visible$`, remounts
   `BootSequence`, and re-reads the flag live.

This will be noted in the boot README so the behaviour isn't mistaken for a bug.

### 5. `@rtc/ui-contract` harness

To let the shared contract spec assert the toggle against both frameworks:
- `shared/harness/world.ts` — `CommandLog.forceBootAnimationSets: boolean[]`,
  `World.forceBootAnimation: BehaviorSubject<boolean>`, `createWorld`
  `forceBootAnimationSeed?` param + subject init + record + command-log init.
- `shared/mount.ts` — `MountOptions.forceBootAnimation?`, threaded into
  `createWorld`.
- `shared/pages/shell/prefs/PreferencesModalPage.ts` — page-object accessors
  `forceBootAnimationOn()`, `toggleForceBootAnimation()`,
  `forceBootAnimationSets()` (mirroring the power-saver accessors).
- Both `viewModelFromWorld.ts` test seams (`client-react/tests/...` +
  `client-solid/tests/...`) — a `useForceBootAnimation` impl that reads
  `world.forceBootAnimation` and logs writes to
  `world.commands.forceBootAnimationSets`.
- Spec: extend `specs/shell/prefs/PreferencesModal.contract.spec.ts` with a case
  — the DISPLAY-column toggle reflects the preference and writes it on toggle.

## Error handling

No new failure modes. Preference reads fall back to `false` on
missing/invalid/throwing storage (existing `readBool` semantics); all streams
are replay-current, so there is no UI flash. When forced, the untouched `!ctx`
guard still degrades gracefully to chrome-only if no 2D context exists.

## Testing

- **Domain unit:** `PreferencesSimulator` seed/stream/set for
  `forceBootAnimation`; `preferences.ts` default const.
- **Domain contract:** three `PreferencesPortContract` cases (above), which run
  against the simulator and both LocalStorage adapters.
- **Adapter contract:** react + solid `preferences.contract.test.ts`
  round-trip under the new storage key; RN adapter test in its existing style.
- **client-core unit:** `ForceBootAnimationPresenter` test (mirror of
  `AnimatedBackgroundPresenter.test.ts`).
- **Bindings:** Solid `createViewModel.streams.test.tsx` —
  "useForceBootAnimation defaults off and toggle() flips it". React is covered
  via `@rtc/ui-contract` (matching how power-saver is covered).
- **ui-contract spec:** the PreferencesModal toggle case (above), which runs
  against **both** React and Solid via the swap-trio.
- **BootSequence jsdom test:** with the force flag ON and `matchMedia(reduce)`
  stubbed true, assert the reduced-motion-neutralising attribute
  (`data-force-anim="true"`) is present on `.boot` (jsdom has no 2D context, so
  the observable is the attribute, not pixels). With the flag OFF, assert it is
  absent.
- **e2e (Playwright) — the real proof:** a spec that emulates
  `prefers-reduced-motion: reduce`, sets `forceBootAnimation`, and asserts the
  boot canvas is **rendered** (not `display:none`). Runs against both React and
  Solid. A companion assertion confirms that with the pref OFF under emulated
  reduced-motion, the canvas is hidden (current behaviour preserved).
  *Enabler:* the boot splash is normally suppressed under `navigator.webdriver`,
  so this adds a symmetric **`?splash` force-on** override to `bootSplashGate.ts`
  (mirroring the existing `?nosplash` force-off) that the e2e drives via
  `/?splash` — pre-auth, so it runs identically on both clients.
- **No visual goldens:** default-off preserves current output; a
  forced-animation golden would be time-based and flaky, so none is added.

## Acceptance criteria

1. With `prefers-reduced-motion: reduce` emulated and `forceBootAnimation` OFF,
   the boot splash renders chrome only (unchanged current behaviour).
2. With the same emulation and `forceBootAnimation` ON, the boot `<canvas>`
   renders and animates (asserted as: not `display:none`, rAF loop entered),
   dismissing via the normal opacity transition.
3. The preference persists across reload and is exposed as a wired DISPLAY-column
   toggle (`pref-toggle-forceBootAnimation`) in both the React and Solid
   Preferences dialogs.
4. The same `@rtc/ui-contract` PreferencesModal spec passes against both React
   and Solid.
5. Full gauntlet green; no golden regeneration.

## Documentation

- `packages/client-react/src/ui/shell/boot/README.md` (and the Solid twin, if it
  has one) gains a short note: the two suppression gates, the
  `forceBootAnimation` override, that it takes effect next boot / via Reboot HUD,
  and the `!ctx` hard floor it cannot override.
