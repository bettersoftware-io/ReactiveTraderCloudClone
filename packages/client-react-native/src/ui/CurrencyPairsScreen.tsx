import type { JSX } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { CurrencyPair } from "@rtc/domain";

import { useCurrencyPairs } from "#/data/useCurrencyPairs";

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24 },
  heading: {
    fontSize: 18,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  symbol: { fontSize: 16, fontWeight: "500" },
  detail: { fontSize: 12, opacity: 0.6 },
});

function renderPair(pair: CurrencyPair): JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.symbol}>{pair.symbol}</Text>
      <Text style={styles.detail}>
        {pair.base}/{pair.terms} · precision {pair.ratePrecision}
      </Text>
    </View>
  );
}

export function CurrencyPairsScreen(): JSX.Element {
  const pairs = useCurrencyPairs();
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Currency pairs (from @rtc/client-core)</Text>
      <FlatList
        data={pairs}
        keyExtractor={(pair: CurrencyPair) => {
          return pair.symbol;
        }}
        renderItem={({ item }: ListRenderItemInfo<CurrencyPair>) => {
          return renderPair(item);
        }}
      />
    </View>
  );
}
