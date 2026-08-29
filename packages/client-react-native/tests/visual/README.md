# RN visual-verification harness (mobile-v1 Phase 1)

Real iOS-simulator pixel-screenshot regression tests for `@rtc/client-react-native` — the net for RN paint bugs that jsdom/jest can't see.

> **Not a PR gate.** This is a **Mac-local** suite — run it before merging any change that touches RN views, and never add its scripts to `.github/workflows/ci.yml`.
>
> **The reason changed, because the old one was wrong.** This note used to say "there are no macOS CI runners". There are. This repo is **public**, so GitHub-hosted standard runners — macOS included — are free and unlimited, and the `macos-26` image ships this harness's exact golden pin (iPhone 17 + iOS 26.x runtimes). Access was never the blocker. What believing otherwise cost is on the record: **P1** — every boot scene drawing zero glyphs on real iOS — shipped unnoticed through the whole of Phase 6a, because nothing automated could see a device pixel.
>
> The *conclusion* survives the correction, for a different and more durable reason: device and simulator UI suites are the slowest and flakiest thing in any pipeline, which makes them poor merge gates — see [mobile-ci-testing-options.md §4](../../../../docs/mobile-ci-testing-options.md) for the published evidence. This repo already made exactly that call for the web, where [`visual.yml`](../../../../.github/workflows/visual.yml) runs post-merge only. Bringing these tiers to CI is tracked as **T1** in [rn-open-items.md](../../../../docs/rn-open-items.md); its destination is a scheduled, non-gating workflow, not `ci.yml`.

## What's here

