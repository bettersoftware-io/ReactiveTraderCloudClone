import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import {
  type Dealer,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { QuoteCard } from "#/ui/credit/rfqTiles/QuoteCard";
import { RfqCountdownBar } from "#/ui/credit/rfqTiles/RfqCountdownBar";
import { SurfaceCard } from "#/ui/SurfaceCard";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function RfqCard({
  rfq,
  quotes,
  instrument,
  dealers,
  onAccept,
  onDismiss,
}: RfqCardProps): JSX.Element {
  const totalMs = rfq.expirySecs * 1000;
  const { useRfqCountdown } = useViewModel();
  const remainingMs = useRfqCountdown(rfq.creationTimestamp, totalMs);
  const styles = useThemedStyles(makeStyles);

  const dealerMap = new Map<number, Dealer>();

  for (const d of dealers) {
    dealerMap.set(d.id, d);
  }

  const canDismiss = rfq.state !== RfqState.Open;

  return (
    <SurfaceCard
      variant="tile"
      style={styles.card}
      testID={`rfq-card-${rfq.id}`}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.instrumentName}>
            {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
          </Text>
          <Text style={styles.instrumentMeta}>
            {rfq.direction} | Qty: {rfq.quantity.toLocaleString()}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.badge} testID={`rfq-badge-${rfq.id}`}>
            {stateLabel(rfq.state)}
          </Text>
          {canDismiss ? (
            <Pressable
              testID={`rfq-dismiss-${rfq.id}`}
              style={styles.dismissBtn}
              onPress={() => {
                onDismiss(rfq.id);
              }}
            >
              <Text style={styles.dismissText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {rfq.state === RfqState.Open ? (
        <RfqCountdownBar remainingMs={remainingMs} totalMs={totalMs} />
      ) : null}

      <View style={styles.quoteList}>
        {quotes.map((quote) => {
          return (
            <QuoteCard
              key={quote.id}
              quote={quote}
              dealer={dealerMap.get(quote.dealerId)}
              onAccept={rfq.state === RfqState.Open ? onAccept : undefined}
            />
          );
        })}
      </View>
    </SurfaceCard>
  );
}

interface RfqCardProps {
  rfq: Rfq;
  quotes: readonly Quote[];
  instrument: Instrument | undefined;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => void | Promise<void>;
  onDismiss: (rfqId: number) => void;
}

function stateLabel(state: RfqState): string {
  switch (state) {
    case RfqState.Open:
      return "Live";
    case RfqState.Closed:
      return "Done";
    case RfqState.Expired:
      return "Expired";
    case RfqState.Cancelled:
      return "Cancelled";
  }
}

interface RfqCardStyles {
  card: ViewStyle;
  header: ViewStyle;
  headerLeft: ViewStyle;
  headerRight: ViewStyle;
  instrumentName: TextStyle;
  instrumentMeta: TextStyle;
  badge: TextStyle;
  dismissBtn: ViewStyle;
  dismissText: TextStyle;
  quoteList: ViewStyle;
}

function makeStyles(t: RnTheme): RfqCardStyles {
  return StyleSheet.create({
    card: {
      gap: SPACING.sm,
      padding: SPACING.md,
      marginHorizontal: SPACING.sm,
      marginVertical: SPACING.xs,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    headerLeft: { gap: 2, flexShrink: 1 },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    instrumentName: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    instrumentMeta: {
      fontSize: 12,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    badge: {
      fontSize: 11,
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    dismissBtn: { paddingHorizontal: 6, paddingVertical: 2 },
    dismissText: { fontSize: 14, color: t.textMuted },
    quoteList: { gap: 6 },
  });
}
