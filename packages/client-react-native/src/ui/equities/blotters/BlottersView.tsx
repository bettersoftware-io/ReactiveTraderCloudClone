import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { OrdersBlotter } from "#/ui/equities/blotters/OrdersBlotter";
import { PositionsBlotter } from "#/ui/equities/blotters/PositionsBlotter";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Blotters sub-view: an Orders/Positions toggle over the two blotters. */
export function BlottersView(): JSX.Element {
  const [tab, setTab] = useState<BlotterTab>("orders");
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <Pressable
          testID="blotter-toggle-orders"
          style={tab === "orders" ? styles.toggleActive : styles.toggle}
          onPress={() => {
            setTab("orders");
          }}
        >
          <Text style={tab === "orders" ? styles.labelActive : styles.label}>
            ORDERS
          </Text>
        </Pressable>
        <Pressable
          testID="blotter-toggle-positions"
          style={tab === "positions" ? styles.toggleActive : styles.toggle}
          onPress={() => {
            setTab("positions");
          }}
        >
          <Text style={tab === "positions" ? styles.labelActive : styles.label}>
            POSITIONS
          </Text>
        </Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {tab === "orders" ? <OrdersBlotter /> : <PositionsBlotter />}
      </ScrollView>
    </View>
  );
}

type BlotterTab = "orders" | "positions";

interface BlottersViewStyles {
  container: ViewStyle;
  toggleRow: ViewStyle;
  toggle: ViewStyle;
  toggleActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
  scroll: ViewStyle;
  content: ViewStyle;
}

function makeStyles(t: RnTheme): BlottersViewStyles {
  const baseToggle: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  };
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bgPrimary },
    toggleRow: {
      flexDirection: "row",
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    toggle: baseToggle,
    toggleActive: {
      ...baseToggle,
      borderBottomWidth: 2,
      borderBottomColor: t.accentPrimary,
    },
    label: { fontSize: 12, color: t.textMuted, fontFamily: t.fontDisplay },
    labelActive: {
      fontSize: 12,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    scroll: { flex: 1 },
    content: { padding: 12 },
  });
}
