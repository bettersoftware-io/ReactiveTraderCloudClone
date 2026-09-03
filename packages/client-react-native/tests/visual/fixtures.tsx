import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import {
  DEALERS_CATALOG,
  type Dealer,
  Direction,
  type HistoricPosition,
  INSTRUMENTS_CATALOG,
  type Instrument,
  type PositionUpdates,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { AmbientBackground } from "#/ui/ambient/AmbientBackground";
import { AnalyticsDashboard } from "#/ui/analytics/AnalyticsDashboard";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { SellSideTicket } from "#/ui/credit/sellSide/SellSideTicket";
import { RatesModule } from "#/ui/rates/RatesModule";
import { TradeTicketSheet } from "#/ui/rates/ticket/TradeTicketSheet";
import { LoginScreen } from "#/ui/shell/auth/LoginScreen";
import { BootClockContext } from "#/ui/shell/boot/BootClockContext";
import { BootSequence } from "#/ui/shell/boot/BootSequence";
import { ActiveModuleContext } from "#/ui/shell/hud/ActiveModuleContext";
import { DockOpenContext } from "#/ui/shell/hud/DockOpenContext";
import { MODULE_ROUTES, type ModuleRoute } from "#/ui/shell/hud/moduleRoutes";
import { RadialCommandDock } from "#/ui/shell/hud/RadialCommandDock";
import { ShellHeader } from "#/ui/shell/hud/ShellHeader";
import {
  type FrozenTelemetry,
  ShellTelemetryContext,
} from "#/ui/shell/hud/ShellTelemetryContext";
import { StatusStrip } from "#/ui/shell/hud/StatusStrip";
import { LockHoldProgressContext } from "#/ui/shell/lock/LockHoldProgressContext";
import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { useAppFonts } from "#/ui/theme/fonts";

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
  // MOUNT-AFTER-THE-FONTS, and not a duplicate of the host's own
  // `useAppFonts()` call.
  //
  // iOS resolves a `fontFamily` when a text node is CREATED; a family
  // registered later (expo-font registers asynchronously) never reaches a node
  // that already exists, and no re-render re-resolves it. The app is immune —
  // `app/(app)/_layout.tsx` holds first paint until `useAppFonts()` is true, so
  // every leaf, `BootGate` included, is created after registration. The harness
  // is NOT: `VisualScenarioHost` reads the same hook but renders its children
  // immediately, so anything created in the FIRST commit is stuck with the
  // system face.
  //
  // Most fixtures dodge it by accident — their content arrives on a later
  // commit (a ViewModel stream, `LockScreen`'s `state.locked` gate), by which
  // time the fonts are registered. `BootSequence` does not: the scenario pins
  // `useBootSequence` to a literal, so its whole chrome exists in commit one.
  // Until 2026-08-30 every `boot/*` golden pinned the wordmark and both mono
  // lines in SF — a golden of a screen the app never draws. Gating the mount
  // here reproduces the app's own ordering.
  //
  // Scoped to this fixture ON PURPOSE. The same defect is visible in the
  // framed goldens' `ShellHeader` wordmark (also first-commit, also SF today);
  // fixing it for everyone belongs in `VisualScenarioHost` and re-pins every
  // golden, which is a decision for the round that re-pins them.
  const fontsLoaded = useAppFonts();

  if (!fontsLoaded) {
    return null;
  }

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
 * The dock is captured COLLAPSED, which is its resting state. Its `open` flag
 * is internal `useState` with no PROP seam — adding one so a screenshot could
 * open it would put an affordance in production for the test's benefit — so
 * the expanded satellite fan went uncovered by any framed golden until
 * `DockOpenContext` (a context pin, invisible to the app, the same shape as
 * `BootClockContext`) gave it one: `DockOpenFixture` below, captured as
 * `shell/dock-open`. Every other framed scenario still mounts the dock with no
 * provider above it, so it still starts collapsed.
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
      {/* Restates RfqTilesPanel's own `grid` inset (paddingVertical: 8) —
          without it the golden under-reports the chips→card gap the live
          panel actually renders. Same restatement rule as the analytics
          fixture's screen padding. */}
      <View style={creditFixtureStyles.rfqList}>
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
      </View>
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
    // Restates SellSidePanel's `list` inset (paddingVertical: 12) — the bare
    // ticket used to sit ~4pt under the tabs in the golden while the live
    // panel renders the design's ~12pt.
    <View style={creditFixtureStyles.sellSideList}>
      <SellSideTicket
        rfq={PINNED_SELL_SIDE_RFQ}
        quote={PINNED_SELL_SIDE_QUOTE}
        instrument={PINNED_INSTRUMENTS[0]}
        pinnedRemainingMs={PINNED_REMAINING_MS}
      />
    </View>
  );
}

