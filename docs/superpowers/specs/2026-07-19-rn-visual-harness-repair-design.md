# RN Visual-Harness Repair + Path A Completion — Design

**Status:** Design (approved to write). Supersedes the capture-only assumptions of
`docs/superpowers/plans/2026-07-17-rn-visual-tiers-followup.md`, which presumed a
working simctl tier; this spec repairs that foundation first, then completes the
tiers.

## Problem

The RN visual-verification harness cannot capture a scenario in isolation, and
its shipped "goldens" are invalid:

- The `app/__visual/[...id]` route renders `VisualScenarioHost` — which is
  **fully self-contained** (its own `createApp` composition with
  `createSimulatorPorts`, its own `ViewModelProvider`, `AuthSimulator({})`,
  `InMemorySessionStore`, `ThemeProvider`). It needs nothing from the real app.
- But `app/_layout.tsx` (the expo-router **root** layout, which wraps every
  route) nests the whole tree in `AppRoot → ThemeProvider → AuthGate → Chrome
  (toolbar/tabs/ambient/banner) → Tabs`. The `__visual` route is a
  `<Tabs.Screen>` inside that shell.
- Result: deep-linking `rtcmobile://__visual/<id>` on a fresh boot renders the
  **LoginScreen** (AuthGate blocks, unauthenticated) — or, if past auth, the
  scenario buried inside the app chrome. The committed `ios-iphone15-18`
  `blotter/seeded` golden is proof: it shows the full chrome plus the faint
  `visual-not-found` fallback text ("no scenario: blotter/seeded"), not a
  seeded blotter.

Root cause: an isolated host rendered inside the authenticated app shell.

## Goals

1. `__visual/<id>` renders `VisualScenarioHost` as the **top-level** element —
   no `AuthGate`, no `Chrome`, no `Tabs` — deterministic, `visual-ready`-marked.
2. The **real app** (boot splash, auth, five tabs, session resume) is behaviourally
   unchanged.
3. A **security hardening** so removing AuthGate's incidental coverage of
   `__visual` does not create a production footgun.
4. Re-capture valid base **simctl** goldens on the re-pinned `ios-iphone17-26`
   device, then complete the original Path A tiers: **Maestro**, **owl**,
   the **appearance** golden, the **injected-paint-bug** proof, and **BAKEOFF.md**.

Non-goal: changing what `VisualScenarioHost` renders or how the capture drivers
work — both are correct and stay as-is.

## Architecture — route-group restructure

expo-router's root `app/_layout.tsx` wraps *every* route, so the shell must move
out of the root and into a route **group** (`(app)`, path-invisible), leaving
`__visual` as a sibling under a minimal root.

```
app/
  _layout.tsx        → MINIMAL root: GestureHandlerRootView + <Slot/>
  (app)/
    _layout.tsx      → the shell (moved verbatim): fonts-gate + AsyncStorage
                       session hydrate + AppRoot + ThemeProvider + AuthGate +
                       Chrome + BootGate + MotionProbe + <Tabs>
    index.tsx        (moved from app/)
    blotter.tsx      (moved)
    analytics.tsx    (moved)
    credit.tsx       (moved)
    equities.tsx     (moved)
  __visual/
    [...id].tsx      → unchanged content; now under the minimal root only
```

- **URLs are unchanged** — route groups add no path segment. `/blotter`,
  `/__visual/blotter/seeded` resolve exactly as before. Deep-links, the RN e2e,
  and the boot flow keep working.
- `GestureHandlerRootView` stays at the root so both branches (shell and
  harness) get a gesture root.
- `useAppFonts` + `AsyncStorageSessionStore.hydrate()` move into `(app)/_layout`
  (they gate the *app's* first paint; the harness route already gates its own
  fonts + `visual-ready` inside `VisualScenarioHost`).
