import { Slot } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import type { SessionStore } from "@rtc/client-core";

import { AppRoot } from "#/app/AppRoot";
import { AsyncStorageSessionStore } from "#/app/adapters/AsyncStorageSessionStore";
import { shouldPlayBootSplash } from "#/app/bootSplashGate";
import { MotionProbe } from "#/ui/_probe/MotionProbe";
import { AmbientBackground } from "#/ui/ambient/AmbientBackground";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
import { AuthGate } from "#/ui/shell/auth/AuthGate";
import { BootGate } from "#/ui/shell/boot/BootGate";
import { RadialCommandDock } from "#/ui/shell/hud/RadialCommandDock";
import { ShellHeader } from "#/ui/shell/hud/ShellHeader";
import { StatusStrip } from "#/ui/shell/hud/StatusStrip";
import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { useAppFonts } from "#/ui/theme/fonts";
import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** App-group layout: owns the simulator/live toggle, wraps the HUD chrome in one
 * `AppRoot` (one composition, one WS, one blotter presenter) and one
 * `ThemeProvider` (one resolved skin×mode shared by every route). First paint is
 * gated on both the bundled fonts (so no leaf renders a not-yet-loaded family)
 * and a hydrated `AsyncStorageSessionStore` — `AuthPresenter.resume()` reads
 * the store synchronously at construction, so the persisted session must be
 * loaded into the in-memory mirror before `AppRoot` mounts, else a cold launch
 * would always fall back to the login screen. The store is created once and
 * kept stable across the sim/live `key`-remount, so a session survives a
 * toggle; `logout()` clears it (and AsyncStorage) through the same instance.
 * The outer wrapper is a plain `View` (not `SafeAreaView`): `ShellHeader` now
 * owns its own top safe-area inset via `useSafeAreaInsets`, so a `SafeAreaView`
 * here would double-pad the top edge. */
export default function AppGroupLayout(): JSX.Element {
  const [simulator, setSimulator] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [sessionStore, setSessionStore] = useState<SessionStore | null>(null);
  const fontsLoaded = useAppFonts();

  useEffect(() => {
    let alive = true;
    void AsyncStorageSessionStore.hydrate().then((store) => {
      if (alive) {
        setSessionStore(store);
      }
    });

    return (): void => {
      alive = false;
    };
  }, []);

  if (!fontsLoaded || sessionStore === null) {
    return (
      <GestureHandlerRootView style={styles.screen}>
        <View style={styles.screen} testID="fonts-loading" />
      </GestureHandlerRootView>
    );
  }

  const playSplash = shouldPlayBootSplash();

  return (
    <GestureHandlerRootView style={styles.screen}>
      <View style={styles.screen}>
        <AppRoot
          key={simulator ? "sim" : "live"}
          simulator={simulator}
          sessionStore={sessionStore}
        >
          <ThemeProvider>
            <AuthGate simulator={simulator} onToggleSimulator={setSimulator}>
              <Chrome simulator={simulator} onToggle={setSimulator} />
            </AuthGate>
            {playSplash && !bootDone ? (
              <BootGate
                onFinished={(): void => {
                  setBootDone(true);
                }}
              />
            ) : null}
          </ThemeProvider>
        </AppRoot>
        {process.env.EXPO_PUBLIC_MOTION_PROBE === "1" ? <MotionProbe /> : null}
      </View>
    </GestureHandlerRootView>
  );
}

interface ChromeProps {
  readonly simulator: boolean;
  readonly onToggle: (value: boolean) => void;
}

/** The persistent HUD shell inside the providers: ambient background (backmost)
 * → HUD header → connection banner (the sole Reconnect recovery path) → the
 * active route (`<Slot/>`, driven by the dock and deep links) → status strip →
 * radial command dock, with the appearance sheet and lock screen as overlays.
 * Replaces the former tab navigator; the file routes under `app/(app)/` are
 * unchanged so deep links still resolve. */
function Chrome({ simulator, onToggle }: ChromeProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  return (
    <View style={styles.fill}>
      <AmbientBackground />
      <ShellHeader
        simulator={simulator}
        onToggleSimulator={onToggle}
        onOpenAppearance={() => {
          setAppearanceOpen(true);
        }}
      />
      <ConnectionBanner />
      <View style={styles.body}>
        <Slot />
      </View>
      <StatusStrip />
      <RadialCommandDock />
      <AppearanceOverlay
        open={appearanceOpen}
        onClose={() => {
          setAppearanceOpen(false);
        }}
      />
      <LockScreen />
    </View>
  );
}

interface RootLayoutStyles {
  screen: ViewStyle;
}

const styles: RootLayoutStyles = StyleSheet.create({
  screen: { flex: 1 },
});

interface ChromeStyles {
  fill: ViewStyle;
  body: ViewStyle;
}

function makeStyles(t: RnTheme): ChromeStyles {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bgPrimary },
    body: { flex: 1, minHeight: 0 },
  });
}
