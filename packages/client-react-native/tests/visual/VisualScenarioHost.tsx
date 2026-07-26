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
  PreferencesSimulator,
  type ThemeMode,
  type ThemeSkin,
} from "@rtc/domain";
import { createViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { useBootSceneFonts } from "#/ui/shell/boot/scenes/bootSceneFonts";
import { useAppFonts } from "#/ui/theme/fonts";
import { ThemeProvider } from "#/ui/theme/ThemeProvider";

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
    return buildScenarioViewModel(skin, mode, forceReduceMotion);
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
        <View style={{ flex: 1 }}>
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
      </ThemeProvider>
    </ViewModelProvider>
  );
}

function buildScenarioViewModel(
  skin: ThemeSkin,
  mode: ThemeMode,
  forceReduceMotion: boolean,
): ReturnType<typeof createViewModel> {
  const preferences = new PreferencesSimulator({
    themeSkin: skin,
    themeMode: mode,
    animatedBackground: !forceReduceMotion,
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
    ...createSimulatorPorts({ preferences, auth, sessionStore }),
    connectionEvents,
  });
  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );
}
