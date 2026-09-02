import type { JSX, ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { OrderTicketState } from "@rtc/client-core";
import type { OrderSide } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { OrderCeremony } from "#/ui/equities/trade/OrderCeremony";
import { SurfaceCard } from "#/ui/SurfaceCard";
import { labelStyle } from "#/ui/theme/labelStyle";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** Equity order ticket in the mobile-v1 shape — `SELL` / `BUY` outlined
 * toggles with a boxed `MKT | LMT` pair, quantity preset chips, a `LIMIT PX`
 * stepper under LMT, and a full-width side-coloured CTA reading
 * `BUY 500 NVDA · @ 131.14` — plus the terminal/in-flight phases
 * (submitting/working/partiallyFilled/filled/rejected). All state + intents
 * from `useOrderTicket(symbol)`; the free-text quantity and limit inputs of
 * the web port were replaced by the design's chips and stepper on
 * 2026-08-29. Every
 * phase's `Ticket` shell also carries `OrderCeremony`, which OWNS the
 * phase-status text (busy pill / fill-or-reject toast) — this component
 * itself renders none of it, so the same fact (e.g. "FILLED — 100 @ 182.40")
 * never appears twice in one card. */
export function OrderTicket({ symbol }: OrderTicketProps): JSX.Element {
  const { useOrderTicket, useEquityQuote } = useViewModel();
  const ticket = useOrderTicket(symbol);
  // The limit stepper starts from the last price when no limit has been set
  // yet — the prototype's `eqLimit ?? cur.px`.
  const quote = useEquityQuote(symbol);
  const { state } = ticket;
  const styles = useThemedStyles(makeStyles);

  if (state.phase === "submitting") {
    return <Ticket state={state} styles={styles} />;
  }

  if (state.phase === "working" || state.phase === "partiallyFilled") {
    return (
      <Ticket state={state} styles={styles}>
        <ResetButton label="RESET" onPress={ticket.reset} styles={styles} />
      </Ticket>
    );
  }

  if (state.phase === "filled") {
    return (
      <Ticket state={state} styles={styles}>
        <ResetButton label="NEW ORDER" onPress={ticket.reset} styles={styles} />
      </Ticket>
    );
  }

  if (state.phase === "rejected") {
    return (
      <Ticket state={state} styles={styles}>
        <ResetButton label="RETRY" onPress={ticket.reset} styles={styles} />
      </Ticket>
    );
  }

  const { form, error } = state;
  const isLimit = form.type === "limit";
  const buy = form.side === "buy";
  const limit = form.limitPrice ?? quote?.last ?? 0;

  function selectSellSide(): void {
    ticket.setSide("sell");
  }

  function selectBuySide(): void {
    ticket.setSide("buy");
  }

  function selectMarketType(): void {
    ticket.setType("market");
  }

  function selectLimitType(): void {
    ticket.setType("limit");
  }

  function selectQtyFor(qty: number): () => void {
    return () => {
      ticket.setQty(qty);
    };
  }

  function decrementLimitPrice(): void {
    ticket.setLimitPrice(stepPrice(limit, -1));
  }

  function incrementLimitPrice(): void {
    ticket.setLimitPrice(stepPrice(limit, 1));
  }

  return (
    <Ticket state={state} styles={styles}>
      <View style={styles.sideRow}>
        <Pressable
          testID="order-ticket-side-sell"
          style={!buy ? styles.sellActive : styles.sideToggle}
          onPress={selectSellSide}
        >
          <Text style={!buy ? styles.sellLabelOn : styles.sideLabel}>SELL</Text>
        </Pressable>
        <Pressable
          testID="order-ticket-side-buy"
          style={buy ? styles.buyActive : styles.sideToggle}
          onPress={selectBuySide}
        >
          <Text style={buy ? styles.buyLabelOn : styles.sideLabel}>BUY</Text>
        </Pressable>
        <View style={styles.typeGroup}>
          <Pressable
            testID="order-ticket-type-market"
            style={!isLimit ? styles.typeActive : styles.type}
            onPress={selectMarketType}
          >
            <Text style={!isLimit ? styles.typeLabelOn : styles.typeLabel}>
              MKT
            </Text>
          </Pressable>
          <Pressable
            testID="order-ticket-type-limit"
            style={isLimit ? styles.typeActive : styles.type}
            onPress={selectLimitType}
          >
            <Text style={isLimit ? styles.typeLabelOn : styles.typeLabel}>
              LMT
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.qtyRow}>
        {QTY_CHIPS.map((qty) => {
          const on = form.qty === qty;

          return (
            <Pressable
              key={qty}
              testID={`order-ticket-qty-${qty}`}
              accessibilityState={{ selected: on }}
              style={on ? styles.chipActive : styles.chip}
              onPress={selectQtyFor(qty)}
            >
              <Text style={on ? styles.chipLabelOn : styles.chipLabel}>
                {formatQty(qty)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLimit ? (
        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>LIMIT PX</Text>
          <Pressable
            testID="order-ticket-limit-down"
            style={styles.stepper}
            onPress={decrementLimitPrice}
          >
            <Text style={styles.stepperGlyph}>−</Text>
          </Pressable>
          <Text testID="order-ticket-limit" style={styles.limitValue}>
            {limit.toFixed(2)}
          </Text>
          <Pressable
            testID="order-ticket-limit-up"
            style={styles.stepper}
            onPress={incrementLimitPrice}
          >
            <Text style={styles.stepperGlyph}>+</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        testID="order-ticket-submit"
        style={buy ? styles.submitBuy : styles.submitSell}
        onPress={ticket.submit}
      >
        <Text style={styles.submitLabel}>
          {submitLabel(form.side, form.qty, symbol, isLimit ? limit : null)}
        </Text>
      </Pressable>
    </Ticket>
  );
}

/** The design's quantity presets. */
const QTY_CHIPS: readonly number[] = [100, 500, 1000, 5000];

/** One stepper tap moves the limit by a dime, as the prototype does. */
const LIMIT_STEP = 0.1;

/** `1K` / `5K` above a thousand, the plain number below — the prototype's
 * chip and CTA rendering of a quantity. */
function formatQty(qty: number): string {
  return qty >= 1000 ? `${qty / 1000}K` : String(qty);
}

/** The limit after one stepper tap, rounded to the cent so repeated
 * `± 0.1` steps never accumulate float dust. */
function stepPrice(price: number, direction: 1 | -1): number {
  return Math.round((price + direction * LIMIT_STEP) * 100) / 100;
}

/** `BUY 500 NVDA · @ 131.14` / `SELL 1K NVDA · MARKET`; the quantity is
 * omitted while none is chosen (the machine starts at 0). */
function submitLabel(
  side: OrderSide,
  qty: number,
  symbol: string,
  limit: number | null,
): string {
  const parts = [side.toUpperCase()];

  if (qty > 0) {
    parts.push(formatQty(qty));
  }

  parts.push(symbol);
  return `${parts.join(" ")} · ${limit === null ? "MARKET" : `@ ${limit.toFixed(2)}`}`;
}

interface OrderTicketProps {
  symbol: string;
}

interface TicketProps {
  state: OrderTicketState;
  styles: OrderTicketStyles;
  // Optional: `submitting` has no other content — `OrderCeremony` alone (its
  // busy pill) is the whole card.
  children?: ReactNode;
}

/** Shared `order-ticket` card shell — every phase branch (submitting/working/
 * partiallyFilled/filled/rejected/editing) renders through this one wrapper
 * so the SurfaceCard chrome isn't duplicated per branch. Carries the
 * `OrderCeremony` flourish above `children` for every phase — it renders
 * nothing itself while editing. */
function Ticket({ state, styles, children }: TicketProps): JSX.Element {
  return (
    <SurfaceCard variant="panel" testID="order-ticket" style={styles.ticket}>
      <OrderCeremony state={state} />
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
  sideRow: ViewStyle;
  sideToggle: ViewStyle;
  buyActive: ViewStyle;
  sellActive: ViewStyle;
  sideLabel: TextStyle;
  buyLabelOn: TextStyle;
  sellLabelOn: TextStyle;
  typeGroup: ViewStyle;
  type: ViewStyle;
  typeActive: ViewStyle;
  typeLabel: TextStyle;
  typeLabelOn: TextStyle;
  qtyRow: ViewStyle;
  chip: ViewStyle;
  chipActive: ViewStyle;
  chipLabel: TextStyle;
  chipLabelOn: TextStyle;
  limitRow: ViewStyle;
  limitLabel: TextStyle;
  stepper: ViewStyle;
  stepperGlyph: TextStyle;
  limitValue: TextStyle;
  error: TextStyle;
  submitBuy: ViewStyle;
  submitSell: ViewStyle;
  submitLabel: TextStyle;
  resetBtn: ViewStyle;
  resetLabel: TextStyle;
}

/** The prototype tints an active side toggle at 12% of its colour
 * (`color-mix(... 12%, transparent)`); the accent tokens are six-digit hex,
 * so the alpha byte is appended directly. */
function tint12(hexColor: string): string {
  return `${hexColor}1F`;
}

function makeStyles(t: RnTheme): OrderTicketStyles {
  const sideToggle: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: t.borderSubtle,
  };

  const sideLabel: TextStyle = labelStyle(t, 10, 2, "700");
  const type: ViewStyle = { paddingHorizontal: 11, justifyContent: "center" };
  const typeLabel: TextStyle = {
    fontSize: 9,
    ...weightedFont(t, "mono", "600"),
  };

  const chip: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: t.borderSubtle,
  };

  const chipLabel: TextStyle = {
    fontSize: 10,
    ...weightedFont(t, "mono", "600"),
  };

  const baseSubmit: ViewStyle = {
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 10,
  };
  return StyleSheet.create({
    ticket: {
      gap: 9,
      paddingTop: 11,
      paddingHorizontal: 13,
      paddingBottom: 11,
      marginBottom: 9,
    },
    sideRow: { flexDirection: "row", gap: 7, marginTop: 4 },
    sideToggle,
    buyActive: {
      ...sideToggle,
      borderColor: t.accentPositive,
      backgroundColor: tint12(t.accentPositive),
    },
    sellActive: {
      ...sideToggle,
      borderColor: t.accentNegative,
      backgroundColor: tint12(t.accentNegative),
    },
    sideLabel: { ...sideLabel, color: t.textMuted },
    buyLabelOn: { ...sideLabel, color: t.accentPositive },
    sellLabelOn: { ...sideLabel, color: t.accentNegative },
    typeGroup: {
      flexDirection: "row",
      borderRadius: 9,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      overflow: "hidden",
    },
    type,
    typeActive: { ...type, backgroundColor: t.accentPrimary },
    typeLabel: { ...typeLabel, color: t.textSecondary },
    typeLabelOn: { ...typeLabel, color: t.textOnAccent },
    qtyRow: { flexDirection: "row", gap: 6 },
    chip,
    chipActive: {
      ...chip,
      borderColor: t.accentPrimary,
      backgroundColor: t.chip,
    },
    chipLabel: { ...chipLabel, color: t.textMuted },
    chipLabelOn: { ...chipLabel, color: t.accentPrimary },
    limitRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    limitLabel: {
      width: 54,
      ...labelStyle(t, 8, 1.5),
      color: t.textMuted,
    },
    stepper: {
      width: 38,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.borderSubtle,
    },
    stepperGlyph: {
      fontSize: 14,
      color: t.accentPrimary,
      fontFamily: t.fontMono,
    },
    limitValue: {
      flex: 1,
      textAlign: "center",
      fontSize: 16,
      color: t.textPrimary,
      ...weightedFont(t, "mono", "700"),
    },
    error: { fontSize: 12, color: t.accentNegative, fontFamily: t.fontMono },
    submitBuy: { ...baseSubmit, backgroundColor: t.accentPositive },
    submitSell: { ...baseSubmit, backgroundColor: t.accentNegative },
    submitLabel: {
      ...labelStyle(t, 10.5, 2.5, "700"),
      color: t.textOnAccent,
    },
    resetBtn: {
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: SPACING.md,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: t.borderSubtle,
    },
    resetLabel: {
      ...labelStyle(t, 10, 1),
      color: t.textSecondary,
    },
  });
}
