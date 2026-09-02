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

import { CtaGradient } from "#/ui/CtaGradient";
import { AcceptPulse } from "#/ui/credit/rfqTiles/AcceptPulse";
import { AwaitingLabel } from "#/ui/credit/rfqTiles/AwaitingLabel";
import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** One dealer's line inside an RFQ card. The prototype draws these as flat rows
 * separated by a hairline rather than nested cards (dc.html:241-250), with the
 * winning row tinted and its ACCEPT button haloed — `isBest` is decided once
 * per RFQ by `findBestQuoteId`, not re-derived here, so both clients agree on
 * the winner. Unpriced dealers show a breathing `AWAITING…` instead of a
 * price, which is what makes a slow dealer visibly distinct from a passed one.
 *
 * Two rows carry the accent treatment, not one (dc.html:2145-2153 keys every
 * one of `pxC`/`bg`/`btnBg` on `isBest || won`): the best LIVE quote, and the
 * quote that actually traded on a settled card. They are mutually exclusive in
 * practice — `RfqCard` only computes a best quote while the RFQ is Open — but
 * the tag distinguishes them, `◂ BEST` while the race is on and `◂ WON` once
 * it is over. */
export function QuoteCard({
  quote,
  dealer,
  isBest = false,
  onAccept,
}: QuoteCardProps): JSX.Element {
  const canAccept = quote.state.type === "pendingWithPrice" && onAccept != null;
  const awaiting = quote.state.type === "pendingWithoutPrice";
  const won = quote.state.type === "accepted";
  const accented = isBest || won;
  const styles = useThemedStyles(makeStyles);

  function acceptPendingQuote(): void {
    if (canAccept && onAccept) {
      void onAccept(quote.id);
    }
  }

  return (
    <View
      style={[styles.row, accented ? styles.rowAccented : null]}
      testID={`quote-card-${quote.id}`}
    >
      <Text style={styles.dealerName} numberOfLines={1}>
        {(dealer?.name ?? `Dealer ${quote.dealerId}`).toUpperCase()}
        <Text style={styles.tag}>{tagText(isBest, won)}</Text>
      </Text>
      {awaiting ? (
        <AwaitingLabel />
      ) : (
        <Text style={accented ? styles.priceAccented : styles.priceText}>
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
            {isBest ? <CtaGradient /> : null}
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

/** The marker the design prints after the dealer name (dc.html:2151 —
 * `tag: isBest ? '◂ BEST' : won ? '◂ WON' : ''`). Leading space included: it
 * renders as a nested span inside the name, so the gap is part of the text.
 * The empty string is the normal case and draws nothing. */
function tagText(isBest: boolean, won: boolean): string {
  if (isBest) {
    return " ◂ BEST";
  }

  if (won) {
    return " ◂ WON";
  }

  return "";
}

function displayText(state: Quote["state"]): string {
  switch (state.type) {
    case "pendingWithoutPrice":
    case "rejectedWithoutPrice":
      return "Awaiting response";
    case "pendingWithPrice":
    case "accepted":
    case "rejectedWithPrice":
      // Fixed 2dp, and NO currency prefix: the design prints a bare `97.15`
      // (dc.html:2144, `d.px.toFixed(2)`) — these are bond prices per 100 of
      // par, not dollar amounts, and a `$` both misreads them and pushes the
      // decimal points out of a shared column. Fixed 2dp is what keeps that
      // column aligned, which is the entire job of it.
      return state.price.toFixed(2);
    case "passed":
      return "Passed";
  }
}

interface QuoteCardStyles {
  row: ViewStyle;
  rowAccented: ViewStyle;
  dealerName: TextStyle;
  tag: TextStyle;
  priceText: TextStyle;
  priceAccented: TextStyle;
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
    color: t.textPrimary,
    ...weightedFont(t, "mono", "600"),
  };

  const acceptBtn: ViewStyle = {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: t.chip,
  };

  const acceptLabel: TextStyle = {
    ...labelStyle(t, 8.5, 1.5, "700"),
    color: t.accentPrimary,
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
    // dc.html:2148 — `color-mix(in oklab, acc 7%, transparent)`. Every skin's
    // `accentPrimary` is a 6-digit hex, so the 7% is expressed as the `12`
    // alpha byte (18/255 ≈ 7.1%) rather than a second token.
    rowAccented: { backgroundColor: `${t.accentPrimary}12` },
    dealerName: {
      flex: 1,
      ...labelStyle(t, 9, 0.8),
      color: t.textSecondary,
    },
    // dc.html:243 — the marker rides inside the name at 7.5px in the accent.
    tag: { fontSize: 7.5, color: t.accentPrimary },
    priceText: price,
    priceAccented: { ...price, color: t.accentPrimary },
    acceptWrap: { position: "relative" },
    acceptBtn,
    // `overflow: hidden` clips the gradient sublayer to the 7px radius; the
    // flat accent underneath it is what shows if the SVG layer ever fails.
    acceptBtnBest: {
      ...acceptBtn,
      backgroundColor: t.accentPrimary,
      overflow: "hidden",
    },
    acceptLabel,
    acceptLabelBest: { ...acceptLabel, color: t.textOnAccent },
  });
}