- `shared/diff.ts` — `pixelmatch`/`pngjs` golden-diff core (tolerance `0.06`).
- `shared/goldens.ts` — golden path resolver + device pin (`ios-iphone17-26`).
- `scenarioIds.ts` — the pure, Node-safe list of scenario ids (the runner iterates this; importing the RN registry would crash tsx/esbuild).
- `scenarios.tsx` — the RN scenario registry (each id → a leaf wrapped in `VisualScenarioHost`, which mounts it on sim ports with a pinned skin/mode and frozen motion, **outside** the app's `AuthGate`/shell — see "Harness isolation" below).
- `simctl/` — **Tier 1** capture driver + CLI runner (`xcrun simctl` + `idb`).
- `maestro/` — **Tier 2** generated flows + CLI runner (`maestro test`, XCUITest a11y driver).
- `owl/` — **Tier 3** config only — **not viable on this stack**; the dep and its
  test were removed 2026-07-25 (they were the sole source of a vulnerable
  transitive `ajv@7`). See `BAKEOFF.md`.
- `__screenshots__/ios-iphone17-26/{simctl,maestro}/` — committed goldens (one set per viable tier).

**Scenarios** (provisional "prove-the-harness" fixtures — module goldens are pinned in their own rehaul phases, per spec §7):

| id | surface | skin×mode | why it's stable |
|----|---------|-----------|-----------------|
| `blotter/seeded` | Blotter tab | holo3d · dark | `TradeStoreSimulator` pre-seeds 5 static trades at construction (not `Math.random`, not live) |
| `shell/connection-banner` | connection banner | classic · light | pinned DISCONNECTED via `viewModelOverrides` — the banner renders nothing while CONNECTED (the fake's default), so this is the only golden that shows it |
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
- **Maestro + a JDK** (Tier 2): `curl -fsSL https://get.maestro.mobile.dev | bash` and `brew install openjdk@21`; run flows with `JAVA_HOME="$(brew --prefix openjdk@21)"` and `~/.maestro/bin` on `PATH`. Maestro's check is a **floor** (`-lt 17`), not a pin — but **21 is the newest JDK it runs clean on**: 25 and 26 both warn that dependencies Maestro bundles "will be blocked in a future release", one of them its own CLI arg parser. Always the *versioned* formula; bare `openjdk` floats onto the next release. Measured table: [BAKEOFF.md](BAKEOFF.md#the-jdk-requirement-is-a-floor-of-17-and-the-right-choice-is-21).

## Run

```bash
# from repo root, with the sim booted + dev client + Metro (8083) up:

# Tier 1 — simctl + idb
RTC_VISUAL_UDID=<iphone17-udid> RTC_VISUAL_METRO_PORT=8083 RTC_VISUAL_IDB=$(command -v idb) \
  pnpm --filter @rtc/client-react-native test:rn:visual:simctl          # verify vs goldens
… pnpm --filter @rtc/client-react-native test:rn:visual:simctl:update   # regenerate

# Tier 2 — Maestro (a11y-driven; no blind taps). Regenerate flows first if SCENARIO_IDS changed:
tsx tests/visual/maestro/generateFlows.ts
PATH="$HOME/.maestro/bin:$PATH" JAVA_HOME="$(brew --prefix openjdk@21)" MAESTRO_METRO_PORT=8083 \
  pnpm --filter @rtc/client-react-native test:rn:visual:maestro          # verify vs goldens
… pnpm --filter @rtc/client-react-native test:rn:visual:maestro:update   # regenerate
```

**Tier 1** capture: load the app from Metro base → poll the a11y tree for the `login-screen` boot marker → in-app deep-link `rtcmobile://__visual/<id>` → dismiss the iOS "Open in RTC Mobile?" confirmation by locating its "Open" button in the a11y tree (a blind coordinate tap at the iPhone 17 pin, `(274, 474)`, is a **fallback only**, tried once if no such button is found partway through the wait) → poll the a11y tree for the harness's `visual-ready` id, throwing if it's never observed → re-check the a11y tree isn't launcher-shaped at the moment of the shot → `simctl io screenshot`. **Tier 2** does the same two-step deep link via Maestro's own a11y-tree waits (`extendedWaitUntil`). After `:update`, eyeball each PNG and run the verify pass — it must report `pass` for every scenario (a golden that can't reproduce itself is flaky; fix the scenario, don't pin the flake).

**Capture failure vs. visual regression (Tier 1 reliability fix).** Before this fix, Tier 1 dismissed the "Open in RTC Mobile?" confirmation with an **unconditional blind tap** at a hardcoded point, followed by a **fixed sleep**, then screenshotted whatever was on screen — no matter what that was. When the confirmation didn't land exactly where expected (e.g. a stale "RECENTLY OPENED" row from a prior Metro session sitting under the tap point), the blind tap missed, the deep link never completed, and the driver silently screenshotted the Expo dev-client launcher instead of the scenario. That capture-of-the-wrong-screen then diffed against the golden as if it were a real render, producing a `FAIL` percentage indistinguishable from an actual pixel regression — which made `:update` in that state actively dangerous: it would have pinned a screenshot of the launcher as the new baseline and made the tier permanently, silently green on a broken capture.

The fix (`simctl/capture.ts`) makes the driver refuse to guess:
- It polls the a11y tree (`idb ui describe-all --udid <udid>`) for the `login-screen` and `visual-ready` markers with bounded timeouts, and **throws — never returns a screenshot** — if either is never observed. A capture failure now looks like a thrown error naming the scenario, not a mysterious diff percentage.
- It locates the "Open in RTC Mobile?" confirmation's button by its a11y label ("Open") instead of assuming a fixed coordinate; the coordinate tap is now a last-resort fallback, tried once, only if the button never appears in the tree.
- As defence in depth, it re-checks the a11y tree at the moment of the shot for the launcher home screen's signature (`DEVELOPMENT SERVERS`, `RECENTLY OPENED`, `Enter URL manually`, `Development Build` — confirmed empirically against a live capture of that screen) and throws if it matches. A **pixel-based** guard (e.g. "screen is mostly light") was considered and rejected: `shell/connection-banner` is pinned `classic`/`light`, so a blanket light-background heuristic would misfire on a legitimately passing capture. The a11y-label signature is scenario-agnostic and safe regardless of skin/mode.

If you hit a `FAIL` on this tier, re-run first — if it now throws a "never reached `visual-ready`"/"looks like the launcher" error instead of reporting a diff percentage, that's a capture problem (Metro/sim/dev-client state), not a regression; only trust a diff percentage as a real signal once the capture completes cleanly.

Debugging a single scenario without touching goldens: `tsx tests/visual/simctl/run.ts --scratch <id>` writes the current render to `RTC_VISUAL_SCRATCH` (default `/tmp/rtc-visual-scratch`) instead of diffing/updating — see the flag docs in `simctl/run.ts`.

See **`BAKEOFF.md`** for the full three-tier comparison (owl is not viable on SDK 57 / RN 0.86 / React 19 / new-arch), the injected-paint-bug detection proof, and known capture artifacts (status-bar clock, dev-tools gear).

## Adding a scenario: two things that make a golden assert nothing

Both were found on 2026-08-01 by *looking at* the PNGs, after a year of green
diffs. A diff against an equally-wrong baseline is green, so neither the tier
nor its reproduction percentage can surface them — only eyes can.

**1. Wrap screen content in `ScreenContentFixture`.** A scenario mounts under
`VisualScenarioHost` alone; there is no `ShellHeader` above it, so a module
mounted bare starts at `y=0` and its first row lands under the status bar and
the dynamic island. `blotter/seeded` was captured for months with its
**`PENDING` filter chip entirely hidden** — the golden asserted a blotter with
three filters instead of four. `shell/connection-banner` lost its "Live" pill,
and `analytics/dashboard` lost its "P&L" title.

Do **not** wrap a genuinely full-bleed surface — `boot/*` (the app's
`BootCanvas` really is edge-to-edge), `lock/hold` (`LockScreen` centres over
the whole screen) or `shell/appearance` (a modal overlay). Insetting those
would pin a frame the app never draws: the same defect mirrored.

**2. Mount the leaf where the app puts it.** `LockHoldFixture` mounted the
progress ring bare, so it rendered at the top of the screen with the dynamic
island covering all but a sliver of the arc — while `LOCK_HOLD_PROGRESS = 0.55`
exists precisely so the golden proves a *partial* fill. The fixture now centres
it the way `LockScreen` does. When a fixture mounts a leaf instead of a screen,
restate the container's layout, not just its data.

## Visual reach — which surfaces have a golden at all

```bash
pnpm --filter @rtc/client-react-native test:rn:visual:reach
```

Mounts every registered scenario under jest with istanbul watching `src/ui`
(`reach/scenarioReach.test.tsx`, then `reach/report.ts`) — the counterpart of
the web clients' `ui (visual reach)` coverage tiers. It gates nothing. The
number that matters is not the total but the list of files at **0%**: each is
an app surface no golden renders, so a visual change to it has no "before"
to diff against. Test scaffolding that lives under `src/ui` (`*Harness.tsx`,
`renderWithTheme.tsx`, `_probe/`) is excluded from both list and total.

**Before-golden first.** Before changing how a surface looks, make sure its
*real composition* is already pinned on `main` — add the scenario (and a prop
seam where the state is internal) in its own PR and pin it, then make the
change in the next PR so that PR's own diff shows the golden before → after.
`equities/blotter-positions` was the first: pinned in PR #593 through a
`BlottersView initialTab` seam, then retired in the fidelity PR that replaced
the Orders/Positions toggle with the design's stacked sections — that PR's
diff carries both befores. Measured 2026-08-29 against 21 scenarios: 82.6%
of statements reached; unwitnessed were the Positions tab (closed as above),
`LockScreen` (only its ring is pinned, via `lock/hold`), the
credit panel wrappers (`RfqTilesPanel`, `SellSidePanel` — the fixtures mount
their card/ticket leaves), the rates ticket sheet and the new-RFQ form (the
two prototype-only scenarios), and the transient `OrderCeremony` /
`ExecutionCeremony` / fanned-dock states.

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
