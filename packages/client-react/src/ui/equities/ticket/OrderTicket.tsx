import type { ChangeEvent, ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./OrderTicket.module.css";

/**
 * Equity order ticket — BUY/SELL + Market/Limit toggles, a qty stepper,
 * conditional limit price, a cost summary, and a big accent Submit. Reads all
 * state from useOrderTicket(symbol) and animation intent from
 * useAnimationIntents(`ticket:${symbol}`). The traded symbol defaults to the
 * shared eqWorkspace selection when no `symbol` prop is given — the eq-ticket
 * dock panel (Task 6) mounts it with no symbol, relying on that fallback; the
 * visual/contract specs still pass an explicit symbol to pin a fixed AAPL shot.
 *
 * Phase → data-phase: editing | submitting | working | partiallyFilled |
 *                      filled | rejected
 * Animation → data-anim="fill" when intent kind === "fill" (fill choreography).
 *
 * NOTE: `submitting` phase has NO `order` field — the component never reads
 * order on a submitting state.
 */
export function OrderTicket({ symbol }: OrderTicketProps): ReactElement {
  const {
    useOrderTicket,
    useAnimationIntents,
    useEqWorkspace,
    useEquityQuote,
  } = useViewModel();
  const workspace = useEqWorkspace();
  const sym = symbol ?? workspace.state.sel;
  const ticket = useOrderTicket(sym);
  const animIntent = useAnimationIntents(`ticket:${sym}`);
  const quote = useEquityQuote(sym);

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
  const live = quote?.last ?? 0;
  // PROTO Ticket/OrderTicketPanel.tsx:24 — a limit order costs at the limit
  // price ONLY once one has actually been entered; a blank/zero limit still
  // prices off the live last (matches the prototype's `limitN ? limitN : last`).
  const unitPrice = isLimit && form.limitPrice ? form.limitPrice : live;
  const estCost = form.qty * unitPrice;

  function stepQty(delta: number): void {
    ticket.setQty(Math.max(0, form.qty + delta));
  }

  return (
    <div
      data-testid="order-ticket"
      data-phase="editing"
      data-anim={animAttr}
      className={styles.ticket}
    >
      {/* Side toggle: Buy / Sell */}
      <div className={styles.sideToggle}>
        <button
          type="button"
          data-side="buy"
          data-active={form.side === "buy" ? "true" : "false"}
          className={styles.side}
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
          className={styles.side}
          onClick={() => {
            ticket.setSide("sell");
          }}
        >
          SELL
        </button>
      </div>

      {/* Type toggle: Market / Limit */}
      <span className={styles.label}>ORDER TYPE</span>
      <div className={styles.typeRow}>
        <button
          type="button"
          data-kind="type"
          data-active={form.type === "market" ? "true" : "false"}
          className={styles.type}
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
          className={styles.type}
          onClick={() => {
            ticket.setType("limit");
          }}
        >
          LIMIT
        </button>
      </div>

      {/* Quantity stepper */}
      <span className={styles.label}>QUANTITY</span>
      <div className={styles.qtyRow}>
        <button
          type="button"
          data-testid="order-ticket-qty-dec"
          className={styles.step}
          onClick={() => {
            stepQty(-QTY_STEP);
          }}
        >
          −
        </button>
        <input
          type="number"
          min={0}
          step={1}
          className={styles.qtyInput}
          value={form.qty === 0 ? "" : form.qty}
          placeholder="0"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) ticket.setQty(n);
          }}
        />
        <button
          type="button"
          data-testid="order-ticket-qty-inc"
          className={styles.step}
          onClick={() => {
            stepQty(QTY_STEP);
          }}
        >
          +
        </button>
      </div>

      {/* Conditional limit price */}
      {isLimit && (
        <>
          <span className={styles.label}>LIMIT PRICE</span>
          <input
            type="number"
            min={0}
            step={0.01}
            className={styles.input}
            value={form.limitPrice ?? ""}
            placeholder={live.toFixed(2)}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const n =
                e.target.value === "" ? undefined : Number(e.target.value);
              ticket.setLimitPrice(Number.isFinite(n) ? n : undefined);
            }}
          />
        </>
      )}

      {/* Validation error */}
      {!!error && <div className={styles.error}>{error}</div>}

      {/* Cost summary */}
      <div className={styles.summary}>
        <SummaryRow
          label="Est. Cost"
          value={`$${fmtNum(estCost)}`}
          testId="order-ticket-est-cost"
        />
        <SummaryRow label="Buying Power" value={BUYING_POWER} />
        <SummaryRow label="Time in Force" value="Day" dim />
      </div>

      {/* Submit */}
      <button
        type="button"
        data-testid="order-ticket-submit"
        data-side={form.side}
        className={styles.submit}
        onClick={ticket.submit}
      >
        {form.side === "buy" ? "BUY" : "SELL"} {sym}
      </button>
    </div>
  );
}

const BUYING_POWER = "$250,000";
const QTY_STEP = 10;

/** Rounds to the nearest integer and formats with thousands separators —
 * mirrors the prototype's `fmtNum` (Ticket/OrderTicketPanel.tsx). */
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

interface OrderTicketProps {
  symbol?: string;
}

interface SummaryRowProps {
  label: string;
  value: string;
  dim?: boolean;
  testId?: string;
}

function SummaryRow({
  label,
  value,
  dim = false,
  testId,
}: SummaryRowProps): ReactElement {
  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryLabel}>{label}</span>
      <span
        data-testid={testId}
        className={styles.summaryValue}
        data-dim={dim ? "true" : "false"}
      >
        {value}
      </span>
    </div>
  );
}
