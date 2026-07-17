# Reactive Trader Mobile Rehaul (mobile-v1) — Design Spec

**Date:** 2026-07-16
**Target package:** `packages/client-react-native` (`@rtc/client-react-native`)
**Design source of truth:** `docs/design/mobile/v1/` (standalone prototype + `dev-handoff/`)
**Status:** Approved design — to be decomposed into per-phase implementation plans.

---

## 1. Goal

Rehaul the entire UI of the React Native client to match the **mobile-v1 futuristic
"HUD" design prototype**: six switchable themes (dark & light), a radial command-dock
navigation, event-driven motion everywhere (tick flashes, FLIP glides, execution
ceremonies), an ambient background, and a rotation of cinematic Skia boot splash
sequences — while preserving the existing real-data plumbing.

This is a **phased master spec**: one coherent design, decomposed into eight sequential
phases (0–7). Each phase becomes its own implementation plan and its own review/merge
cycle. Later-phase plans are written only once their predecessors have landed and been
signed off on-device (later phases depend on earlier outcomes).

## 2. Current state vs. target (the real gap)

The current client is **feature-complete but built on a static rendering stack**. The
rehaul is less "new screens" and more "a new motion + rendering foundation under
everything."

| Dimension | Today | mobile-v1 target |
|---|---|---|
| Motion/render stack | `react-native-svg` only | + Reanimated 3, **Skia**, gesture-handler, expo-blur, expo-haptics, expo-sensors |
| Themes | 6 skin keys exist; **reduced** token vocab (FX keys deliberately dropped) | full HUD token shape (`gridC/glowC/aurora/`translucent `panel`+blur) × dark/light |
| Navigation | expo-router tab routes | **radial command dock** (hex FAB fans 5 satellites over a blurred scrim) |
| Boot splash | 5 SVG scenes | **8 Skia canvas scenes** (shared 3D kernel, gyro parallax), incremental |
| Ambient bg | none | aurora blobs + HUD grid, per-theme intensity, toggleable |
| Event motion | mostly static | tick flashes, FLIP glides, ceremonies, rank-move glows — off real streams |

**Key finding — theming already anticipated this rehaul.** `src/ui/theme/tokens.ts`
already selects `skin × mode` behind the ViewModel seam, persists via AsyncStorage, and
its `DepthTokens` already ports the 3D shadow/gradient/top-highlight/glow layer. Its own
comment states the FX keys (`blur/glow/grid/aurora`) were "dropped — those belong to the
deferred animation phase." So the theme work in this rehaul is an **extension** of an
existing, correct model — not a rebuild. The 6 skin keys, the mode toggle, the fonts
(Chakra Petch / IBM Plex / JetBrains Mono) are already wired.

## 3. Decisions (locked)

1. **Structure:** one phased master spec (this doc); each phase → its own plan.
2. **Screens:** **rebuild presentation from the prototype** — the prototype markup/layout/
   motion is the target — **but preserve the data seam**: all data continues to flow
   through the `@rtc/react-bindings` ViewModel. No changes to `@rtc/domain`,
   `@rtc/client-core`, or the wire contracts. The dumb-UI grep gates stay green.
3. **Shared math → `@rtc/motion-core`.** The boot 3D projection kernel, FLIP deltas,
   rank-glide, countdown/ring math, and tick-flash keying land as pure zero-dependency
   functions in `@rtc/motion-core`; RN consumes them through thin Skia/Reanimated shells
   (per ADR-005). This keeps the logic portable to the web/Solid clients later.
4. **Boot suite:** **incremental** — port CORE SYNC + UI DRAW-IN first to prove the
   `<BootSequence>` machinery (rotation, skip, persistence, perf), then add the remaining
   six scenes within the boot phase.
