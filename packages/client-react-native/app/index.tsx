import type { JSX } from "react";
import { useState } from "react";
import { SafeAreaView, StyleSheet, Switch, Text, View } from "react-native";

import { AppRoot } from "#/app/AppRoot";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { TileGrid } from "#/ui/TileGrid";

/** The demo screen: a simulator/live toggle atop the composed FX spot-tile
 * grid. Flipping the toggle re-mounts `AppRoot` (via the `key`), rebuilding
 * the whole composition against the newly selected branch. */
export default function IndexScreen(): JSX.Element {
  const [simulator, setSimulator] = useState(false);
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.toolbar}>
        <Text>Simulator</Text>
        <Switch value={simulator} onValueChange={setSimulator} />
      </View>
      <AppRoot key={simulator ? "sim" : "live"} simulator={simulator}>
        <ConnectionBanner />
        <TileGrid />
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
