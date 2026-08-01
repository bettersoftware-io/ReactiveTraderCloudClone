import { Canvas } from "@shopify/react-native-skia";
import type { ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ADAPTIVE_BANK_NAME,
  type Dealer,
  Direction,
  type Instrument,
  type PositionUpdates,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";

import { AnalyticsDashboard } from "#/ui/analytics/AnalyticsDashboard";
import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { SellSideTicket } from "#/ui/credit/sellSide/SellSideTicket";
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
        now={PINNED_WALL_CLOCK}
      />
    </Canvas>
  );
}

/**
 * Drops screen CONTENT below the status bar, the way `ShellHeader` does in the
 * app.
 *
 * WRAP ANY SCENARIO THAT MOUNTS A SCREEN'S CONTENT. Every scenario renders
 * under `VisualScenarioHost` alone — there is no `ShellHeader` above it — so a
 * module mounted bare starts at y=0 and its first row lands under the clock
 * and the dynamic island. Three goldens were captured that way and nobody
 * noticed, because a diff against an equally-wrong baseline is green:
 * `blotter/seeded` lost its filter chips and fills summary, and
 * `shell/connection-banner` lost the "Live" pill behind the clock.
 *
 * DO NOT wrap a deliberately full-bleed surface: `boot/*` (the app's
 * `BootCanvas` really is edge-to-edge behind the chrome), `lock/hold`
 * (`LockScreen` centres its content over the whole screen) and
 * `shell/appearance` (a modal overlay). Insetting those would make the golden
 * assert a frame the app never draws — the same defect, mirrored.
 */
export function ScreenContentFixture({
  children,
}: ScreenContentProps): ReactNode {
  const insets = useSafeAreaInsets();

  // `flex: 1` is load-bearing, not tidiness. Without it this view takes its
  // children's intrinsic height, and a module that fills its parent
  // (`BlotterModule`'s list) collapses to nothing — the first capture with
  // this wrapper came back an empty screen.
  return (
    <View style={[styles.fill, { paddingTop: insets.top }]}>{children}</View>
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
    <ScreenContentFixture>
      <View style={styles.content}>
        <AnalyticsDashboard data={PINNED_BOOK} />
      </View>
    </ScreenContentFixture>
  );
}

/**
 * The Credit RFQ tiles over a literal book, in place of the live `useRfqs()`
 * seam.
 *
 * `credit/rfq-tiles-empty` was dropped once for exactly the reason this fixture
 * exists: `CreditRfqSimulator` emits new Live RFQs over time, so a capture of
 * the live panel is a race — re-captures swung 0.7% to 11.9% against a fixed
 * golden. Two things have to be pinned, not one:
 *
 *  1. THE DATA — literal RFQs and quotes, mounting `RfqCard` (which takes them
 *     as props) rather than `RfqTilesPanel` (which reads the seam).
 *  2. THE COUNTDOWN — `RfqCard` still calls `useRfqCountdown`, a live clock, so
 *     the ring and its seconds readout would differ between any two captures.
 *     `pinnedRemainingMs` overrides it, the same injected-clock move
 *     `BootSceneProps.now` makes for `boot/topo`.
 *
 * The scenario must ALSO seed power-saver `freeze` (see `scenarios.tsx`): the
 * ring's 1 s glide and the ACCEPT halo are gated by `useShellMotionEnabled`,
 * which `forceReduceMotion` does not touch. Pinned data alone would still be
 * captured mid-tween.
 *
 * Two cards deliberately: one live (ring, best-quote tint, ACCEPT halo,
 * AWAITING pulse) and one traded (the ACCEPTED stamp), so the golden covers
 * both halves of the accept ceremony.
 */
export function CreditRfqTilesFixture(): ReactNode {
  return (
    <ScreenContentFixture>
      <RfqFilterTabs />
      <RfqCard
        rfq={PINNED_LIVE_RFQ}
        quotes={PINNED_QUOTES}
        instrument={PINNED_INSTRUMENTS[0]}
        dealers={PINNED_DEALERS}
        pinnedRemainingMs={PINNED_REMAINING_MS}
        onAccept={NOOP_ACCEPT}
        onDismiss={NOOP_DISMISS}
      />
      <RfqCard
        rfq={PINNED_TRADED_RFQ}
        quotes={PINNED_TRADED_QUOTES}
        instrument={PINNED_INSTRUMENTS[1]}
        dealers={PINNED_DEALERS}
        pinnedRemainingMs={0}
        onAccept={NOOP_ACCEPT}
        onDismiss={NOOP_DISMISS}
      />
    </ScreenContentFixture>
  );
}

/**
 * One sell-side ticket over a literal RFQ — same two pins as
 * `CreditRfqTilesFixture` (literal data, `pinnedRemainingMs`), for the same
 * reasons.
 *
 * Mounts `SellSideTicket` rather than `SellSidePanel` so the price stepper
 * starts at the instrument's reference price rather than wherever a live
 * simulator happened to be.
 */
export function CreditSellSideFixture(): ReactNode {
  return (
    <ScreenContentFixture>
      <SellSideTicket
        rfq={PINNED_SELL_SIDE_RFQ}
        quote={PINNED_SELL_SIDE_QUOTE}
        instrument={PINNED_INSTRUMENTS[0]}
        pinnedRemainingMs={PINNED_REMAINING_MS}
      />
    </ScreenContentFixture>
  );
}

/** Mid-window, and above the ten-second urgent threshold — so the golden pins
 * the ring's normal accent rather than its alarm state. */