- Root uses `<Slot/>`; if the group-plus-standalone mix misbehaves under `<Slot/>`,
  fall back to `<Stack screenOptions={{ headerShown: false }}>` — confirm
  empirically (mirrors the harness's "confirm on-device" convention).

### Why this is safe (security analysis)

Moving `AuthGate` from the root into `(app)/_layout` keeps **identical**
enforcement for every real route — they move into `(app)` *with* the gate.
Deep-linking `/blotter` unauthenticated still hits `AuthGate → LoginScreen`.

`__visual` escapes the gate, but it exposes **nothing sensitive**: it renders
only `VisualScenarioHost`, a sandboxed composition on `createSimulatorPorts`
(no WS server, no network), `AuthSimulator({})` (never authenticated), fake
seeded data (`TradeStoreSimulator`'s 5 trades). There is no navigation path
from a scenario leaf back into the real app. So even reaching `__visual`
yields zero real data and zero privilege — worst case is fake demo data.

### Security hardening (defense-in-depth)

Today `AuthGate` *incidentally* also guards `__visual` (it's inside the gated
tree), so a release mis-built with the harness flag would still be blocked by
login. This restructure removes that incidental layer, making the harness gate
the only barrier. Replace it with an explicit, un-flippable one:

- `visualHarnessGate.ts`:
  `return __DEV__ && process.env.EXPO_PUBLIC_VISUAL_HARNESS === "1";`
  `__DEV__` is hard-`false` in any release build regardless of env, so a
  mis-set `EXPO_PUBLIC_VISUAL_HARNESS` can no longer activate the harness in
  production. Two independent conditions; the un-flippable one wins.
- **Test** (locks the property, not convention): with `__DEV__ === false`,
  `visualHarnessEnabled()` returns `false` even when
  `EXPO_PUBLIC_VISUAL_HARNESS === "1"`.
- **Coupling this creates:** the `__DEV__` guard means captures must run against
  **Debug/dev** builds (`__DEV__ === true`). All three tiers already do —
  simctl/Maestro via the Expo dev client, owl via `owl.config.json`
  `configuration: "Debug"`. If a tier is later found to *require* a true Release
  build (e.g. a Maestro fallback), it needs a dedicated build-time constant that
  is still guaranteed off in App-Store/EAS profiles — NOT a relaxation of this
  guard. Flagged, not blocking (no current tier needs it).

## Scenario resolution ("no scenario")

The registry is well-formed today — `SCENARIO_IDS` and `scenarios.tsx` both hold
`blotter/seeded`, `shell/connection-banner`, `shell/appearance`, and
`getScenario` reconstructs the catch-all id correctly. The #232 "no scenario"
was a capture-context artifact (route rendered inside the shell / a stale
bundle), not a registry bug. **Verify empirically** after the restructure that
each scenario renders; no registry change is planned.

## Path A completion (unblocked once the harness renders)

Pin is already re-set to `ios-iphone17-26` (Xcode 26 dropped the iPhone-15
device type); confirm-dialog tap re-measured to (274, 474). Then, per the
existing follow-up plan's TAIL:

1. **simctl goldens** — re-capture `blotter/seeded`, `shell/connection-banner`,
   and the new `shell/appearance` on the new pin. Eyeball each; the verify pass
   must self-reproduce (`pass` for every scenario).
2. **Maestro tier** — flows exist; Maestro + OpenJDK 17 installed. Confirm the
   two-step dev-client deep link + `visual-ready` a11y assert on-device; capture
   goldens. A "needs release build" outcome is a bake-off finding (see the
   `__DEV__` coupling above before choosing that path).
3. **owl tier** — native Debug build + baselines. "won't compile on SDK 57 /
   RN 0.86" is a *valid decisive finding*, not a failure — record it (Detox +
   `jest-image-snapshot` fallback or "not viable on this stack").
4. **Injected-paint-bug proof** — reintroduce the documented `overflow:"hidden"`
   shadow-clip on a 3D surface card (PR #147 finding); confirm each viable tier
   goes red with the exact ratios; revert.
5. **BAKEOFF.md + README** — tier scoring rubric (setup, LOC, wall-clock, flake,
   caught-the-bug, portability, DX) + the Maestro/owl README sections + the tier
   map.
6. **Toolchain troubleshooting note** (folded in — it surfaced here): a
   teammate-facing "RN red box = stale `node_modules` → clean reinstall (NOT a
   worklets/reanimated bump); diagnose via `expo export` + dev-bundle curl" note
   in the RN visual README (parallel to CLAUDE.md's Vite "blank screen = stale
   pre-bundle").

## Global constraints

- **Never a CI gate.** iOS pixels need macOS; no macOS runners. Never add the
  `test:rn:visual:*` scripts to `.github/workflows/ci.yml`.
- **Pin:** `ios-iphone17-26` (iPhone 17 / iOS 26.x). Tap (274, 474) points.
- Reduce-motion frozen (ambient/aurora), sim ports only, deterministic scenarios
  (no `Math.random`/live-ticking sources).
- `#/` subpath alias, not `@/`. Braces on all control statements. Biome + both
  ESLint configs + stylelint + knip + typecheck must pass for every moved/new file.
- Harness inert unless `__DEV__ && EXPO_PUBLIC_VISUAL_HARNESS === "1"`.
- Bundle/scheme identity unchanged: `io.bettersoftware.rtcmobile`, `rtcmobile`,
  `exp+rtc-mobile`, slug `rtc-mobile`.

## Verification

- **Real app unchanged:** on-device boot → LoginScreen → sign in (demo roster,
  `mcdc2026`) → five tabs; boot splash still plays; a session survives the
  sim/live toggle (AsyncStorage resume). RN jest suite green, including a
  migrated `(app)/_layout.test.tsx` (shell) and a new minimal-root test.
- **RN e2e** (if present for RN) still green against the restructured routes.
- **Harness:** each scenario deep-link renders the isolated scenario (no login,
  no chrome), `visual-ready` marked; the three simctl goldens self-reproduce.
- **Security:** the new `visualHarnessGate` test proves inertness when
  `__DEV__` is false.
- **Full gauntlet:** `biome ci .`, `eslint .` (both configs), typecheck, `knip`,
  RN `test` — the expo-router file moves must keep knip entries, tsconfig/eslint
  includes, and `app.config.ts` router root correct.

## Risks

- **Restructure disturbs boot/auth/deep-links** — the highest risk. Mitigated by
  on-device boot+auth+tab verification and the e2e suite; the shell moves
  *verbatim* into `(app)/_layout` (no logic change), only its position changes.
- **`<Slot/>` vs `<Stack>` at root** — empirical; fallback noted.
- **owl won't build on SDK 57** — pre-declared as a finding, not a failure.
- **Status-bar clock** adds tiny per-capture non-determinism to full-screen
  shots; within the 0.06 diff tolerance — note, don't fight.
- **Two goldens change meaning** — the re-captured `blotter/seeded` /
  `shell/connection-banner` will differ from the (broken) #232 PNGs; that's the
  point. Byte-diff is expected and correct.
