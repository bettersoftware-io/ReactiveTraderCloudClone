import { Canvas } from "@shopify/react-native-skia";
import type { ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";

import type { PositionUpdates } from "@rtc/domain";

import { AnalyticsDashboard } from "#/ui/analytics/AnalyticsDashboard";
import type { BootSceneComponent } from "#/ui/shell/boot/bootScene";
import { useGyroDrift } from "#/ui/shell/boot/useGyroDrift";
import { HoldToUnlockRing } from "#/ui/shell/lock/HoldToUnlockRing";
import { useTheme } from "#/ui/theme/useTheme";

/**
 * Component-only module, split out of `scenarios.tsx` so Biome's
 * `useComponentExportOnlyModules` stays happy: that file's primary exports
 * (`SCENARIOS`, `getScenario`) are data/a lookup function, not components, and
 * the rule forbids a file from exporting both a component and a non-component
 * (mirrors why `bootScene.ts` keeps the non-component `BOOT_SCENES` map out of
 * any scene's own file — see its header comment).
 *
 * Both fixtures below exist to pin a Phase 6a boot/lock surface to one
 * deterministic frame instead of mounting it live — see `scenarios.tsx`'s
 * header comment for the full "why a free-running clock can't be a stable
 * golden" rationale.
 */
export function BootSceneFixture({ Scene }: BootSceneFixtureProps): ReactNode {
  const { width, height } = useWindowDimensions();
  // Read outside the <Canvas> below and pass in as a prop: Skia's canvas is a
  // separate reconciler React Context can't cross (see BootSceneProps.theme).
  const theme = useTheme();
  const elapsedSec = useSharedValue(BOOT_SCENE_ELAPSED_SEC);
  // `false`: never subscribes to the device gyroscope regardless (see
  // `useGyroDrift`), so `drift` stays centred for the whole capture — the
  // second half of a deterministic pin alongside `elapsedSec`.
  const drift = useGyroDrift(false);

  return (
    <Canvas
      testID="boot-canvas"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Scene
        elapsedSec={elapsedSec}
        drift={drift}
        width={width}
        height={height}
        theme={theme}
      />
    </Canvas>
  );
}

/**
 * The Analytics cards over a pinned book, in place of the live
 * `useAnalytics()` seam.
 *
 * `AnalyticsSimulator` cannot be screenshotted: its P&L history is seeded with
 * a `Math.random` walk at construction, and since Phase 5c Task 1 its
 * positions drift every 10 seconds. Both were the stated reason Analytics was
 * excluded from this harness. `AnalyticsDashboard` takes its data as a prop
 * precisely so a fixture can supply a literal instead — the same
 * mount-the-leaf-not-the-machine move `BootSceneFixture` makes.
 *
 * The scenario must ALSO seed power-saver `freeze` (see `scenarios.tsx`), or
 * the bars' and bubbles' entry tweens can be caught mid-flight. Pinned data
 * alone is not enough.
 */
export function AnalyticsDashboardFixture(): ReactNode {
  return (
    // Mirrors `AnalyticsScreen`'s ScrollView `contentContainerStyle`. The one
    // thing this fixture restates rather than shares; the cards themselves are
    // the real component.
    <View style={styles.content}>
      <AnalyticsDashboard data={PINNED_BOOK} />
    </View>
  );
}

export function LockHoldFixture(): ReactNode {
  const progress = useSharedValue(LOCK_HOLD_PROGRESS);
  // Built fresh and never triggered: nothing drives a real touch during a
  // static capture, so this only needs to satisfy `HoldToUnlockRing`'s
  // `gesture` prop.
  const gesture = Gesture.LongPress();

  return (
    <HoldToUnlockRing
      gesture={gesture}
      progress={progress}
      onPress={(): void => {}}
    />
  );
}

interface BootSceneFixtureProps {
  readonly Scene: BootSceneComponent;
}

/** A representative mid-boot instant — 60% of `BOOT_DURATION_MS` (4200ms) —
 * pinned as a fixed `elapsedSec` shared value instead of `BootCanvas`'s live
 * `useFrameCallback`. `bootProgress`/`panelRevealFraction` clamp to 0..1
 * internally, so any value strictly between 0 and 4.2 is safe; this one
 * lands well past both scenes' initial reveal windows so the captured frame
 * shows settled geometry, not a blank first frame. */
const BOOT_SCENE_ELAPSED_SEC = 2.52;

/** A representative mid-hold fill — clear of both the empty and the complete
 * edge values, so the golden actually proves the ring's dash-offset math
 * paints a partial arc rather than an all-or-nothing state. */
const LOCK_HOLD_PROGRESS = 0.55;

const styles = StyleSheet.create({
  content: { flex: 1, padding: 16, gap: 20 },
});

/**
 * A hand-built book, chosen so every branch of the three cards is actually
 * painted rather than merely mounted:
 *
 * - **P&L chart** — the history crosses zero between the third and fourth
 *   point, so the dashed zero baseline is drawn and the area gradient has
 *   something on both sides of it. It closes positive, so the line takes the
 *   positive accent.
 * - **Pair bars** — two pairs up and two down, so both the left- and
 *   right-anchored bars appear.
 * - **Exposure bubbles** — the five currency nets (EUR +8.0M, JPY -6.4M,
 *   GBP -4.0M, AUD +3.0M, USD +0.55M) land on radii of 60, 50.3, 35.8, 29.8
 *   and 15 (verified against `aggregatePositionsByCurrency`, not estimated).
 *   That covers every label branch at once: EUR, JPY and GBP clear the 62px
 *   diameter and take the stepped-up currency label; AUD sits between the two
 *   thresholds, so it gets an amount but the smaller label; USD is under both
 *   and gets neither. A golden that lost the size-threshold logic could not
 *   pass.
 *
 * Literal, not generated: this file is the last place a `Math.random` should
 * appear, and the numbers being explainable is worth more than their being
 * realistic.
 */
const PINNED_BOOK: PositionUpdates = {
  history: [
    { timestamp: "2026-07-27T09:00:00Z", usdPnl: -8_200 },
    { timestamp: "2026-07-27T09:10:00Z", usdPnl: -5_400 },
    { timestamp: "2026-07-27T09:20:00Z", usdPnl: -2_100 },
    { timestamp: "2026-07-27T09:30:00Z", usdPnl: 900 },
    { timestamp: "2026-07-27T09:40:00Z", usdPnl: 3_400 },
    { timestamp: "2026-07-27T09:50:00Z", usdPnl: 2_200 },
    { timestamp: "2026-07-27T10:00:00Z", usdPnl: 5_600 },
    { timestamp: "2026-07-27T10:10:00Z", usdPnl: 8_900 },
    { timestamp: "2026-07-27T10:20:00Z", usdPnl: 7_300 },
    { timestamp: "2026-07-27T10:30:00Z", usdPnl: 10_400 },
    { timestamp: "2026-07-27T10:40:00Z", usdPnl: 12_800 },
    { timestamp: "2026-07-27T10:50:00Z", usdPnl: 9_700 },
  ],
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: 12_000,
      baseTradedAmount: 8_000_000,
      counterTradedAmount: -8_600_000,
    },
    {
      symbol: "GBPUSD",
      basePnl: -5_400,
      baseTradedAmount: -4_000_000,
      counterTradedAmount: 5_100_000,
    },
    {
      symbol: "AUDUSD",
      basePnl: 2_100,
      baseTradedAmount: 3_000_000,
      counterTradedAmount: -1_950_000,
    },
    {
      symbol: "USDJPY",
      basePnl: -8_900,
      baseTradedAmount: 6_000_000,
      counterTradedAmount: -6_400_000,
    },
  ],
};
