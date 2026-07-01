import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type Trade, TradeStatus } from "@rtc/domain";

/** One executed-trade row. Status color mirrors SpotTile's `movementStyle`
 * pattern (a StyleSheet map indexed by the enum value) rather than an inline
 * style object, per the repo's inline-style ban. */
export function TradeRow({ trade }: TradeRowProps): JSX.Element {
  return (
    <View style={styles.row} testID={`trade-row-${trade.tradeId}`}>
      <Text style={styles.pair}>{trade.currencyPair}</Text>
      <Text>{trade.direction}</Text>
      <Text>{trade.notional.toLocaleString("en-US")}</Text>
      <Text>{trade.spotRate}</Text>
      <Text style={statusStyle[trade.status]}>{trade.status}</Text>
    </View>
  );
}

interface TradeRowProps {
  trade: Trade;
}

const statusStyle = StyleSheet.create({
  [TradeStatus.Pending]: { color: "#c8a13f" },
  [TradeStatus.Done]: { color: "#3fb68b" },
  [TradeStatus.Rejected]: { color: "#e05252" },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pair: { fontWeight: "600" },
});
