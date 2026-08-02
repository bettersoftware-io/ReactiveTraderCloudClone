# React Native motion: Skia, Reanimated, and the hooks traps between them

How the RN client animates: which of the two libraries owns what, why, and the
failure classes that live on the seam between them. Read this before writing
anything that moves in `@rtc/client-react-native`.

Companion pages: [performance.md](performance.md) is the cross-client rendering
doctrine (only `transform`/`opacity` composite, etc.); [rn-open-items.md](rn-open-items.md)
is the live defect ledger; [adr/ADR-005-ui-logic-placement.md](adr/ADR-005-ui-logic-placement.md)
decides where *logic* lives, this page decides where *motion* lives.

**Last updated: 2026-08-02**

---

## 1. We are on the New Architecture, unconditionally

There is no opt-out and no flag to check. Expo SDK 55 removed `newArchEnabled`
from `ExpoConfig` because Fabric + TurboModules became the only architecture;
`app.config.ts` carries a comment saying so rather than a setting.

Two consequences worth holding on to:

- **Old-Architecture advice on the internet does not apply**, including most
  Reanimated troubleshooting written before 2025. When a symptom looks like a
  known issue, check the date before trusting the remedy.
- **Renderer-level workarounds are gone.** `setNativeProps`, direct view-manager
  pokes, and the various `useNativeDriver` escape hatches either no longer exist
  or no longer mean what they used to. Everything below is written for Fabric.

## 2. The division of labour

Two libraries, and the choice is not a preference — each does something the
other structurally cannot.

| | **`@shopify/react-native-skia`** | **`react-native-reanimated`** |
|---|---|---|
| **What it is** | An immediate-mode 2D drawing surface | A UI-thread animation runtime for RN views |
| **Use it when** | You are **drawing** — geometry that is not a rectangle with a background colour | You are **moving** — a view that exists needs to change position, scale, opacity or colour |
| **In this repo** | boot scenes (all 8), analytics P&L chart, exposure bubbles, equities candles, ambient background | countdown rings, tick flashes, list cascades (`LinearTransition`/`FadeInDown`/`FadeOut`), the accept stamp, the ACCEPT halo, hold-to-unlock |
| **Cannot** | Participate in RN layout, receive touches per-shape, or expose anything to the accessibility tree | Draw a mesh, a path, a gradient sweep, or anything with no view backing it |

**The one-line rule: Skia when you are drawing, Reanimated when you are moving.**

### 2.1 They are not alternatives — they compose

The boot scenes use **both at once**, and this is the shape to copy:

```
Reanimated  useFrameCallback ──> elapsedSec (SharedValue)   ← the CLOCK
                                      │
Skia        useDerivedValue ──────────┘                     ← reads the clock
              └─> createPicture(...)  ← draws the frame
                    └─> <Picture picture={...} />
```

Reanimated supplies **time on the UI thread**; Skia consumes it to **draw a
frame**. Neither library is animating anything by itself — Skia has no
animation primitives here, and Reanimated is not drawing.

That seam is where this repo's worst bugs live (§4).

### 2.2 Two consequences of Skia that keep catching people

- **Skia's canvas is a separate reconciler.** React Context does not cross it.
  `BootCanvas` reads `useTheme()` *outside* the `<Canvas>` and passes the theme
  down as a prop, because a scene calling `useTheme()` itself would get nothing.
- **Skia elements accept no `testID`.** Nothing drawn is visible to RNTL, to
  `idb ui describe-all`, or to Maestro. This is why every drawing decision is
  pushed into pure modules (`buildBubbleDrawModel`, `buildChart`,
  `rfqRingVm`) and asserted there. A "the chart is correct" test asserts the
  *model*, never the pixels — the pixels are the visual tier's job.

### 2.3 When neither applies

Per-frame maths with no framework in it — FLIP deltas, easing curves, ring
circumference — belongs in **`@rtc/motion-core`**, a zero-dependency leaf shared
with both web clients. `ringCircumference`/`ringDashOffset` live there and are
consumed by the RN countdown ring, the RN lock ring and the web clients alike.
See ADR-005.

## 3. Motion is always gated

Every animation in the RN client is gated by `useShellMotionEnabled()` (or
`useBootMotionEnabled()` for boot), which resolves OS reduced-motion **and** the
power-saver tier. When motion is off, render the **static end-state** — except
where the end-state carries no information, in which case render nothing:
`AcceptPulse` returns `null` under Freeze, because a frozen halo is a coloured
smear rather than a hint, while the ACCEPTED stamp holds its landed state
because the word itself is the information.

## 4. Case study: every boot scene was frozen at t=0

The most instructive bug this codebase has produced, because **three separate
layers of tooling all reported success** while the feature was completely
broken, and because React Compiler — which exists to make exactly this class go
away — could not help.

### 4.1 The symptom

