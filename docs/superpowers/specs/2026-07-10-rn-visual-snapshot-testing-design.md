# RN Visual Snapshot Testing — Design

**Status:** Approved design, ready for implementation planning
**Date:** 2026-07-10
**Package:** `@rtc/client-react-native`
**Related:** web visual suite (`packages/client-react/tests/ui/visual/`), its
tooling bake-off (`docs/superpowers/plans/2026-06-06-visual-diff-tooling-variants.md`),
and the deferred RN e2e work.

## 1. Problem

The RN client (`@rtc/client-react-native`) has a jest-expo test island, but those
tests assert on the **serialized component tree** (RNTL `toJSON()` / prop checks),
not on rendered pixels. They therefore *cannot* see a paint bug. Two real ones
shipped and were caught only by human whole-branch review:

- `PriceChart` passed `overflow:"hidden"` onto `SurfaceCard`'s shadowed view →
  iOS `clipsToBounds` clipped the drop shadow → the chart rendered flat on 3D
  skins while sibling panels were raised.
- `TradeTicket` used a `textOnAccent` label on a `bgSecondary` fill → contrast
  ≤1.24 in 7 of 8 skins → an effectively invisible label.

Every jest suite was green through both. The project's own note stands: *"opus
whole-branch review remains the only net for jsdom-invisible RN paint bugs."*
This design replaces that manual net with an automated one, giving the RN client
the same class of coverage the web client already has.

## 2. Goals / Non-goals

**Goals**
- Real **pixel** screenshots rendered on an iOS **simulator**, diffed against
  committed golden images — the true analogue of the web visual suite.
- Catch the paint-bug class above (clipped shadows, per-skin invisible labels,
  layout drift, wrong colour tokens).
- Demonstrate the port/adapter philosophy at the *test-tooling* layer by shipping
  **three** capture drivers over one shared core (mirroring the web suite's
  three permanent runner tiers).

**Non-goals (v1)**
- **Not a CI gate.** iOS-simulator pixels require macOS; every CI job here runs
  `ubuntu-latest`. This is a documented **Mac-local, run-by-hand / pre-merge**
  suite.
- **No Android yet.** Android is designed-for (see §8) but deferred to a
  follow-up phase, where it *can* become a real CI gate on a Linux KVM emulator.
- Not a replacement for the jest island (structure/behaviour) or the sociable
  contract tier — this is the pixel tier only.

## 3. Key decisions (resolved during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Fidelity | Real simulator pixels | Only pixels catch the paint-bug class this exists for. Tree snapshots structurally cannot. |
| Platform v1 | iOS only | Reuses the proven on-device screenshot recipe; keeps CI cost at zero. Android is a clean follow-up. |
| Gate | **Not** a CI gate | iOS pixels are Mac-only; no macOS runners in use. Documented local suite. |
| Driver count | **Three, kept permanently** | Mirrors the web suite's 3-tier model; the swappable-driver comparison is itself a showcase deliverable. |
| Comparison | Produced empirically | A `BAKEOFF.md` scores the tiers against a rubric incl. an injected real paint bug — evidence, not theory. |

## 4. Architecture

The one unavoidable RN difference from web: the web `playwright-ct` and
`vitest-browser` tiers mount *components* inside a browser test runner. Real
native pixels only exist when the app renders on a simulator, so **every RN tier
must render inside the running app**. That forces one shared piece the web suite
does not need — an in-app visual harness.

```
tests/visual/
  scenarios.ts        — shared scenario registry (plain TS, sim ports, pinned skin)
  shared/
    diff.ts           — pixelmatch + pngjs golden compare (tolerance ported from web)
    goldens.ts        — golden path resolution: ios-<device>-<runtime>/<tier>/<id>.png
    driver.ts         — the capture(scenarioId) -> PNG interface
  simctl/             — Tier 1 driver (tsx orchestrator around the simctl recipe)
  maestro/            — Tier 2 driver (YAML flows + shared diff core)
  owl/                — Tier 3 driver (react-native-owl; Detox fallback)
  __screenshots__/
    ios-iphone15-18/  — committed goldens, one canonical device+runtime
  BAKEOFF.md          — rubric scores across the three tiers
  README.md           — when to run, how to regenerate, the device pin

src/app/__visual/[id].tsx   — dev-only harness route (gated by EXPO_PUBLIC_VISUAL_HARNESS)
```

**Shared core (written once, used by all three tiers)**

- **Scenario registry** (`scenarios.ts`) — the RN analogue of the web
  `registry.tsx`. A list of `{ id, skin, mode, build(): ReactNode }` entries fed
  by **simulator ports** (never live WS), each pinning skin/theme. Single source
  of truth for *what* is shot.
- **In-app harness screen** (`app/__visual/[id].tsx`) — reads the scenario id
  from the deep-link param and renders exactly that one registry scenario,
  deterministically. Reached by `rtcmobile://__visual/<id>`. Gated behind an
  `EXPO_PUBLIC_VISUAL_HARNESS` flag (same seam idea as `bootSplashGate`) so it is
  inert in a real release build.
- **Golden/diff core** (`shared/diff.ts`) — `pixelmatch` + `pngjs`, with
  `allowedMismatchedPixelRatio` tolerance ported from the web suite's settled
  `0.06`.

**Three swappable driver adapters** — each implements `capture(scenarioId) → PNG`,
so the registry and diff core are identical and only the capture mechanism
differs:

- **Tier 1 — `simctl`**: a tsx orchestrator around the already-proven recipe —
  boot the sim → install the prebuilt `.app` → start Metro from the worktree →
  deep-link `rtcmobile://__visual/<id>` → `xcrun simctl io <udid> screenshot`.
  No new runtime dependency (only `pixelmatch`/`pngjs`, dev-only).
