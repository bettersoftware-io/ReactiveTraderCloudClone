import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { type CurrencyPairPosition, formatPnlK } from "@rtc/domain";

import { PairPnlBar } from "#/ui/analytics/PairPnlBar";
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
            <Text style={styles.symbol}>{slashPair(pos.symbol)}</Text>
            <PairPnlBar fraction={fraction} positive={positive} />
            <Text
              testID={`pair-pnl-label-${pos.symbol}`}
              style={positive ? styles.labelPos : styles.labelNeg}
            >
              {formatPnlK(pos.basePnl)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * `EURUSD` → `EUR/USD` (T42). The domain carries the unseparated symbol; the
 * prototype renders the slash (dc.html:182), and without it a row reads as an
 * unfamiliar single ticker rather than a pair.
 *
 * Only a 6-character symbol splits — anything else is passed through
 * untouched rather than sliced at a position that may not be a boundary.
 */
function slashPair(symbol: string): string {
  return symbol.length === 6
    ? `${symbol.slice(0, 3)}/${symbol.slice(3)}`
    : symbol;
}

interface PairPnlBarsProps {
  positions: readonly CurrencyPairPosition[];
}

interface PairPnlBarsStyles {
  container: ViewStyle;
  row: ViewStyle;
  symbol: TextStyle;
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
