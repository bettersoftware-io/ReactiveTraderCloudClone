# RN visual-tier bake-off

Three candidate tiers were evaluated for on-device iOS visual verification of
`@rtc/client-react-native`, all sharing one harness (`VisualScenarioHost` +
the `__visual/<id>` dev-only route) and one diff core (`shared/diff.ts`,
`pixelmatch`, 6% mismatched-pixel tolerance). This records what each tier is,
how it scored, and where the comparison currently stands.

All three drive the **same** isolated scenarios and compare against the **same**
committed goldens under `__screenshots__/<pin>/<tier>/`; they differ only in how
they navigate the device and take the shot. Measured on the pinned device
`ios-iphone17-26` (iPhone 17 / iOS 26.x). **Never CI** — iOS pixels need a Mac.

## Status: UNFINISHED, not decided (as of 2026-08-06)

**No tier has been chosen, because no two tiers have been compared at
comparable coverage.** Read every conclusion below against its evidentiary
base:

| | what was actually measured |
|---|---|
| Scenarios | **3** of the 18 that exist today (`blotter/seeded`, `shell/appearance`, `shell/connection-banner`) |
| Devices | 1 (`ios-iphone17-26`) |
| Platforms | iOS only — **no Android run at all**, though Maestro's whole case is that it is cross-platform |
| Duration | a single sitting, not sustained use |
| Regressions caught | 1 injected paint bug, plus 1 real regression the suite **missed** (#147) |

That is a **viability spike** — enough to establish which tiers can run here,
and nothing like enough to rank them. The contrast worth holding onto is the
web suite's Playwright-vs-Cypress bake-off, which ran both frameworks over the
same specs for months before Cypress was retired
([`docs/test-bakeoff-outcome.md`](../../../../docs/test-bakeoff-outcome.md));
that is what a decision's worth of evidence looks like.

Meanwhile the golden sets are lopsided — **simctl has all 18, Maestro has the
3 from the spike, owl has none** — so the tiers cannot be compared even in
principle right now. Running the Maestro tier today reports **15 failures at
100%**, because `compareToGolden` returns `ratio: 1` for an absent golden
rather than throwing; that is a missing baseline, not a regression.

**Deliberately not fixed yet.** Capturing the other 15 Maestro goldens would
mean re-capturing them on every visual-fidelity change still in flight — churn,
not a baseline. The plan is to finish the comparison **after the mobile UI's
visual fidelity settles**: capture all tiers at full coverage at that point,
then decide. Until then all three stay on the table and nothing is retired.

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
| Goldens committed | **18** (all scenarios) | **3** (the spike's sample) | 0 |
| Runner pins the device | ✅ `RTC_VISUAL_UDID` (default `booted`) | ❌ **none** — Maestro picks | — |
| Runnable on this Mac today | ✅ | ✅ **since 2026-08-08** (openjdk@21) | ❌ |
| Dev-menu gear hidden | ✅ since 2026-08-05 | ❌ still in all 3 goldens | — |

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

### Trap: the Maestro runner pins no device

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
Apple-only problem, and will land on the Maestro tier the moment it drives an
Android emulator.

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

1. **Pin Maestro's device** — resolve the UDID and pass it to `maestro test`.
   Closes the wrong-device hazard and hands the runner the identifier
   `hideDevMenuFab` needs.
2. ~~**Install a JDK**~~ — **DONE 2026-08-08**, `openjdk@21`. See the floor-vs-pin
   section above for why 21 and not the newest.
3. **Capture every tier at full scenario coverage, then judge** — once the
   mobile UI's visual fidelity has stabilised, so goldens are captured against
   a UI that has stopped moving. Compare on wall-clock, flake rate across
   repeated runs, and what each tier catches — *not* on the spike's numbers.
4. **Add an inset-3D-card scenario** so the suite can actually catch the #147
   shadow-clip class (see the injected-bug findings above). This is a gap in
   the *scenario matrix*, and it handicaps every tier equally — worth closing
   before the comparison, so all three are judged on a matrix that can catch
   the bug class the suite was built for.

Tracked in [`docs/rn-open-items.md`](../../../../docs/rn-open-items.md) and
[`docs/STATUS.md`](../../../../docs/STATUS.md).