- **Tier 2 — Maestro**: a YAML flow launches + deep-links + `takeScreenshot`,
  feeding the *same* diff core. Doubles as the seed for the deferred RN e2e work
  and eases Android reuse (same flows).
- **Tier 3 — react-native-owl**: the batteries-included RN visual-regression
  library. **Fallback:** Detox + `jest-image-snapshot` if owl proves unhealthy
  on Expo SDK 57 / RN 0.86 during the spike (a rubric finding in itself).

## 5. Determinism

Simulator screenshots are far more environment-sensitive than the web's headless
Chromium. The harness screen enforces:

- **Sim ports only** — no live WS; seeded deterministic data. Mirrors the web
  suite stopping the graph at `ViewModelProvider`.
- **Pinned skin/theme/mode per scenario** — set by the registry entry, not read
  from persisted preferences.
- **Frozen motion & time** — force reduce-motion (the app already honours it:
  `BootEmblem` / `Animated` go static) and a fixed clock so countdowns/pulses
  don't smear a captured frame.
- **Font-ready + explicit "ready" gate before capture** — direct port of the web
  `document.fonts.ready` lesson (`useAppFonts()` already gates first paint; the
  harness additionally exposes a rendered-marker the drivers wait on).
- **One canonical device + runtime** — **iPhone 15 · iOS 18.x** — documented and
  required for regenerating goldens. The RN analogue of the web suite's pinned
  x86 Playwright container. A golden is defined *relative to that pin*; a
  different device/OS produces different pixels by design.

## 6. Golden storage

- Location: `packages/client-react-native/tests/visual/__screenshots__/ios-iphone15-18/<tier>/<id>.png`.
- Committed and reviewed like the web goldens.
- **No `react/` vs `react-local/` split.** The web suite carries two sets because
  CI re-renders the canonical one on x86; nothing re-renders these on CI, so
  there is a single Mac-authored canonical set per tier.
- A `:update` script per tier regenerates its set from the pinned device.

## 7. Scenario slice (v1)

Representative, not exhaustive — enough to prove all three tiers and exercise the
paint-bug surfaces the project has flagged, then grow:

- FX **SpotTile** on a **3D skin** (shadow/sheen — the `overflow:hidden` surface)
  and a flat skin, price up / down.
- **Equities** `PriceChart` panel on a 3D skin (the actual regressed component).
- **LockScreen** overlay + boot emblem (static under reduce-motion).
- One **Credit** `RfqCard` (tile variant) and one **Analytics** widget card.
- A dark/light × one-extra-skin matrix on a couple of these, to exercise the
  per-skin legibility net (the invisible-label class).

## 8. Scripts, wiring, and the non-gate

Per the repo's "all gates cover every package" rule, new scripts and dev deps
must be wired into the shared tool configs even though the suite is not a gate:

- Scripts: `test:rn:visual` plus `:simctl` / `:maestro` / `:owl` and each tier's
  `:update` variant; a Turbo task.
- Config wiring: `knip.json` (RN workspace block) for the new dev deps
  (`pixelmatch`, `pngjs`, `maestro`, `react-native-owl`) and the harness route;
  tsconfig include and Biome scope for the new test dirs; the harness route added
  to the Expo Router `noDefaultExport:off` scope.
- **Explicitly not added to `ci.yml`.** The README documents it as a Mac-local
  suite and states when to run it: any RN view change. This intentionally does
  not close the gap on CI — the trade is documented, not accidental.

## 9. Empirical comparison (a first-class deliverable)

`BAKEOFF.md` scores the three tiers on: setup cost · config/LOC · per-run
wall-clock · flake / determinism · **catches the injected `PriceChart
overflow:"hidden"` paint bug?** · Android-portability (Phase 2) · maintenance
risk · DX.

The injected-bug row is the decisive one: we reintroduce that exact documented
regression into the thin slice and record which tiers go red. It turns "which
tool is best" into a reproducible experiment against the bug this suite exists to
catch.

## 10. Phase 2 — Android seam (deferred)

Because the registry, harness, and diff core are platform-agnostic and only the
driver adapter is iOS-specific, Android is additive: an emulator-backed adapter
(`adb` / owl-android / Maestro-android) plus an `android-<device>-<api>/` golden
set. At that point it *can* become a real `ubuntu-latest` CI **gate** (KVM
emulator via `reactivecircus/android-emulator-runner`), because Android pixels do
not need macOS. No rework of the shared core.

## 11. Risks

- **owl health on Expo SDK 57 / RN 0.86** — spike-gated; Detox +
  `jest-image-snapshot` is the documented fallback for Tier 3.
- **iOS-runtime pixel drift** when Apple bumps the simulator OS — mitigated by
  the device/runtime pin (§5) and the `0.06` tolerance; a deliberate OS bump is a
  reviewed golden regeneration, not a silent flake.
- **Harness route is a small production surface** — gated behind
  `EXPO_PUBLIC_VISUAL_HARNESS` so it is absent/inert in a real release build.
- **Three permanent tiers = 3× goldens + upkeep** — accepted for showcase value;
  the shared-core design keeps the *incremental* cost of each tier to its driver
  adapter, not a full suite.

## 12. Out of scope

- Android implementation (Phase 2).
- Any CI gating of the iOS tier.
- Interaction-driven e2e flows (the deferred Maestro/gherkin RN e2e phase; Tier 2
  seeds it but does not deliver it here).
- Migrating the existing jest island; it stays as the structure/behaviour tier.
