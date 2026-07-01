import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { CurrencyPair } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { splitPrice } from "#/ui/formatPrice";

export function SpotTile({ pair }: SpotTileProps): JSX.Element {
  const { usePrice } = useViewModel();
  const price = usePrice(pair);

  if (!price) {
    return (
      <View style={styles.container}>
        <Text style={styles.symbol}>{pair.symbol}</Text>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  }

  const ask = splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition);
  return (
    <View style={styles.container}>
      <Text style={styles.symbol}>{pair.symbol}</Text>
      <View style={styles.row}>
        <Text>{ask.prefix}</Text>
        <Text style={movementStyle[price.movementType]}>{ask.pips}</Text>
        <Text>{ask.fractional}</Text>
      </View>
      <Text style={styles.spread}>{price.spread}</Text>
      <Text testID="spot-tile-movement">{price.movementType}</Text>
    </View>
  );
}

interface SpotTileProps {
  pair: CurrencyPair;
}

const movementStyle = StyleSheet.create({
  NONE: { color: "#c8c8c8" },
  UP: { color: "#3fb68b" },
  DOWN: { color: "#e05252" },
});

const styles = StyleSheet.create({
  container: { padding: 12 },
  symbol: { fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row" },
  spread: { fontSize: 11, opacity: 0.6 },
  loading: { fontSize: 12, opacity: 0.5 },
});
