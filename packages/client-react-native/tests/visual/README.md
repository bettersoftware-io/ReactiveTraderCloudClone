# RN visual-verification harness (mobile-v1 Phase 1)

Real iOS-simulator pixel-screenshot regression tests for `@rtc/client-react-native` — the net for RN paint bugs that jsdom/jest can't see.

> **Not a CI gate.** iOS pixels need macOS and a running simulator + dev client + Metro; there are no macOS CI runners. This is a **Mac-local** suite — run it before merging any change that touches RN views. Never add its scripts to `.github/workflows/ci.yml`.

## What's here

- `shared/diff.ts` — `pixelmatch`/`pngjs` golden-diff core (tolerance `0.06`).
- `shared/goldens.ts` — golden path resolver + device pin (`ios-iphone17-26`).
- `scenarioIds.ts` — the pure, Node-safe list of scenario ids (the runner iterates this; importing the RN registry would crash tsx/esbuild).
- `scenarios.tsx` — the RN scenario registry (each id → a leaf wrapped in `VisualScenarioHost`, which mounts it on sim ports with a pinned skin/mode and frozen motion, **outside** the app's `AuthGate`/shell — see "Harness isolation" below).
- `simctl/` — **Tier 1** capture driver + CLI runner (`xcrun simctl` + `idb`).
- `maestro/` — **Tier 2** generated flows + CLI runner (`maestro test`, XCUITest a11y driver).
- `owl/` — **Tier 3** config + test — **not viable on this stack** (see `BAKEOFF.md`).
- `__screenshots__/ios-iphone17-26/{simctl,maestro}/` — committed goldens (one set per viable tier).

**Scenarios** (provisional "prove-the-harness" fixtures — module goldens are pinned in their own rehaul phases, per spec §7):

| id | surface | skin×mode | why it's stable |
|----|---------|-----------|-----------------|
| `blotter/seeded` | Blotter tab | holo3d · dark | `TradeStoreSimulator` pre-seeds 5 static trades at construction (not `Math.random`, not live) |
| `shell/connection-banner` | connection pill | classic · light | host emits a single synchronous `gatewayConnected` → always "Live" |
| `shell/appearance` | Appearance sheet | holo3d · dark | pinned sheet; ambient frozen via `VisualScenarioHost`'s `forceReduceMotion` |

`credit/rfq-tiles-empty` was tried and **dropped** — on-device verify proved it non-deterministic (`CreditRfqSimulator` emits new Live RFQs over time; diffs swung 0.7% ↔ 11.9%). Restore a Credit fixture only behind a frozen-clock harness variant.

## Harness isolation

`__visual/<id>` renders `VisualScenarioHost` as a **root sibling** of the app's
`(app)` route group, so the scenario mounts outside `AuthGate` and the toolbar/
tab chrome — a deep link renders the isolated scenario even from an
unauthenticated cold start. The harness is inert unless **both**
`__DEV__` **and** `EXPO_PUBLIC_VISUAL_HARNESS === "1"` (`src/app/visualHarnessGate.ts`);
`__DEV__` is hard-`false` in any release build, so a mis-set flag can never
activate it in production.

## Prerequisites

- macOS + Xcode iOS **26** simulator, device **iPhone 17** (the golden pin).
- A **dev client** installed on that sim. Fast path: reuse any recent `RTCMobile.app` from `~/Library/Developer/Xcode/DerivedData/` (Phase 0+ branches share native deps) — or `pnpm dev:ios` once.
- **Metro** running from this worktree with the harness flag:
  `EXPO_PUBLIC_VISUAL_HARNESS=1 npx expo start --dev-client --port 8083`
- **idb** (Tier 1) for the in-app "Open?" confirmation tap: `pipx install --python python3.13 fb-idb` + `brew install facebook/fb/idb-companion` (fb-idb needs Python ≤3.13).
- **Maestro + JDK 17** (Tier 2): `curl -fsSL https://get.maestro.mobile.dev | bash` and `brew install openjdk@17`; run flows with `JAVA_HOME=/opt/homebrew/opt/openjdk@17` and `~/.maestro/bin` on `PATH`.

## Run

```bash
# from repo root, with the sim booted + dev client + Metro (8083) up:

# Tier 1 — simctl + idb
RTC_VISUAL_UDID=<iphone17-udid> RTC_VISUAL_METRO_PORT=8083 RTC_VISUAL_IDB=$(command -v idb) \
  pnpm --filter @rtc/client-react-native test:rn:visual:simctl          # verify vs goldens
… pnpm --filter @rtc/client-react-native test:rn:visual:simctl:update   # regenerate

# Tier 2 — Maestro (a11y-driven; no blind taps). Regenerate flows first if SCENARIO_IDS changed:
tsx tests/visual/maestro/generateFlows.ts
PATH="$HOME/.maestro/bin:$PATH" JAVA_HOME=/opt/homebrew/opt/openjdk@17 MAESTRO_METRO_PORT=8083 \
  pnpm --filter @rtc/client-react-native test:rn:visual:maestro          # verify vs goldens
… pnpm --filter @rtc/client-react-native test:rn:visual:maestro:update   # regenerate
```

**Tier 1** capture: load the app from Metro base → in-app deep-link `rtcmobile://__visual/<id>` → tap the iOS "Open in RTC Mobile?" confirm with a **blind `idb` tap** at pin-specific points (`(274, 474)` on iPhone 17) → settle → `simctl io screenshot`. **Tier 2** does the same two-step deep link but via Maestro's **a11y tree** — waits for the `login-screen` boot marker, deep-links, dismisses "Open" by finding it in the tree, `extendedWaitUntil`s the harness's `visual-ready` id, then `takeScreenshot`. After `:update`, eyeball each PNG and run the verify pass — it must report `pass` for every scenario (a golden that can't reproduce itself is flaky; fix the scenario, don't pin the flake).

See **`BAKEOFF.md`** for the full three-tier comparison (owl is not viable on SDK 57 / RN 0.86 / React 19 / new-arch), the injected-paint-bug detection proof, and known capture artifacts (status-bar clock, dev-tools gear).

## Troubleshooting

**Metro red box `[Worklets] Babel plugin exception: … reading 'length'`** while
bundling `react-native-reanimated` — this is a **corrupt local `node_modules`**,
NOT a version problem, even though `pnpm install` may report "Already up to
date". Fix with a clean reinstall (`rm -rf node_modules && pnpm install`) in the
affected checkout; do **not** bump `react-native-worklets`/`react-native-reanimated`
(that only "works" by forcing a fresh install and churns the deliberate SDK-57
pins). Diagnose headlessly without a sim via `expo export --platform ios` and a
dev-bundle curl to `/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true`
(a clean bundle is >100 KB and contains no `Babel plugin exception`). This is
the RN analogue of CLAUDE.md's Vite "blank screen = stale pre-bundle" note.

## Remaining (not yet built)

- **Inset 3D-card scenario** to guard the #147 `overflow: hidden` shadow-clip
  regression class. The injected-bug proof showed the current full-bleed
  `SurfaceCard` scenario can't catch it (the drop shadow is off-screen), so a
  scenario with an inset 3D card on a contrasting background is needed — see
  `BAKEOFF.md` § "Findings from the injected-paint-bug proof".
