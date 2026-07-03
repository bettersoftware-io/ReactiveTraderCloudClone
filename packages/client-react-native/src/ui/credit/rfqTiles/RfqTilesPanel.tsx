import type { JSX } from "react";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { Dealer, Instrument, Rfq } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { filterRfqs, type RfqFilter } from "#/ui/credit/rfqTiles/rfqTileFilter";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function RfqTilesPanel(): JSX.Element {
  const { useRfqs, useInstruments, useDealers, useAcceptQuote } =
    useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();
  const acceptQuote = useAcceptQuote();
  const [filter, setFilter] = useState<RfqFilter>("Live");
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  const styles = useThemedStyles(makeStyles);

  const instrumentMap = new Map<number, Instrument>();

  for (const i of instruments) {
    instrumentMap.set(i.id, i);
  }

  const visible = filterRfqs(rfqs, filter, dismissed);

  async function handleAccept(quoteId: number): Promise<void> {
    await acceptQuote(quoteId);
  }

  function handleDismiss(rfqId: number): void {
    setDismissed((prev) => {
      return new Set(prev).add(rfqId);
    });
  }

  return (
    <View style={styles.panel} testID="credit-tiles-panel">
      <RfqFilterTabs selected={filter} onChange={setFilter} />
      {visible.length === 0 ? (
        <Text style={styles.empty} testID="credit-tiles-empty">
          No RFQs to display
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {visible.map((rfq) => {
            return (
              <RfqTileRow
                key={rfq.id}
                rfq={rfq}
                instrumentMap={instrumentMap}
                dealers={dealers}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

interface RfqTileRowProps {
  rfq: Rfq;
  instrumentMap: Map<number, Instrument>;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => Promise<void>;
  onDismiss: (rfqId: number) => void;
}

function RfqTileRow({
  rfq,
  instrumentMap,
  dealers,
  onAccept,
  onDismiss,
}: RfqTileRowProps): JSX.Element {
  const { useQuotesForRfq } = useViewModel();
  const quotes = useQuotesForRfq(rfq.id);
  return (
    <RfqCard
      rfq={rfq}
      quotes={quotes}
      instrument={instrumentMap.get(rfq.instrumentId)}
      dealers={dealers}
      onAccept={onAccept}
      onDismiss={onDismiss}
    />
  );
}

interface RfqTilesPanelStyles {
  panel: ViewStyle;
  grid: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): RfqTilesPanelStyles {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: t.bgPrimary },
    grid: { paddingVertical: 4 },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
