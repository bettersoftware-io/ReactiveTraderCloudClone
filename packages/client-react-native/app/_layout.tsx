import { Tabs } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { SafeAreaView, StyleSheet, Switch, Text, View } from "react-native";

import { AppRoot } from "#/app/AppRoot";
import { ConnectionBanner } from "#/ui/ConnectionBanner";

/** Root layout: owns the simulator/live toggle and wraps the whole tab
 * navigator in a single `AppRoot` so both tabs (Rates | Blotter) share one
 * composition — one WS connection, one blotter presenter. Flipping the toggle
 * re-mounts `AppRoot` via the `key`, rebuilding the composition against the
 * newly selected branch (moved up one level from Phase 2's index screen). */
export default function RootLayout(): JSX.Element {
  const [simulator, setSimulator] = useState(false);
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.toolbar}>
        <Text>Simulator</Text>
        <Switch value={simulator} onValueChange={setSimulator} />
      </View>
      <AppRoot key={simulator ? "sim" : "live"} simulator={simulator}>
        <ConnectionBanner />
        <Tabs screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="index" options={{ title: "Rates" }} />
          <Tabs.Screen name="blotter" options={{ title: "Blotter" }} />
          <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
        </Tabs>
      </AppRoot>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
