import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Equity order ticket — side/type toggles, qty, optional limit price, Submit,
 * plus the terminal/in-flight phases (submitting/working/partiallyFilled/
 * filled/rejected). All state + intents from `useOrderTicket(symbol)`. Ported
 * from web `OrderTicket` without the web-only fill animation intent. */
export function OrderTicket({ symbol }: OrderTicketProps): JSX.Element {
  const { useOrderTicket } = useViewModel();
  const ticket = useOrderTicket(symbol);
  const { state } = ticket;
  const styles = useThemedStyles(makeStyles);

  if (state.phase === "submitting") {
    return (
      <View testID="order-ticket" style={styles.ticket}>
        <Text style={styles.status}>SUBMITTING…</Text>
      </View>
    );
  }

  if (state.phase === "working") {
    return (
      <View testID="order-ticket" style={styles.ticket}>
        <Text style={styles.status}>
          WORKING — {state.order.filledQty}/{state.order.qty} filled
        </Text>
        <ResetButton label="RESET" onPress={ticket.reset} styles={styles} />
      </View>
    );
  }

  if (state.phase === "partiallyFilled") {
    return (
      <View testID="order-ticket" style={styles.ticket}>
        <Text style={styles.status}>
          PARTIAL — {state.order.filledQty}/{state.order.qty} @{" "}
          {state.order.avgPrice?.toFixed(2) ?? "—"}
        </Text>
        <ResetButton label="RESET" onPress={ticket.reset} styles={styles} />
      </View>
    );
  }

  if (state.phase === "filled") {
    return (
      <View testID="order-ticket" style={styles.ticket}>
        <Text style={styles.status}>
          FILLED — {state.order.qty} @ {state.order.avgPrice?.toFixed(2) ?? "—"}
        </Text>
        <ResetButton label="NEW ORDER" onPress={ticket.reset} styles={styles} />
      </View>
    );
  }

  if (state.phase === "rejected") {
    return (
      <View testID="order-ticket" style={styles.ticket}>
        <Text style={styles.status}>REJECTED — {state.reason}</Text>
        <ResetButton label="RETRY" onPress={ticket.reset} styles={styles} />
      </View>
    );
  }

  const { form, error } = state;
  const isLimit = form.type === "limit";
  const buy = form.side === "buy";

  return (
    <View testID="order-ticket" style={styles.ticket}>
      <View style={styles.toggleGroup}>
        <Pressable
          testID="order-ticket-side-buy"
          style={buy ? styles.buyActive : styles.toggle}
          onPress={() => {
            ticket.setSide("buy");
          }}
        >
          <Text style={buy ? styles.toggleLabelOn : styles.toggleLabel}>
            BUY
          </Text>
        </Pressable>
        <Pressable
          testID="order-ticket-side-sell"
          style={!buy ? styles.sellActive : styles.toggle}
          onPress={() => {
            ticket.setSide("sell");
          }}
        >
          <Text style={!buy ? styles.toggleLabelOn : styles.toggleLabel}>
            SELL
          </Text>
        </Pressable>
      </View>

      <View style={styles.toggleGroup}>
        <Pressable
          testID="order-ticket-type-market"
          style={!isLimit ? styles.typeActive : styles.toggle}
          onPress={() => {
            ticket.setType("market");
          }}
        >
          <Text style={!isLimit ? styles.toggleLabelOn : styles.toggleLabel}>
            MARKET
          </Text>
        </Pressable>
        <Pressable
          testID="order-ticket-type-limit"
          style={isLimit ? styles.typeActive : styles.toggle}
          onPress={() => {
            ticket.setType("limit");
          }}
        >
          <Text style={isLimit ? styles.toggleLabelOn : styles.toggleLabel}>
            LIMIT
          </Text>
        </Pressable>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>QUANTITY</Text>
        <TextInput
          testID="order-ticket-qty"
          style={styles.input}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={styles.label.color}
          value={form.qty === 0 ? "" : String(form.qty)}
          onChangeText={(text: string): void => {
            const n = Number(text);

            if (Number.isFinite(n)) {
              ticket.setQty(n);
            }
          }}
        />
      </View>

      {isLimit ? (
        <View style={styles.field}>
          <Text style={styles.label}>LIMIT PRICE</Text>
          <TextInput
            testID="order-ticket-limit"
            style={styles.input}
            keyboardType="numeric"
            placeholder="0.00"
            placeholderTextColor={styles.label.color}
            value={form.limitPrice === undefined ? "" : String(form.limitPrice)}
            onChangeText={(text: string): void => {
              const n = text === "" ? undefined : Number(text);
              ticket.setLimitPrice(Number.isFinite(n) ? n : undefined);
            }}
          />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        testID="order-ticket-submit"
        style={buy ? styles.submitBuy : styles.submitSell}
        onPress={ticket.submit}
      >
        <Text style={styles.submitLabel}>
          {buy ? "BUY" : "SELL"} {symbol}
        </Text>
      </Pressable>
    </View>
  );
}

interface OrderTicketProps {
  symbol: string;
}

interface ResetButtonProps {
  label: string;
  onPress: () => void;
  styles: OrderTicketStyles;
}

function ResetButton({
  label,
  onPress,
  styles,
}: ResetButtonProps): JSX.Element {
  return (
    <Pressable
      testID="order-ticket-reset"
      style={styles.resetBtn}
      onPress={onPress}
    >
      <Text style={styles.resetLabel}>{label}</Text>
    </Pressable>
  );
}

interface OrderTicketStyles {
  ticket: ViewStyle;
  status: TextStyle;
  toggleGroup: ViewStyle;
  toggle: ViewStyle;
  buyActive: ViewStyle;
  sellActive: ViewStyle;
  typeActive: ViewStyle;
  toggleLabel: TextStyle;
  toggleLabelOn: TextStyle;
  field: ViewStyle;
  label: TextStyle;
  input: TextStyle;
  error: TextStyle;
  submitBuy: ViewStyle;
  submitSell: ViewStyle;
  submitLabel: TextStyle;
  resetBtn: ViewStyle;
  resetLabel: TextStyle;
}

function makeStyles(t: RnTheme): OrderTicketStyles {
  const baseToggle: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderSubtle,
    backgroundColor: t.bgSecondary,
  };
  const baseSubmit: ViewStyle = {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 4,
  };
  return StyleSheet.create({
    ticket: {
      gap: 10,
      padding: 12,
      backgroundColor: t.panel,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.borderSubtle,
    },
    status: { fontSize: 13, color: t.textPrimary, fontFamily: t.fontMono },
    toggleGroup: { flexDirection: "row", gap: 8 },
    toggle: baseToggle,
    buyActive: {
      ...baseToggle,
      backgroundColor: t.accentPositive,
      borderColor: t.accentPositive,
    },
    sellActive: {
      ...baseToggle,
      backgroundColor: t.accentNegative,
      borderColor: t.accentNegative,
    },
    typeActive: {
      ...baseToggle,
      backgroundColor: t.accentPrimary,
      borderColor: t.accentPrimary,
    },
    // textOnAccent is legible only on an accent fill — used ONLY on the active
    // (accent-filled) toggle; inactive toggles use textSecondary on bgSecondary.
    toggleLabel: {
      fontSize: 13,
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    toggleLabelOn: {
      fontSize: 13,
      color: t.textOnAccent,
      fontFamily: t.fontDisplay,
    },
    field: { gap: 4 },
    label: { fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    input: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      backgroundColor: t.bgSecondary,
      color: t.textPrimary,
      fontFamily: t.fontMono,
      fontSize: 14,
    },
    error: { fontSize: 12, color: t.accentNegative, fontFamily: t.fontMono },
    submitBuy: { ...baseSubmit, backgroundColor: t.accentPositive },
    submitSell: { ...baseSubmit, backgroundColor: t.accentNegative },
    submitLabel: {
      fontSize: 14,
      color: t.textOnAccent,
      fontFamily: t.fontDisplay,
    },
    resetBtn: {
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: t.border,
    },
    resetLabel: {
      fontSize: 12,
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
  });
}
