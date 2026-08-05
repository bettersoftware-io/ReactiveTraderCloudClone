import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { of } from "rxjs";

import {
  createApp,
  createMachineFactories,
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-core";
import {
  AuthSimulator,
  type ConnectionEventsPort,
  type PowerSaverLevel,
  PreferencesSimulator,
  type ThemeMode,
  type ThemeSkin,
} from "@rtc/domain";
import { createViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { useBootSceneFonts } from "#/ui/shell/boot/scenes/bootSceneFonts";
import { useAppFonts } from "#/ui/theme/fonts";
import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import { useTheme } from "#/ui/theme/useTheme";

interface Props {
  skin: ThemeSkin;
  mode: ThemeMode;
  /** Freezes ambient/animated-background motion for a deterministic capture.
   * Default true — this host exists to be screenshotted, so a scenario should
   * never be caught mid-animation (rehaul Phase 1 amendment A5). Threaded
   * through the seeded `PreferencesSimulator`'s `animatedBackground` gate —
   * the same production knob a device's OS-level "reduce motion" already
   * collapses to (see `packages/domain/src/preferences/preferences.ts`), so
   * this needs no new ThemeProvider surface. */
  forceReduceMotion?: boolean;
  /**
   * Power-saver tier to seed, default `off` (production's default, so existing
   * scenarios are unaffected).
   *
   * `forceReduceMotion` above does NOT cover every animation: it seeds
   * `animatedBackground`, which gates the ambient layer only. Widget-level
   * motion — the Analytics bars' and bubbles' entry tweens — is gated by
   * `useShellMotionEnabled`, which reads the OS reduce-motion flag and this
   * power-saver level, neither of which `animatedBackground` touches. A
   * scenario containing those widgets must seed `freeze` or it can be captured
   * mid-tween.
   *
   * Freeze is safe to pin a golden against because on React Native it feeds
   * nothing but motion gates (`useShellMotionEnabled`, `useBootMotionEnabled`)
   * — no badge, no alternative styling. The captured pixels are the resting
   * state, which is exactly what a golden should hold.
   */
  powerSaverLevel?: PowerSaverLevel;
  children: ReactNode;
}

/** Readiness probe only — the font it builds is never drawn, so the size is
 * arbitrary. `useBootSceneFonts` resolves both faces regardless of how many
 * sites a caller declares, so one entry is enough to observe the load. */
const HARNESS_FONT_PROBE = { probe: { size: 12 } } as const;

/** Mounts one full, isolated app composition per scenario — sim ports only,
 * a skin×mode pinned via a seeded `PreferencesSimulator` (not the persisted
 * device preference), and no shared `reconnect$`/`incident$` wiring (each
 * mount is self-contained, so scenarios never leak state between captures).
 * `ThemeProvider` reads skin/mode from the ViewModel's preference presenters
 * (confirmed against `ThemeProvider.tsx` — it takes no skin/mode props), so
 * pinning happens by SEEDING the preferences port, not by a ThemeProvider
 * override; no production touch was needed for the skin/mode axis.
 *
 * Sets `testID="visual-ready"` on the root one frame after BOTH font paths
 * finish loading — the RN text families (`useAppFonts`) and the Skia
 * typefaces the boot scenes draw with — the same rendered-ready marker the
 * capture drivers (Tasks 1.x/2.x/3.x) wait on before taking the
 * screenshot. */
export function VisualScenarioHost({
  skin,
  mode,
  forceReduceMotion = true,
  powerSaverLevel = "off",
  children,
}: Props): ReactNode {
  const fontsLoaded = useAppFonts();
  // The Skia typefaces the boot scenes draw text with load on their OWN
  // async path, separate from `useAppFonts` — so a scenario could otherwise
  // be captured in the window where geometry has drawn and text has not, and
  // that golden would then pin missing text as correct. That is exactly how
  // the text this gate protects went unnoticed for weeks. Gated here for
  // every scenario, not just `boot/*`: the wait is a few milliseconds, and a
  // host that only guards the scenarios someone remembered to list is the
  // same trap one level up.
  const skiaFontsLoaded = useBootSceneFonts(HARNESS_FONT_PROBE) !== null;
  const [viewModel] = useState(() => {
    return buildScenarioViewModel(
      skin,
      mode,
      forceReduceMotion,
      powerSaverLevel,
    );
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!fontsLoaded || !skiaFontsLoaded) {
      return undefined;
    }

    const handle = requestAnimationFrame(() => {
      setReady(true);
    });

    return () => {
      cancelAnimationFrame(handle);
    };
  }, [fontsLoaded, skiaFontsLoaded]);

  return (
    <ViewModelProvider viewModel={viewModel}>
      <ThemeProvider>
        <ScenarioSurface ready={ready}>{children}</ScenarioSurface>
      </ThemeProvider>
    </ViewModelProvider>
  );
}

/**
 * The themed surface every scenario is captured against.
 *
 * WHY THIS EXISTS AS ITS OWN COMPONENT. `backgroundColor` has to come from
 * `useTheme()`, which only resolves BELOW `ThemeProvider` — so the root view
 * cannot be inline in `VisualScenarioHost`'s own tree.
 *
 * WHY IT PAINTS A BACKGROUND AT ALL. Every fixture that mounts a LEAF rather
 * than a screen — `BootSceneFixture` (a bare `<Canvas>`), `LockHoldFixture`
 * (the ring alone), `AnalyticsDashboardFixture` (the cards alone) — leaves
 * behind whatever the harness root is, and RN's default is white. The real
 * app never shows that: `BootSequence` and `LockScreen` both paint
 * `t.bgPrimary`. Six of the eight committed simctl goldens were captured over
 * white as a result, which is why #353's "reproducing at 0.01-0.05%" was true
 * and meaningless — they reproduced a wrong background faithfully.
 *
 * Full-screen scenarios (`shell/appearance`) paint over this and are
 * unaffected. Deliberately `bgPrimary` rather than a fixed colour, so a
 * light-pinned scenario (`shell/connection-banner` is classic/light) gets its
 * own theme's light background instead of RN's white.
 */
function ScenarioSurface({ ready, children }: SurfaceProps): ReactNode {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bgPrimary }}>
      {children}
      {/* Readiness marker for the simctl capture driver.
       *
       * It must be its OWN accessibility element, not an attribute of the
       * wrapper: iOS only exposes `testID` (as `accessibilityIdentifier`)
       * for nodes that are themselves accessibility elements, so a plain
       * container View never appears in `idb ui describe-all` at all —
       * which is exactly why the driver's readiness poll timed out
       * against a perfectly healthy app.
       *
       * It is also deliberately a SIBLING rather than `accessible` on the
       * wrapper. Marking the wrapper accessible does surface the marker,
       * but it collapses the whole subtree into one element (measured:
       * 41 accessibility nodes -> 3), which would blind the Maestro tier
       * to the scenario's own content.
       *
       * 1x1 and empty, so it paints nothing and cannot shift a golden. */}
      <View
        testID={ready ? "visual-ready" : "visual-pending"}
        accessible={true}
        accessibilityLabel={ready ? "visual-ready" : "visual-pending"}
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1,
          height: 1,
        }}
      />
    </View>
  );
}

