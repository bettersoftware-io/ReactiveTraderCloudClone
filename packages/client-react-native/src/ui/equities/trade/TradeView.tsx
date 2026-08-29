import type { JSX } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { PositionsBlotter } from "#/ui/equities/blotters/PositionsBlotter";
import { SectionLabel } from "#/ui/equities/SectionLabel";
import { InstrumentCard } from "#/ui/equities/trade/InstrumentCard";
import { InstrumentTabs } from "#/ui/equities/trade/InstrumentTabs";
import { OrderTicket } from "#/ui/equities/trade/OrderTicket";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Trade sub-view for the selected symbol, in the mobile-v1 order: the
 * symbol chips, the instrument card (price + chart), the order ticket, and
 * the POSITIONS list beneath. Shows a prompt until a symbol is chosen. Until
 * 2026-08-29 a DEPTH ladder sat between chart and ticket — a web extra the
 * mobile design never drew, removed in the fidelity pass.
 *
 * Reads `useCandles` here (unconditionally, ahead of the `selectedSymbol ===
 * null` early return below — never gated behind it) and hands the series
 * down to `InstrumentCard` as a plain prop, so the chart leaf stays seam-free
 * and compiler-memoizable. `selectedSymbol ?? ""` is deliberate, not a
 * placeholder: `CandleSeriesPresenter.candles$` special-cases `""` as a
 * stable empty series precisely so a hook call ahead of the "nothing
 * selected" branch never subscribes the real market-data port for an unknown
 * symbol (see that presenter's own comment for the crash this guards). */
export function TradeView({
  selectedSymbol,
  onSelect,
}: TradeViewProps): JSX.Element {
  const { useCandles } = useViewModel();
  const candles = useCandles(selectedSymbol ?? "");
  const styles = useThemedStyles(makeStyles);

  if (selectedSymbol === null) {
    return (
      <View testID="trade-empty" style={styles.empty}>
        <Text style={styles.emptyText}>Select an instrument from Markets</Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="trade-view"
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <InstrumentTabs selectedSymbol={selectedSymbol} onSelect={onSelect} />
      <InstrumentCard symbol={selectedSymbol} candles={candles} />
      <OrderTicket symbol={selectedSymbol} />
      <SectionLabel>POSITIONS</SectionLabel>
      <PositionsBlotter />
    </ScrollView>
  );
}

interface TradeViewProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

interface TradeViewStyles {
  scroll: ViewStyle;
  content: ViewStyle;
  empty: ViewStyle;
  emptyText: TextStyle;
}

function makeStyles(t: RnTheme): TradeViewStyles {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingTop: 9, paddingHorizontal: 12, paddingBottom: 8 },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    emptyText: { fontSize: 13, color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
