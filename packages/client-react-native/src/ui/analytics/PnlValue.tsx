import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";

import { formatPnlValue } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function PnlValue({ value }: PnlValueProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const color = value >= 0 ? styles.pos : styles.neg;
  return (
    <Text testID="pnl-value" style={[styles.value, color]}>
      USD {formatPnlValue(value)}
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
    value: { fontSize: 20, fontWeight: "600", fontFamily: t.fontMono },
    pos: { color: t.accentPositive },
    neg: { color: t.accentNegative },
  });
}
