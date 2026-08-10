import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";

import type { EquityOrder, OrderStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { useRowInsertFlash } from "#/ui/blotter/useRowInsertFlash";
import { SurfaceCard } from "#/ui/SurfaceCard";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { useNewestOrderId } from "./useNewestOrderId";

/** Read-only orders table. Ported from web `OrdersBlotter`. Each row's
 * status pill is coloured by `OrderStatus` (mirrors web OrdersTable's CSS
 * grouping: filled = positive, still-open = primary, cancelled/rejected =
 * negative). The row `useNewestOrderId` currently flags plays the shared
 * `useRowInsertFlash` insert animation — the same hook Phase 4b's `TradeRow`
 * uses — gated by `useShellMotionEnabled`. */
export function OrdersBlotter(): JSX.Element {
  const { useEquityOrders } = useViewModel();
  const orders = useEquityOrders();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const motionEnabled = useShellMotionEnabled();
  const newestId = useNewestOrderId(orders);

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
          <OrderRow
            key={order.id}
            order={order}
            isNewest={order.id === newestId}
            baseColor={theme.bgTile}
            motionEnabled={motionEnabled}
            styles={styles}
          />
        );
      })}
    </SurfaceCard>
  );
}

interface OrderRowProps {
  order: EquityOrder;
  isNewest: boolean;
  baseColor: string;
  motionEnabled: boolean;
  styles: OrdersBlotterStyles;
}

/** One orders-table row, wrapped in `Animated.View` so it can play the
 * shared row-insert flash when it is the newest row. A separate component
 * (not inlined in the `.map()` above) so `useRowInsertFlash` — a hook — has
 * its own component instance per row, same shape as Phase 4b's `TradeRow`. */
function OrderRow({
  order,
  isNewest,
  baseColor,
  motionEnabled,
  styles,
}: OrderRowProps): JSX.Element {
  const pillStyle = statusPillStyle(styles, order.status);
  const { flashStyle } = useRowInsertFlash(
    isNewest,
    pillStyle.color,
    baseColor,
    motionEnabled,
  );

  return (
    <Animated.View
      testID={`order-row-${order.id}`}
      // A testID must stay stable across a row's own state — mutating it to
      // `-newest` broke `getByTestId(id)` exactly when a row became newest,
      // the normal live path (see `RankByChips`'s `eq-rank-${sort}` for the
      // same fix). `isNewest` is observable via `accessibilityState` instead.
      accessibilityState={{ selected: isNewest }}
      style={[styles.row, flashStyle]}
    >
      <Text style={styles.cell}>{order.symbol}</Text>
      <Text
        style={[styles.cell, order.side === "buy" ? styles.buy : styles.sell]}
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
      <Text
        testID={`eq-order-status-${order.id}`}
        style={[styles.cell, pillStyle]}
      >
        {order.status.toUpperCase()}
      </Text>
    </Animated.View>
  );
}

/** The pill colour bucket for a given status — mirrors web OrdersTable.module.css's
 * `data-status` grouping: `filled` reads positive, still-open statuses
 * (`new`/`working`/`partiallyFilled`) read primary, and terminal negative
 * outcomes (`cancelled`/`rejected`) read negative. */
function statusPillStyle(
  styles: OrdersBlotterStyles,
  status: OrderStatus,
): PillStyle {
  if (status === "filled") {
    return styles.pillFilled;
  }

  if (status === "cancelled" || status === "rejected") {
    return styles.pillRejected;
  }

  return styles.pillPending;
}

/** A status pill's text colour, also fed straight into `useRowInsertFlash`'s
 * `flashColor` — kept a required plain `string` (not RN's optional
 * `ColorValue`) for that reuse, mirroring `TradeRow`'s `PillStyle`. */
interface PillStyle extends TextStyle {
  color: string;
}

interface OrdersBlotterStyles {
  blotter: ViewStyle;
  header: ViewStyle;
  hCell: TextStyle;
  row: ViewStyle;
  cell: TextStyle;
  buy: TextStyle;
  sell: TextStyle;
  pillFilled: PillStyle;
  pillPending: PillStyle;
  pillRejected: PillStyle;
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
    pillFilled: { color: t.accentPositive },
    pillPending: { color: t.accentPrimary },
    pillRejected: { color: t.accentNegative },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