const PINNED_REMAINING_MS = 42_000;

const PINNED_INSTRUMENTS: readonly Instrument[] = [
  {
    id: 1,
    name: "Acme 5.5% 2030",
    cusip: "000000AA1",
    ticker: "ACME",
    maturity: "2030",
    interestRate: 5.5,
    benchmark: "T 4.0 2030",
    refPrice: 98.4,
  },
  {
    id: 2,
    name: "Vertex 4.25% 2028",
    cusip: "000000BB2",
    ticker: "VRTX",
    maturity: "2028",
    interestRate: 4.25,
    benchmark: "T 3.5 2028",
    refPrice: 101.2,
  },
];

const PINNED_DEALERS: readonly Dealer[] = [
  { id: 1, name: "Bank A" },
  { id: 2, name: "Bank B" },
  { id: 3, name: "Bank C" },
  { id: 9, name: ADAPTIVE_BANK_NAME },
];

const PINNED_LIVE_RFQ: Rfq = {
  id: 101,
  instrumentId: 1,
  quantity: 5_000_000,
  direction: Direction.Buy,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 0,
};

const PINNED_TRADED_RFQ: Rfq = {
  id: 102,
  instrumentId: 2,
  quantity: 1_000_000,
  direction: Direction.Sell,
  state: RfqState.Closed,
  expirySecs: 120,
  creationTimestamp: 0,
};

/** A Buy, so the LOWEST price wins: 97.85 takes the tint and the halo. The
 * third dealer is unpriced, which is what puts an `AWAITING…` on screen. */
const PINNED_QUOTES: readonly Quote[] = [
  {
    id: 1001,
    rfqId: 101,
    dealerId: 1,
    state: { type: "pendingWithPrice", price: 98.4 },
  },
  {
    id: 1002,
    rfqId: 101,
    dealerId: 2,
    state: { type: "pendingWithPrice", price: 97.85 },
  },
  { id: 1003, rfqId: 101, dealerId: 3, state: { type: "pendingWithoutPrice" } },
];

const PINNED_TRADED_QUOTES: readonly Quote[] = [
  {
    id: 1004,
    rfqId: 102,
    dealerId: 1,
    state: { type: "accepted", price: 101.35 },
  },
];

const PINNED_SELL_SIDE_RFQ: Rfq = {
  id: 201,
  instrumentId: 1,
  quantity: 2_000_000,
  direction: Direction.Sell,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 0,
};

const PINNED_SELL_SIDE_QUOTE: Quote = {
  id: 2001,
  rfqId: 201,
  dealerId: 9,
  state: { type: "pendingWithoutPrice" },
};

function NOOP_ACCEPT(): void {}

function NOOP_DISMISS(): void {}

export function LockHoldFixture(): ReactNode {
  const progress = useSharedValue(LOCK_HOLD_PROGRESS);
  // Built fresh and never triggered: nothing drives a real touch during a
  // static capture, so this only needs to satisfy `HoldToUnlockRing`'s
  // `gesture` prop.
  const gesture = Gesture.LongPress();

  // Centred, mirroring `LockScreen`'s `scrollContent`. Without it the ring
  // renders at the top of the screen and the dynamic island covers all but a
  // sliver of the arc — which is what the previous golden pinned, defeating
  // the whole point of `LOCK_HOLD_PROGRESS` being a PARTIAL fill. `LockScreen`
  // itself cannot be mounted here: it renders null unless the session is
  // locked, and locking it would need a real auth round-trip.
  return (
    <View style={styles.centred}>
      <HoldToUnlockRing
        gesture={gesture}
        progress={progress}
        onPress={(): void => {}}
      />
    </View>
  );
}

interface BootSceneFixtureProps {
  readonly Scene: BootSceneComponent;
}

interface ScreenContentProps {
  readonly children: ReactNode;
}

/** A representative mid-boot instant — 60% of `BOOT_DURATION_MS` (4200ms) —
 * pinned as a fixed `elapsedSec` shared value instead of `BootCanvas`'s live
 * `useFrameCallback`. `bootProgress`/`panelRevealFraction` clamp to 0..1
 * internally, so any value strictly between 0 and 4.2 is safe; this one
 * lands well past both scenes' initial reveal windows so the captured frame
 * shows settled geometry, not a blank first frame. */
const BOOT_SCENE_ELAPSED_SEC = 2.52;

/** The wall clock every boot scene is captured against.
 *
 * Only `TopoScene` draws it (a footer stamp), and it is the sole reason
 * `boot/topo` could not be a golden: the scene samples `new Date()` at mount,
 * so two captures minutes apart differ and the golden could never reproduce
 * itself. Passed to every scene rather than just `topo` — a scene that starts
 * printing the clock later then inherits a pinned one instead of silently
 * becoming unreproducible.
 *
 * Constructed from explicit LOCAL-time components, never a UTC string: the
 * scene renders via `getFullYear`/`getHours`/…, so a `Date` parsed from
 * `"…Z"` would stamp differently on a runner in another timezone and the
 * golden would be machine-dependent — a subtler version of the very
 * non-determinism this pin removes. */
const PINNED_WALL_CLOCK = new Date(2026, 6, 27, 9, 41, 7);

/** A representative mid-hold fill — clear of both the empty and the complete
 * edge values, so the golden actually proves the ring's dash-offset math
 * paints a partial arc rather than an all-or-nothing state. */
const LOCK_HOLD_PROGRESS = 0.55;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, padding: 16, gap: 20 },
  centred: { flex: 1, alignItems: "center", justifyContent: "center" },
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
