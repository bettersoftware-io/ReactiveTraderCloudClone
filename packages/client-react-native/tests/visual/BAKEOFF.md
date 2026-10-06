# RN visual-tier bake-off

Three candidate tiers were evaluated for on-device iOS visual verification of
`@rtc/client-react-native`, all sharing one harness (`VisualScenarioHost` +
the `__visual/<id>` dev-only route) and one diff core (`shared/diff.ts`,
`pixelmatch`; the bar is exact reproduction since 2026-08, 6% during the
original spike). This records what each tier is,
how it scored, and where the comparison currently stands.

All three drive the **same** isolated scenarios and compare against the **same**
committed goldens under `__screenshots__/<pin>/<tier>/`; they differ only in how
they navigate the device and take the shot. Measured on the pinned device
`ios-iphone17-26` (iPhone 17 / iOS 26.x). **Never CI** — iOS pixels need a Mac.

## Status: the iOS comparison is DONE at full coverage; Android is verified (2026-10-06)

The gate this file used to name — the mobile UI's visual fidelity settling —
lifted on 2026-10-04 (all 12 skins signed off), so both viable tiers were
captured at full coverage and measured on the same day, the same simulator and
the same commit.

| | what was measured |
|---|---|
| Scenarios | **all 26**, on both tiers |
| Devices | 1 (`ios-iphone17-26`) |
| Platforms | iOS for the comparison; Android since 2026-10-06, Maestro only — see "The Android leg" below |
| Repetitions | **5 full runs per tier** (130 scenario runs each), back to back |
| Regressions | 1 injected (the #147 shadow-clip), run once through each tier |

### Results

| | simctl | Maestro |
|---|---|---|
| Scenario runs passing | 130 / 130 | 130 / 130 |
| Worst diff across all runs | 0.0000% | 0.0000% |
| Aborted runs | 0 | 0 |
| App crashes | 0 | 0 |
| Wall-clock per full run | **175–181 s** (~6.8 s a scenario) | **488–495 s** (~18.8 s a scenario) |

Both tiers reproduce their goldens exactly. **Maestro takes 2.8× as long**,
because every flow cold-launches the app (see the `stopApp` note in the README:
a warm relaunch crashes the app under Maestro's accessibility query).

**The two tiers agree on what the app renders.** Comparing each Maestro golden
to the simctl golden of the same scenario: **21 of 26 are pixel-identical**, and
the other five (`shell/connection-banner`, `boot/core`, `boot/laser`,
`boot/docking`, `boot/topo`) differ only under the device mask — the Dynamic
Island and rounded corners that simctl's `--mask=black` paints and Maestro's
screenshot does not. The differing pixels are app content showing through
there (a light background, a laser line crossing the island), not a different
render.

**Both catch the #147 shadow-clip — the regression the spike's suite missed.**
With `overflow: "hidden"` re-injected on `SurfaceCard`, both tiers failed the
same four scenarios (`analytics/dashboard`, `credit/rfq-tiles`,
`credit/sell-side`, `equities/trade`) at **0.0002%–0.0011%** of pixels. That is
catchable only because the bar is now exact reproduction; under the spike's 6%
tolerance every one of them would have passed.

### Incidents — the flake evidence

Neither tier flaked inside the five measured runs. Across the two days of this
session, counting every full run:

- **simctl, 8 full runs: 3 incidents.** One run aborted when
  `idb ui describe-all` timed out. Twice `credit/new-rfq` failed at **0.1147%**
  — the identical figure both times, once on a clean tree and once during the
  injected-bug run (where Maestro passed that scenario), and it passed at
  0.0000% on immediate re-runs. An identical ratio means one specific alternate
  frame, not noise: simctl shoots after a fixed settle delay, and that scenario
  is evidently sometimes not settled. **Not diagnosed.**
- **Maestro, 9 full runs since the `stopApp` fix: 0 incidents.** Before that
  fix it failed every other flow (see the README).

Small numbers, so read them as a direction, not a rate: the one tier that
waits for a ready marker has had no capture-side incident, and the one that
waits a fixed time has.

### What this does and does not settle

It settles the iOS question the spike could not: both tiers are viable at full
coverage, they agree pixel for pixel, and both catch the bug class the suite
exists for. simctl is faster; Maestro is steadier and is the only route to
Android.

### The Android leg: Maestro runs there, as steadily as on iOS once the emulator is headless (2026-10-06)

The same 26 flows now drive an Android emulator (Pixel 10a, API 37, a local
debug build from `expo run:android`) and a golden set is committed under
`android-pixel10a-37/maestro/`. `simctl` has no Android counterpart, so this
set has no second tier to agree with — it was accepted by eye.

| | measured |
|---|---|
| Scenarios captured | 26 / 26 |
| Verification runs, emulator started with `-no-window` | 6 of 6 complete |
| Scenario runs passing in those six | 156 / 156, every one at 0.0000% |
| Time per run | 175–202 s (iOS Maestro: ~8 min 10 s) |
| App crashes at launch | 1 in about 280 launches (see below) |

**The first verification was wrong about its own cause.** It was taken with
the emulator in a window, produced 51 of 52 passes and one run with three
errored flows, took 21–27 minutes a run, and was put down to "a heavily loaded
machine". Repeating it showed the load was the symptom. What was found:

- **A windowed emulator is throttled by macOS once its window is covered.**
  Two runs passed in about four minutes each; partway through the fourth, each
  flow went from 8 s to 50 s between one flow and the next. The host was idle
  apart from the emulator. `ps` showed the emulator process at priority 4 with
  every thread throttled, where its siblings from the same shell sat at 31:
  App Nap's background class. A shell loop inside the guest took 10.4 s
  throttled and 3.5 s not. In that state launches time out against the
  two-minute wait and Android reports the app as not responding (an ANR after
  18 s on the main thread). Started with `-no-window` the emulator is a plain
  process App Nap never touches: priority stayed at 56 through six runs, and it
  renders the same pixels — all six runs matched goldens captured with a
  window. The runner now warns when the emulator it drives has one
  (`shared/emulatorWindow.ts`).
- **`equities/trade`'s 0.1070% frame was a frame still settling.** The harness
  raises `visual-ready` one frame after fonts load, but this scene needs a few
  more: the Skia candle chart draws at its first size before its final layout,
  and the skin's frame lines are still being drawn. At normal speed the scene
  matches its golden within 0.44 s of the scenario link opening, and Maestro
  shoots 0.92–2.53 s after it (median 1.13 s over 26 flows), so the shot lands
  on the settled frame. With the emulator throttled on purpose (`taskpolicy
  -b`, the same class App Nap uses) a burst of screenshots found an unsettled
  frame about two seconds in, 5 times out of 5, scoring 0.4119% (once
  0.4110%). The exact 0.1070% was not reproduced — the burst samples about
  0.6 s apart — so this is the mechanism, not that frame. What remains is that
  the marker precedes the settled frame and only Maestro's own latency covers
  the gap.
- **Android scroll indicators are not the cause, though they do vary.** A
  scroll view flashes its indicator when it appears and fades it about two
  seconds later, so `rates/ticket` and `shell/appearance` each have two
  distinct frames across runs: a strip 11 px wide on the right edge. Its
  pixels differ from the golden by 1–2 in 255, below the comparison's
  per-pixel threshold, so both frames score 0.0000%.
- **One real crash, independent of all that.** Once in about 280 launches the
  app died about four seconds after the dev client recreated its activity:
  `SIGSEGV` in React Native's `MountingCoordinator::pullTransaction` on the JS
  thread, at a fault address that reads as ASCII text — freed memory reused
  for a string. Nothing relaunches the app, so the flow waited two minutes on
  the home screen. It is in React Native's native mounting code on a path only
  a dev build takes; it is not reported upstream. The flows now retry the
  launch once (`retry` around the stop, the link and the wait). Proven by
  killing the app during a launch: the flow passed on its second attempt.
- **One failed flow no longer hides the other 25.** Maestro exits non-zero
  when any flow fails, and the runner used to stop there with a stack trace.
  It now prints Maestro's `[Failed]` lines, scores every scenario that has a
  shot, and reports the rest as `NO SHOT`. It also deletes each scenario's
  shot before the run, so a flow that took none cannot be scored from the
  previous run's file. Proven by killing the app on both attempts of one
  flow: 25 passes, one `NO SHOT`, exit 1.

What Android needed that iOS did not:

- **The ready marker had to move.** `VisualScenarioHost`'s 1x1 `visual-ready`
  view sat at the top-left corner. Android's status bar is a window of its own
  over an edge-to-edge app, and Maestro drops an element wholly under it: the
  marker was in `uiautomator dump` and absent from `maestro hierarchy`, so every
  flow timed out on a ready screen. It now sits halfway down the left edge.
  Both iOS tiers were re-verified after the move.
- **The dev menu opens itself.** Besides the floating gear, expo-dev-menu on
  Android shows its sheet at launch while `showsAtLaunch` is true or
  `isOnboardingFinished` is false — both defaults. The runner writes three
  preferences through `adb shell run-as` and restores the file afterwards
  (`shared/androidDevice.ts`).
- **The status bar is masked, not pinned.** Between two boots of the same
  emulator the clock moved 43 px sideways and the signal glyph changed, which
  failed 25 of 26 scenarios at about 0.05%. System UI's demo mode held the
  clock's text and the battery but neither of those. The top 142 rows are
  painted black on Android (`shared/statusBarMask.ts`); the app's own
  background behind the bar goes with them.
- **`adb reverse`** for the Metro port, so the flows keep one dev-client link.
- **The "Open" tap is iOS-only** in the flows (`when: platform: iOS`).
- A resumed emulator snapshot lost its package service mid-run ("Can't find
  service: package"); a cold boot (`emulator -avd … -no-snapshot`) cured it.
- **No window** (`-no-window`), for the reason above.

It does **not** settle whether to retire a tier. On iOS they now duplicate each
other exactly, so keeping both costs a second set of 26 goldens to re-pin on
every visual change. Retiring simctl leaves the slower tier; retiring Maestro
leaves the one with capture incidents and closes the door on Android. That is a
maintainer decision. The Android leg has now run: Maestro does reach Android,
and with a headless emulator it reproduced its goldens in 156 of 156 scenario
runs — the same result as on iOS, at under half the time per run.

## Scoreboard

| Dimension | simctl | Maestro | owl |
|---|---|---|---|
| **Viable on this stack** | ✅ yes | ✅ yes | ❌ **no** |
| Extra tooling | `idb` | Maestro 2.6.1 + **a JDK ≥ 17** (we use 21) | native `ios/` build + `owl` |
| Harness LOC | ~200 (`capture.ts`+`run.ts`) | ~230 (`generateFlows.ts`+`run.ts`+3 flows) | ~10 config + 1 test (never ran) |
| Wall-clock, 3 scenarios | ~35 s | ~30 s | — (never built) |
| Navigation | blind `idb` taps at fixed points | **a11y tree** (XCUITest) element waits | — |
| Dialog dismissal | blind tap `(274, 474)` | queries `"Open"` in the tree, taps it | — |
| Ready signal | fixed settle delay (2.5 s) | asserts `visual-ready` a11y id | — |
| Self-reproduces | 0.00 / 0.00 / 0.02% | 0.03% all three | — |
| Caught blatant paint bug | ✅ 67.92% | ✅ 67.92% | — |
| Android-portable | ❌ Apple-only | ✅ cross-platform | ❌ (owl is iOS/Android but dead here) |
| Device-pin coupling | **high** (re-measure tap px per pin) | low (a11y ids are pin-agnostic) | — |
| Goldens committed | **26** (all scenarios) | **26** (all scenarios, since 2026-10-05) | 0 |
| Wall-clock, all 26 scenarios | **~177 s** | **~490 s** | — |
| Self-reproduces at full coverage | 130 / 130 at 0.0000% | 130 / 130 at 0.0000% | — |
| Runner pins the device | ✅ `RTC_VISUAL_UDID` (default: the single booted sim) | ✅ **since 2026-10-02** — same variable, passed as `maestro --udid` | — |
| Runnable on this Mac today | ✅ | ✅ **since 2026-08-08** (openjdk@21) | ❌ |
| Dev-menu gear hidden | ✅ since 2026-08-05 | ✅ **since 2026-10-02** (3 goldens re-pinned gear-free) | — |

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
Android). Costs a JDK (≥ 17; see below for which) + Maestro install and flow
regeneration when `SCENARIO_IDS` changes.

> **Fix applied here:** the generated flow previously waited for `visual-ready`
> *before* the scenario deep link, so all three flows timed out on the
> LoginScreen (where `visual-ready` does not exist) — no goldens were ever
> produced. Reordered to wait on the `login-screen` boot marker first, then
> deep-link, then `visual-ready`. Maestro then captures + self-reproduces at
> 0.03%.

### Trap: the Maestro runner pins no device — CLOSED 2026-10-02

**Closed.** `maestro/run.ts` now resolves the UDID exactly as the simctl runner
does (`RTC_VISUAL_UDID`, else the single booted simulator via the shared
`shared/bootedUdid.ts`, refusing to guess between two), passes it as
`maestro --udid`, and brackets the run with `hideDevMenuFab` /
`restoreDevMenuFab`. What follows is the original analysis, kept for the record.

**What closing it showed.** With the gear gone, Maestro's 25 shots were diffed
against the simctl goldens with the tier's own comparator: **20 of 25 match at
0 px**. The other five differ only by the device mask — Maestro's own
screenshot draws neither the Dynamic Island nor the black rounded corners that
simctl's pinned `--mask=black` does — which reads 69,520 px on the one
light-background scenario (`shell/connection-banner`) and 36–1,665 px on four
boot scenes. So the two tiers, which share nothing but the harness, agree on
what the app renders. Before the gear was hidden every scenario was off by a
near-constant ~12,670 px: the gear bubble itself. That is also why each tier
keeps its own golden set: the capture conventions differ, the content does not.

`maestro/run.ts` drives the device with exactly one call —
`exec("maestro", ["test", FLOWS_DIR, "--format", "junit"])` — and Maestro
performs its own device discovery. **The runner never learns which simulator
ran**, and never asserts one.

Its goldens nonetheless live under `__screenshots__/ios-iphone17-26/maestro/`,
a path that claims a specific phone. Nothing enforces that claim: with two
booted simulators, Maestro may shoot the wrong one and the run diffs it against
the pinned baseline anyway. On a device mismatch that surfaces as a large
mismatch ratio (or a dimension mismatch, which `shared/diff.ts` refuses to
absorb) — a confusing failure that names pixels rather than the device.

`simctl` has no such gap: `simctl/run.ts` reads `RTC_VISUAL_UDID` (defaulting to
the `booted` alias) and passes it to every `xcrun` call it makes.

Fixing it also unblocks the dev-menu gear (below): resolving the UDID ourselves
— `xcrun simctl list devices booted` — and handing it to Maestro would pin the
device **and** give the runner the identifier `hideDevMenuFab` needs. One
change, two problems.

### The JDK requirement is a FLOOR of 17, and the right choice is 21

**Resolved 2026-08-08 — `openjdk@21` installed; the tier runs here now.** Until
then it did not, which is the actual reason its golden set stalled at the
spike's 3, rather than any verdict against it. Worth stating plainly: a tier
that silently cannot run looks identical, in a file listing, to one that was
weighed and set aside.

**"JDK 17" was this repo's own mis-transcription.** The launcher check is a
floor, not a pin — `~/.maestro/bin/maestro:250`:

```sh
JAVA_VERSION=$( "$JAVACMD" -classpath "$APP_HOME"/bin/*.jar JvmVersion )
if [ "$JAVA_VERSION" -lt 17 ]; then
  die "ERROR: Java 17 or higher is required.
```

`-lt 17`, and the error string says *"or higher"*. Five files in this repo —
this one included, three lines below a verbatim quote of that string — rendered
it as "install JDK 17", and `ios-visual-spike.yml` then hardcoded
`brew install openjdk@17` from the summary rather than the source.

**So why not the newest JDK?** Measured across the whole installable range,
`maestro --version` on Maestro 2.6.1:

| JDK | starts | warnings |
|---|---|---|
| 1.8.0_501 | ❌ dies on the `-lt 17` check | — |
| **21.0.12** (LTS) | ✅ `2.6.1` | **0** |
| 25.0.4 (LTS) | ✅ `2.6.1` | 4 — jansi calls the restricted `System::load` |
| 26.0.2 (current) | ✅ `2.6.1` | 7 — jansi, **plus** picocli mutating a final field |

Every JDK past 21 adds a *scheduled* breakage to a dependency Maestro bundles,
and both warnings say so in as many words — *"will be blocked in a future
release"*. The picocli one is not cosmetic: picocli is Maestro's **command-line
argument parser** and the mutated field is on `TestCommand`, the class behind
the `maestro test` our runner invokes. When a JDK enforces it, Maestro stops
parsing its own flags.

21 is the newest JDK that runs clean, and it is an LTS. Pick it deliberately,
not by defaulting to `brew install openjdk` — **the unversioned formula floats**,
so it would roll onto the next release the moment one ships, which the table
above says is exactly when this breaks. Always the versioned formula.

## owl — `react-native-owl` — BLOCKED on this stack (unproven, not rejected)

**Nothing here judges owl as a screenshot tool — it never took a screenshot.**
All three blockers below are *compatibility with this stack*: a shell-quoting
detail, a gitignored directory, and a version gap. None of them is evidence
that owl captures worse pixels, navigates worse, or is slower; that comparison
has never been run. Keep the two claims apart, because "not viable" is one
sentence away from being read as "evaluated and rejected", and only the first
is true.

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

Note which blockers are **ours** and which are not. (1) needs a wrapper script;
(2) needs `expo prebuild` to be run (the `ios/` folder is gitignored, not
absent by design) — both are an afternoon. Only (3) is outside our control, and
it is a *wait-for-a-release* problem rather than a permanent one. If a
new-architecture-capable owl ships, this tier becomes assessable again for the
cost of a `pnpm add`.

### The dependency was REMOVED on 2026-07-25 (the config stays)

The finding above stood, but the npm package kept being installed — and a
package that cannot execute still has a supply chain. `react-native-owl@1.5.0`
was the **sole** source of `ajv@7.2.4` in the whole workspace, which carries a
MEDIUM ReDoS advisory (`$data` option; vulnerable `>=7.0.0-alpha.0 <8.18.0`).
Clearing it by override would have meant forcing a major `ajv` 7 → 8 lift on a
tool that is documented as non-functional here — all risk, no benefit. Removing
the dependency deletes the advisory at its root instead.

Removed: the `react-native-owl` devDependency and `tests/visual/owl/visual.owl.test.ts`
(it imported `takeScreenshot` from the package, and `tsconfig` includes
`**/*.ts`, so it could not survive the dep's removal).

**Kept: `tests/visual/owl/owl.config.json`** — the artifact this section already
promised to keep, plus this write-up. The *evidence* for the owl verdict is prose
and config, neither of which needs the package installed. Nothing was runnable
before the removal and nothing is runnable after it; what changed is that the
workspace no longer ships a vulnerable transitive dep for a dead tier.

To revisit owl (i.e. if a new-arch-capable release lands), re-add the dep and
restore a test from the Tier 3 recipe in
`docs/superpowers/plans/2026-07-17-rn-visual-tiers-followup.md` (Task O).

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
- **Expo dev-tools gear** was baked into dev-build shots. It is deterministic
  (always present in the same spot), so it never broke reproduction — **hidden
  on the `simctl` tier since 2026-08-05, still present in Maestro's 3 goldens.**
  See below; it is the clearest case in this file of an artifact that a
  self-reproducing suite cannot report.

### The dev-menu gear, and how to hide it on every tier

expo-dev-menu mounts a floating action button — a grey `gearshape.fill` bubble
near the top-left — in a `DevMenuFABWindow`, a passthrough `UIWindow` layered
*above* the app. So it drew over the Rates filter chips and the shell header,
and appeared in the a11y tree as though it were ours.

**It survived in all 18 goldens precisely because the tier stayed green.** Same
place every run ⇒ captures reproduced at 0.00% ⇒ nothing to report. A golden
answers *"did this change?"*, never *"is this right?"*, and this is what that
distinction costs: the bubble was harmless to diffing and pure noise to the
corpus's other use — reading these PNGs beside the design prototype's shots to
judge fidelity.

The preference behind it exists on **both** platforms, under the **same key**,
and is reachable two different ways:

| | build-time default | runtime override |
|---|---|---|
| **iOS** | `Info.plist` → `EXDevMenuShowFloatingActionButton` (`DevMenuPreferences.swift:29,49`) | `UserDefaults`, app domain → `xcrun simctl spawn <udid> defaults write` |
| **Android** | `AndroidManifest` meta-data → **same key** (`DevMenuPreferences.kt:73`, fallback `true`) | `SharedPreferences` → `adb shell` |

Android has its own FAB (`MovableFloatingActionButton.kt`) — this is not an
Apple-only problem. `shared/androidDevice.ts` implements the **Android runtime
override** since 2026-10-06, along with the two preferences that stop the menu
opening itself at launch.

`shared/devMenuFab.ts` implements the **iOS runtime override**: written off
before a run, deleted afterwards, best-effort in both directions so a simulator
that refuses the write degrades to a noisier golden rather than a failed run.
That was the right fix to ship, because it works against the dev client we
already have and reverts cleanly for ordinary development.

But note what shape it has: **a per-runner fix**. It is wired into `simctl` and
was silently missed by Maestro, which has no UDID to give it (see the
device-pin trap above) — the same way a fourth tier would miss it. The
**build-time default** is the version no driver can forget: set the key in the
app config and the bubble is off for `simctl`, Maestro, owl and anything
future, on both platforms, with no device identifier involved at all. Its cost
is that it is baked into a binary, so the harness would need its own native
build rather than sharing the everyday dev client (today `EXPO_PUBLIC_VISUAL_HARNESS`
only affects the JS bundle Metro serves). **That is the shape to move to when
the tiers are compared for real.**

## Working position — a division of roles, not a verdict

These were never "winner and losers". They were assigned **roles** on the
evidence available, and the roles still hold:

- **simctl** — the zero-JDK **base** tier: fewest dependencies, works today,
  carries all 18 goldens. Accept the blind-tap re-measurement cost on device
  re-pins.
- **Maestro** — the more robust tier and **the one to grow**: a11y-based waits
  (pin-agnostic, less flaky) and the only path to Android, which `xcrun`-based
  simctl can never take. Worth its JDK dependency.
- **owl** — blocked on SDK 57 / RN 0.86 / React 19 / new-arch; do not invest
  until a new-architecture-capable release exists. Unproven, not outscored.

**Nothing is retired.** Retiring a tier requires the comparison this file says
has not happened, and the Android requirement makes Maestro load-bearing
regardless of how that comparison lands.

## What would finish the comparison

In order. The first is cheap and should not wait; the third is the one gated on
visual fidelity settling.

1. ~~**Pin Maestro's device**~~ — **DONE 2026-10-02**: the runner resolves the
   UDID, passes `maestro --udid`, and hides the dev-menu gear around the run.
2. ~~**Install a JDK**~~ — **DONE 2026-08-08**, `openjdk@21`. See the floor-vs-pin
   section above for why 21 and not the newest.
3. ~~**Capture every tier at full scenario coverage, then judge**~~ — **DONE
   for iOS 2026-10-05**; results in the Status section above. The judgement
   itself (keep both, or retire one) is left to the maintainer.
4. ~~**Add an inset-3D-card scenario**~~ — **DONE**: the matrix now has
   inset-card scenarios, and the #147 shadow-clip is caught by both tiers.
5. ~~**Run the Android leg.**~~ — **DONE 2026-10-06**, results above,
   including the repeat verification (156 / 156 headless) and the cause of
   `equities/trade`'s stray frame. Still open from it: `visual-ready` is raised
   before a scene has settled, and only Maestro's latency covers the gap.
6. **Diagnose simctl's `credit/new-rfq` alternate frame** (0.1147%, twice in 8
   runs) — or replace its fixed settle delay with the `visual-ready` marker
   Maestro already waits for.

Tracked in [`docs/rn-open-items.md`](../../../../docs/rn-open-items.md) and
[`docs/STATUS.md`](../../../../docs/STATUS.md).
