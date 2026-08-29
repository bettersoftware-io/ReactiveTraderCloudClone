import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

import {
  formatSignedCompact,
  formatSignedInteger,
} from "./formatSignedNumbers";

/** The POSITIONS list of the mobile-v1 blotter: one bordered card per
 * position on four equal columns — symbol, signed quantity, `@avg`, and the
 * unrealised P&L compacted (`+1.3K`) — quantity and P&L coloured by sign.
 * Until 2026-08-29 this was the web `PositionsBlotter` port: a desk-P&L
 * gauge above a six-column table with per-row sparklines, none of which the
 * mobile design draws. */
export function PositionsBlotter(): JSX.Element {
  const { useEquityPositions } = useViewModel();
  const positions = useEquityPositions();
  const styles = useThemedStyles(makeStyles);

  if (positions.length === 0) {
    return (
      <Text testID="positions-empty" style={styles.empty}>
        NO POSITIONS
      </Text>
    );
  }

  return (
    <View testID="positions-panel">
      {positions.map((pos) => {
        return (
          <View
            key={pos.symbol}
            testID={`position-row-${pos.symbol}`}
            style={styles.card}
          >
            <Text style={[styles.cell, styles.symbol]}>{pos.symbol}</Text>
            <Text
              style={[
                styles.cell,
                styles.mono,
                pos.qty >= 0 ? styles.pos : styles.neg,
              ]}
            >
              {formatSignedInteger(pos.qty)}
            </Text>
            <Text style={[styles.cell, styles.mono, styles.avg]}>
              @{pos.avgPrice.toFixed(2)}
            </Text>
            <Text
              testID={`eq-position-pnl-${pos.symbol}`}
              style={[
                styles.cell,
                styles.mono,
                pos.unrealisedPnl >= 0 ? styles.pos : styles.neg,
              ]}
            >
              {formatSignedCompact(pos.unrealisedPnl)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

interface PositionsBlotterStyles {
  card: ViewStyle;
  cell: TextStyle;
  symbol: TextStyle;
  mono: TextStyle;
  avg: TextStyle;
  pos: TextStyle;
  neg: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): PositionsBlotterStyles {
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
    cell: { flex: 1, textAlign: "right" },
    symbol: {
      textAlign: "left",
      fontSize: 11,
      color: t.textPrimary,
      ...weightedFont(t, "display", "600"),
    },
    mono: { fontSize: 9.5, fontFamily: t.fontMono },
    avg: { color: t.textSecondary },
    pos: { color: t.accentPositive },
    neg: { color: t.accentNegative },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
