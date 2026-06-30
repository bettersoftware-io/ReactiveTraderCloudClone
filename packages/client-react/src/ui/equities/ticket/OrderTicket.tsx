import type { ChangeEvent, ReactElement } from "react";

import { useViewModel } from "#/ui/viewModel/useViewModel";

import styles from "./OrderTicket.module.css";

interface OrderTicketProps {
  symbol: string;
}

/**
 * Equity order ticket — side/type toggles, qty input, optional limit-price,
 * Submit. Reads all state from useOrderTicket(symbol) and animation intent
 * from useAnimationIntents(`ticket:${symbol}`).
 *
 * Phase → data-phase: editing | submitting | working | partiallyFilled |
 *                      filled | rejected
 * Animation → data-anim="fill" when intent kind === "fill" (fill choreography).
 *
 * NOTE: `submitting` phase has NO `order` field — the component never reads
 * order on a submitting state.
 */
export function OrderTicket({ symbol }: OrderTicketProps): ReactElement {
  const { useOrderTicket, useAnimationIntents } = useViewModel();
  const ticket = useOrderTicket(symbol);
  const animIntent = useAnimationIntents(`ticket:${symbol}`);

  const { state } = ticket;
  const animAttr = animIntent?.kind === "fill" ? "fill" : undefined;

  // ── Terminal / in-flight phase rendering ──────────────────────────────────

  if (state.phase === "submitting") {
    return (
      <div
        data-testid="order-ticket"
        data-phase="submitting"
        data-anim={animAttr}
        className={styles.ticket}
      >
        <div className={styles.status}>SUBMITTING…</div>
      </div>
    );
  }

  if (state.phase === "working") {
    return (
      <div
        data-testid="order-ticket"
        data-phase="working"
        data-anim={animAttr}
        className={styles.ticket}
      >
        <div className={styles.status}>
          WORKING — {state.order.filledQty}/{state.order.qty} filled
        </div>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={ticket.reset}
        >
          RESET
        </button>
      </div>
    );
  }

  if (state.phase === "partiallyFilled") {
    return (
      <div
        data-testid="order-ticket"
        data-phase="partiallyFilled"
        data-anim={animAttr}
        className={styles.ticket}
      >
        <div className={styles.status}>
          PARTIAL — {state.order.filledQty}/{state.order.qty} @{" "}
          {state.order.avgPrice?.toFixed(2) ?? "—"}
        </div>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={ticket.reset}
        >
          RESET
        </button>
      </div>
    );
  }

  if (state.phase === "filled") {
    return (
      <div
        data-testid="order-ticket"
        data-phase="filled"
        data-anim={animAttr}
        className={styles.ticket}
      >
        <div className={styles.status}>
          FILLED — {state.order.qty} @ {state.order.avgPrice?.toFixed(2) ?? "—"}
        </div>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={ticket.reset}
        >
          NEW ORDER
        </button>
      </div>
    );
  }

  if (state.phase === "rejected") {
    return (
      <div
        data-testid="order-ticket"
        data-phase="rejected"
        data-anim={animAttr}
        className={styles.ticket}
      >
        <div className={styles.status}>REJECTED — {state.reason}</div>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={ticket.reset}
        >
          RETRY
        </button>
      </div>
    );
  }

  // ── Editing phase ──────────────────────────────────────────────────────────

  const { form, error } = state;
  const isLimit = form.type === "limit";

  return (
    <div
      data-testid="order-ticket"
      data-phase="editing"
      data-anim={animAttr}
      className={styles.ticket}
    >
      {/* Side toggle: Buy / Sell */}
      <div className={styles.row}>
        <div className={styles.toggleGroup}>
          <button
            type="button"
            data-side="buy"
            data-active={form.side === "buy" ? "true" : "false"}
            className={styles.toggle}
            onClick={() => {
              ticket.setSide("buy");
            }}
          >
            BUY
          </button>
          <button
            type="button"
            data-side="sell"
            data-active={form.side === "sell" ? "true" : "false"}
            className={styles.toggle}
            onClick={() => {
              ticket.setSide("sell");
            }}
          >
            SELL
          </button>
        </div>
      </div>

      {/* Type toggle: Market / Limit */}
      <div className={styles.row}>
        <div className={styles.toggleGroup}>
          <button
            type="button"
            data-kind="type"
            data-active={form.type === "market" ? "true" : "false"}
            className={styles.toggle}
            onClick={() => {
              ticket.setType("market");
            }}
          >
            MARKET
          </button>
          <button
            type="button"
            data-kind="type"
            data-active={form.type === "limit" ? "true" : "false"}
            className={styles.toggle}
            onClick={() => {
              ticket.setType("limit");
            }}
          >
            LIMIT
          </button>
        </div>
      </div>

      {/* Quantity */}
      <div className={styles.fieldGroup}>
        <span className={styles.label}>QUANTITY</span>
        <input
          type="number"
          min={1}
          step={1}
          className={styles.input}
          value={form.qty === 0 ? "" : form.qty}
          placeholder="0"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) ticket.setQty(n);
          }}
        />
      </div>

      {/* Conditional limit price */}
      {isLimit && (
        <div className={styles.fieldGroup}>
          <span className={styles.label}>LIMIT PRICE</span>
          <input
            type="number"
            min={0}
            step={0.01}
            className={styles.input}
            value={form.limitPrice ?? ""}
            placeholder="0.00"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const n =
                e.target.value === "" ? undefined : Number(e.target.value);
              ticket.setLimitPrice(Number.isFinite(n) ? n : undefined);
            }}
          />
        </div>
      )}

      {/* Validation error */}
      {!!error && <div className={styles.error}>{error}</div>}

      {/* Submit */}
      <button
        type="button"
        data-testid="order-ticket-submit"
        className={styles.submit}
        onClick={ticket.submit}
      >
        {form.side === "buy" ? "BUY" : "SELL"} {symbol}
      </button>
    </div>
  );
}
