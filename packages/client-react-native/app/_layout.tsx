import { Slot } from "expo-router";
import type { JSX } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

/** Minimal expo-router root. The authed app shell (AppRoot/AuthGate/Chrome/Tabs)
 * lives in the `(app)` route group; the dev-only `__visual/[...id]` harness route
 * is a sibling here, so it renders OUTSIDE AuthGate/Chrome in isolation. This
 * root owns a GestureHandlerRootView so the `__visual` branch (which provides
 * none of its own) still has a gesture root; the `(app)` group keeps its own,
 * and RN gesture-handler supports the nesting. */
export default function RootLayout(): JSX.Element {
  return (
    <GestureHandlerRootView style={styles.screen}>
      <Slot />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
