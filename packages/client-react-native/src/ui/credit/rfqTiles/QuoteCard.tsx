import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { Dealer, Quote } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function QuoteCard({
  quote,
  dealer,
  onAccept,
}: QuoteCardProps): JSX.Element {
  const canAccept = quote.state.type === "pendingWithPrice" && onAccept != null;
  const styles = useThemedStyles(makeStyles);

  function handleAccept(): void {
    if (quote.state.type === "pendingWithPrice" && onAccept) {
      void onAccept(quote.id);
    }
  }

  return (
    <View style={styles.quoteCard}>
      <View style={styles.info}>
        <Text style={styles.dealerName}>
          {dealer?.name ?? `Dealer ${quote.dealerId}`}
        </Text>
        <Text style={styles.priceText}>{displayText(quote.state)}</Text>
      </View>
      {canAccept ? (
        <Pressable
          testID={`quote-accept-${quote.id}`}
          style={styles.acceptBtn}
          onPress={handleAccept}
        >
          <Text style={styles.acceptLabel}>Accept</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface QuoteCardProps {
  quote: Quote;
  dealer: Dealer | undefined;
  onAccept?: (quoteId: number) => void | Promise<void>;
}

function displayText(state: Quote["state"]): string {
  switch (state.type) {
    case "pendingWithoutPrice":
    case "rejectedWithoutPrice":
      return "Awaiting response";
    case "pendingWithPrice":
    case "accepted":
    case "rejectedWithPrice":
      return `$${state.price}`;
    case "passed":
      return "Passed";
  }
}

interface QuoteCardStyles {
  quoteCard: ViewStyle;
  info: ViewStyle;
  dealerName: TextStyle;
  priceText: TextStyle;
  acceptBtn: ViewStyle;
  acceptLabel: TextStyle;
}

function makeStyles(t: RnTheme): QuoteCardStyles {
  return StyleSheet.create({
    quoteCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: t.bgSecondary,
    },
    info: { gap: 2 },
    dealerName: {
      fontSize: 13,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    priceText: { fontSize: 13, color: t.textSecondary, fontFamily: t.fontMono },
    acceptBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: t.accentPositive,
    },
    acceptLabel: {
      fontSize: 12,
      color: t.textOnAccent,
      fontFamily: t.fontDisplay,
    },
  });
}
