import type { JSX } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { ADAPTIVE_BANK_NAME, type Instrument, type Rfq } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { TradeTicket } from "#/ui/credit/sellSide/TradeTicket";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function SellSidePanel(): JSX.Element {
  const { useRfqs, useInstruments, useDealers } = useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();
  const styles = useThemedStyles(makeStyles);

  const adaptiveBankId = dealers.find((d) => {
    return d.name === ADAPTIVE_BANK_NAME;
  })?.id;

  const instrumentMap = new Map<number, Instrument>();

  for (const i of instruments) {
    instrumentMap.set(i.id, i);
  }

  return (
    <View style={styles.panel} testID="sell-side-panel">
      <Text style={styles.title}>Sell Side (Adaptive Bank)</Text>
      {adaptiveBankId === undefined || rfqs.length === 0 ? (
        <Text style={styles.empty} testID="sell-side-empty">
          No RFQs for Adaptive Bank
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {rfqs.map((rfq) => {
            return (
              <SellSideRfqRow
                key={rfq.id}
                rfq={rfq}
                adaptiveBankId={adaptiveBankId}
                instrumentMap={instrumentMap}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

interface SellSideRfqRowProps {
  rfq: Rfq;
  adaptiveBankId: number;
  instrumentMap: Map<number, Instrument>;
}

function SellSideRfqRow({
  rfq,
  adaptiveBankId,
  instrumentMap,
}: SellSideRfqRowProps): JSX.Element | null {
  const { useQuotesForRfq } = useViewModel();
  const quotes = useQuotesForRfq(rfq.id);
  const abQuote = quotes.find((q) => {
    return q.dealerId === adaptiveBankId;
  });

  if (!abQuote) {
    return null;
  }

  return (
    <TradeTicket
      rfq={rfq}
      quote={abQuote}
      instrument={instrumentMap.get(rfq.instrumentId)}
    />
  );
}

interface SellSidePanelStyles {
  panel: ViewStyle;
  title: TextStyle;
  list: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): SellSidePanelStyles {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: t.bgPrimary },
    title: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      padding: 12,
    },
    list: { paddingVertical: 4 },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
