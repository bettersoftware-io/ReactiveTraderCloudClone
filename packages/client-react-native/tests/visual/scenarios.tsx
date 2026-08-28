import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { ReactNode } from "react";

import { ConnectionStatus } from "@rtc/domain";

import { BlotterModule } from "#/ui/blotter/BlotterModule";
import { CreditNav } from "#/ui/credit/CreditNav";
import { BlottersView } from "#/ui/equities/blotters/BlottersView";
import { EquitiesNav } from "#/ui/equities/EquitiesNav";
import { MarketsView } from "#/ui/equities/markets/MarketsView";
import { TradeView } from "#/ui/equities/trade/TradeView";
import { RatesModule } from "#/ui/rates/RatesModule";
import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
import { BootEmblem } from "#/ui/shell/boot/BootEmblem";
import { CoreScene } from "#/ui/shell/boot/scenes/CoreScene";
import { DockingScene } from "#/ui/shell/boot/scenes/DockingScene";
import { GeoScene } from "#/ui/shell/boot/scenes/GeoScene";
import { HologramScene } from "#/ui/shell/boot/scenes/HologramScene";
import { JarvisScene } from "#/ui/shell/boot/scenes/JarvisScene";
import { LaserScene } from "#/ui/shell/boot/scenes/LaserScene";
import { LayersScene } from "#/ui/shell/boot/scenes/LayersScene";
import { TopoScene } from "#/ui/shell/boot/scenes/TopoScene";

import type { Scenario } from "./driver";
import {
  AnalyticsDashboardFixture,
  BootSceneFixture,
  CreditRfqTilesFixture,
  CreditSellSideFixture,
  LockHoldFixture,
  ModuleScreenFixture,
  ShellChromeFixture,
  ShellFrameFixture,
} from "./fixtures";
import { VisualScenarioHost } from "./VisualScenarioHost";

