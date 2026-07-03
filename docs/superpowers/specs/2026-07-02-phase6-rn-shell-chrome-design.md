# Phase 6 — React Native Shell Chrome (boot / lock) · Design

**Status:** Approved (2026-07-02)
**Workstream:** `@rtc/client-react-native` (RN/Expo client) — Phase 6
**Predecessor:** Phase 5 (theming skin × mode, PR #92 `ac106600`)
**Spec home:** this file · **Roadmap line:** `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md` §Phasing ("shell chrome (boot / lock)")

---

## 1. Goal

Bring the web client's two shell-chrome overlays — the **boot sequence** splash and
the **session lock** screen — to the React Native client, so a colleague on the phone
sees the app boot with a branded splash on cold start and can lock/unlock the session.
Both features already own a framework-neutral state brain in `client-core`; Phase 6
adds **only the RN paint layer**, making it another showcase of the clean-arch reuse
seam — the RN app inherits the whole boot/lock brain and supplies only the pixels.

## 2. Architecture — a pure View phase

The boot and lock **state already exists and is framework-neutral**. Phase 6 adds
**only RN leaves + shell wiring**. No changes to `domain`, `client-core`,
`react-bindings`, or the web client.

```
domain          BootVariant                                                        REUSED
client-core     BootSequenceMachine (timer ramp + skip + variant cycle) ·
                BootPreferencePresenter (persisted variant) ·
                SessionPresenter (locked$ + static DEMO_USER, lock/unlock)          REUSED
react-bindings  useBootSequence(onDone) {state:{variant,progress,done}, skip} ·
                useSession() {state:{locked,user}, lock, unlock}                    REUSED
RN AsyncStorage AsyncStoragePreferencesAdapter already persists bootVariant         REUSED
──────────────────────────────────────────────────────────────────────────────────
RN (NEW)        BootGate · BootSequence · BootEmblem (react-native-svg) ·
                LockScreen · BiometricLine · LockButton · bootSplashGate ·
                _layout wiring (boot gate above sim-toggle + lock overlay)
```

This mirrors how the web paints. The web's `BootSequence` reads `useBootSequence`
and drives a `<canvas>` 2-D animation; its `LockScreen` reads `useSession` and draws
an inline-SVG hex emblem. RN cannot use `<canvas>` or CSS, but it consumes the **same
two ViewModel hooks**, so the reused seam is identical — only the paint layer differs.

### The reused seams (verbatim, no changes)

| Seam | Shape | Source (unchanged) |
|---|---|---|
| `useBootSequence(onDone)` | `{ state: { variant, progress, done }, skip }` | `BootSequenceMachine` + `BootPreferencePresenter` |
| `useSession()` | `{ state: { locked, user }, lock, unlock }` | `SessionPresenter` (`DEMO_USER`) |

- `BootSequenceMachine` is pure RxJS: a `timer(0, 90ms)`-driven progress ramp to 100%
  over `BOOT_DURATION_MS = 4200`, a `skip$` Subject that jumps to done, and it advances
  the persisted `BootVariant` (`core` → `laser` → `docking` → …) one step at construction
  via the `PreferencesPort`. `onDone` fires exactly once when `done` lands. All of this
  is reused with **zero** changes.
- `SessionPresenter` models `locked$` as a `BehaviorSubject<boolean>` paired with the
  static `DEMO_USER` (`Anthony Stark` / `AS` / `Senior FX Trader` / `TRD-0042`).
  `lock()` and `unlock()` are genuinely wired; only the biometric readout in the view
  is decorative. Reused with **zero** changes.

## 3. The one real porting decision — the boot graphic

The web boot splash paints a `<canvas>` 2-D animation (`bootCanvas.ts`: `core` globe /
`laser` / `docking` draws using `CanvasRenderingContext2D`). Canvas/GL is **DOM-coupled
and Expo-Go-incompatible** — the roadmap's standing constraint is "stay Expo-Go-safe, no
custom native modules" — so the pixels are **not** ported. The reusable part is the
*machine* (progress ramp + skip + variant); the graphic is replaced with an RN-native
substitute.

**Decision: a `react-native-svg` emblem.** `react-native-svg` (`15.15.3`) is already a
dependency (analytics uses it), and the lock screen's hex emblem is already pure SVG, so
the idiom ports cleanly. `BootEmblem` is a single themed SVG emblem with an `Animated`
pulse/rotate loop (native-driver), reducing to a static emblem under reduce-motion. It is
**not** three distinct animations — see §7.

## 4. Components (new RN leaves under `src/ui/shell/`, mirroring the web tree)

| File | Responsibility |
|---|---|
| `boot/BootGate.tsx` | Overlay host. Renders `BootSequence` on top of the app until the machine reports `done`; on done runs one `Animated` opacity→0 fade and, in the completion callback, lifts `bootDone` to unmount the overlay. Reduce-motion → jump-cut (no fade). App mounts underneath immediately so streams warm during boot (faithful to web's `BootGate`). |
| `boot/BootSequence.tsx` | Consumes `useBootSequence(onDone)`. Renders `<BootEmblem variant>` + wordmark `REACTIVE TRADER` + subtitle `TACTICAL TRADING OPERATING SYSTEM · v4.0` + a variant tag (`SEQUENCE · CORE`) + a progress bar with `{progress}%` + a `SKIP ▸` pressable wired to `skip`. Themed via `useThemedStyles`. |
| `boot/BootEmblem.tsx` | `react-native-svg` hex emblem with an `Animated` pulse/rotate loop (native-driver); static under reduce-motion. Accent colours from the theme tokens. |
| `lock/LockScreen.tsx` | Consumes `useSession()`. Renders `null` unless `state.locked`. When locked, an **absolute-fill `<View>` overlay** (inset 0, high `zIndex` — **not** an RN `Modal`) covering toolbar + tabs + tab bar: hex emblem (`react-native-svg`), `SESSION LOCKED`, subtitle `REACTIVE TRADER OS · {user.id}`, avatar hex with `{user.initials}`, `{user.name}`, `{user.role}`, an `AUTHENTICATE ▸` pressable wired to `unlock`, and `<BiometricLine>`. Themed. |
| `lock/BiometricLine.tsx` | Decorative-only: a row of on/off status dots + `BIOMETRIC · ENCRYPTED CHANNEL`. No port behind it (matches the web's explicitly-decorative component). |
| `lock/LockButton.tsx` | Toolbar pressable → `useSession().lock()`. |
| `app/bootSplashGate.ts` | `shouldPlayBootSplash(): boolean` in the composition/app layer. Returns `true` now; a single seam for a future e2e/Maestro suppress (mirrors web's `bootSplashGate.ts` structure without the browser-specific `navigator.webdriver` / `?nosplash` checks). |

Modified: `app/_layout.tsx` — see §5.

## 5. Placement & data flow

- **Boot gate lives above the simulator `key`-remount.** `RootLayout` already owns the
  `useAppFonts()` first-paint gate and the `simulator` state that re-mounts `AppRoot` via
  a React `key`. Phase 6 adds a `bootDone` state to `RootLayout`. The `BootGate` overlay
  renders **inside** `AppRoot` + `ThemeProvider` (it needs the ViewModel and theme), but
  whether the splash renders keys off `bootDone` held in `RootLayout` — **so toggling the
  Simulator switch does not replay the splash** (that toggle only remounts `AppRoot`, not
  `RootLayout`). The splash plays once per cold start, gated by `shouldPlayBootSplash()`,
  and is dismissible via `SKIP`.
- **Fade-out via Animated callback.** On the machine's `onDone`, `BootGate` starts one
  `Animated.timing` opacity→0; its completion callback flips `bootDone`. (The web juggles a
  CSS `transitionend`; RN's Animated completion callback is exact and simpler.)
- **Lock overlay** renders inside `Chrome` as an absolute-fill sibling on top of the
  `Tabs`. When `state.locked` it covers the whole shell (toolbar + tabs + tab bar).
  `LockButton` in the toolbar (beside the Simulator switch) calls `lock()`; `AUTHENTICATE`
  calls `unlock()`. RN has no header `AccountMenu`, so the toolbar is the lock affordance.

```
RootLayout (owns simulator + fontsLoaded + bootDone)
  SafeAreaView
    AppRoot key={sim|live}              ← ViewModelProvider (one composition/WS)
      ThemeProvider                     ← one resolved skin×mode
        Chrome
          toolbar: [Simulator switch] [LockButton]
          ConnectionBanner
          Tabs (Rates / Blotter / Analytics / Appearance)
          LockScreen                    ← absolute-fill overlay when locked
        BootGate (renders only while shouldPlayBootSplash() && !bootDone)
          BootSequence → BootEmblem
```

## 6. Testing (jest-expo island, RNTL 14 — all interactions `await`ed)

New `.test.tsx` files run under **jest-expo** (RNTL 14: `render` / `fireEvent.press` are
async and must be `await`ed; the typed ESLint config's `no-floating-promises` enforces it).
Driven by a fake ViewModel through the existing `renderWithTheme` helper.

- **`BootSequence`**: renders the wordmark and `{progress}%`; the variant tag reflects
  `state.variant`; `SKIP` press calls the `skip` intent; when `state.done` is true the
  `onDone` callback fires.
- **`BootGate`**: shows the splash while `!done`; unmounts the overlay after `onDone`.
- **`LockScreen`**: renders nothing when `!locked`; shows the identity (`SESSION LOCKED`,
  name, role, id) and `AUTHENTICATE` when `locked`; `AUTHENTICATE` press calls `unlock`.
- **`LockButton`**: press calls `lock`.
- **`BiometricLine`**: renders the decorative row.

Pure-TS units (`bootSplashGate`) run under the vitest node island (`.test.ts`) and must
stay `react-native`-free.

No new visual goldens (RN visual baselines remain deferred per the roadmap). No
`.feature` / Maestro e2e this phase (deferred to the roadmap's Phase 3–4 e2e fold-in,
which the mobile workstream has been sequencing after feature parity).

## 7. Decisions & non-goals

**Single emblem, variant surfaced as a tag.** The machine cycles `BootVariant` per run
through the persisted `PreferencesPort`. Rather than build three distinct RN animations
(the web's `core`/`laser`/`docking` are three separate canvas draws), Phase 6 renders one
`BootEmblem` and surfaces the current variant as a small text tag (`SEQUENCE · CORE`).
This keeps the machine's variant-cycling genuinely wired to the view — and unit-assertable
— at YAGNI cost.

**`LockScreen` is an absolute-fill `View`, not an RN `Modal`.** Banked lesson: an RN
`Modal` opened via a press segfaults under x86 jest. An absolutely-positioned full-screen
`View` (inset 0, high `zIndex`) achieves the same full-screen overlay without the trap.

**Non-goals:**
- No canvas / Skia / expo-gl (Expo-Go constraint).
- No real auth — the lock uses the static `DEMO_USER`, exactly as the web does.
- No three distinct boot animations (one emblem + variant tag).
- No header `AccountMenu` chip (the toolbar carries the lock control).
- No Maestro e2e or RN visual baselines this phase.
- Zero changes to `domain` / `client-core` / `react-bindings` / web client.
