import type { JSX } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { DepthLadder } from "#/ui/equities/trade/DepthLadder";
import { InstrumentTabs } from "#/ui/equities/trade/InstrumentTabs";
import { OrderTicket } from "#/ui/equities/trade/OrderTicket";
import { PriceChart } from "#/ui/equities/trade/PriceChart";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Trade sub-view for the selected symbol: quick-switch tabs, price chart,
 * depth ladder, order ticket. Shows a prompt until a symbol is chosen. */
export function TradeView({
  selectedSymbol,
  onSelect,
}: TradeViewProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  if (selectedSymbol === null) {
    return (
      <View testID="trade-empty" style={styles.empty}>
        <Text style={styles.emptyText}>Select an instrument from Markets</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <InstrumentTabs selectedSymbol={selectedSymbol} onSelect={onSelect} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.heading}>{selectedSymbol} — PRICE</Text>
          <PriceChart symbol={selectedSymbol} />
        </View>
        <View style={styles.section}>
          <Text style={styles.heading}>DEPTH</Text>
          <DepthLadder symbol={selectedSymbol} />
        </View>
        <View style={styles.section}>
          <Text style={styles.heading}>ORDER TICKET</Text>
          <OrderTicket symbol={selectedSymbol} />
        </View>
      </ScrollView>
    </View>
  );
}

interface TradeViewProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface TradeViewStyles {
  container: ViewStyle;
  scroll: ViewStyle;
  content: ViewStyle;
  section: ViewStyle;
  heading: TextStyle;
  empty: ViewStyle;
  emptyText: TextStyle;
}

function makeStyles(t: RnTheme): TradeViewStyles {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bgPrimary },
    scroll: { flex: 1 },
    content: { gap: 16, padding: 12 },
    section: { gap: 6 },
    heading: { fontSize: 11, color: t.textSecondary, fontFamily: t.fontMono },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.bgPrimary,
      padding: 24,
    },
    emptyText: { fontSize: 13, color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
