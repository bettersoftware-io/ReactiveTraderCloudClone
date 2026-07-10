import type { JSX } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

import type { CurrencyPair } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { fxColumnCount } from "#/ui/fxColumns";
import { SpotTile } from "#/ui/SpotTile";

function keyExtractor(pair: CurrencyPair): string {
  return pair.symbol;
}

function renderItem({ item }: ListRenderItemInfo<CurrencyPair>): JSX.Element {
  return <SpotTile pair={item} />;
}

/** The FX spot-tile grid — a padded `FlatList` of `SpotTile` cards driven by
 * the live `useCurrencyPairs()` stream. Column count is responsive (1 on
 * phones, 2 on tablet/landscape); the list is re-keyed on the count because RN
 * requires a fresh FlatList when `numColumns` changes. */
export function TileGrid(): JSX.Element {
  const { useCurrencyPairs } = useViewModel();
  const pairs = useCurrencyPairs();
  const { width } = useWindowDimensions();
  const columns = fxColumnCount(width);
  return (
    <FlatList
      key={`cols-${columns}`}
      data={pairs}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      numColumns={columns}
      contentContainerStyle={styles.content}
      columnWrapperStyle={columns > 1 ? styles.column : undefined}
    />
  );
}

interface TileGridStyles {
  content: ViewStyle;
  column: ViewStyle;
}

const styles: TileGridStyles = StyleSheet.create({
  content: { paddingVertical: 8, paddingHorizontal: 12 },
  column: { gap: 12 },
});