Every boot variant drew its first frame forever. The progress bar above it
advanced normally, so the screen looked alive; the reported experience was *"the
animation is stuck, flicking back and forth between the first two frames."*

### 4.2 The cause

`BootCanvas` drove its clock like this:

```tsx
const frameCallback = useFrameCallback((frameInfo) => {
  elapsedSec.value = frameInfo.timeSinceFirstFrame / 1000;
}, false);
```

Reanimated's `useFrameCallback` registers its argument inside an effect keyed on
that argument:

```js
useEffect(() => {
  ref.current.callbackId = frameCallbackRegistry.registerFrameCallback(callback);
  return () => { frameCallbackRegistry.unregisterFrameCallback(...); };
}, [callback, autostart]);          // ← the trap
```

An inline arrow is a **new identity on every render**. So every render
unregistered and re-registered the callback, and re-registration **restarts
`timeSinceFirstFrame` from zero**. `BootSequence` re-renders on every progress
tick, so `elapsedSec` was reset continuously and never escaped the first frame
or two.

The fix is the `useRef` + `current === null` build-once idiom (ADR-003 bans
`useCallback`), plus an explicit `"worklet"` directive — see §4.5.

### 4.3 Why React Compiler did not save us

This is the part worth internalising. React Compiler memoises *values a
component produces*. It does not, and cannot, know that **a third-party hook has
made its argument's identity load-bearing**. `useFrameCallback`'s contract —
"pass me the same function or I will silently restart your clock" — is invisible
at the call site and unenforced by types: the signature accepts any function,
and every identity is equally well-typed.

Generalised: **React Compiler removes the need for defensive memoisation of your
own values; it does not remove identity as an API surface of other people's
hooks.** Any hook that puts a callback in a dependency array has made identity
part of its contract, and nothing in the toolchain will tell you.

### 4.4 Why every test tier missed it

| tier | why it passed |
|---|---|
| **jest** | `jest.setup.ts` stubs `useFrameCallback` with a no-op that never invokes the callback. There is no clock to be wrong. |
| **the visual goldens** | Boot scenes are captured with a **pinned** `elapsedSec` (`BOOT_SCENE_ELAPSED_SEC`), precisely so a free-running clock can't make a golden flaky. Pinning the clock also hides a broken one. |
| **`pnpm check:worklet-order`** | It gates worklet declaration order and missing directives. Neither was wrong here. |

Three green tiers, one dead feature. **A pinned clock and a stubbed clock cannot
tell you a real clock is broken** — only a device can.

### 4.5 The second trap, inside the fix

Hoisting the callback out of the inline position broke it a different way:

> `[Worklets] Tried to synchronously call a Remote Function. Called "anonymous" on the UI Runtime.`

The Reanimated Babel plugin auto-workletizes the **inline argument** to
`useFrameCallback`. Once the function is stored in a ref it no longer matches
that syntactic shape, so it stayed a plain JS function and the UI runtime threw
on the first frame. **Any function that leaves an auto-workletized position must
be given `"worklet"` explicitly.**

### 4.6 How the measurement kept lying

Three separate measurements said the boot was fine before one said otherwise.
Each failure is reusable:

1. **Screenshot bursts are too slow.** `simctl io screenshot` costs ~1s a frame,
   so a six-frame burst outlasts the whole boot sequence and can sample entirely
   after it ends. Record video and extract frames instead.
2. **"Pixels changed" is not "the scene moved."** The whole-frame diff was
   dominated by the progress bar and telemetry readouts, which advance whatever
   the geometry does. Isolate the region you actually care about.
3. **Change is not progression.** An A-B-A-B oscillation produces the same
   per-frame difference as real advance. Compare frames at increasing *lag*: real
   progression grows monotonically with lag, oscillation collapses on even lags.

What finally worked was the cheapest thing available: three frames a second
apart, side by side, reading `YAW 0.0° / 0.0° / 0.0°`.

### 4.7 The same bug, still open

`useShellTelemetry` passes an inline arrow to `useFrameCallback` too, so its
window start is measured against a clock that keeps resetting — the status strip
has been reporting **302, 485 and 1264 FPS**. Tracked as **T30** in
[rn-open-items.md](rn-open-items.md); the obvious repair trips
`react-hooks/immutability`, which tolerates shared-value writes in an inline
frame callback but not in a hoisted one.

### 4.8 Checklist

Before merging anything that animates in the RN client:

- [ ] Any callback handed to a third-party hook — does that hook put it in a
      dependency array? If so, it must be identity-stable.
- [ ] Any function that left an inline auto-workletized position — does it carry
      `"worklet"`?
- [ ] `pnpm check:worklet-order` clean.
- [ ] Motion gated on `useShellMotionEnabled()` / `useBootMotionEnabled()`, with
      a deliberate decision about static-end-state vs render-nothing.
- [ ] **Run it on the simulator.** For anything time-driven this is not optional:
      jest stubs the clock, and the goldens pin it.