const creditFixtureStyles = StyleSheet.create({
  rfqList: { paddingVertical: 8 },
  sellSideList: { paddingVertical: 12 },
});

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

/**
 * The framed Rates screen with the radial command dock FANNED OPEN — the one
 * HUD state no golden could hold until `DockOpenContext` existed.
 *
 * The dock's `open` flag is internal `useState` reached only by tapping the
 * FAB, so `ShellFrameFixture` captures it collapsed in every other framed
 * scenario (its docstring used to record the expanded fan as Maestro-only
 * work). The pin seeds that state's INITIAL value, which is why the provider
 * wraps the whole frame rather than the dock alone: `ShellFrameFixture` mounts
 * `RadialCommandDock` itself, and only the dock reads the context, so nothing
 * else in the frame is touched and every other scenario keeps mounting the
 * dock with NO provider above it at all.
 *
 * The body is the same live-pinned `RatesModule` `rates/grid` mounts, because
 * the prototype shot dims and blurs the Rates screen behind the arc — a blank
 * body would leave the scrim with nothing to blur and the golden would not
 * witness the scrim's tint at all.
 *
 * The scenario must ALSO seed `powerSaverLevel="freeze"`: each satellite
 * springs from the FAB centre on a staggered delay (`radialDockLayout`'s
 * `delayMs`), gated by `useShellMotionEnabled` — under anything but freeze the
 * capture lands mid-fan and the golden pins one arbitrary frame of the
 * stagger.
 */
