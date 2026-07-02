import type { JSX } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  StyleSheet,
  Text,
  type TextStyle,
} from "react-native";

import type { Trade } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { TradeRow } from "#/ui/TradeRow";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

function keyExtractor(trade: Trade): string {
  return String(trade.tradeId);
}

function renderItem({ item }: ListRenderItemInfo<Trade>): JSX.Element {
  return <TradeRow trade={item} />;
}

/** The executed-trades blotter — a `FlatList` over the live `useTrades()`
 * stream from the ViewModel. Empty until the first trade executes (in both
 * simulator and live modes). */
export function Blotter(): JSX.Element {
  const { useTrades } = useViewModel();
  const trades = useTrades();
  const styles = useThemedStyles(makeStyles);

  if (trades.length === 0) {
    return (
      <Text style={styles.empty} testID="blotter-empty">
        No trades yet
      </Text>
    );
  }

  return (
    <FlatList
      testID="blotter-list"
      data={trades}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
    />
  );
}

interface BlotterStyles {
  empty: TextStyle;
}

function makeStyles(t: RnTheme): BlotterStyles {
  return StyleSheet.create({
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
