import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { DeskPnlGauge } from "#/ui/equities/blotters/DeskPnlGauge";
import { PnlSparkline } from "#/ui/equities/blotters/PnlSparkline";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Positions table with a desk-P&L gauge and per-row sparklines. Ported from
 * web `PositionsBlotter`. */
export function PositionsBlotter(): JSX.Element {
  const { useEquityPositions } = useViewModel();
  const positions = useEquityPositions();
  const styles = useThemedStyles(makeStyles);
  const maxAbsPnl = Math.max(
    ...positions.map((p) => {
      return Math.abs(p.unrealisedPnl);
    }),
    1,
  );

  return (
    <View style={styles.wrapper}>
      <DeskPnlGauge positions={positions} />
      {positions.length === 0 ? (
        <Text testID="positions-empty" style={styles.empty}>
          NO POSITIONS
        </Text>
      ) : (
        <View style={styles.blotter}>
          <View style={styles.header}>
            <Text style={styles.hCell}>SYMBOL</Text>
            <Text style={styles.hCell}>QTY</Text>
            <Text style={styles.hCell}>AVG</Text>
            <Text style={styles.hCell}>MARK</Text>
            <Text style={styles.hCell}>UPNL</Text>
            <Text style={styles.hSpark}>SPARK</Text>
          </View>
          {positions.map((pos) => {
            const up = pos.unrealisedPnl >= 0;
            const pnlDisplay = up
              ? `+${pos.unrealisedPnl.toFixed(0)}`
              : pos.unrealisedPnl.toFixed(0);
            return (
              <View
                key={pos.symbol}
                testID={`position-row-${pos.symbol}`}
                style={styles.row}
              >
                <Text style={styles.cell}>{pos.symbol}</Text>
                <Text style={styles.cell}>{pos.qty.toLocaleString()}</Text>
                <Text style={styles.cell}>{pos.avgPrice.toFixed(2)}</Text>
                <Text style={styles.cell}>{pos.markPrice.toFixed(2)}</Text>
                <Text style={[styles.cell, up ? styles.pos : styles.neg]}>
                  {pnlDisplay}
                </Text>
                <View style={styles.sparkCell}>
                  <PnlSparkline pnl={pos.unrealisedPnl} maxAbsPnl={maxAbsPnl} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

interface PositionsBlotterStyles {
  wrapper: ViewStyle;
  blotter: ViewStyle;
  header: ViewStyle;
  hCell: TextStyle;
  hSpark: TextStyle;
  row: ViewStyle;
  cell: TextStyle;
  sparkCell: ViewStyle;
  pos: TextStyle;
  neg: TextStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): PositionsBlotterStyles {
  const rowBase: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.borderSubtle,
  };
  return StyleSheet.create({
    wrapper: { backgroundColor: t.panel },
    blotter: {},
    header: { ...rowBase, paddingVertical: 6 },
    hCell: {
      flex: 1,
      fontSize: 10,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    hSpark: {
      flex: 1.4,
      fontSize: 10,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    row: rowBase,
    cell: {
      flex: 1,
      fontSize: 12,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
    sparkCell: { flex: 1.4 },
    pos: { color: t.accentPositive },
    neg: { color: t.accentNegative },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontMono },
  });
}
