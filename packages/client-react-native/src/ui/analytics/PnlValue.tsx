import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";

import { formatSignedDollars } from "#/ui/analytics/formatAnalytics";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

export function PnlValue({ value }: PnlValueProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const color = value >= 0 ? styles.pos : styles.neg;
  return (
    <Text testID="pnl-value" style={[styles.value, color]}>
      {formatSignedDollars(value)}
    </Text>
  );
}

interface PnlValueProps {
  value: number;
}

interface PnlValueStyles {
  value: TextStyle;
  pos: TextStyle;
  neg: TextStyle;
}

function makeStyles(t: RnTheme): PnlValueStyles {
  return StyleSheet.create({
    // dc.html:169 — the headline is mono 27px/700, the single loudest
    // number on the screen. It was 20/600, which read as one more label in
    // the card rather than the figure the card exists to show.
    value: { fontSize: 27, ...weightedFont(t, "mono", "700") },
    pos: { color: t.accentPositive },
    neg: { color: t.accentNegative },
  });
}
