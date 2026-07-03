import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { type Instrument, type Quote, type Rfq, RfqState } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface TradeTicketProps {
  rfq: Rfq;
  quote: Quote;
  instrument: Instrument | undefined;
}

export function TradeTicket({
  rfq,
  quote,
  instrument,
}: TradeTicketProps): JSX.Element {
  const { useTicketSubmission } = useViewModel();
  const ticket = useTicketSubmission();
  const { submitPrice, pass } = ticket;
  const [price, setPrice] = useState("");
  const styles = useThemedStyles(makeStyles);
  const submitted = ticket.state.submitted;

  const isActive =
    rfq.state === RfqState.Open && quote.state.type === "pendingWithoutPrice";
  const hasResponded = quote.state.type !== "pendingWithoutPrice";

  function handleSubmit(): void {
    const num = parseFloat(price);

    if (Number.isNaN(num) || num <= 0) {
      return;
    }

    submitPrice(quote.id, num);
  }

  function handlePass(): void {
    pass(quote.id);
  }

  return (
    <View style={styles.ticket} testID={`sell-ticket-${rfq.id}`}>
      <View style={styles.info}>
        <Text style={styles.instrumentName}>
          {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
        </Text>
        <Text style={styles.instrumentMeta}>
          {instrument?.cusip} | {rfq.direction} | Qty:{" "}
          {rfq.quantity.toLocaleString()}
        </Text>
      </View>

      {hasResponded || submitted ? (
        <Text style={styles.respondedText}>{respondedLabel(rfq, quote)}</Text>
      ) : isActive ? (
        <View style={styles.inputRow}>
          <TextInput
            testID={`sell-ticket-price-${rfq.id}`}
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
            placeholder="Price"
            placeholderTextColor={styles.placeholder.color}
            style={styles.priceInput}
          />
          <Pressable
            testID={`sell-ticket-submit-${rfq.id}`}
            disabled={!price}
            style={price ? styles.submitBtn : styles.submitBtnDisabled}
            onPress={handleSubmit}
          >
            <Text style={styles.btnLabel}>Submit</Text>
          </Pressable>
          <Pressable
            testID={`sell-ticket-pass-${rfq.id}`}
            style={styles.passBtn}
            onPress={handlePass}
          >
            <Text style={styles.btnLabel}>Pass</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.closedText}>{closedLabel(rfq.state)}</Text>
      )}
    </View>
  );
}

function respondedLabel(rfq: Rfq, quote: Quote): string {
  if (quote.state.type === "passed") {
    return "Passed";
  }

  if (quote.state.type === "pendingWithPrice") {
    return `Quoted: $${quote.state.price}`;
  }

  if (rfq.state === RfqState.Cancelled) {
    return "RFQ Cancelled";
  }

  if (rfq.state === RfqState.Expired) {
    return "RFQ Expired";
  }

  return "Responded";
}

function closedLabel(state: RfqState): string {
  if (state === RfqState.Cancelled) {
    return "Cancelled";
  }

  if (state === RfqState.Expired) {
    return "Expired";
  }

  return "Closed";
}

interface TradeTicketStyles {
  ticket: ViewStyle;
  info: ViewStyle;
  instrumentName: TextStyle;
  instrumentMeta: TextStyle;
  respondedText: TextStyle;
  closedText: TextStyle;
  inputRow: ViewStyle;
  priceInput: TextStyle;
  placeholder: TextStyle;
  submitBtn: ViewStyle;
  submitBtnDisabled: ViewStyle;
  passBtn: ViewStyle;
  btnLabel: TextStyle;
}

function makeStyles(t: RnTheme): TradeTicketStyles {
  return StyleSheet.create({
    ticket: {
      gap: 8,
      padding: 12,
      marginHorizontal: 8,
      marginVertical: 4,
      borderRadius: 8,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    info: { gap: 2 },
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
    respondedText: {
      fontSize: 13,
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    closedText: { fontSize: 13, color: t.textMuted, fontFamily: t.fontDisplay },
    inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    priceInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      padding: 8,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    placeholder: { color: t.textMuted },
    submitBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: t.accentPositive,
    },
    submitBtnDisabled: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: t.bgSecondary,
      opacity: 0.5,
    },
    passBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: t.bgSecondary,
    },
    btnLabel: {
      fontSize: 12,
      color: t.textOnAccent,
      fontFamily: t.fontDisplay,
    },
  });
}
