import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";

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

import { AmbientBackground } from "#/ui/ambient/AmbientBackground";
import { AnalyticsDashboard } from "#/ui/analytics/AnalyticsDashboard";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { SellSideTicket } from "#/ui/credit/sellSide/SellSideTicket";
import { BootClockContext } from "#/ui/shell/boot/BootClockContext";
import { BootSequence } from "#/ui/shell/boot/BootSequence";
import { ActiveModuleContext } from "#/ui/shell/hud/ActiveModuleContext";
import { MODULE_ROUTES, type ModuleRoute } from "#/ui/shell/hud/moduleRoutes";
import { RadialCommandDock } from "#/ui/shell/hud/RadialCommandDock";
import { ShellHeader } from "#/ui/shell/hud/ShellHeader";
import {
  type FrozenTelemetry,
  ShellTelemetryContext,
} from "#/ui/shell/hud/ShellTelemetryContext";
import { StatusStrip } from "#/ui/shell/hud/StatusStrip";
import { HoldToUnlockRing } from "#/ui/shell/lock/HoldToUnlockRing";

/**
 * Component-only module, split out of `scenarios.tsx` so Biome's
 * `useComponentExportOnlyModules` stays happy: that file's primary exports
 * (`SCENARIOS`, `getScenario`) are data/a lookup function, not components, and
 * the rule forbids a file from exporting both a component and a non-component
 * (mirrors why `bootScene.ts` keeps the non-component `BOOT_SCENES` map out of
 * any scene's own file — see its header comment).
 *
 * `BootSequenceFixture` is the REAL `BootSequence` — canvas, emblem gate,
 * wordmark, `SEQUENCE ·` tag, progress ramp and SKIP — held at one instant.
 * Two pins make it a still frame: `BootClockContext` replaces `BootCanvas`'s
 * live frame callback with `BOOT_SCENE_ELAPSED_SEC` (and hands every scene
 * `PINNED_WALL_CLOCK`, which only `TopoScene` prints), and the scenario pins
 * `useBootSequence` through `viewModelOverrides` so the variant and the
 * progress percentage are literals rather than the live machine. Which scene
 * draws — and whether the canvas draws at all or the emblem stands in
 * (power-saver Freeze) — is decided by `BootSequence` itself, exactly as on
 * device. Until 2026-08-29 the boot goldens mounted a bare `<Canvas>` with
 * the scene leaf instead (`BootSceneFixture`, a test-only copy of
 * `BootCanvas`'s render), so the chrome was never in frame and the prototype
 * pairs under-reported the drift — the same defect Phase 0's
 * `ShellFrameFixture` fixed for the module screens.
 *
 * `BootSequenceFixture` and `LockHoldFixture` below each pin a boot/lock
 * surface to one deterministic frame instead of mounting it live — see
 * `scenarios.tsx`'s header comment for the full "why a free-running clock
 * can't be a stable golden" rationale.
 */
export function BootSequenceFixture(): ReactNode {
  // The pinned scene clock. `useGyroDrift` is not pinned here because
  // `BootCanvas` never subscribes it while a pin is present — the pointer
  // stays centred for the whole capture, the second half of a deterministic
  // frame alongside `elapsedSec`.
  const elapsedSec = useSharedValue(BOOT_SCENE_ELAPSED_SEC);

  return (
    <BootClockContext.Provider value={{ elapsedSec, now: PINNED_WALL_CLOCK }}>
      <BootSequence onDone={(): void => {}} />
    </BootClockContext.Provider>
  );
}

