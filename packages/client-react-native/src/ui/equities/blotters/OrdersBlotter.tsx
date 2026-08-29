import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";

import type { EquityOrder, OrderStatus, OrderType } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { useRowInsertFlash } from "#/ui/blotter/useRowInsertFlash";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { useNewestOrderId } from "./useNewestOrderId";

/** The ORDERS list of the mobile-v1 blotter: one bordered card per order on
 * the prototype's 1.1 / 0.8 / 0.9 / 0.9 grid — symbol over a `BUY LMT`
 * side+type sub-label, quantity, price, and a boxed status pill. Until
 * 2026-08-29 this was a six-column header table whose STATUS column wrapped
 * mid-word (`PARTIALL/YFILLED`); the card row is what the design draws, and
 * the pill labels are kept short enough never to wrap.
 *
 * Pill colour follows the prototype's rule rather than the web table's:
 * filled reads positive, every still-open status (`new`/`working`/
 * `partiallyFilled`) reads AWARE (amber), and the terminal negatives
 * (`cancelled`/`rejected`) read negative. The newest card plays the shared
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
    <View testID="orders-panel">
      {orders.map((order) => {
        return (
          <OrderCard
            key={order.id}
            order={order}
            isNewest={order.id === newestId}
            baseColor={theme.bgPrimary}
            motionEnabled={motionEnabled}
            styles={styles}
            theme={theme}
          />
        );
      })}
    </View>
  );
}

interface OrderCardProps {
  order: EquityOrder;
  isNewest: boolean;
  baseColor: string;
  motionEnabled: boolean;
  styles: OrdersBlotterStyles;
  theme: RnTheme;
}

/** One order card, wrapped in `Animated.View` so it can play the shared
 * row-insert flash when it is the newest. A separate component (not inlined
 * in the `.map()` above) so `useRowInsertFlash` — a hook — has its own
 * component instance per card, same shape as Phase 4b's `TradeRow`. */
function OrderCard({
  order,
  isNewest,
  baseColor,
  motionEnabled,
  styles,
  theme,
}: OrderCardProps): JSX.Element {
  const statusColor = statusColorFor(theme, order.status);
  const { flashStyle } = useRowInsertFlash(
    isNewest,
    statusColor,
    baseColor,
    motionEnabled,
  );
  const price = order.avgPrice ?? order.limitPrice;

  return (
    <Animated.View
      testID={`order-row-${order.id}`}
      // A testID must stay stable across a row's own state — mutating it to
      // `-newest` broke `getByTestId(id)` exactly when a row became newest,
      // the normal live path (see `RankByChips`'s `eq-rank-${sort}` for the
      // same fix). `isNewest` is observable via `accessibilityState` instead.
      accessibilityState={{ selected: isNewest }}
      style={[styles.card, flashStyle]}
    >
      <View style={styles.symbolCell}>
        <Text style={styles.symbol}>{order.symbol}</Text>
        <Text
          testID={`eq-order-side-${order.id}`}
          style={[
            styles.sideType,
            order.side === "buy" ? styles.buy : styles.sell,
          ]}
        >
          {order.side.toUpperCase()} {ORDER_TYPE_LABEL[order.type]}
        </Text>
      </View>
      <Text style={[styles.qtyCell, styles.qty]}>
        {order.qty.toLocaleString("en-US")}
      </Text>
      <Text style={[styles.priceCell, styles.price]}>
        {price === undefined ? "—" : price.toFixed(2)}
      </Text>
      <View style={styles.statusCell}>
        <Text
          testID={`eq-order-status-${order.id}`}
          style={[
            styles.pill,
            { color: statusColor, borderColor: pillBorder(statusColor) },
          ]}
        >
          {ORDER_STATUS_LABEL[order.status]}
        </Text>
      </View>
    </Animated.View>
  );
}

/** The pill's text colour for a status — the prototype's grouping: filled
 * positive, still-open aware, terminal negatives negative. Also fed straight
 * into `useRowInsertFlash`'s `flashColor`. */
function statusColorFor(theme: RnTheme, status: OrderStatus): string {
  if (status === "filled") {
    return theme.accentPositive;
  }

  if (status === "cancelled" || status === "rejected") {
    return theme.accentNegative;
  }

  return theme.accentAware;
}

/** The prototype draws the pill border at 45% of its text colour
 * (`color-mix(... 45%, transparent)`); every skin's accent tokens are
 * six-digit hex, so the alpha byte can be appended directly. */
function pillBorder(hexColor: string): string {
  return `${hexColor}73`;
}

/** Short, non-wrapping pill labels. `PARTIAL` is deliberate: the full
 * `PARTIALLYFILLED` is what wrapped mid-word in the table this replaced. */
const ORDER_STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  new: "NEW",
  working: "WORKING",
  partiallyFilled: "PARTIAL",
  filled: "FILLED",
  cancelled: "CANCELLED",
  rejected: "REJECTED",
};

const ORDER_TYPE_LABEL: Readonly<Record<OrderType, string>> = {
  market: "MKT",
  limit: "LMT",
};

interface OrdersBlotterStyles {
  card: ViewStyle;
  symbolCell: ViewStyle;
  qtyCell: TextStyle;
  priceCell: TextStyle;
  statusCell: ViewStyle;
  symbol: TextStyle;
  sideType: TextStyle;
  buy: TextStyle;
  sell: TextStyle;
  qty: TextStyle;
  price: TextStyle;
  pill: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): OrdersBlotterStyles {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: t.borderSubtle,
      borderRadius: 9,
      paddingVertical: 7,
      paddingHorizontal: 11,
      marginBottom: 6,
    },
    symbolCell: { flex: 1.1 },
    qtyCell: { flex: 0.8, textAlign: "right" },
    priceCell: { flex: 0.9, textAlign: "right" },
    statusCell: { flex: 0.9, alignItems: "flex-end" },
    symbol: {
      fontSize: 11,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    sideType: {
      fontSize: 7.5,
      letterSpacing: 0.8,
      marginTop: 1,
      fontFamily: t.fontMono,
    },
    buy: { color: t.accentPositive },
    sell: { color: t.accentNegative },
    qty: { fontSize: 10, color: t.textPrimary, fontFamily: t.fontMono },
    price: { fontSize: 10, color: t.textSecondary, fontFamily: t.fontMono },
    pill: {
      fontSize: 8,
      letterSpacing: 0.8,
      fontFamily: t.fontMono,
      borderWidth: 1,
      borderRadius: 4,
      paddingVertical: 2,
      paddingHorizontal: 6,
      overflow: "hidden",
    },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
