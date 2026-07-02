import type { JSX } from "react";
import { StyleSheet, Text } from "react-native";

import { formatPnlValue } from "@rtc/domain";

export function PnlValue({ value }: PnlValueProps): JSX.Element {
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

const styles = StyleSheet.create({
  value: { fontSize: 20, fontWeight: "600" },
  pos: { color: "#3fb68b" },
  neg: { color: "#e05252" },
});
