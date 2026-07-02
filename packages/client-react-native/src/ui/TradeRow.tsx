import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { type Trade, TradeStatus } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** One executed-trade row. Status colour maps to the theme's status/accent
 * tokens (pending → aware, done → positive, rejected → negative). */
export function TradeRow({ trade }: TradeRowProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row} testID={`trade-row-${trade.tradeId}`}>
      <Text style={styles.pair}>{trade.currencyPair}</Text>
      <Text style={styles.cell}>{trade.direction}</Text>
      <Text style={styles.cell}>{trade.notional.toLocaleString("en-US")}</Text>
      <Text style={styles.cell}>{trade.spotRate}</Text>
      <Text style={statusStyle(styles, trade.status)}>{trade.status}</Text>
    </View>
  );
}

interface TradeRowProps {
  trade: Trade;
}

/** Narrow style for the status text — `color` stays a plain `string` (not
 * RN's optional `ColorValue`) so `statusStyle` can return it directly. */
interface StatusTextStyle {
  color: string;
}

function statusStyle(
  styles: ReturnType<typeof makeStyles>,
  status: TradeStatus,
): StatusTextStyle {
  if (status === TradeStatus.Done) {
    return styles.done;
  }

  if (status === TradeStatus.Rejected) {
    return styles.rejected;
  }

  return styles.pending;
}

interface TradeRowStyles {
  row: ViewStyle;
  pair: TextStyle;
  cell: TextStyle;
  pending: StatusTextStyle;
  done: StatusTextStyle;
  rejected: StatusTextStyle;
}

function makeStyles(t: RnTheme): TradeRowStyles {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: t.bgTile,
    },
    pair: {
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    cell: { color: t.textPrimary, fontFamily: t.fontMono },
    pending: { color: t.accentAware },
    done: { color: t.accentPositive },
    rejected: { color: t.accentNegative },
  });
}
