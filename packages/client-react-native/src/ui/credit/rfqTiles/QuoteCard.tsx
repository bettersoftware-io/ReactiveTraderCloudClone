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

import { AcceptPulse } from "#/ui/credit/rfqTiles/AcceptPulse";
import { AwaitingLabel } from "#/ui/credit/rfqTiles/AwaitingLabel";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** One dealer's line inside an RFQ card. The prototype draws these as flat rows
 * separated by a hairline rather than nested cards (dc.html:241-250), with the
 * winning row tinted and its ACCEPT button haloed — `isBest` is decided once
 * per RFQ by `findBestQuoteId`, not re-derived here, so both clients agree on
 * the winner. Unpriced dealers show a breathing `AWAITING…` instead of a
 * price, which is what makes a slow dealer visibly distinct from a passed one. */
export function QuoteCard({
  quote,
  dealer,
  isBest = false,
  onAccept,
}: QuoteCardProps): JSX.Element {
  const canAccept = quote.state.type === "pendingWithPrice" && onAccept != null;
  const awaiting = quote.state.type === "pendingWithoutPrice";
  const styles = useThemedStyles(makeStyles);

  function acceptPendingQuote(): void {
    if (canAccept && onAccept) {
      void onAccept(quote.id);
    }
  }

  return (
    <View
      style={[styles.row, isBest ? styles.rowBest : null]}
      testID={`quote-card-${quote.id}`}
    >
      <Text style={styles.dealerName} numberOfLines={1}>
        {dealer?.name ?? `Dealer ${quote.dealerId}`}
      </Text>
      {awaiting ? (
        <AwaitingLabel />
      ) : (
        <Text style={isBest ? styles.priceBest : styles.priceText}>
          {displayText(quote.state)}
        </Text>
      )}
      {canAccept ? (
        <View style={styles.acceptWrap}>
          {isBest ? <AcceptPulse /> : null}
          <Pressable
            testID={`quote-accept-${quote.id}`}
            style={isBest ? styles.acceptBtnBest : styles.acceptBtn}
            onPress={acceptPendingQuote}
          >
            <Text style={isBest ? styles.acceptLabelBest : styles.acceptLabel}>
              ACCEPT
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

interface QuoteCardProps {
  quote: Quote;
  dealer: Dealer | undefined;
  /** Best price for this RFQ's direction — tinted row + haloed ACCEPT. */
  isBest?: boolean;
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
  row: ViewStyle;
  rowBest: ViewStyle;
  dealerName: TextStyle;
  priceText: TextStyle;
  priceBest: TextStyle;
  acceptWrap: ViewStyle;
  acceptBtn: ViewStyle;
  acceptBtnBest: ViewStyle;
  acceptLabel: TextStyle;
  acceptLabelBest: TextStyle;
}

function makeStyles(t: RnTheme): QuoteCardStyles {
  // dc.html:242 — `padding: 6px 0 5px`, a `--border-sub` top rule, and the
  // row bled to the card's edges. `ACCEPT` is 8.5px/700/ls 1.5 with
  // `padding: 7px 11px` and `radius 7` (dc.html:246).
  const price: TextStyle = {
    fontSize: 12,
    fontWeight: "600",
    color: t.textSecondary,
    fontFamily: t.fontMono,
  };

  const acceptBtn: ViewStyle = {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: t.bgSecondary,
  };

  const acceptLabel: TextStyle = {
    fontSize: 8.5,
    fontWeight: "700",
    letterSpacing: 1.5,
    fontFamily: t.fontMono,
    color: t.textSecondary,
  };

  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingTop: 6,
      paddingBottom: 5,
      paddingHorizontal: 12,
      marginHorizontal: -12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.borderSubtle,
    },
    rowBest: { backgroundColor: t.bgSecondary },
    dealerName: {
      flex: 1,
      fontSize: 9,
      letterSpacing: 0.8,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    priceText: price,
    priceBest: { ...price, color: t.accentPositive },
    acceptWrap: { position: "relative" },
    acceptBtn,
    acceptBtnBest: { ...acceptBtn, backgroundColor: t.accentPositive },
    acceptLabel,
    acceptLabelBest: { ...acceptLabel, color: t.textOnAccent },
  });
}
