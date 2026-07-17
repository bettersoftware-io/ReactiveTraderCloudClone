# RN mobile-v1 Rehaul — Phase 1: Visual-verification harness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the deferred #149 RN visual-verification harness (Maestro e2e + iOS visual-baseline screenshots + shared diff core) as rehaul Phase 1 — the durable regression scaffolding every later phase pins its goldens against.

**Architecture:** This phase **adopts the existing, detailed plan** [`docs/superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md`](2026-07-10-rn-visual-snapshot-testing.md) wholesale — its Tasks 0.1 → 4.3 (pixelmatch diff core, golden resolver, scenario registry, in-app harness route + `VisualScenarioHost`, three driver tiers `simctl`/Maestro/owl, bake-off + injected-bug proof, README) are correct and unchanged. This document is the **reconciliation layer**: it applies the small set of amendments the rehaul framing and current codebase state require, then hands the amended plan to the SDD executor. Do not re-derive the base plan; execute it *with these amendments applied*.

**Tech Stack:** Unchanged from the base plan — Expo SDK 57 / RN 0.86, Expo Router, `pixelmatch` + `pngjs`, `xcrun simctl`, Maestro CLI, `react-native-owl`, tsx, vitest + jest-expo.

## Global Constraints

- **Base plan is authoritative for task detail:** [`2026-07-10-rn-visual-snapshot-testing.md`](2026-07-10-rn-visual-snapshot-testing.md). Its Global Constraints all still hold. Where this document and the base plan disagree, **this document wins** (it is newer and reconciled against merged Phase 0 + the rehaul phasing).
- **Not a CI gate.** iOS pixels need macOS; there are no macOS CI runners. Never add these scripts to `.github/workflows/ci.yml`. This is a Mac-local suite (base plan Global Constraints; spec §6 makes on-device sign-off the primary net regardless).
- **Canonical device+runtime pin:** iPhone 15 · iOS 18.x. **Diff tolerance:** `allowedMismatchedPixelRatio: 0.06` (ported from the web suite). Both unchanged from the base plan.
- **Phase 0 is merged** (`origin/main` ≥ `8b0e3a0b`): reanimated 4.5.0 / worklets 0.10.0 / Skia 2.6.2 / gesture-handler / expo-blur/haptics/sensors are installed and the app boots on the sim. The base plan predates this; any base-plan hedging about the native stack being absent is now moot. Determinism controls may rely on `react-native-reanimated`'s `useReducedMotion()` being available.
- **Goldens are provisional, the harness is the deliverable** (spec §5 Phase 1, §7). Screens are rebuilt across Phases 2–6, so early module goldens would churn immediately. Pin only enough goldens to *prove the pipeline catches a diff*; each module phase pins its own; Phase 7 does the final full re-pin.

---

## Amendments to the base plan

Apply each of these while executing [`2026-07-10-rn-visual-snapshot-testing.md`](2026-07-10-rn-visual-snapshot-testing.md). They are keyed to the base plan's tasks.

### A1 — Fix the bundle identifier (base plan Tasks 1.1, 2.1)

The base plan uses `io.rtc.mobile` in two places. The **real** bundle id is **`io.bettersoftware.rtcmobile`** (`packages/client-react-native/app.config.ts:14` — `ios.bundleIdentifier`; `:15` android `package` matches).

- Base plan **Task 1.1** `capture.ts`: `xcrun simctl terminate <dev> io.rtc.mobile` → `io.bettersoftware.rtcmobile`.
- Base plan **Task 2.1** `generateFlows.ts`: `appId: io.rtc.mobile` → `appId: io.bettersoftware.rtcmobile`.

### A2 — Confirm the deep-link forms against the running dev client (base plan Task 1.1)