export function DockOpenFixture(): ReactNode {
  return (
    <DockOpenContext.Provider value={true}>
      <ShellFrameFixture module="rates">
        <RatesModule />
      </ShellFrameFixture>
    </DockOpenContext.Provider>
  );
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

/** The REAL bonds, straight off the domain's own catalogue — replacing the
 * invented `Acme`/`Vertex` placeholders this fixture carried until the
 * bucket-1 data pass. The design's RFQ book is all ticker-named bonds
 * (`AAPL 3.85% 2043` style); the catalogue keeps the web-v5 design's exact
 * name format (`AAPL 2.4 08/30`, real CUSIPs). `[0]` is the AAPL bond (live
 * card + sell-side, ref 98.4 — same as Acme's, so the price stepper is
 * unmoved); `[1]` is the TSLA bond (id 4, ref 100.6), standing in for the
 * design's accepted-card META bond, which has no catalogue counterpart —
 * nearest by reference price to its 101.24. */
const PINNED_INSTRUMENTS: readonly Instrument[] = [
  INSTRUMENTS_CATALOG[0] as Instrument,
  INSTRUMENTS_CATALOG[4] as Instrument,
];

/** The REAL desks, straight off the domain's own catalogue (ids 0-4:
 * Adaptive Bank, Citi, J.P. Morgan, Goldman Sachs, Morgan Stanley) rather than
 * the `Bank A/B/C` placeholders this fixture carried until 2026-08-30 — the
 * one deviation the first Credit fidelity comparison named first. Five of
 * them, because the design streams every RFQ to five dealers
 * (dc.html:2069/2105, `DEALERS.slice(0, 5)`); `QuoteCard` upper-cases them at
 * render, as the design prints them. */
const PINNED_DEALERS: readonly Dealer[] = DEALERS_CATALOG.slice(0, 5);

/** The design's live RFQ (its `3044`): BUY 5M of the AAPL bond. */
const PINNED_LIVE_RFQ: Rfq = {
  id: 101,
  instrumentId: 0,
  quantity: 5_000_000,
  direction: Direction.Buy,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 0,
};

/** The design's accepted RFQ (its `3042`): BUY 10M, settled with
 * J.P. Morgan — instrument remapped to the TSLA bond (see
 * `PINNED_INSTRUMENTS`). */
const PINNED_TRADED_RFQ: Rfq = {
  id: 102,
  instrumentId: 4,
  quantity: 10_000_000,
  direction: Direction.Buy,
  state: RfqState.Closed,
  expirySecs: 120,
  creationTimestamp: 0,
};

/** One quote per pinned dealer — five, matching the design's five-dealer fan
 * (dc.html:2069). A Buy, so the LOWEST price wins: 97.85 (Citi) takes the
 * tint, the `◂ BEST` marker and the gradient ACCEPT. One dealer is left
 * unpriced, which is what puts an `AWAITING…` on screen. */
const PINNED_QUOTES: readonly Quote[] = [
  {
    id: 1001,
    rfqId: 101,
    dealerId: 0,
    state: { type: "pendingWithPrice", price: 98.4 },
  },
  {
    id: 1002,
    rfqId: 101,
    dealerId: 1,
    state: { type: "pendingWithPrice", price: 97.85 },
  },
  {
    id: 1003,
    rfqId: 101,
    dealerId: 2,
    state: { type: "pendingWithPrice", price: 98.15 },
  },
  { id: 1004, rfqId: 101, dealerId: 3, state: { type: "pendingWithoutPrice" } },
  {
    id: 1005,
    rfqId: 101,
    dealerId: 4,
    state: { type: "pendingWithPrice", price: 98.72 },
  },
];

/** The settled card's one row — an `accepted` quote, which is what earns the
 * `◂ WON` marker and the accent treatment on a card that has no best quote
 * (dc.html:2145 keys both on `isBest || won`). Dealer 2 is J.P. Morgan, the
 * design's own `acceptedDealer` on this card. */
const PINNED_TRADED_QUOTES: readonly Quote[] = [
  {
    id: 1010,
    rfqId: 102,
    dealerId: 2,
    state: { type: "accepted", price: 101.35 },
  },
];

const PINNED_SELL_SIDE_RFQ: Rfq = {
  id: 201,
  instrumentId: 0,
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

/**
 * The REAL `LockScreen` at a fixed mid-hold. Two pins make it static and
 * locked at once: the scenario's `viewModelOverrides` (`scenarios.tsx`'s
 * `pinnedLockedAuth`) hands `useAuth` a locked, unlocking session so the
 * overlay renders at all — it is `null` unless `state.locked` — and
 * `LockHoldProgressContext` seeds `useHoldToUnlock`'s ring fill at
 * `LOCK_HOLD_PROGRESS`, which nothing drives during a capture. Until
 * 2026-08-30 this fixture mounted `HoldToUnlockRing` alone (a locked session
 * was thought to need a real auth round-trip — it needs only the seam), so
 * the golden witnessed the ring and none of the overlay around it.
 */
export function LockHoldFixture(): ReactNode {
  const progress = useSharedValue(LOCK_HOLD_PROGRESS);

  return (
    <LockHoldProgressContext.Provider value={progress}>
      <LockScreen />
    </LockHoldProgressContext.Provider>
  );
}

function NOOP_TOGGLE(): void {}

/**
 * The REAL `LoginScreen` at rest: the fake ViewModel's default `useAuth`
 * reports an unauthenticated session with no error, which is exactly the
 * state `AuthGate` mounts it for — no pin needed. `simulator` is shown ON
 * (the harness runs on sim ports) with the toggle inert.
 */
export function LoginFixture(): ReactNode {
  return <LoginScreen simulator={true} onToggleSimulator={NOOP_TOGGLE} />;
}

/**
 * The REAL `TradeTicketSheet`, presented over the Rates grid — the spot ticket
 * the prototype shows at `docs/design/mobile/v1/reference-shots/rates/ticket.png`.
 *
 * Mounted the way the app mounts it, not a stand-in: `RatesModule` hosts the
 * sheet behind a selected-pair `useState` with no prop seam (selecting a tile
 * is the only way in), so this fixture renders the sheet ITSELF alongside a
 * live `RatesModule`, pinned to the fake ViewModel's first currency pair. The
 * grid behind is what the shot shows through the sheet's blurred background,
 * so it is part of the frame rather than decoration.
 *
 * Deterministic without any pin of its own: the sheet's three seams all come
 * from `fake/rates.ts` — `usePrice` returns that pair's frozen `Price`,
 * `useNotional` a formatted view of `pair.defaultNotional`, and
 * `useTileExecution` the resting `{ status: "ready" }` arm, under which
 * `ExecutionCeremony` renders nothing. The scenario still seeds power-saver
 * `freeze` (see `scenarios.tsx`): `ExecutionCeremony`'s motion and the shell
 * chrome around it are gated by `useShellMotionEnabled`, which reads
 * power-saver rather than `forceReduceMotion`.
 *
 * `TradeTicketSheet` presents itself through an imperative ref in a mount
 * effect (gorhom's API, no `visible` prop), and a `BottomSheetModal` throws
 * `'BottomSheetModalInternalContext' cannot be null!` with no
 * `BottomSheetModalProvider` ancestor — the scenario supplies one of its own,
 * exactly as `shell/appearance` does and for the same reason (this harness
 * route is a sibling of `app/(app)`, whose `Chrome` provides it in the app).
 */
export function TradeTicketFixture(): ReactNode {
  const { useCurrencyPairs } = useViewModel();
  const pair = useCurrencyPairs()[0];

  return (
    <>
      <ShellFrameFixture module="rates">
        <RatesModule />
      </ShellFrameFixture>
      <TradeTicketSheet pair={pair} onClose={NOOP_CLOSE_TICKET} />
    </>
  );
}

function NOOP_CLOSE_TICKET(): void {}

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
  // AnalyticsScreen's contentContainerStyle, restated: vertical inset only
  // (the cards own the 12px side inset + 10px stack gap since 2026-09-02).
  content: { flex: 1, paddingTop: 12, paddingBottom: 8 },
});

