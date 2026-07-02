import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type CurrencyPairPosition, formatWithScale } from "@rtc/domain";

import { BASELINE, NEGATIVE, POSITIVE } from "#/ui/analytics/colours";

export function PairPnlBars({ positions }: PairPnlBarsProps): JSX.Element {
  const maxAbsPnl = Math.max(
    ...positions.map((p) => {
      return Math.abs(p.basePnl);
    }),
    1,
  );

  return (
    <View testID="pair-pnl-bars" style={styles.container}>
      {positions.map((pos) => {
        const fraction = Math.abs(pos.basePnl) / maxAbsPnl;
        const positive = pos.basePnl >= 0;
        return (
          <View
            key={pos.symbol}
            testID={`pair-pnl-row-${pos.symbol}`}
            style={styles.row}
          >
            <Text style={styles.symbol}>{pos.symbol}</Text>
            <View style={styles.track}>
              <View style={styles.centerLine} />
              <View
                style={[
                  styles.bar,
                  positive ? styles.barPos : styles.barNeg,
                  { flex: fraction },
                ]}
              />
              <View style={styles.spacer} />
            </View>
            <Text
              testID={`pair-pnl-label-${pos.symbol}`}
              style={positive ? styles.labelPos : styles.labelNeg}
            >
              {formatWithScale(pos.basePnl)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

interface PairPnlBarsProps {
  positions: readonly CurrencyPairPosition[];
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  symbol: { width: 64, fontSize: 12 },
  track: { flex: 1, flexDirection: "row", alignItems: "center", height: 12 },
  centerLine: {
    position: "absolute",
    left: "50%",
    width: 1,
    height: 12,
    backgroundColor: BASELINE,
  },
  bar: { height: 8 },
  barPos: { backgroundColor: POSITIVE },
  barNeg: { backgroundColor: NEGATIVE },
  spacer: { flex: 1 },
  labelPos: { width: 56, textAlign: "right", color: POSITIVE, fontSize: 12 },
  labelNeg: { width: 56, textAlign: "right", color: NEGATIVE, fontSize: 12 },
});