The **release scheme** is `rtcmobile` (`app.config.ts:6`) → standalone deep link `rtcmobile://__visual/<id>` (this is what the base plan's Maestro `openLink` uses — correct). The **dev-client** deep link the base plan's `capture.ts` builds (`exp+rtc-mobile://expo-development-client/?url=...`) derives from the **slug** `rtc-mobile` (`app.config.ts:5`), so `exp+rtc-mobile://` is plausibly correct for the dev client — **but confirm it empirically** on first run (`npx uri-scheme list` or by opening the printed dev-client URL). If the dev build is a **release/standalone** `.app` instead, use the plain `rtcmobile://__visual/<id>` form. Record which build type the goldens were captured against in the README (Task 4.3).

### A3 — Re-scope the scenario registry to "prove-the-harness" surfaces (base plan Task 0.3)

The base plan's registry pins **module** scenarios (`fx/tile-up-holo3d`, `equities/pricechart-holo3d`, `credit/rfqcard-holo3d`, `analytics/pairpnl-neon`). Under the rehaul phasing those screens are **rebuilt in Phases 4–5**, so pinning their goldens now wastes effort (spec §7). Replace the initial registry with a **small set of currently-stable surfaces** whose only job is to exercise all three tiers and the diff core end-to-end:

- Keep the registry **shape** and the `VisualScenarioHost` machinery exactly as the base plan specifies.
- For the initial `SCENARIOS`, pick 2–3 surfaces that exist on `main` today and are **not** slated for rebuild in the parallel Phase 2 (avoid the Appearance sheet — Phase 2 rebuilds it; its baseline is pinned by **Phase 2 Task 9**, not here). Good candidates: the current lock screen if one exists, and one or two current module screens (e.g. the existing `blotter`/`analytics` route) used **purely** as diff-pipeline fixtures. The implementer reads `app/*.tsx` + `src/ui/**` to choose 2–3 that render deterministically on sim ports.
- Update the base plan's `scenarios.test.tsx` assertions (base plan Task 0.3 Step 2) to match the chosen ids instead of `fx/tile-up-holo3d` etc. Keep the "unique ids" + "resolves by id" assertions.
- **The injected-bug proof (base plan Task 4.2) is the real "harness catches a diff" gate** and does not depend on permanent module goldens — keep it, but target it at whichever chosen fixture renders a shadow/paint detail (or temporarily register the `equities/pricechart` surface just for the bug proof, then remove it). Record the caught ratios in `BAKEOFF.md`.

> Rationale to carry into execution: the exit gate is *"the harness runs in CI and locally; a deliberate visual change is caught"* (spec §5 Phase 1) — it is about the **pipeline**, not a canonical screen set. Provisional fixtures satisfy it; Phases 2–7 supply the durable goldens.

### A4 — Coordinate the Appearance baseline with the parallel Phase 2

Phase 2 (running concurrently) **rebuilds the Appearance sheet** and owns pinning its baseline (Phase 2 **Task 9**, which is itself gated on this harness landing). Therefore:
- Do **not** pin an Appearance golden in this phase.
- Ensure the harness supports a `shell/appearance` scenario id being **added later** without harness changes (the registry is data-driven — it already does; just don't pre-register a stale Appearance shot here).

### A5 — Reduced-motion determinism uses the now-available Reanimated hook (base plan Task 0.4)

The base plan's `VisualScenarioHost` forces reduce-motion via a `forceReduceMotion` prop on `ThemeProvider`. Since Phase 0 landed Reanimated, prefer freezing motion at the source the ambient/animation shells actually read: gate deterministic capture on the same reduced-motion signal Phase 2's ambient uses (`react-native-reanimated`'s `useReducedMotion()`), so a scenario screenshot never catches mid-animation frames. Keep the `forceReduceMotion` host prop as the explicit override; the point is that captured frames are static.

### A6 — Non-amendments (execute base plan as-written)

Everything else in the base plan is unchanged and correct: the `pixelmatch` diff core + `0.06` tolerance (Task 0.1), the `goldenPath`/`DEVICE_PIN` resolver (Task 0.2), the `VisualScenarioHost` + dev-only `EXPO_PUBLIC_VISUAL_HARNESS` route (Task 0.4), all three driver tiers (Tasks 1.x/2.x/3.x), the gate wiring into `knip.json`/Biome/tsconfig/Turbo as a **non-CI** suite (Task 4.1), and the README (Task 4.3). Reuse the proven on-device recipe (prebuilt `.app` + `simctl boot/install/openurl` + Metro from the worktree on a LAN IP).

---

## Execution order

Execute the base plan's tasks in their given order, applying the amendments above at the corresponding task:

1. **Base Task 0.1** — pixelmatch diff core *(unchanged)*.
2. **Base Task 0.2** — golden path resolver + device pin *(unchanged)*.
3. **Base Task 0.3** — scenario registry + driver interface **← apply A3** (re-scoped `SCENARIOS` + test assertions).
4. **Base Task 0.4** — in-app harness route + `VisualScenarioHost` + gate **← apply A5** (reduced-motion signal).
5. **Base Task 1.1 / 1.2** — `simctl` tier + first goldens **← apply A1, A2** (bundle id, deep-link confirmation).
6. **Base Task 2.1 / 2.2** — Maestro tier + goldens **← apply A1** (`appId`).
7. **Base Task 3.1** — react-native-owl tier + baselines *(unchanged; keep the Detox fallback note)*.
8. **Base Task 4.1** — gate wiring (non-CI) *(unchanged)*.
9. **Base Task 4.2** — injected-bug proof + `BAKEOFF.md` **← apply A3** (target a rendering fixture; this is the exit-gate proof).
10. **Base Task 4.3** — README **← apply A2, A4** (record build type + deep-link form; note Appearance baseline is Phase 2's).

**Exit gate (spec §5 Phase 1):** the harness runs locally (all three tiers green against their own provisional goldens on the iPhone 15 / iOS 18 pin) **and** the injected-bug proof shows a deliberate visual change caught (non-zero ratio > 0.06) on the tiers that render the detail. Recorded in `BAKEOFF.md`. Not wired into CI.

---

## Parallel-execution notes (Phase 1 ∥ Phase 2)

- **Disjoint files:** this phase touches `tests/visual/**`, `src/app/__visual/**`, `src/app/visualHarnessGate.ts`, and additive `knip.json`/Biome-scope entries. Phase 2 touches `src/ui/theme/**`, `src/ui/ambient/**`, `src/ui/AppearanceScreen.tsx`, `packages/motion-core/**`, and additive `knip.json` entries. The **only** shared file is `knip.json` (both add entries) — expect a trivial merge there; whichever lands second rebases the one-line addition. No logic conflict.
- **Cross-phase handshake:** Phase 2 Task 9 (appearance baseline) is gated on this harness being merged. Land this phase, then Phase 2's deferred Task 9 can pin `shell/appearance`. If Phase 2 finishes first, its Task 9 stays deferred until this merges — by design (spec §7 provisional goldens).
- **Single simulator = serial sign-off:** both phases require on-device iOS acceptance on the one simulator; sequence the human sign-off even though the branches develop in parallel.

---

## Self-Review (reconciliation against spec + base plan)

- **Spec §5 Phase 1 coverage:** Maestro e2e flows + iOS visual-baseline capture + (documented, non-)CI wiring — all delivered by the adopted base plan; baselines re-scoped to shell/provisional per §5/§7 via **A3/A4**. Exit gate (deliberate change caught) preserved via the base plan's injected-bug proof. ✔
- **Base-plan errors reconciled:** bundle id `io.rtc.mobile` → `io.bettersoftware.rtcmobile` (**A1**, verified `app.config.ts:14`); deep-link forms confirmed empirically (**A2**); stale native-stack hedging retired (Phase 0 merged). ✔
- **Rehaul-phasing reconciled:** module goldens de-scoped (**A3**); Appearance baseline handed to Phase 2 to avoid double-pinning a screen being rebuilt (**A4**). ✔
- **No new placeholders:** every amendment names the exact base-plan task + file + line it patches; the two "confirm empirically" items (deep-link form, chosen fixtures) name the source to check. ✔
- **DRY:** the 42k base plan is referenced, not re-transcribed; only the deltas live here.
```