/**
 * The persistent HUD frame around a module's content — exactly what
 * `app/(app)/_layout.tsx`'s `Chrome` draws around its `<Slot/>`: ambient
 * layer, header, connection banner (which paints nothing while CONNECTED —
 * the fake's default — so it is absent from every framed golden except
 * `shell/connection-banner`), the body, status strip and the collapsed
 * radial dock. Minus the two overlays (a closed `AppearanceOverlay` and an
 * unlocked `LockScreen` both paint nothing; `shell/appearance` mounts the
 * sheet itself) and minus `Chrome`'s `BottomSheetModalProvider` (only
 * `shell/appearance` presents a sheet, and it wraps its own so the registry
 * test can still see the provider in the element tree).
 *
 * WRAP EVERY SCENARIO THAT MOUNTS A MODULE. Until 2026-08-28 those mounted
 * content-only under a `ScreenContentFixture` that faked the header's inset,
 * so every module golden was a screen the app never draws: no wordmark, no
 * status strip, no dock, no HUD grid, no sub-nav. Judged against the mobile-v1
 * prototype shots (`docs/design/mobile/v1/reference-shots/DRIFT.md`, whose
 * panels DO carry all of that) the "drift" was mostly this harness, not the
 * app — so a fidelity pass driven by that comparison would have chased the
 * wrong deltas. The frame makes the app column like-for-like.
 *
 * DO NOT wrap a deliberately full-bleed surface: `boot/*` (`BootSequence`
 * is its own full-screen overlay, canvas edge-to-edge) and `lock/hold`
 * (`LockScreen` centres its content over the whole screen). Framing those
 * would make the golden assert a frame the app never draws — the same
 * defect, mirrored.
 *
 * THREE THINGS ARE PINNED, and none is optional:
 *
 * - **The module label**, via `ActiveModuleContext`. `StatusStrip` and the
 *   dock's FAB glyph resolve the active module from the expo-router pathname,
 *   which under `/__visual/<id>` is always RATES. A typo in `module` throws
 *   rather than silently falling back to the pathname — a frame that names
 *   the wrong module is the kind of golden that passes forever.
 * - **FPS**, via `ShellTelemetryContext`. `useShellTelemetry` runs a live
 *   rolling-window frame meter, so the strip's `NNFPS` cell reports whatever
 *   the device measured over the last second and the golden would re-pin
 *   itself on every capture. This provider is the production seam built for
 *   exactly that.
 * - **Motion**, via the scenario's `powerSaverLevel="freeze"`. The header's
 *   connection dot runs a 1200 ms opacity pulse, the dock's satellites
 *   spring-stagger on open, and — since the same change that introduced this
 *   fixture — the ambient layer's drift loop gates on it too. That last one
 *   is what lets a framed scenario pass `forceReduceMotion={false}` (ambient
 *   ON, as the prototype shots have it) and still reproduce pixel-for-pixel:
 *   the canvas paints its grid plus one static frame at `progress = 0`.
 *
 * The dock is captured COLLAPSED, which is its resting state: `open` is
 * internal `useState` with no prop seam, and adding one so a screenshot could
 * open it would put an affordance in production for the test's benefit. The
 * expanded satellite fan is therefore NOT covered by any framed golden — that
 * needs the Maestro tier, which can tap.
 *
 * `simulator` defaults to `false` so the env badge reads `LIVE`, matching the
 * prototype's; `shell/chrome` passes `true` to keep its own golden honest
 * about what this harness is (a static fake, not a live gateway).
 */
export function ShellFrameFixture({
  module,
  simulator = false,
  children,
}: ShellFrameProps): ReactNode {
  return (
    <ShellTelemetryContext.Provider value={FROZEN_TELEMETRY}>
      <ActiveModuleContext.Provider value={moduleRouteFor(module)}>
        <View style={styles.fill}>
          <AmbientBackground />
          <ShellHeader
            simulator={simulator}
            onToggleSimulator={NOOP_TOGGLE_SIMULATOR}
            onOpenAppearance={NOOP_OPEN_APPEARANCE}
          />
          <ConnectionBanner />
          <View style={styles.body}>{children}</View>
          <StatusStrip />
          <RadialCommandDock />
        </View>
      </ActiveModuleContext.Provider>
    </ShellTelemetryContext.Provider>
  );
}

function moduleRouteFor(key: string): ModuleRoute {
  const route = MODULE_ROUTES.find((m) => {
    return m.key === key;
  });

  if (route === undefined) {
    throw new Error(`ShellFrameFixture: no module route with key "${key}"`);
  }

  return route;
}

