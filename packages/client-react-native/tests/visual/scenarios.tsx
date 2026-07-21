import type { ReactNode } from "react";

import { Blotter } from "#/ui/Blotter";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
import { BootEmblem } from "#/ui/shell/boot/BootEmblem";
import { CoreScene } from "#/ui/shell/boot/scenes/CoreScene";
import { LaserScene } from "#/ui/shell/boot/scenes/LaserScene";

import type { Scenario } from "./driver";
import { BootSceneFixture, LockHoldFixture } from "./fixtures";
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
 * - `shell/connection-banner` — the connection-status pill. The simulator's
 *   `ConnectionEventsPort` (built fresh per host mount, not the shared
 *   `ConnectionEventsSimulator` used by the real app) emits a single
 *   synchronous `gatewayConnected`, so the pill always settles on "Live".
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
 *   seeded synchronously by `VisualScenarioHost`'s `PreferencesSimulator` —
 *   no live-ticking source. The overlay is an opaque full-screen sheet (no
 *   ambient layer beneath it here), and `forceReduceMotion` seeds
 *   `animatedBackground: false` so the Ambient toggle deterministically reads
 *   OFF — both keep the shot stable.
 *
 * Explicitly avoided: the Rates tab (`PricingSimulator` ticks with
 * `Math.random`) and Analytics (`AnalyticsSimulator`'s P&L history is seeded
 * with a `Math.random` walk at construction).
 *
 * - `boot/core` / `boot/laser` — the two Phase 6a boot scenes, each pinned to
 *   `fixtures.tsx`'s `BOOT_SCENE_ELAPSED_SEC` via `BootSceneFixture`.
 * - `boot/static` — the reduced-motion/Freeze fallback: `BootEmblem` alone,
 *   the only thing `BootSequence` paints once `BootCanvas` is gated off (no
 *   wordmark/progress chrome here — that lives inside the real
 *   `BootSequenceMachine`, whose live progress ramp is exactly the
 *   non-determinism this fixture exists to avoid). Note: `BootEmblem`'s own
 *   pulse loop is gated by `AccessibilityInfo.isReduceMotionEnabled()` (an
 *   OS-level signal, not this app's preferences), so it is NOT frozen by
 *   anything this harness controls — Task 11's on-device capture should
 *   confirm whether that introduces the same class of variance that got
 *   `credit/rfq-tiles-empty` dropped, before this golden is trusted blind.
 * - `lock/hold` — `HoldToUnlockRing` alone at a fixed mid-fill `progress`
 *   (`fixtures.tsx`'s `LOCK_HOLD_PROGRESS`), with a freshly-built,
 *   never-triggered `LongPressGesture` satisfying its `gesture` prop.
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: "blotter/seeded",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <Blotter />
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
        <VisualScenarioHost skin="classic" mode="light">
          <ConnectionBanner />
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
        <VisualScenarioHost skin="holo3d" mode="dark">
          <AppearanceOverlay open onClose={(): void => {}} />
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
    id: "boot/static",
    skin: "holo",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo" mode="dark">
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
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => {
    return s.id === id;
  });
}
