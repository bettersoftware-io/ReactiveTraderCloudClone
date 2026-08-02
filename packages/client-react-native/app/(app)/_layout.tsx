import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Slot } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import type { SessionStore } from "@rtc/client-core";
import type { PreferencesPort } from "@rtc/domain";

import { AppRoot } from "#/app/AppRoot";
import { AsyncStoragePreferencesAdapter } from "#/app/adapters/AsyncStoragePreferencesAdapter";
import { AsyncStorageSessionStore } from "#/app/adapters/AsyncStorageSessionStore";
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
 * gated on the bundled fonts (so no leaf renders a not-yet-loaded family), a
 * hydrated `AsyncStorageSessionStore`, and a hydrated
 * `AsyncStoragePreferencesAdapter`. Both stores have the same constraint: a
 * presenter reads them synchronously at construction — `AuthPresenter.resume()`
 * the session, `BootPreferencePresenter.current()` the boot variant (once, at
 * boot-machine construction) — so each must be loaded into its in-memory mirror
 * before `AppRoot` mounts. Otherwise a cold launch always falls back to the
 * login screen (session) and always replays the `core` boot variant instead of
 * cycling (preferences). Both are created once and kept stable across the
 * sim/live `key`-remount, so a session (and the persisted variant pointer)
 * survives a toggle; `logout()` clears the session through the same instance.
 * The outer wrapper is a plain `View` (not `SafeAreaView`): `ShellHeader` now
 * owns its own top safe-area inset via `useSafeAreaInsets`, so a `SafeAreaView`
 * here would double-pad the top edge. */
export default function AppGroupLayout(): JSX.Element {
  const [simulator, setSimulator] = useState(false);
  const [sessionStore, setSessionStore] = useState<SessionStore | null>(null);
  const [preferences, setPreferences] = useState<PreferencesPort | null>(null);
  const fontsLoaded = useAppFonts();

  useEffect(() => {
    let alive = true;
    void AsyncStorageSessionStore.hydrate().then((store) => {
      if (alive) {
        setSessionStore(store);
      }
    });
    void AsyncStoragePreferencesAdapter.hydrate().then((prefs) => {
      if (alive) {
        setPreferences(prefs);
      }
    });

    return (): void => {
      alive = false;
    };
  }, []);

  if (!fontsLoaded || sessionStore === null || preferences === null) {
    return (
      <GestureHandlerRootView style={styles.screen}>
        <View style={styles.screen} testID="fonts-loading" />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.screen}>
      <View style={styles.screen}>
        <AppRoot
          key={simulator ? "sim" : "live"}
          simulator={simulator}
          sessionStore={sessionStore}
          preferences={preferences}
        >
          <ThemeProvider>
            <AuthGate simulator={simulator} onToggleSimulator={setSimulator}>
              <Chrome simulator={simulator} onToggle={setSimulator} />
            </AuthGate>
            {/* Visibility is the `useBootGate` seam's, not this layout's — see
                BootGate.tsx. It was a `bootDone` useState here, which silently
                made ⟳ Replay Boot a no-op: `reboot()` re-raised the presenter
                and nothing subscribed. `shouldPlayBootSplash()` still decides
                whether it plays at all, now seeded into the presenter at
                composition through the `bootSplash` port. */}
            <BootGate />
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
 * unchanged so deep links still resolve.
 *
 * `BottomSheetModalProvider` wraps the whole body here (not inside the Rates
 * module that hosts the trade ticket) so the sheet's portal + backdrop sit
 * ABOVE every other HUD layer — the status strip and the Phase-3 radial dock
 * included — matching the prototype's full-bleed `inset:0` scrim. It only
 * needs a `GestureHandlerRootView` above it, which the app root already
 * provides. */
function Chrome({ simulator, onToggle }: ChromeProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  return (
    <BottomSheetModalProvider>
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
    </BottomSheetModalProvider>
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