/**
 * The root a routed module screen supplies for itself, for the sub-views a
 * scenario mounts directly: `CreditScreen` and `EquitiesScreen` wrap their
 * segmented nav + active sub-view in a transparent `flex: 1` view, so the
 * shell's ambient grid shows through them exactly as it does through Rates
 * and Blotter (until 2026-08-29 that root was painted an opaque `bgPrimary`,
 * and this fixture mirrored the opacity so the goldens would not show a grid
 * the app hid). Mirrored rather than mounting the screens themselves, whose
 * active view is internal `useState` with no prop seam.
 */
export function ModuleScreenFixture({
  children,
}: ModuleScreenProps): ReactNode {
  return <View style={moduleScreenStyles.screen}>{children}</View>;
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
 * mount-the-leaf-not-the-machine move `LockHoldFixture` makes.
 *
 * The scenario must ALSO seed power-saver `freeze` (see `scenarios.tsx`), or
 * the bars' and bubbles' entry tweens can be caught mid-flight. Pinned data
 * alone is not enough.
 */
export function AnalyticsDashboardFixture(): ReactNode {
  return (
    // Mirrors `AnalyticsScreen`'s ScrollView: its `bgPrimary` panel (via
    // `ModuleScreenFixture`) and its `contentContainerStyle`. The one thing
    // this fixture restates rather than shares; the cards themselves are the
    // real component.
    <ModuleScreenFixture>
      <View style={styles.content}>
        <AnalyticsDashboard data={PINNED_BOOK} />
      </View>
    </ModuleScreenFixture>
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
    <>
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
    </>
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
    <SellSideTicket
      rfq={PINNED_SELL_SIDE_RFQ}
      quote={PINNED_SELL_SIDE_QUOTE}
      instrument={PINNED_INSTRUMENTS[0]}
      pinnedRemainingMs={PINNED_REMAINING_MS}
    />
  );
}

/**
 * The persistent HUD chrome with an EMPTY body — `ShellFrameFixture` around
 * nothing. Kept as its own scenario (`shell/chrome`) even though every module
 * golden is now framed: this is the one that pins the frame in isolation, so a
 * chrome regression shows up as ONE red golden with nothing else in the diff,
 * rather than as the same few rows of pixels moving in ten. `simulator` is
 * `true` here and only here — see `ShellFrameFixture`.
 */
export function ShellChromeFixture(): ReactNode {
  return <ShellFrameFixture module="rates" simulator />;
}

function NOOP_TOGGLE_SIMULATOR(): void {}

function NOOP_OPEN_APPEARANCE(): void {}

/** The frozen strip readout. Deliberately the hook's OWN production seeds
 * (`SEED_FPS` 60 / `SEED_LATENCY_MS` 12) rather than invented numbers, so the
 * golden pins what a healthy app shows — and a tone regression in `fpsTone`
 * would still move the pixels, since 60 sits in its nominal band. */
const FROZEN_TELEMETRY: FrozenTelemetry = { fps: 60, latencyMs: 12 };

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

interface ShellFrameProps {
  /** A `MODULE_ROUTES` key — `rates` | `blotter` | `analytics` | `credit` |
   * `equities`. Unknown keys throw at render. */
  readonly module: string;
  readonly simulator?: boolean;
  readonly children?: ReactNode;
}

interface ModuleScreenProps {
  readonly children: ReactNode;
}

const moduleScreenStyles = StyleSheet.create({
  screen: { flex: 1 },
});

/** A representative mid-boot instant — 60% of `BOOT_DURATION_MS` (4200ms) —
 * pinned as a fixed `elapsedSec` shared value (through `BootClockContext`)
 * instead of `BootCanvas`'s live `useFrameCallback`. `bootProgress`/`panelRevealFraction` clamp to 0..1
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
  // Mirrors `Chrome`'s own `body`. `minHeight: 0` is copied deliberately, not
  // incidentally: without it a flex child refuses to shrink below its content,
  // which is how the chrome would end up pushed off-screen by a body that has
  // none. `flex: 1` is load-bearing the other way too: a module that fills
  // its parent (`BlotterModule`'s list) collapses to nothing without it — the
  // first content-only capture ever taken came back an empty screen.
  body: { flex: 1, minHeight: 0 },
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
