import { Tabs } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import {
  type ColorValue,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import type { SessionStore } from "@rtc/client-core";

import { AppRoot } from "#/app/AppRoot";
import { AsyncStorageSessionStore } from "#/app/adapters/AsyncStorageSessionStore";
import { shouldPlayBootSplash } from "#/app/bootSplashGate";
import { MotionProbe } from "#/ui/_probe/MotionProbe";
import { AmbientBackground } from "#/ui/ambient/AmbientBackground";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { AppearanceButton } from "#/ui/shell/appearance/AppearanceButton";
import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
import { AuthGate } from "#/ui/shell/auth/AuthGate";
import { LogoutButton } from "#/ui/shell/auth/LogoutButton";
import { BootGate } from "#/ui/shell/boot/BootGate";
import { LockButton } from "#/ui/shell/lock/LockButton";
import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { useAppFonts } from "#/ui/theme/fonts";
import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** App-group layout: owns the simulator/live toggle, wraps the tab navigator in one
 * `AppRoot` (one composition, one WS, one blotter presenter) and one
 * `ThemeProvider` (one resolved skin×mode shared by every tab). First paint is
 * gated on both the bundled fonts (so no leaf renders a not-yet-loaded family)
 * and a hydrated `AsyncStorageSessionStore` — `AuthPresenter.resume()` reads
 * the store synchronously at construction, so the persisted session must be
 * loaded into the in-memory mirror before `AppRoot` mounts, else a cold launch
 * would always fall back to the login screen. The store is created once and
 * kept stable across the sim/live `key`-remount, so a session survives a
 * toggle; `logout()` clears it (and AsyncStorage) through the same instance. */
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
        <SafeAreaView style={styles.screen} testID="fonts-loading" />
      </GestureHandlerRootView>
    );
  }

  const playSplash = shouldPlayBootSplash();

  return (
    <GestureHandlerRootView style={styles.screen}>
      <SafeAreaView style={styles.screen}>
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
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

interface ChromeProps {
  simulator: boolean;
  onToggle: (value: boolean) => void;
}

/** Themed shell inside the providers — reads the theme for the toolbar and tab
 * bar and renders the connection banner + tab navigator. `AmbientBackground`
 * mounts first inside `styles.fill` so it paints in front of the View's own
 * `bgPrimary` background but behind every routed/toolbar sibling — the
 * backmost layer, spanning every tab since `Chrome` is the persistent shell. */
function Chrome({ simulator, onToggle }: ChromeProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  return (
    <View style={styles.fill}>
      <AmbientBackground />
      <View style={styles.toolbar}>
        <Text style={styles.wordmark}>REACTIVE TRADER</Text>
        <View style={styles.toolbarRight}>
          <Text style={styles.simLabel}>Sim</Text>
          <Switch value={simulator} onValueChange={onToggle} />
          <AppearanceButton
            onPress={() => {
              setAppearanceOpen(true);
            }}
          />
          <LockButton />
          <LogoutButton />
        </View>
      </View>
      <ConnectionBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.bgPrimary },
          tabBarStyle: {
            backgroundColor: theme.bgHeader,
            borderTopColor: theme.borderSubtle,
          },
          tabBarActiveTintColor: theme.accentPrimary,
          tabBarInactiveTintColor: theme.textMuted,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Rates", tabBarIcon: tabIcon("⇅", theme) }}
        />
        <Tabs.Screen
          name="blotter"
          options={{ title: "Blotter", tabBarIcon: tabIcon("▤", theme) }}
        />
        <Tabs.Screen
          name="analytics"
          options={{ title: "Analytics", tabBarIcon: tabIcon("◵", theme) }}
        />
        <Tabs.Screen
          name="credit"
          options={{ title: "Credit", tabBarIcon: tabIcon("◈", theme) }}
        />
        <Tabs.Screen
          name="equities"
          options={{ title: "Equities", tabBarIcon: tabIcon("▦", theme) }}
        />
      </Tabs>
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

/** The tint react-navigation passes to a `tabBarIcon` (active/inactive). */
interface TabIconProps {
  color: ColorValue;
}

/** A tab-bar icon factory: a monochrome unicode glyph in a themed <Text>, so
 * tabs get an icon without pulling in an icon-font dependency. The glyph takes
 * the active/inactive tint react-navigation passes via `color`. */
function tabIcon(glyph: string, t: RnTheme) {
  return ({ color }: TabIconProps): JSX.Element => {
    return (
      <Text style={{ color, fontSize: 16, fontFamily: t.fontDisplay }}>
        {glyph}
      </Text>
    );
  };
}

interface RootLayoutStyles {
  screen: ViewStyle;
}

const styles: RootLayoutStyles = StyleSheet.create({
  screen: { flex: 1 },
});

interface ChromeStyles {
  fill: ViewStyle;
  toolbar: ViewStyle;
  toolbarRight: ViewStyle;
  wordmark: TextStyle;
  simLabel: TextStyle;
}

function makeStyles(t: RnTheme): ChromeStyles {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bgPrimary },
    toolbar: {
      height: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    toolbarRight: { flexDirection: "row", alignItems: "center", gap: 12 },
    wordmark: {
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 15,
      fontWeight: "700",
      letterSpacing: 1.5,
    },
    simLabel: { color: t.textMuted, fontFamily: t.fontDisplay, fontSize: 12 },
  });
}