/** The prototype's `_seedPnl` walks 48 points; this is a hand-picked
 * deterministic stand-in for that random walk, oldest first. It dips three
 * times so the line has real shape, crosses zero early, and its final step is
 * exactly +4,200 — the change the delta chip reports. */
const PINNED_PNL_STEPS: readonly number[] = [
  -8_200, -6_100, -7_400, -4_800, -2_600, -3_900, -1_200, 900, 2_400, 1_100,
  3_600, 5_200, 4_300, 6_800, 8_100, 7_000, 9_400, 11_200, 10_100, 12_600,
  14_300, 13_100, 15_400, 17_200, 16_000, 18_300, 20_100, 19_000, 21_400,
  23_200, 22_100, 24_600, 26_300, 25_100, 27_400, 29_200, 28_100, 26_900,
  24_800, 22_600, 24_100, 26_400, 25_200, 27_800, 29_400, 28_300, 25_472,
  29_672,
];

/** Spacing between history points. The delta chip's window label is derived
 * from the gap between the LAST TWO points, so 12 s is what makes it read
 * `/ 12S` — the prototype's own window (dc.html L977). */
const PINNED_HISTORY_STEP_MS = 12_000;

/** Fixed epoch for the history, so the golden is reproducible on any runner.
 * Only the SPACING is rendered, never an absolute time. */
