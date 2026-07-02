import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { type CurrencyPairPosition, formatWithScale } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function PairPnlBars({ positions }: PairPnlBarsProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
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

interface PairPnlBarsStyles {
  container: ViewStyle;
  row: ViewStyle;
  symbol: TextStyle;
  track: ViewStyle;
  centerLine: ViewStyle;
  bar: ViewStyle;
  barPos: ViewStyle;
  barNeg: ViewStyle;
  spacer: ViewStyle;
  labelPos: TextStyle;
  labelNeg: TextStyle;
}

function makeStyles(t: RnTheme): PairPnlBarsStyles {
  return StyleSheet.create({
    container: { gap: 6 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    symbol: {
      width: 64,
      fontSize: 12,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
    track: { flex: 1, flexDirection: "row", alignItems: "center", height: 12 },
    centerLine: {
      position: "absolute",
      left: "50%",
      width: 1,
      height: 12,
      backgroundColor: t.textMuted,
    },
    bar: { height: 8 },
    barPos: { backgroundColor: t.accentPositive },
    barNeg: { backgroundColor: t.accentNegative },
    spacer: { flex: 1 },
    labelPos: {
      width: 56,
      textAlign: "right",
      color: t.accentPositive,
      fontSize: 12,
      fontFamily: t.fontMono,
    },
    labelNeg: {
      width: 56,
      textAlign: "right",
      color: t.accentNegative,
      fontSize: 12,
      fontFamily: t.fontMono,
    },
  });
}