/**
 * Rehaul Phase 1 amendment A3: the module screens the base plan originally
 * pinned (`fx/tile-up-holo3d` etc.) are rebuilt in Phases 4-6, so pinning
 * their goldens now would churn immediately. These three "prove-the-harness"
 * fixtures exist on `main` today and render deterministically on sim ports —
 * each is a leaf whose default sim-port state carries no `Math.random()` or
 * live-ticking data (verified against the domain simulators):
 *
 * DETERMINISM, restated for the Phase 6a Task 10 additions below: a boot
 * scene animates `elapsedSec` from `BootCanvas`'s `useFrameCallback` (a real
 * UI-thread clock), and `BootSequenceMachine`'s progress ramp ticks off a
 * real `rxjs timer` regardless of motion settings — mounting either live
 * would race the capture exactly like the dropped `credit/rfq-tiles-empty`
 * fixture below, just with a canvas/percentage instead of a cascading list.
 * `boot/core` and `boot/laser` sidestep this by never mounting `BootCanvas`
 * or `BootSequence` at all: each renders its `CoreScene`/`LaserScene` leaf
 * directly inside a bare `<Canvas>` (`BootSceneFixture` in `./fixtures.tsx` —
 * split out of this file so Biome's `useComponentExportOnlyModules` doesn't
 * collide with `SCENARIOS`/`getScenario` below, which aren't components),
 * fed a `useSharedValue` pinned to one fixed `elapsedSec` instead of the live
 * frame callback, and a `useGyroDrift` built with `enabled=false` so the
 * pointer stays centred (it never subscribes to the device gyroscope either
 * way). `boot/static` avoids the same free-running progress ramp by not
 * mounting `BootSequence` either — see its own comment below. `lock/hold`
 * (`LockHoldFixture`, same file) uses the same pin-a-fixed-value idiom for
 * the ring's `progress` `SharedValue`, in place of a live `useHoldToUnlock`
 * gesture that only moves while actually held.
 *
 * - `blotter/seeded` — the Blotter tab on sim ports. On-device capture
 *   (rehaul Phase 1 driver-tier verification) found this is NOT empty:
 *   `TradeStoreSimulator` (`packages/domain/src/simulators/TradeStoreSimulator.ts`)
 *   pre-seeds 5 trades at construction time — EURUSD Buy Done, USDJPY Sell
 *   Done, GBPUSD Buy Rejected, EURJPY Sell Done, AUDUSD Buy Done — so the
 *   default state is always the populated list, not "No trades yet". The
 *   seed is a static literal array (no `Math.random`, no live ticking), so
 *   the populated list is exactly as deterministic as an empty one would
 *   have been — renamed to match reality rather than forcing an artificial
 *   empty premise.
 * - `shell/connection-banner` — the connection-status pill. The fake's
 *   `useConnectionStatus` defaults to CONNECTED everywhere (matching what the
 *   old live composition produced for every scenario), so this is the one
 *   scenario that pins a `viewModelOverrides` DISCONNECTED instead — it
 *   exists to capture the banner's full surface INCLUDING its Reconnect
 *   affordance, which only renders when the status is neither CONNECTED nor
 *   CONNECTING.
 * A third fixture, `credit/rfq-tiles-empty`, was TRIED and DROPPED: on-device
 * golden verification proved it non-deterministic. `CreditRfqSimulator` emits
 * NEW Live RFQs over time, so the default "No RFQs to display" view is only
 * momentary — re-capture diffs swung 0.7% ↔ 11.9% against a fixed golden
 * (static analysis had wrongly assumed the seed RFQs stay terminal). Restore a
 * Credit fixture only behind a frozen-clock / cascade-disabled harness variant.
 *
 * - `shell/appearance` — the rebuilt Appearance sheet (Phase 2 Task 7),
 *   pinned open via `AppearanceOverlay`'s own `open`/`onClose` props (not the
 *   host). It reads only theme/motion/power-saver preference presenters, all
 *   seeded synchronously by the fake ViewModel — no live-ticking source.
 *   Since 2026-08-28 the sheet opens over a FRAMED Rates grid
 *   (`ShellFrameFixture`), the way the prototype shows it and the way a user
 *   reaches it from the app's index route; `forceReduceMotion={false}` puts
 *   the ambient layer on beneath it (so the Ambient toggle reads ON, as the
 *   prototype's does) and `freeze` holds that layer at its resting frame.
 *   `AppearanceOverlay` mounts a `BottomSheetModal`, whose internals call
 *   `useBottomSheetModalInternal()` unconditionally and throw
 *   `'BottomSheetModalInternalContext' cannot be null!'` with no
 *   `BottomSheetModalProvider` ancestor — real in the app, because
 *   `app/(app)/_layout.tsx` supplies one, but this route is a SIBLING of
 *   `(app)`, not inside it (see `app/__visual/[...id].tsx`), and
 *   `VisualScenarioHost` itself supplies only `ViewModelProvider` +
 *   `ThemeProvider`. So this scenario wraps `AppearanceOverlay` in its own
 *   `BottomSheetModalProvider` below — scoped to this one scenario, not
 *   added to `VisualScenarioHost`, which no other scenario needs.
 *
 * - `shell/chrome` — the persistent HUD frame itself (header, connection
 *   banner, status strip, collapsed radial dock) via `ShellChromeFixture`:
 *   `ShellFrameFixture` around an EMPTY body. Originally the one scenario
 *   that was not a module's content — until 2026-08-28 every other one was
 *   content-only under a `ScreenContentFixture`, which left the frame the
 *   user stares at all session with zero pixel coverage (T6). Every module
 *   scenario is now FRAMED too (see `ShellFrameFixture`'s docstring for why:
 *   the prototype comparison in `reference-shots/DRIFT.md` was mostly
 *   measuring the missing chrome), and this one stays as the isolated
 *   witness — a chrome regression is one red golden here, not the same rows
 *   of pixels moving in ten. Carries `powerSaverLevel="freeze"` for the
 *   header's pulsing connection dot, and the fixture pins the status strip's
 *   live FPS meter through `ShellTelemetryContext` — see its docstring for
 *   why neither half alone is sufficient.
 *
 * NOTHING IS EXPLICITLY AVOIDED ANY MORE. The two surfaces that were are worth
 * keeping on the record, because each was freed by an opposite move.
 *
 * The **Rates** tab was excluded outright: `PricingSimulator` moved every cell
 * twice over — a `Math.random()` seed walk at construction plus a live tick
 * loop. `rates/grid` covers it now because the SOURCE was pinned:
 * `VisualScenarioHost` passes a host-wide `pricingPinMs`, under which the walk
 * is skipped and the tick loop never schedules, so the grid renders at its
 * `KNOWN_CURRENCY_PAIRS` reference prices, at rest (T6).
 *
 * **Analytics** was excluded for the same reason — `AnalyticsSimulator` seeds
 * its P&L history with a `Math.random` walk at construction, and since Phase 5c
 * Task 1 it also drifts positions every 10 s. `analytics/dashboard` covers it
 * by NOT pinning the simulator but declining to mount it: Phase 5c Task 7 split
 * the cards out as `AnalyticsDashboard`, which takes its data as a prop, so the
 * fixture feeds it a literal book. That removes the data non-determinism; the
 * SECOND source — the bars' and bubbles' entry tweens — is removed by seeding
 * power-saver `freeze`. Neither half alone is sufficient.
 *
 * Which of the two applies is a judgement about the seam, not a preference:
 * pin the source when the screen under test IS the live one (Rates is nothing
 * but prices); mount the leaf over a literal when the component already takes
 * its data as a prop and the simulator would only add noise.
 *
 * - `boot/core` / `boot/laser` — the two Phase 6a boot scenes, each pinned to
 *   `fixtures.tsx`'s `BOOT_SCENE_ELAPSED_SEC` via `BootSceneFixture`. **Their
 *   Phase 6a goldens are now stale by design**: Phase 6b-1 backfilled `core`
 *   to all 12 of the web's elements (7 deferred layers + the whole-frame holo
 *   flicker) and `laser` from border-trace-only to the full web draw, so both
 *   scenes paint materially more than the goldens on `main` show. Treat a
 *   diff against the pre-6b-1 goldens as an EXPECTED recapture, not a
 *   regression — Task 11 (on-device) is where they get re-pinned.
 * - `boot/docking` — Phase 6b-1's third scene (the "escort craft lock-on" HUD,
 *   the last boot scene needing no `project3d` camera kernel), pinned to the
 *   SAME shared `BOOT_SCENE_ELAPSED_SEC` as `core`/`laser` above rather than a
 *   scene-specific constant: at that instant `docking` is mid-`TARGET LOCKED`
 *   with the craft at ~80% size and the lock box nearly closed — a good,
 *   non-degenerate frame — so there was no need to add the second pinned
 *   constant the plan allows for (which would only be worth the churn if this
 *   scene read blank or degenerate at the shared instant).
 * - `boot/static` — the reduced-motion/Freeze fallback: `BootEmblem` alone,
 *   the only thing `BootSequence` paints once `BootCanvas` is gated off (no
 *   wordmark/progress chrome here — that lives inside the real
 *   `BootSequenceMachine`, whose live progress ramp is exactly the
 *   non-determinism this fixture exists to avoid). **Pinned with
 *   `powerSaverLevel="freeze"`, and that is load-bearing (T16/T33).**
 *   `BootEmblem` runs a 900 ms opacity pulse; it used to gate only on
 *   `AccessibilityInfo.isReduceMotionEnabled()`, an OS-level signal the
 *   harness has no authority over, so this was the one scenario capturing a
 *   *live animation*. Measured 2026-08-04: six raw screenshots back-to-back
 *   off one mount climbed 24 → 61 → 93 → 118 → 133 in max channel delta.
 *   Crucially the captures still reproduced, because the driver's fixed
 *   `postReadySettleMs` re-samples the same phase — so the golden looked
 *   stable while being a phase sample, and reading that stability as "the
 *   scene is static, therefore a mismatch means the golden is stale" cost a
 *   real investigation (T33 in `docs/rn-open-items.md`). The emblem now routes
 *   through `useBootMotionEnabled`, which encodes "Freeze always wins", so
 *   seeding `freeze` here pins it to its resting frame like any other
 *   scenario.
 * - `lock/hold` — `HoldToUnlockRing` alone at a fixed mid-fill `progress`
 *   (`fixtures.tsx`'s `LOCK_HOLD_PROGRESS`), with a freshly-built,
 *   never-triggered `LongPressGesture` satisfying its `gesture` prop.
 *
 * - `equities/markets` / `equities/trade` / `equities/blotter` — Phase 5b
 *   Task 10, the Equities module's first three scenarios. Each mounts one
 *   sub-view (`MarketsView`/`TradeView`/`BlottersView`, the same pieces
 *   `EquitiesScreen` switches between) under the screen's segmented
 *   `EquitiesNav` pinned to that view, inside `ModuleScreenFixture` (the
 *   screen's own `bgPrimary` root) inside `ShellFrameFixture` — none of the
 *   three is full-bleed. All three seed
 *   `powerSaverLevel="freeze"`: this module has the widest Reanimated surface
 *   of any phase so far — `MoversBoard`'s rank-glide
 *   `LinearTransition`/`FadeIn`/`FadeOut`, `InstrumentHeader`'s tick-flash,
 *   `OrderCeremony`'s `FadeIn`, `OrdersBlotter`'s newest-row flash — every one
 *   gated by `useShellMotionEnabled`, which reads power-saver rather than
 *   `forceReduceMotion` (the `animatedBackground`-only gate; see
 *   `analytics/dashboard` and `shell/chrome` above). `markets`/`trade` pin
 *   `selectedSymbol="AAPL"` (the watchlist's first instrument) so the golden
 *   also covers the selected-row ring in `MoversRow`/`SectorHeatmap` and
 *   `TradeView` never falls into its unselected "Select an instrument…"
 *   empty state.
 *
 *   **`markets` and `trade` carry a KNOWN, UNPROVEN determinism risk — the
 *   same class as the dropped `credit/rfq-tiles-empty`.** `rates/grid` and
 *   `blotter/seeded` are captured over data the harness can freeze
 *   (`PortFactoryDeps.pricingPinMs` / `blotterSeedBaseMs`); the equities
 *   `EquityMarketDataSimulator` `createSimulatorPorts` builds here has NO
 *   equivalent pin, and its per-symbol quote stream ticks live on a real
 *   500 ms `interval` regardless of power-saver level (freeze only gates
 *   ANIMATION, not the underlying price data). `MoversRow`'s price/pct
 *   column and `InstrumentHeader`'s price text can therefore differ between
 *   captures depending on how many ticks land before the driver's
 *   `postReadySettleMs` screenshot — a risk this task's own scope (no booted
 *   simulator) cannot settle. `blotter` is unaffected: `EquityPositionSimulator`
 *   /`EquityOrderSimulator` both start empty with no seed and subscribe to no
 *   price stream until an order is placed. See `docs/rn-open-items.md` T46
 *   for the full writeup and what to do if a native capture proves
 *   `markets`/`trade` non-reproducible (the `credit/rfq-tiles-empty` playbook:
 *   drop it, or add a pin the way T6 added `pricingPinMs`).
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: "blotter/seeded",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        // `powerSaverLevel="freeze"` is load-bearing, and this scenario was
        // the last one still missing it. `TradeRow`'s newest-row flash and the
        // list's entry transitions are gated by `useShellMotionEnabled`, which
        // reads power-saver — NOT by `forceReduceMotion`, which seeds
        // `animatedBackground` and gates the ambient layer alone (the same
        // distinction `analytics/dashboard` and `credit/rfq-tiles` document).
        //
        // Measured 2026-08-12 across three captures of identical fixture data:
        // 0.59% of pixels differed between runs without it, 0.08% with it. The
        // drift was invisible for as long as it was because the live simulator
        // delivered trades over time, so the rows had usually finished
        // animating before the capture; a static fixture mounts all six rows at
        // once and they animate together, right where the shot lands.
        <VisualScenarioHost
          skin="holo3d"
          mode="dark"
          powerSaverLevel="freeze"
          forceReduceMotion={false}
        >
          <ShellFrameFixture module="blotter">
            <BlotterModule />
          </ShellFrameFixture>
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "shell/connection-banner",
    skin: "classic",
    mode: "light",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost
          skin="classic"
          mode="light"
          powerSaverLevel="freeze"
          // The fake defaults `useConnectionStatus` to CONNECTED — matching
          // what the old live composition produced for every scenario — so
          // this is the one scenario that opts out: it exists to capture the
          // banner's full surface INCLUDING its Reconnect affordance, which
          // `ConnectionBanner` only renders when the status is neither
          // CONNECTED nor CONNECTING. The banner is part of the frame (it sits
          // between the header and the body in `Chrome`), so the frame with
          // an empty body IS the scenario; `freeze` stills the header's
          // connection dot, which pulses while disconnected.
          viewModelOverrides={{
            useConnectionStatus: () => {
              return ConnectionStatus.DISCONNECTED;
            },
          }}
        >
          <ShellFrameFixture module="rates" />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "shell/appearance",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost
          skin="holo3d"
          mode="dark"
          powerSaverLevel="freeze"
          forceReduceMotion={false}
        >
          {/* BottomSheetModalProvider, scoped to THIS scenario only — see the
              file-level comment above. `app/(app)/_layout.tsx` supplies one
              for the real app, but this harness route sits outside that
              layout, and neither VisualScenarioHost nor ShellFrameFixture
              provides one for the other scenarios, which present no sheet.
              The sheet opens over the framed Rates grid, which is where the
              prototype shows it (and where a user opens it from: `/` is the
              app's index route). */}
          <BottomSheetModalProvider>
            <ShellFrameFixture module="rates">
              <RatesModule />
            </ShellFrameFixture>
            <AppearanceOverlay open onClose={(): void => {}} />
          </BottomSheetModalProvider>
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "shell/chrome",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark" powerSaverLevel="freeze">
          <ShellChromeFixture />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "boot/core",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <BootSceneFixture Scene={CoreScene} />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "boot/laser",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <BootSceneFixture Scene={LaserScene} />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "boot/docking",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <BootSceneFixture Scene={DockingScene} />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "boot/hologram",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <BootSceneFixture Scene={HologramScene} />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "boot/layers",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <BootSceneFixture Scene={LayersScene} />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "boot/geo",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <BootSceneFixture Scene={GeoScene} />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "boot/jarvis",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <BootSceneFixture Scene={JarvisScene} />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "boot/topo",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <BootSceneFixture Scene={TopoScene} />
        </VisualScenarioHost>
      );
    },
  },
  {
    // T6: the Rates grid — the app's busiest screen, and until the pricing pin
    // existed it had no scenario at all, because every cell moved twice over
    // (a `Math.random()` seed walk plus a live tick loop). `VisualScenarioHost`
    // now pins pricing host-wide, so the grid renders at its reference prices,
    // at rest. `freeze` additionally stills the tick-flash pips, which are
    // driven by a nonce rather than by the price stream and so survive a pin.
    id: "rates/grid",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost
          skin="holo3d"
          mode="dark"
          powerSaverLevel="freeze"
          forceReduceMotion={false}
        >
          <ShellFrameFixture module="rates">
            <RatesModule />
          </ShellFrameFixture>
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "boot/static",
    skin: "holo",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo" mode="dark" powerSaverLevel="freeze">
          <BootEmblem />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "lock/hold",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <LockHoldFixture />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "analytics/dashboard",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        // `powerSaverLevel="freeze"` is load-bearing, not a stylistic choice:
        // it is the only gate that stops the Analytics bars and bubbles from
        // being captured part-way through their entry tweens.
        // `forceReduceMotion` (on by default) does NOT cover them — it seeds
        // `animatedBackground`, which gates the ambient layer alone.
        <VisualScenarioHost
          skin="holo3d"
          mode="dark"
          powerSaverLevel="freeze"
          forceReduceMotion={false}
        >
          <ShellFrameFixture module="analytics">
            <AnalyticsDashboardFixture />
          </ShellFrameFixture>
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "credit/rfq-tiles",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        // `powerSaverLevel="freeze"` is load-bearing, exactly as for
        // `analytics/dashboard`: it is the only gate that holds the countdown
        // ring's 1s glide and the best-quote ACCEPT halo at rest.
        // `forceReduceMotion` seeds `animatedBackground`, which gates the
        // ambient layer alone and touches neither.
        <VisualScenarioHost
          skin="holo3d"
          mode="dark"
          powerSaverLevel="freeze"
          forceReduceMotion={false}
        >
          <ShellFrameFixture module="credit">
            <ModuleScreenFixture>
              <CreditNav view="tiles" onChange={(): void => {}} />
              <CreditRfqTilesFixture />
            </ModuleScreenFixture>
          </ShellFrameFixture>
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "credit/sell-side",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost
          skin="holo3d"
          mode="dark"
          powerSaverLevel="freeze"
          forceReduceMotion={false}
        >
          <ShellFrameFixture module="credit">
            <ModuleScreenFixture>
              <CreditNav view="sell-side" onChange={(): void => {}} />
              <CreditSellSideFixture />
            </ModuleScreenFixture>
          </ShellFrameFixture>
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "equities/markets",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        // freeze is load-bearing here, exactly as for `credit/rfq-tiles`: it
        // is the only gate that holds MoversBoard's rank-glide
        // LinearTransition/FadeIn/FadeOut at rest.
        <VisualScenarioHost
          skin="holo3d"
          mode="dark"
          powerSaverLevel="freeze"
          forceReduceMotion={false}
        >
          <ShellFrameFixture module="equities">
            <ModuleScreenFixture>
              <EquitiesNav view="markets" onChange={(): void => {}} />
              <MarketsView
                selectedSymbol={PINNED_EQUITY_SYMBOL}
                onSelect={(): void => {}}
              />
            </ModuleScreenFixture>
          </ShellFrameFixture>
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "equities/trade",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        // freeze holds InstrumentHeader's tick-flash and OrderCeremony's
        // FadeIn at rest, mirroring `equities/markets` above.
        <VisualScenarioHost
          skin="holo3d"
          mode="dark"
          powerSaverLevel="freeze"
          forceReduceMotion={false}
        >
          <ShellFrameFixture module="equities">
            <ModuleScreenFixture>
              <EquitiesNav view="trade" onChange={(): void => {}} />
              <TradeView
                selectedSymbol={PINNED_EQUITY_SYMBOL}
                onSelect={(): void => {}}
              />
            </ModuleScreenFixture>
          </ShellFrameFixture>
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "equities/blotter",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        // freeze holds OrdersBlotter's newest-row flash at rest; moot today
        // (BlottersView mounts with no orders/positions seeded — see the
        // header comment above), kept for the same "pin it, don't rely on an
        // empty seed staying empty" reasoning as the other two.
        <VisualScenarioHost
          skin="holo3d"
          mode="dark"
          powerSaverLevel="freeze"
          forceReduceMotion={false}
        >
          <ShellFrameFixture module="equities">
            <ModuleScreenFixture>
              <EquitiesNav view="blotters" onChange={(): void => {}} />
              <BlottersView />
            </ModuleScreenFixture>
          </ShellFrameFixture>
        </VisualScenarioHost>
      );
    },
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => {
    return s.id === id;
  });
}

/** Symbol pinned for `equities/markets`/`equities/trade`: the watchlist's
 * first instrument (`EquityMarketDataSimulator`'s `WATCHLIST`/`SEED_PRICES`,
 * domain-internal and not exported, so repeated here as a literal — same
 * move `fixtures.tsx`'s `PINNED_INSTRUMENTS` makes for Credit). Selecting one
 * also exercises the selected-row ring in `MoversRow`/`SectorHeatmap` and
 * keeps `TradeView` out of its unselected "Select an instrument…" empty
 * state. */
const PINNED_EQUITY_SYMBOL = "AAPL";
