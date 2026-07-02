import { Tabs } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { AppRoot } from "#/app/AppRoot";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { useAppFonts } from "#/ui/theme/fonts";
import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Root layout: owns the simulator/live toggle, wraps the tab navigator in one
 * `AppRoot` (one composition, one WS, one blotter presenter) and one
 * `ThemeProvider` (one resolved skin×mode shared by every tab). First paint is
 * gated on the bundled fonts so no leaf renders a not-yet-loaded family. */
export default function RootLayout(): JSX.Element {
  const [simulator, setSimulator] = useState(false);
  const fontsLoaded = useAppFonts();

  if (!fontsLoaded) {
    return <SafeAreaView style={styles.screen} testID="fonts-loading" />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <AppRoot key={simulator ? "sim" : "live"} simulator={simulator}>
        <ThemeProvider>
          <Chrome simulator={simulator} onToggle={setSimulator} />
        </ThemeProvider>
      </AppRoot>
    </SafeAreaView>
  );
}

interface ChromeProps {
  simulator: boolean;
  onToggle: (value: boolean) => void;
}

/** Themed shell inside the providers — reads the theme for the toolbar and tab
 * bar and renders the connection banner + tab navigator. */
function Chrome({ simulator, onToggle }: ChromeProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.fill}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>Simulator</Text>
        <Switch value={simulator} onValueChange={onToggle} />
      </View>
      <ConnectionBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.bgHeader,
            borderTopColor: theme.borderSubtle,
          },
          tabBarActiveTintColor: theme.accentPrimary,
          tabBarInactiveTintColor: theme.textMuted,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Rates" }} />
        <Tabs.Screen name="blotter" options={{ title: "Blotter" }} />
        <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
        <Tabs.Screen name="appearance" options={{ title: "Appearance" }} />
      </Tabs>
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
  toolbar: ViewStyle;
  toolbarLabel: TextStyle;
}

function makeStyles(t: RnTheme): ChromeStyles {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bgPrimary },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: t.bgHeader,
    },
    toolbarLabel: { color: t.textPrimary, fontFamily: t.fontDisplay },
  });
}
