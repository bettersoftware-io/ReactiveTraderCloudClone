import type { JSX } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import {
  ADAPTIVE_BANK_NAME,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { SellSideTicket } from "#/ui/credit/sellSide/SellSideTicket";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The sell-side desk: every RFQ Adaptive Bank has been asked to price, each
 * wearing the prototype's ticket chrome, with the desk's settled quotes below.
 *
 * **A list, not one rotating ticket (Phase 5 design §3.1).** The prototype
 * cycles a single incoming RFQ every 45 s because it has no real feed; the seam
 * has many open at once, and showing all but the first would lose real work.
 * Won/lost likewise derives from real `QuoteState` — `accepted` → WON,
 * `rejectedWithPrice` → LOST — so there is no "resolves after 2600 ms" timer to
 * port. */
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

  if (adaptiveBankId === undefined || rfqs.length === 0) {
    return (
      <View style={styles.panel} testID="sell-side-panel">
        <Text style={styles.empty} testID="sell-side-empty">
          No RFQs for {ADAPTIVE_BANK_NAME}
        </Text>
      </View>
    );
  }

  // Incoming tickets first, settled quotes under a YOUR QUOTES heading —
  // the prototype's order (dc.html:292 then :305). Rendering `rfqs` in seam
  // order instead buried a live ticket below the history, which is backwards:
  // the ticket is the only thing on this screen with a countdown on it.
  const live: Rfq[] = [];
  const settled: Rfq[] = [];

  for (const rfq of rfqs) {
    (rfq.state === RfqState.Open ? live : settled).push(rfq);
  }

  return (
    <View style={styles.panel} testID="sell-side-panel">
      <ScrollView contentContainerStyle={styles.list}>
        {live.map((rfq) => {
          return (
            <SellSideRow
              key={rfq.id}
              rfq={rfq}
              adaptiveBankId={adaptiveBankId}
              instrumentMap={instrumentMap}
            />
          );
        })}
        {settled.length > 0 ? (
          <Text style={styles.sectionLabel} testID="sell-side-your-quotes">
            YOUR QUOTES
          </Text>
        ) : null}
        {settled.map((rfq) => {
          return (
            <SellSideRow
              key={rfq.id}
              rfq={rfq}
              adaptiveBankId={adaptiveBankId}
              instrumentMap={instrumentMap}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

interface SellSideRowProps {
  rfq: Rfq;
  adaptiveBankId: number;
  instrumentMap: Map<number, Instrument>;
}

/** Private: resolves this desk's own quote on one RFQ, then renders either the
 * live ticket or a `YOUR QUOTES` history row. Split per-RFQ because
 * `useQuotesForRfq` is a hook and cannot be called in a loop. */
function SellSideRow({
  rfq,
  adaptiveBankId,
  instrumentMap,
}: SellSideRowProps): JSX.Element | null {
  const { useQuotesForRfq } = useViewModel();
  const quotes = useQuotesForRfq(rfq.id);
  const ownQuote = quotes.find((q) => {
    return q.dealerId === adaptiveBankId;
  });

  if (!ownQuote) {
    return null;
  }

  if (isAwaitingOurPrice(rfq, ownQuote)) {
    return (
      <SellSideTicket
        rfq={rfq}
        quote={ownQuote}
        instrument={instrumentMap.get(rfq.instrumentId)}
      />
    );
  }

  return (
    <QuoteHistoryRow
      rfq={rfq}
      quote={ownQuote}
      instrument={instrumentMap.get(rfq.instrumentId)}
    />
  );
}

interface QuoteHistoryRowProps {
  rfq: Rfq;
  quote: Quote;
  instrument: Instrument | undefined;
}

/** Private: one settled row of the prototype's `YOUR QUOTES` list
 * (dc.html:306-312) — instrument, our price, and a status pill whose wording
 * comes straight from the real `QuoteState`. */
function QuoteHistoryRow({
  rfq,
  quote,
  instrument,
}: QuoteHistoryRowProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const outcome = quoteOutcome(quote);

  return (
    <View style={styles.historyRow} testID={`sell-side-history-${rfq.id}`}>
      <View style={styles.historyLeft}>
        <Text style={styles.historyInstrument}>
          {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
        </Text>
        <Text style={styles.historyMeta}>
          {rfq.quantity.toLocaleString("en-US")}
        </Text>
      </View>
      <View style={styles.historyRight}>
        <Text style={styles.historyPrice}>{quotedPriceText(quote)}</Text>
        <Text
          testID={`sell-side-status-${rfq.id}`}
          style={outcomePillStyle(outcome, styles)}
        >
          {outcome}
        </Text>
      </View>
    </View>
  );
}

/** A ticket is live only while the RFQ is open AND this desk has not answered
 * — the seam's own two facts, no local "have I submitted" flag. */
function isAwaitingOurPrice(rfq: Rfq, quote: Quote): boolean {
  return (
    rfq.state === RfqState.Open && quote.state.type === "pendingWithoutPrice"
  );
}

/** Won/lost derives from real `QuoteState`, not a timer (Phase 5 design §3.1). */
function quoteOutcome(quote: Quote): string {
  switch (quote.state.type) {
    case "accepted":
      return "WON";
    case "rejectedWithPrice":
      return "LOST";
    case "passed":
      return "PASSED";
    case "pendingWithPrice":
      return "PENDING";
    case "rejectedWithoutPrice":
    case "pendingWithoutPrice":
      return "CLOSED";
  }
}

function outcomePillStyle(
  outcome: string,
  styles: SellSidePanelStyles,
): TextStyle {
  if (outcome === "WON") {
    return styles.pillWon;
  }

  if (outcome === "LOST") {
    return styles.pillLost;
  }

  return styles.pill;
}

function quotedPriceText(quote: Quote): string {
  switch (quote.state.type) {
    case "pendingWithPrice":
    case "accepted":
    case "rejectedWithPrice":
      return quote.state.price.toFixed(2);
    case "passed":
    case "rejectedWithoutPrice":
    case "pendingWithoutPrice":
      return "—";
  }
}

interface SellSidePanelStyles {
  panel: ViewStyle;
  list: ViewStyle;
  sectionLabel: TextStyle;
  empty: TextStyle;
  historyRow: ViewStyle;
  historyLeft: ViewStyle;
  historyRight: ViewStyle;
  historyInstrument: TextStyle;
  historyMeta: TextStyle;
  historyPrice: TextStyle;
  pill: TextStyle;
  pillWon: TextStyle;
  pillLost: TextStyle;
}

function makeStyles(t: RnTheme): SellSidePanelStyles {
  // dc.html:306-312 — rows `radius 9`, `padding 8px 11px`, `margin-bottom 7`;
  // the status pill `8px`, `ls 1px`, `padding 2px 6px`, `radius 4`.
  const pill: TextStyle = {
    fontSize: 8,
    letterSpacing: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    color: t.textMuted,
    borderColor: t.borderSubtle,
    fontFamily: t.fontMono,
  };

  return StyleSheet.create({
    panel: { flex: 1 },
    list: { paddingVertical: 12 },
    // dc.html:305 — `8.5px`, `letter-spacing: 2`, `--faint`, sitting just above
    // the settled rows.
    sectionLabel: {
      fontSize: 8.5,
      letterSpacing: 2,
      color: t.textMuted,
      fontFamily: t.fontMono,
      marginHorizontal: 14,
      marginTop: 2,
      marginBottom: 7,
    },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontDisplay },
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: t.borderSubtle,
      borderRadius: 9,
      paddingVertical: 8,
      paddingHorizontal: 11,
      marginHorizontal: 12,
      marginBottom: 7,
    },
    historyLeft: { gap: 1 },
    historyRight: { flexDirection: "row", alignItems: "center", gap: 9 },
    historyInstrument: {
      fontSize: 10.5,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    historyMeta: { fontSize: 8, color: t.textMuted, fontFamily: t.fontMono },
    historyPrice: {
      fontSize: 11,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    pill,
    pillWon: {
      ...pill,
      color: t.accentPositive,
      borderColor: t.accentPositive,
    },
    pillLost: {
      ...pill,
      color: t.accentNegative,
      borderColor: t.accentNegative,
    },
  });
}