const PINNED_HISTORY_START_MS: number = Date.parse("2026-07-27T09:00:00Z");

/**
 * A hand-built book, sized and shaped to the MOBILE prototype's own analytics
 * seed (`fxPos` / `fxExp` / `_seedPnl`, dc.html L712-723 and L916) so the
 * golden reads in the design's figures rather than merely in its layout —
 * while still painting every branch of the three cards:
 *
 * - **P&L headline** — closes at +29,672, so the grouped whole-dollar format
 *   (`+$29,672`) is actually exercised; a round figure would pass just as well
 *   with the grouping missing.
 * - **Delta chip** — the last step is +4,200 over a 12-second gap, so the chip
 *   reads `Δ +4.2K / 12S`, the design's own pill. The window is DERIVED from
 *   the last two timestamps (see `latestDelta`), so the spacing is the thing
 *   that pins the label, not a literal.
 * - **P&L chart** — 48 points, the prototype's own history length. It crosses
 *   zero between the 7th and 8th, so the dashed zero baseline is drawn with
 *   area on both sides of it, and it closes positive, so the line takes the
 *   positive accent.
 * - **Pair bars** — the design's seven pairs at its own magnitudes, four up
 *   and three down, so both the left- and right-anchored bars appear. Their
 *   labels span the compact format's two live branches: `+420.0K` down to
 *   `+74.0K`.
 * - **Exposure bubbles** — the seven currency nets (EUR +24.8M, USD −18.2M,
 *   JPY +9.4M, GBP −6.1M, AUD +3.2M, CAD −2.4M, NZD +0.9M) land on radii of
 *   60, 47.6, 31, 24.8, 19.3, 17.8 and 15. Every one clears the 30px amount
 *   floor, so all seven are labelled, and NZD is deliberately sub-million so
 *   the `K` branch of the bubble format is painted beside six `M`s.
 *
 * The traded amounts are chosen to AGGREGATE to those seven nets (base amount
 * to the base currency, counter amount to the terms currency), not to be
 * consistent with any FX rate — the same licence the existing simulator books
 * take. `NZD/CAD` stands in for the design's seventh pair, `USD/CAD`: the
 * bubbles are derived from the pairs here rather than seeded separately as
 * they are in the prototype, and that one substitution is what yields seven
 * currencies from seven pairs.
 *
 * Literal, not generated: this file is the last place a `Math.random` should
 * appear, and the numbers being explainable is worth more than their being
 * realistic.
 */
const PINNED_BOOK: PositionUpdates = {
  history: PINNED_PNL_STEPS.map((usdPnl, index): HistoricPosition => {
    return {
      timestamp: new Date(
        PINNED_HISTORY_START_MS + index * PINNED_HISTORY_STEP_MS,
      ).toISOString(),
      usdPnl,
    };
  }),
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: 420_000,
      baseTradedAmount: 4_000_000,
      counterTradedAmount: -4_200_000,
    },
    {
      symbol: "USDJPY",
      basePnl: -180_000,
      baseTradedAmount: -15_200_000,
      counterTradedAmount: 16_500_000,
    },
    {
      symbol: "GBPUSD",
      basePnl: 260_000,
      baseTradedAmount: -4_300_000,
      counterTradedAmount: 4_600_000,
    },
    {
      symbol: "AUDUSD",
      basePnl: -90_000,
      baseTradedAmount: 3_200_000,
      counterTradedAmount: -3_400_000,
    },
    {
      symbol: "EURJPY",
      basePnl: 152_000,
      baseTradedAmount: 20_800_000,
      counterTradedAmount: -9_100_000,
    },
    {
      symbol: "GBPJPY",
      basePnl: -310_000,
      baseTradedAmount: -1_800_000,
      counterTradedAmount: 2_000_000,
    },
    {
      symbol: "NZDCAD",
      basePnl: 74_000,
      baseTradedAmount: 900_000,
      counterTradedAmount: -2_400_000,
    },
  ],
};
