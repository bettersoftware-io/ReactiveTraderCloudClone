import type { JSX } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { SectorHeatmap } from "#/ui/equities/markets/SectorHeatmap";
import { Watchlist } from "#/ui/equities/markets/Watchlist";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Markets sub-view: watchlist over sector heatmap. Selecting an instrument in
 * either flows up through `onSelect`. */
export function MarketsView({
  selectedSymbol,
  onSelect,
}: MarketsViewProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView
      testID="markets-view"
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <View style={styles.section}>
        <Text style={styles.heading}>WATCHLIST</Text>
        <Watchlist selectedSymbol={selectedSymbol} onSelect={onSelect} />
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>SECTORS</Text>
        <SectorHeatmap selectedSymbol={selectedSymbol} onSelect={onSelect} />
      </View>
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
  section: ViewStyle;
  heading: TextStyle;
}

function makeStyles(t: RnTheme): MarketsViewStyles {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: t.bgPrimary },
    content: { gap: 16, paddingVertical: 12 },
    section: { gap: 6 },
    heading: {
      fontSize: 11,
      color: t.textSecondary,
      fontFamily: t.fontMono,
      paddingHorizontal: 12,
    },
  });
}
