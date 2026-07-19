# RN visual-tier bake-off

Three candidate tiers were evaluated for on-device iOS visual verification of
`@rtc/client-react-native`, all sharing one harness (`VisualScenarioHost` +
the `__visual/<id>` dev-only route) and one diff core (`shared/diff.ts`,
`pixelmatch`, 6% mismatched-pixel tolerance). This records what each tier is,
how it scored, and the recommendation.

All three drive the **same** isolated scenarios and compare against the **same**
committed goldens under `__screenshots__/<pin>/<tier>/`; they differ only in how
they navigate the device and take the shot. Measured on the pinned device
`ios-iphone17-26` (iPhone 17 / iOS 26.x). **Never CI** — iOS pixels need a Mac.

## Scoreboard

| Dimension | simctl | Maestro | owl |
|---|---|---|---|
| **Viable on this stack** | ✅ yes | ✅ yes | ❌ **no** |
| Extra tooling | `idb` | Maestro 2.6.1 + **JDK 17** | native `ios/` build + `owl` |
| Harness LOC | ~200 (`capture.ts`+`run.ts`) | ~230 (`generateFlows.ts`+`run.ts`+3 flows) | ~10 config + 1 test (never ran) |
| Wall-clock, 3 scenarios | ~35 s | ~30 s | — (never built) |
| Navigation | blind `idb` taps at fixed points | **a11y tree** (XCUITest) element waits | — |
| Dialog dismissal | blind tap `(274, 474)` | queries `"Open"` in the tree, taps it | — |
| Ready signal | fixed settle delay (2.5 s) | asserts `visual-ready` a11y id | — |
| Self-reproduces | 0.00 / 0.00 / 0.02% | 0.03% all three | — |
| Caught blatant paint bug | ✅ 67.92% | ✅ 67.92% | — |
| Android-portable | ❌ Apple-only | ✅ cross-platform | ❌ (owl is iOS/Android but dead here) |
| Device-pin coupling | **high** (re-measure tap px per pin) | low (a11y ids are pin-agnostic) | — |

## simctl — `xcrun simctl` + `idb`

The lightest tier and the current base. `simctl/capture.ts` opens the dev
client at the Metro base URL, waits a fixed delay, deep-links the release
scheme `rtcmobile://__visual/<id>`, dismisses the iOS "Open in RTC Mobile?"
dialog with a **blind `idb` tap at fixed points**, waits a fixed settle, and
`simctl io screenshot`s. Fewest dependencies (`idb` only), works today, and
self-reproduces at 0.00–0.02%.

Its weakness is the blind tap: the "Open" button coordinates are device-pin
specific (`(274, 474)` points on iPhone 17; the old iPhone-15 pin used
`(264, 469)`), so every device re-pin must re-measure them, and `simctl`/`idb`
cannot query the a11y tree to know when the scenario is actually ready — it
waits a fixed 2.5 s. Apple-only.

## Maestro — `maestro test` (XCUITest driver)

The more robust tier, viable after a flow-ordering fix made in this workstream.
Flows are generated (`generateFlows.ts`) per scenario and drive the identical
two-step deep link, but via Maestro's a11y-aware primitives: after loading the
Metro base it waits for the `login-screen` boot marker, deep-links the scenario,
dismisses the "Open" dialog by **finding it in the accessibility tree** (no blind
tap), and `extendedWaitUntil`s the harness's `visual-ready` id before shooting.
No fixed coordinates, no fixed settle — the assertions make it pin-agnostic and
less flaky, and Maestro is **cross-platform** (the same flows would drive
Android). Costs a JDK 17 + Maestro install and flow regeneration when
`SCENARIO_IDS` changes.

> **Fix applied here:** the generated flow previously waited for `visual-ready`
> *before* the scenario deep link, so all three flows timed out on the
> LoginScreen (where `visual-ready` does not exist) — no goldens were ever
> produced. Reordered to wait on the `login-screen` boot marker first, then
> deep-link, then `visual-ready`. Maestro then captures + self-reproduces at
> 0.03%.

## owl — `react-native-owl` — NOT VIABLE on this stack

owl needs a native Debug build of an instrumented app and produced **no**
goldens. Three stacking blockers, decisive:

1. **buildCommand can't carry the harness flag.** owl 1.5.0 `spawn`s the
   configured `buildCommand` as a *single executable*, so
   `"EXPO_PUBLIC_VISUAL_HARNESS=1 xcodebuild"` is looked up as a binary literally
   named `EXPO_PUBLIC_VISUAL_HARNESS=1` → `ENOENT`. The flag the harness needs
   cannot even reach the build without a wrapper script.
2. **No native project to build.** A fresh checkout has no `ios/` Xcode
   workspace (Expo prebuild output is gitignored), so `owl build` has nothing
   to compile.
3. **Version / architecture gap.** owl 1.5.0 peers `react: "^17 || ^18"` (this
   app is React 19) and ships an old-bridge native screenshot module, while RN
   0.86 defaults to the **new architecture**. Even past (1) and (2), the native
   module is unlikely to link.

owl would need a new-architecture-capable fork (or a React downgrade) to be
viable here. Recorded as a decisive finding, not a failure — the `owl.config.json`
is kept for documentation.

## Findings from the injected-paint-bug proof

The tiers were validated against a deliberately introduced regression (PR #147's
`overflow: "hidden"` shadow-clip on `SurfaceCard`, then a blatant magenta card
background), captures NOT regenerated:

- **Detection works.** A blatant paint change (magenta `SurfaceCard` bg) failed
  `blotter/seeded` at **67.92%** on *both* viable tiers, far above the 6%
  tolerance; the two non-`SurfaceCard` scenarios stayed green. The diff core and
  both capture paths reliably catch a visible regression.
- **Coverage gap worth noting.** The *specific* #147 shadow-clip was **not**
  caught (0.04%, passes). The only `SurfaceCard`-bearing scenario
  (`blotter/seeded`, `holo3d`) renders the card **full-bleed**, so its drop
  shadow is off-screen / imperceptible on the dark background and clipping it
  moves fewer than 6% of pixels. **Recommendation:** add an inset 3D-skin card
  scenario on a contrasting background to guard the shadow-clip regression class
  — a self-reproducing suite can otherwise look healthy while blind to the exact
  bug class it was built for.

## Known capture artifacts (non-blocking)

- **Status-bar clock** overlaps the top row of full-bleed shots. It changes
  between capture and verify but stays within the 6% tolerance (self-repro
  0.00–0.03%); noted, not fought.
- **Expo dev-tools gear** is baked into dev-build shots. It is deterministic
  (always present in the same spot), so it does not break reproduction.

## Recommendation

- **simctl** — keep as the zero-JDK base tier; it works today with the fewest
  dependencies. Accept the blind-tap re-measurement cost on device re-pins.
- **Maestro** — the more robust choice and the one to grow: a11y-based waits
  (pin-agnostic, less flaky) and a path to Android. Worth its JDK 17 dependency.
- **owl** — not viable on SDK 57 / RN 0.86 / React 19 / new-arch; do not invest
  without a new-architecture-capable fork.
- **Next** — add an inset-3D-card scenario so the suite can actually catch the
  #147 shadow-clip class.
