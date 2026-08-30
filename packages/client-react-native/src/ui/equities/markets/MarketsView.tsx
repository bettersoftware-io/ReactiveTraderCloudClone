import type { JSX } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";

import { MoversBoard } from "#/ui/equities/markets/MoversBoard";
import { RankByChips } from "#/ui/equities/markets/RankByChips";

/** Markets sub-view: the `RANK BY` chip row over the ranked movers board.
 * The design (dc.html ~L332-345) runs straight from the module sub-nav into
 * the chip row and then the board — no `MOVERS` heading, and no `SECTORS`
 * heatmap block, which the prototype has no analogue for. Selecting an
 * instrument flows up through `onSelect`. */
export function MarketsView({
  selectedSymbol,
  onSelect,
}: MarketsViewProps): JSX.Element {
  return (
    <ScrollView
      testID="markets-view"
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <View style={styles.rankRow}>
        <RankByChips />
      </View>
      <MoversBoard selectedSymbol={selectedSymbol} onSelect={onSelect} />
    </ScrollView>
  );
}

interface MarketsViewProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface MarketsViewStyles {
  scroll: ViewStyle;
  content: ViewStyle;
  rankRow: ViewStyle;
}

// Nothing here reads a theme token any more (the `MOVERS`/`SECTORS` headings
// were the only themed text), so this is a plain module-level sheet rather
// than a `useThemedStyles(makeStyles)` factory.
const styles: MarketsViewStyles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { gap: 6, paddingVertical: 12 },
  rankRow: { paddingHorizontal: 12 },
});
