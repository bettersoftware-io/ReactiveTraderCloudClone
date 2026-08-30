/**
 * The visual-harness scenario ids — the pure, Node-safe source of truth the
 * `simctl` / Maestro runners iterate.
 *
 * Kept free of ANY React Native import: the tsx/Node runners load this file
 * directly, whereas importing the full `scenarios.tsx` registry pulls RN leaf
 * components (Blotter, ConnectionBanner, …) that esbuild cannot transform
 * outside Metro (react-native's flow-typed `index.js` throws
 * "Unexpected typeof"). `scenarios.tsx` builds its registry against these ids
 * and `scenarios.test.tsx` asserts the two stay in sync.
 */
export const SCENARIO_IDS = [
  "blotter/seeded",
  "shell/connection-banner",
  // Phase 2 Task 9: the pinned Appearance sheet — ambient frozen via
  // VisualScenarioHost's `forceReduceMotion`.
  "shell/appearance",
  // T6: the persistent HUD chrome — header, banner, status strip, collapsed
  // radial dock. Every other scenario mounts a module's content with no chrome
  // above it, so this is the only golden covering the frame the user actually
  // looks at all session. Needs BOTH a frozen `ShellTelemetryContext` (the FPS
  // cell is a live meter) and `powerSaverLevel="freeze"` (the connection dot
  // pulses); either alone still re-pins on every capture.
  "shell/chrome",
  // The same HUD frame with the radial command dock FANNED OPEN over a framed
  // Rates grid — the arc the prototype's `shell/dock-open.png` shows. The
  // dock's `open` flag is internal `useState` reached only by a tap, so this
  // state had no golden until `DockOpenContext` (a harness-only pin on its
  // INITIAL value). Needs `powerSaverLevel="freeze"` like `shell/chrome`, and
  // for one extra reason: the satellites spring out on a staggered delay, so
  // an unfrozen capture pins a mid-fan frame.
  "shell/dock-open",
  // NB: `credit/rfq-tiles-empty` was dropped after on-device golden
  // verification — it is NON-deterministic. `CreditRfqSimulator` emits new
  // Live RFQs over time, so the default "No RFQs to display" view is only
  // momentary (re-capture diffs swung 0.7% ↔ 11.9% vs a fixed golden). The two
  // fixtures above are rock-stable (0.02%). Restore a Credit fixture only with
  // a frozen-clock / cascade-disabled harness variant.
  // Phase 6a Task 10: the two ported boot scenes and the static-splash
  // fallback, each pinned to a fixed `elapsedSec`/state rather than mounted
  // live — see `scenarios.tsx`'s header comment for why a free-running boot
  // canvas can never be a stable golden.
  "boot/core",
  "boot/laser",
  // Phase 6b-1 Task 10: the `docking` boot scene, pinned to the same shared
  // `BOOT_SCENE_ELAPSED_SEC` as `boot/core`/`boot/laser` — see
  // `scenarios.tsx`'s header comment for why that instant still lands well.
  "boot/docking",
  // Phase 6b-2a Tasks 5/8: the two projected-3D scenes, on the same shared
  // `BOOT_SCENE_ELAPSED_SEC`. That instant is mid-boot, which for these two is
  // deliberately the busiest frame rather than a convenient one — `hologram`
  // has columns still assembling AND risen columns drawn together, and
  // `layers` is inside its inspection window with a panel pulled out. A
  // quieter instant would leave most of both scenes uncovered by the golden.
  "boot/hologram",
  "boot/layers",
  // Phase 6b-2b: `geo`, `jarvis` and `topo`. `topo` was DELIBERATELY ABSENT
  // until 2026-08-01 — it prints a live wall-clock timestamp, so two captures
  // minutes apart differed and the golden could never reproduce itself (same
  // class as `credit/rfq-tiles-empty`, dropped above). It qualifies now that
  // `BootSequenceFixture` pins `now` via `BootClockContext`, which the
  // scene prefers over its mount-time `new Date()`. The footer stamp is kept
  // rather than dropped, so the golden asserts the frame the app really draws.
  "boot/geo",
  "boot/jarvis",
  "boot/topo",
  "boot/static",
  // Phase 6 T6: the Rates grid, unblocked by the host-wide pricing pin.
  "rates/grid",
  // The spot trade ticket over that same grid — the REAL `TradeTicketSheet`,
  // presented for the fake's first pair. Deterministic for the same reason
  // `rates/grid` is; see `scenarios.tsx`.
  "rates/ticket",
  // Phase 6a Task 9: the hold-to-unlock ring at a fixed mid-fill progress.
  "lock/hold",
  // Phase 5c Task 7: the three Analytics cards. Analytics was previously
  // excluded from this harness outright — `AnalyticsSimulator` seeds its P&L
  // history with a `Math.random` walk and (since 5c Task 1) drifts positions
  // every 10 s. It qualifies now only because it is mounted as
  // `AnalyticsDashboard` over a literal book, with power-saver `freeze` seeded
  // so the bars' and bubbles' entry tweens hold at rest. Both halves are
  // required; pinned data alone would still be captured mid-tween.
  "analytics/dashboard",
  // Phase 5a Task 10: the rebuilt Credit surfaces. `credit/rfq-tiles-empty`
  // was dropped above for non-determinism; these two qualify because they pin
  // BOTH halves of it — literal RFQs/quotes (mounting `RfqCard`/
  // `SellSideTicket`, not the seam-reading panels) AND `pinnedRemainingMs`,
  // which overrides the live `useRfqCountdown` clock that would otherwise make
  // the ring and its seconds readout differ between any two captures. Each
  // also seeds power-saver `freeze`, without which the ring's 1s glide and the
  // ACCEPT halo can be caught mid-flight.
  "credit/rfq-tiles",
  "credit/sell-side",
  // Mobile-v1 fidelity item 11: the New-RFQ form, the third and last Credit
  // sub-nav view. Deterministic without any clock pin — unlike its two
  // siblings above it reads no countdown and mounts no simulator-fed list;
  // its whole surface is the instrument/direction/quantity chips and the
  // broadcast button, seeded by `NewRfqForm`'s `initialSelection` prop
  // (the harness cannot tap before it shoots). `freeze` is still seeded for
  // the SHELL around it, whose connection dot pulses.
  "credit/new-rfq",
  // Phase 5b Task 10: the Equities module's first three scenarios — Markets
  // (movers board + sector heatmap), Trade (instrument header, candle chart,
  // depth ladder, order ticket) and Blotters (orders/positions). All three
  // seed `powerSaverLevel="freeze"`, the same pin `credit/rfq-tiles` and
  // `shell/chrome` use: this module has the widest Reanimated surface of any
  // phase so far (rank-glide LinearTransition/FadeIn/FadeOut, the tick-flash
  // header, the order ceremony's FadeIn), all gated by `useShellMotionEnabled`
  // and NOT by `forceReduceMotion` (see `scenarios.tsx`'s header comment on
  // that distinction). UNLIKE `rates/grid`'s `PricingSimulator`, the equities
  // `EquityMarketDataSimulator` `portFactory.ts` builds here has NO injectable
  // pin (`PortFactoryDeps` carries `pricingPinMs`/`blotterSeedBaseMs`, nothing
  // equities-shaped) — its per-symbol quote stream ticks live on a real 500ms
  // `interval` with no way to freeze it from this harness. `markets` and
  // `trade` are therefore the SAME risk class as the dropped
  // `credit/rfq-tiles-empty`: registered here because Task 10's own scope
  // stops short of a booted simulator, but NOT yet proven to reproduce.
  // `blotter` is unaffected — `EquityPositionSimulator`/`EquityOrderSimulator`
  // both start empty with no seed and touch no price stream until an order is
  // placed, so it never subscribes to the ticking simulator at all. See
  // docs/rn-open-items.md T46 for the full risk writeup and what to do if a
  // native capture proves `markets`/`trade` non-deterministic.
  "equities/markets",
  "equities/trade",
  "equities/blotter",
] as const;
