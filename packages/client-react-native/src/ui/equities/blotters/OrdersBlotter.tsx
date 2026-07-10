import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { SurfaceCard } from "#/ui/SurfaceCard";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Read-only orders table. Ported from web `OrdersBlotter`. */
export function OrdersBlotter(): JSX.Element {
  const { useEquityOrders } = useViewModel();
  const orders = useEquityOrders();
  const styles = useThemedStyles(makeStyles);

  if (orders.length === 0) {
    return (
      <Text testID="orders-empty" style={styles.empty}>
        NO ORDERS
      </Text>
    );
  }

  return (
    <SurfaceCard variant="panel" testID="orders-panel" style={styles.blotter}>
      <View style={styles.header}>
        <Text style={styles.hCell}>SYMBOL</Text>
        <Text style={styles.hCell}>SIDE</Text>
        <Text style={styles.hCell}>TYPE</Text>
        <Text style={styles.hCell}>QTY</Text>
        <Text style={styles.hCell}>PRICE</Text>
        <Text style={styles.hCell}>STATUS</Text>
      </View>
      {orders.map((order) => {
        return (
          <View
            key={order.id}
            testID={`order-row-${order.id}`}
            style={styles.row}
          >
            <Text style={styles.cell}>{order.symbol}</Text>
            <Text
              style={[
                styles.cell,
                order.side === "buy" ? styles.buy : styles.sell,
              ]}
            >
              {order.side.toUpperCase()}
            </Text>
            <Text style={styles.cell}>{order.type}</Text>
            <Text style={styles.cell}>
              {order.filledQty}/{order.qty}
            </Text>
            <Text style={styles.cell}>
              {order.avgPrice ? order.avgPrice.toFixed(2) : "—"}
            </Text>
            <Text style={styles.cell}>{order.status.toUpperCase()}</Text>
          </View>
        );
      })}
    </SurfaceCard>
  );
}

interface OrdersBlotterStyles {
  blotter: ViewStyle;
  header: ViewStyle;
  hCell: TextStyle;
  row: ViewStyle;
  cell: TextStyle;
  buy: TextStyle;
  sell: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): OrdersBlotterStyles {
  const dividerBase: ViewStyle = {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.borderSubtle,
  };
  return StyleSheet.create({
    blotter: {},
    header: {
      ...dividerBase,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    hCell: {
      flex: 1,
      fontSize: 10,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    row: {
      ...dividerBase,
      minHeight: 44,
      alignItems: "center",
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    cell: {
      flex: 1,
      fontSize: 12,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
    buy: { color: t.accentPositive },
    sell: { color: t.accentNegative },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