5. **Verification:** stand up the deferred **Maestro e2e + iOS visual-baseline** infra
   (spec+plan #149, gated "until the v3 design rehaul lands") as an early phase; per-module
   baselines are pinned in each module's phase; final re-pin in Phase 7.
6. **Platform:** **iOS-first, Android-safe.** Sign-off on the iOS simulator; no iOS-only
   API without an Android fallback, but Android is not a verification gate this pass.

## 4. Cross-cutting constraints (apply to every phase)

- **Dumb-UI doctrine:** no `rxjs` / `localStorage` / `fetch` in `src/ui`; data only via the
  ViewModel seam. Rebuilding presentation must not reach into `domain`/`client-core`.
- **Perf doctrine** (`docs/performance.md`, RN-adapted): animate **only transform/opacity**;
  run animations as Reanimated worklets on the UI thread; use `Layout` transitions for list
  moves (never animate layout props directly); **calm until a real event** — ambient aurora
  is the only idle motion, all feedback (flashes/glides/ceremonies/glows) is driven off the
  real price/trade streams, never timers.
- **Motion-core placement (ADR-005):** autonomous async folds → RxJS machine in
  `client-core`; per-frame DOM/native-edge computation → pure fn in `motion-core` + thin
  shell. Boot math, FLIP, rank-glide, countdown are pure-fn.
- **Reduced motion & ambient toggle:** honor the existing ambient toggle and a
  reduced-motion setting everywhere (skip to static splash, disable aurora/loops).
- **Power-saver mode (React-only today):** the web React client shipped power-saver
  (PR #218; `docs/power-saver-mode.md`) — one toggle that removes the ambient layers,
  stills logo/connection-dot motion, and conflates price re-renders. RN persists the
  `powerSaver` preference via its adapter but has **no UI** for it. This rehaul should
  surface it — a toggle (header/command-dock or appearance settings) plus ambient +
  motion gating — composing with the ambient/reduced-motion toggle above rather than
  duplicating it.
- **All gates cover the package:** Biome, ESLint (base + typed), stylelint N/A, typecheck,
  knip, jest. New native deps require **jest mocks** so the suite stays green. Dep adds
  follow the freshness policy (`pnpm outdated -r`, 24h cooldown, syncpack single range).
- **Native deps require a dev-client rebuild:** the `ios/` folder is gitignored and rebuilt
  per-checkout; run `pnpm dev:ios` once from the primary checkout after Phase 0.

## 5. Phases

Dependency order is strict: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.** Foundation and harness gate
everything; theme/ambient/primitives gate the shell; the shell gates the modules. Boot
(Phase 6) could run parallel to the modules but is placed after so its shared kernel lands
on a proven motion stack.

### Phase 0 — Native foundation & tooling floor
**Deliverable:** the native motion/render stack installed and the app still fully green.
- Add: `react-native-reanimated` (3.x), `@shopify/react-native-skia`,
  `react-native-gesture-handler`, `expo-blur`, `expo-haptics`, `expo-sensors`.
- Wire the Reanimated babel plugin (worklets), wrap the root in `GestureHandlerRootView`.
- Add **jest mocks** for every new native module so existing tests keep passing.
- Rebuild the iOS dev-client (`expo prebuild` / `pnpm dev:ios`).
- **Exit gate:** app boots on the iOS sim rendering a trivial Skia + Reanimated smoke view;
  full gauntlet (typecheck/lint/knip/jest) green; on-device sign-off that nothing regressed.

### Phase 1 — Visual-verification harness (deferred #149 infra)
**Deliverable:** automated regression scaffolding, iOS-first.
- Stand up Maestro e2e flows + iOS visual-baseline screenshot capture + CI wiring.
- Pin baselines for **shell surfaces only** here (boot/lock/appearance); per-module baselines
  are pinned in each module's phase (screens churn as they are rebuilt — the harness is the
  durable asset, not the early goldens). Final full re-pin in Phase 7.
- **Exit gate:** harness runs in CI and locally; a deliberate visual change is caught.

### Phase 2 — Theme completion + ambient background + motion primitives
**Deliverable:** the full HUD theme surface + idle ambient motion + shared primitives.
- Extend RN `ThemeTokens` with the FX keys (`gridC`, aurora intensity, `glowC`, translucent
  `panel` + `expo-blur` semantics) sourced from `dev-handoff/theme-tokens.ts`; keep the
  `skin × mode` ViewModel seam. Load the Orbitron wordmark via `expo-font`.
- Skia **ambient background** component (aurora blobs + HUD grid, per-theme intensity,
  honoring the ambient/reduced-motion toggle).
- Seed `@rtc/motion-core` with the reusable pure primitives (FLIP deltas, rank-glide,
  tick-flash keying, countdown/ring math) + establish the thin Skia/Reanimated shell pattern.
- Rebuild the **Appearance sheet** to prototype fidelity (theme cards, segmented dark/light,
  ambient toggle, replay-boot).
- **Exit gate:** all 6 themes × dark/light render correctly on-device; ambient honors the
  toggle; appearance baseline pinned.

### Phase 3 — Shell: header/status strip + radial command dock
**Deliverable:** the new chrome and navigation model.
- Animated hex-reticle logo (RN SVG + Reanimated rotation loops), env badge, connection
  pulse, telemetry (latency/FPS/clock) from real perf/connection signals.
- **Radial command dock** replaces tab nav: hex FAB fans out 5 satellites
  (Rates/Blotter/Analytics/Credit/Equities) over an `expo-blur` scrim, per-satellite spring
  stagger, ≥44px targets. **Router-backed** (the dock drives expo-router) so deep links and
  the existing route structure survive.
- **Exit gate:** navigation reaches all 5 modules via the dock; deep links still resolve;
  shell baseline pinned.

### Phase 4 — Rates + Blotter
**Deliverable:** the two densest live-data modules, rebuilt.
- **Rates:** tick-flashing spot tiles (Reanimated `withSequence` scale keyed by price dir),
  FLIP filter glides (`Layout` on the grid), trade-ticket bottom sheet, execution ceremony
  (scan → FILLED stamp). Re-wired to the existing pricing/execution ViewModel.
- **Blotter:** live row-insert flash, filter transitions (stayers glide / leavers fade /
  enterers rise) via `FlatList` + `Layout` / `entering` / `exiting`.
- **Exit gate:** flashes/ceremonies fire off real streams; module baselines pinned;
  on-device sign-off.

### Phase 5 — Credit + Equities + Analytics
**Deliverable:** the remaining three modules, rebuilt.
- **Credit:** RFQ cards + countdown rings, streaming dealer quotes, pulsing best-quote
  ACCEPT, accept ceremony (stamp → linger → fade + list glide), New-RFQ cascade, sell-side
  quoting.
- **Equities:** re-ranking movers board (rank-move glow: green up / red down), sparklines,
  live candles (Skia), order ticket + fill toast, positions.
- **Analytics:** streaming Skia P&L area chart, pair P&L bars, breathing exposure bubbles.
- **Exit gate:** all module ceremonies/transitions correct on-device; baselines pinned.

### Phase 6 — Boot suite + lock screen
**Deliverable:** the cinematic boot rotation and the lock screen.
- Skia `<BootSequence>` on the shared `motion-core` 3D kernel (yaw/pitch + perspective
  divide, extracted once). Port **CORE SYNC + UI DRAW-IN first** (prove rotation, SKIP,
  persistence via AsyncStorage `rtm_bootSeq`, fade-out handoff, perf), then the remaining six
  scenes (DOCKING CAM, HOLO PROJECTOR, GEO TACTICAL, LAYER COMPOSITOR, SCHEMATIC CORE, VOL
  TERRAIN) incrementally.
- **Lock screen:** hold-to-unlock progress ring with decay (`Gesture.LongPress` → shared
  value → SVG/Skia `strokeDashoffset`) + `expo-haptics` on unlock.
- **Gyroscope parallax** via `expo-sensors` feeding the boot drift inputs (`mx`,`my`).
- `geo`/`topo` precompute geometry once per boot and only re-project per frame.
- **Exit gate:** ≥2 scenes rotate/skip/persist correctly on-device with no steady-state
  jank; reduced-motion falls back to a static splash.

### Phase 7 — Cross-cutting polish & sign-off
**Deliverable:** the finished, verified rehaul.
- Reduced-motion audit (static splash, ambient off, no loops), haptics pass across
  ceremonies, Hermes perf profile (zero steady-state jank across modules).
- Final on-device sign-off across all **6 themes × dark/light**.
- Full visual-baseline **re-pin** + a Maestro flow per module.
- **Exit gate:** every module + shell + boot passes the harness; on-device sign-off; docs
  (`packages/client-react-native/README.md`, architecture refs) updated.

## 6. Testing strategy

- **Unit (jest + @testing-library/react-native):** covering tests per component/pure-fn;
  motion-core primitives get pure-function unit tests. New native modules mocked.
- **Visual baselines (Phase 1 infra):** iOS screenshots per surface, pinned per phase.
- **Maestro e2e:** one flow per module + boot/lock/appearance, added as surfaces land.
- **On-device sign-off (the primary net):** each phase requires live iOS-simulator
  acceptance before merge — the only reliable catch for jsdom/jest-invisible RN paint bugs
  (per prior rounds #143/#147). Automated tests supplement, never replace, this gate.

## 7. Risks & mitigations

- **Native dependency floor / dev-client churn.** Six native modules → a new dev-client and
  a broad jest-mock surface. *Mitigation:* Phase 0 isolates this; nothing visual ships until
  the stack is green and signed off on-device.
- **jsdom/jest-invisible paint bugs.** RN visual bugs don't surface in the unit suite.
  *Mitigation:* per-phase on-device sign-off + the Phase 1 visual-baseline harness.
- **Baseline churn during rebuilds.** Pinning module goldens early wastes effort. *Mitigation:*
  harness early, module baselines per phase, one final re-pin in Phase 7.
- **Perf regressions from continuous motion.** *Mitigation:* the calm-until-real-event
  principle, transform/opacity-only, worklets, and a Hermes profile gate in Phase 7.
- **Navigation model change.** Replacing tabs with the dock could break deep links.
  *Mitigation:* keep the dock router-backed so existing routes/links survive.
- **Scope creep across 8 phases.** *Mitigation:* phase exit gates; later-phase plans written
  only after predecessors land.

## 8. Out of scope (this rehaul)

- Android verification/sign-off (kept Android-safe, not gated).
- Changes to `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`, or the wire protocol.
- New product features beyond what the mobile-v1 prototype depicts.
- Web/Solid client changes (they will consume the shared `motion-core` math later, but that
  is separate work).
