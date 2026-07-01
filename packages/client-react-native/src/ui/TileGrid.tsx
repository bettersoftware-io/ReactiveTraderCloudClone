import type { JSX } from "react";
import { FlatList, type ListRenderItemInfo } from "react-native";

import type { CurrencyPair } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { SpotTile } from "#/ui/SpotTile";

function keyExtractor(pair: CurrencyPair): string {
  return pair.symbol;
}

function renderItem({ item }: ListRenderItemInfo<CurrencyPair>): JSX.Element {
  return <SpotTile pair={item} />;
}

/** The FX spot-tile grid — a `FlatList` of `SpotTile`s driven by the live
 * `useCurrencyPairs()` stream from the ViewModel. */
export function TileGrid(): JSX.Element {
  const { useCurrencyPairs } = useViewModel();
  const pairs = useCurrencyPairs();
  return (
    <FlatList
      data={pairs}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
    />
  );
}
