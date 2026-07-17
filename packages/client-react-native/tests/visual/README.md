# RN visual-verification harness (mobile-v1 Phase 1)

Real iOS-simulator pixel-screenshot regression tests for `@rtc/client-react-native` — the net for RN paint bugs that jsdom/jest can't see.

> **Not a CI gate.** iOS pixels need macOS and a running simulator + dev client + Metro; there are no macOS CI runners. This is a **Mac-local** suite — run it before merging any change that touches RN views. Never add its scripts to `.github/workflows/ci.yml`.

## What's here

- `shared/diff.ts` — `pixelmatch`/`pngjs` golden-diff core (tolerance `0.06`).
- `shared/goldens.ts` — golden path resolver + device pin (`ios-iphone15-18`).
- `scenarioIds.ts` — the pure, Node-safe list of scenario ids (the runner iterates this; importing the RN registry would crash tsx/esbuild).
- `scenarios.tsx` — the RN scenario registry (each id → a leaf wrapped in `VisualScenarioHost`, which mounts it on sim ports with a pinned skin/mode and frozen motion).
- `simctl/` — **Tier 1** capture driver + CLI runner (the shipped tier).
- `__screenshots__/ios-iphone15-18/simctl/` — committed goldens.

**Scenarios** (provisional "prove-the-harness" fixtures — module goldens are pinned in their own rehaul phases, per spec §7):

| id | surface | why it's stable |
|----|---------|-----------------|
| `blotter/seeded` | Blotter tab | `TradeStoreSimulator` pre-seeds 5 static trades at construction (not `Math.random`, not live) |
| `shell/connection-banner` | connection pill | host emits a single synchronous `gatewayConnected` → always "Live" |

`credit/rfq-tiles-empty` was tried and **dropped** — on-device verify proved it non-deterministic (`CreditRfqSimulator` emits new Live RFQs over time; diffs swung 0.7% ↔ 11.9%). Restore a Credit fixture only behind a frozen-clock harness variant.

## Prerequisites

- macOS + Xcode iOS **17/18** simulator, device **iPhone 15** (the golden pin).
- A **dev client** installed on that sim. Fast path: reuse any recent `RTCMobile.app` from `~/Library/Developer/Xcode/DerivedData/` (Phase 0+ branches share native deps) — or `pnpm dev:ios` once.
- **Metro** running from this worktree with the harness flag:
  `EXPO_PUBLIC_VISUAL_HARNESS=1 npx expo start --dev-client --port 8083`
- **idb** for the in-app "Open?" confirmation tap: `pipx install --python python3.13 fb-idb` + `brew install facebook/fb/idb-companion` (fb-idb needs Python ≤3.13).

## Run

```bash
# from repo root, with the sim booted + dev client + Metro (8083) up:
RTC_VISUAL_UDID=<iphone15-udid> RTC_VISUAL_METRO_PORT=8083 RTC_VISUAL_IDB=$(command -v idb) \
  pnpm --filter @rtc/client-react-native test:rn:visual:simctl          # verify vs goldens

# regenerate goldens (must use the iPhone 15 / iOS 18 pin):
… pnpm --filter @rtc/client-react-native test:rn:visual:simctl:update
```

Each scenario capture: load the app from Metro base → in-app deep-link `rtcmobile://__visual/<id>` → tap the iOS "Open in RTC Mobile?" confirm (idb) → settle → `simctl io screenshot` → diff vs golden. After `:update`, eyeball each PNG and run the verify pass — it must report `pass` for every scenario (a golden that can't reproduce itself is flaky; fix the scenario, don't pin the flake).

## Remaining (not yet built)

Tier 2 (Maestro) + Tier 3 (react-native-owl) + the tier bake-off (`BAKEOFF.md`) + the injected-paint-bug proof are planned follow-ups over this same harness — see `docs/superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md` and the Phase 1 reconciliation plan.
