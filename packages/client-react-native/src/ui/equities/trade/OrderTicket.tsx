import type { JSX, ReactNode } from "react";
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

import { SurfaceCard } from "#/ui/SurfaceCard";
import { SPACING } from "#/ui/theme/spacing";
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
      <Ticket styles={styles}>
        <Text style={styles.status}>SUBMITTING…</Text>
      </Ticket>
    );
  }

  if (state.phase === "working") {
    return (
      <Ticket styles={styles}>
        <Text style={styles.status}>
          WORKING — {state.order.filledQty}/{state.order.qty} filled
        </Text>
        <ResetButton label="RESET" onPress={ticket.reset} styles={styles} />
      </Ticket>
    );
  }

  if (state.phase === "partiallyFilled") {
    return (
      <Ticket styles={styles}>
        <Text style={styles.status}>
          PARTIAL — {state.order.filledQty}/{state.order.qty} @{" "}
          {state.order.avgPrice?.toFixed(2) ?? "—"}
        </Text>
        <ResetButton label="RESET" onPress={ticket.reset} styles={styles} />
      </Ticket>
    );
  }

  if (state.phase === "filled") {
    return (
      <Ticket styles={styles}>
        <Text style={styles.status}>
          FILLED — {state.order.qty} @ {state.order.avgPrice?.toFixed(2) ?? "—"}
        </Text>
        <ResetButton label="NEW ORDER" onPress={ticket.reset} styles={styles} />
      </Ticket>
    );
  }

  if (state.phase === "rejected") {
    return (
      <Ticket styles={styles}>
        <Text style={styles.status}>REJECTED — {state.reason}</Text>
        <ResetButton label="RETRY" onPress={ticket.reset} styles={styles} />
      </Ticket>
    );
  }

  const { form, error } = state;
  const isLimit = form.type === "limit";
  const buy = form.side === "buy";

  return (
    <Ticket styles={styles}>
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
            if (Number.isFinite(n)) ticket.setQty(n);
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
    </Ticket>
  );
}

interface OrderTicketProps {
  symbol: string;
}

interface TicketProps {
  styles: OrderTicketStyles;
  children: ReactNode;
}

/** Shared `order-ticket` card shell — every phase branch (submitting/working/
 * partiallyFilled/filled/rejected/editing) renders through this one wrapper
 * so the SurfaceCard chrome isn't duplicated per branch. */
function Ticket({ styles, children }: TicketProps): JSX.Element {
  return (
    <SurfaceCard variant="panel" testID="order-ticket" style={styles.ticket}>
      {children}
    </SurfaceCard>
  );
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
    paddingVertical: SPACING.md,
    borderRadius: 6,
    marginTop: SPACING.xs,
  };
  return StyleSheet.create({
    ticket: {
      gap: 10,
      padding: SPACING.md,
    },
    status: { fontSize: 13, color: t.textPrimary, fontFamily: t.fontMono },
    toggleGroup: { flexDirection: "row", gap: SPACING.sm },
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
    field: { gap: SPACING.xs },
    label: { fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    input: {
      paddingHorizontal: 10,
      paddingVertical: SPACING.sm,
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
      paddingHorizontal: SPACING.md,
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