interface SurfaceProps {
  readonly ready: boolean;
  readonly children: ReactNode;
}

/**
 * The instant `blotter/seeded`'s five trade dates are measured back from.
 *
 * Without it those dates come from `Date.now()`, so the golden re-dated itself
 * every calendar day — found 2026-08-02 when a verify pass showed all five rows
 * byte-identical to the golden except every date, each shifted forward by one
 * (T32). It passed regardless: five short date strings are ~0.1% of the frame
 * against a 6% tolerance, so the tier could never report it.
 *
 * **Noon, and UTC, deliberately** — and so NOT `fixtures.tsx`'s
 * `PINNED_WALL_CLOCK`, which is local-time on purpose. That one feeds
 * `boot/topo`, which *renders* a wall-clock stamp and must therefore be pinned
 * in the timezone the pixels are captured in. These are date-only strings taken
 * through `toISOString()`, so they must be pinned in the timezone the
 * derivation happens in instead: noon UTC yields the same ISO date everywhere
 * from UTC-11 to UTC+12, where a local-morning base would slide a day for
 * anyone far enough east. Same word, opposite construction.
 */
const BLOTTER_SEED_BASE_MS = Date.UTC(2026, 6, 27, 12, 0, 0);

/**
 * Freezes FX pricing for every scenario, so a grid of prices can be captured at
 * all. Without it each cell moves twice over — a `Math.random()` seed walk and
 * a live tick loop — and no Rates golden could reproduce itself (T6).
 *
 * Applied HOST-WIDE rather than per-scenario, because a live price stream is
 * never something a pixel golden wants: scenarios that render no prices are
 * unaffected, and one that starts rendering them later inherits the pin instead
 * of silently becoming unreproducible — the lesson `boot/topo` taught when it
 * began printing a wall clock (T10).
 *
 * Same instant as the blotter pin, for one readable clock across the tier.
 */
const PRICING_PIN_MS: number = BLOTTER_SEED_BASE_MS;

function buildScenarioViewModel(
  skin: ThemeSkin,
  mode: ThemeMode,
  forceReduceMotion: boolean,
  powerSaverLevel: PowerSaverLevel,
): ReturnType<typeof createViewModel> {
  const preferences = new PreferencesSimulator({
    themeSkin: skin,
    themeMode: mode,
    animatedBackground: !forceReduceMotion,
    powerSaverLevel,
  });
  // Never authenticated (chosen scenarios need no user session); the roster
  // lookup simply never succeeds since login is never called.
  const auth = new AuthSimulator({});
  const sessionStore = new InMemorySessionStore();
  // One-shot synchronous connect, isolated from the app's real reconnect$/
  // incident$ singletons — a scenario mount never reacts to another mount's
  // (or the real app's) connection events.
  const connectionEvents: ConnectionEventsPort = {
    events: () => {
      return of({ type: "gatewayConnected" as const });
    },
  };

  const { presenters, commands } = createApp({
    ...createSimulatorPorts({
      preferences,
      auth,
      sessionStore,
      blotterSeedBaseMs: BLOTTER_SEED_BASE_MS,
      pricingPinMs: PRICING_PIN_MS,
    }),
    connectionEvents,
  });
  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );
}
