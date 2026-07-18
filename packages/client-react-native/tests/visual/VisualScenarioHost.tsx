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

/** Mounts one full, isolated app composition per scenario — sim ports only,
 * a skin×mode pinned via a seeded `PreferencesSimulator` (not the persisted
 * device preference), and no shared `reconnect$`/`incident$` wiring (each
 * mount is self-contained, so scenarios never leak state between captures).
 * `ThemeProvider` reads skin/mode from the ViewModel's preference presenters
 * (confirmed against `ThemeProvider.tsx` — it takes no skin/mode props), so
 * pinning happens by SEEDING the preferences port, not by a ThemeProvider
 * override; no production touch was needed for the skin/mode axis.
 *
 * Sets `testID="visual-ready"` on the root one frame after the bundled fonts
 * finish loading, the same rendered-ready marker the capture drivers (Tasks
 * 1.x/2.x/3.x) wait on before taking the screenshot. */
export function VisualScenarioHost({
  skin,
  mode,
  forceReduceMotion = true,
  children,
}: Props): ReactNode {
  const fontsLoaded = useAppFonts();
  const [viewModel] = useState(() => {
    return buildScenarioViewModel(skin, mode, forceReduceMotion);
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!fontsLoaded) {
      return undefined;
    }

    const handle = requestAnimationFrame(() => {
      setReady(true);
    });

    return () => {
      cancelAnimationFrame(handle);
    };
  }, [fontsLoaded]);

  return (
    <ViewModelProvider viewModel={viewModel}>
      <ThemeProvider>
        <View
          testID={ready ? "visual-ready" : "visual-pending"}
          style={{ flex: 1 }}
        >
          {children}
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
