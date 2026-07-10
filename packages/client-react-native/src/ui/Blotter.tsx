import type { JSX } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import type { Trade } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { SurfaceCard } from "#/ui/SurfaceCard";
import { TradeRow } from "#/ui/TradeRow";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

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
    <SurfaceCard variant="panel" testID="blotter-panel" style={styles.panel}>
      <FlatList
        testID="blotter-list"
        data={trades}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
      />
    </SurfaceCard>
  );
}

function keyExtractor(trade: Trade): string {
  return String(trade.tradeId);
}

function renderItem({ item }: ListRenderItemInfo<Trade>): JSX.Element {
  return <TradeRow trade={item} />;
}

interface BlotterStyles {
  empty: TextStyle;
  panel: ViewStyle;
}

function makeStyles(t: RnTheme): BlotterStyles {
  return StyleSheet.create({
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontDisplay },
    panel: { flex: 1, margin: SPACING.md },
  });
}
