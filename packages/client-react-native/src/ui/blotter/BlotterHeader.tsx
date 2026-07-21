import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { BLOTTER_COLUMN_FLEX } from "./blotterColumns";

/** The Blotter's 4-column header row: PAIR·DIR / NOTIONAL / RATE / STATUS.
 * Column widths are the shared `BLOTTER_COLUMN_FLEX` ratios so `TradeRow`
 * (Task 5) lines up underneath without drifting. */
export function BlotterHeader(): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.row} testID="blotter-header">
      <Text style={[styles.label, styles.pair]}>PAIR · DIR</Text>
      <Text style={[styles.label, styles.notional]}>NOTIONAL</Text>
      <Text style={[styles.label, styles.rate]}>RATE</Text>
      <Text style={[styles.label, styles.status]}>STATUS</Text>
    </View>
  );
}

interface BlotterHeaderStyles {
  row: ViewStyle;
  label: TextStyle;
  pair: TextStyle;
  notional: TextStyle;
  rate: TextStyle;
  status: TextStyle;
}

function makeStyles(t: RnTheme): BlotterHeaderStyles {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      flexGrow: 0,
      flexShrink: 0,
      paddingHorizontal: 14,
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
      backgroundColor: t.panelHead,
    },
    label: {
      fontSize: 8,
      letterSpacing: 1.5,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    pair: { flex: BLOTTER_COLUMN_FLEX.pair, textAlign: "left" },
    notional: { flex: BLOTTER_COLUMN_FLEX.notional, textAlign: "right" },
    rate: { flex: BLOTTER_COLUMN_FLEX.rate, textAlign: "right" },
    status: { flex: BLOTTER_COLUMN_FLEX.status, textAlign: "right" },
  });
}
