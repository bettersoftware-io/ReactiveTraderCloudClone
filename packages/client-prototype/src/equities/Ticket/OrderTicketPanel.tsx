import type { ChangeEvent, ReactElement } from "react";

import { fmtNum } from "#/equities/equitiesData";
import styles from "#/equities/Ticket/OrderTicketPanel.module.css";
import type { EqSym } from "#/equities/types";
import type { EqTicketApi } from "#/equities/useEqTicket";

const BUYING_POWER = "$250,000";

export interface OrderTicketPanelProps {
  api: EqTicketApi;
  sel: EqSym;
  last: number;
}

// PROTO L649-665: the order ticket body — side toggle, order type, quantity
// stepper, optional limit price, a cost summary, the submit button, and a
// transient confirmation flash. (The outer dock Panel owns the head + maximize.)
export function OrderTicketPanel(props: OrderTicketPanelProps): ReactElement {
  const { api, sel, last } = props;
  const { ticket } = api;
  const qtyN = Number.parseInt(ticket.qty, 10) || 0;
  const limitN = Number.parseFloat(ticket.limit);
  const unit = ticket.type === "Limit" && limitN ? limitN : last;
  const cost = `$${fmtNum(qtyN * unit)}`;

  function handleBuy(): void {
    api.setSide("Buy");
  }

  function handleSell(): void {
    api.setSide("Sell");
  }

  function handleMarket(): void {
    api.setType("Market");
  }

  function handleLimit(): void {
    api.setType("Limit");
  }

  function handleQty(e: ChangeEvent<HTMLInputElement>): void {
    api.setQty(e.target.value);
  }

  function handleLimitPx(e: ChangeEvent<HTMLInputElement>): void {
    api.setLimit(e.target.value);
  }

  function handleDec(): void {
    api.stepQty(-10);
  }

  function handleInc(): void {
    api.stepQty(10);
  }

  return (
    <div className={styles.body}>
      <div className={styles.sideToggle}>
        <button
          type="button"
          className={styles.side}
          data-side="buy"
          data-active={String(ticket.side === "Buy")}
          onClick={handleBuy}
        >
          BUY
        </button>
        <button
          type="button"
          className={styles.side}
          data-side="sell"
          data-active={String(ticket.side === "Sell")}
          onClick={handleSell}
        >
          SELL
        </button>
      </div>

      <div className={styles.label}>Order Type</div>
      <div className={styles.typeRow}>
        <button
          type="button"
          className={styles.type}
          data-active={String(ticket.type === "Market")}
          onClick={handleMarket}
        >
          Market
        </button>
        <button
          type="button"
          className={styles.type}
          data-active={String(ticket.type === "Limit")}
          onClick={handleLimit}
        >
          Limit
        </button>
      </div>

      <div className={styles.label}>Quantity</div>
      <div className={styles.qtyRow}>
        <button type="button" className={styles.step} onClick={handleDec}>
          −
        </button>
        <input
          className={styles.qtyInput}
          value={ticket.qty}
          onChange={handleQty}
          inputMode="numeric"
        />
        <button type="button" className={styles.step} onClick={handleInc}>
          +
        </button>
      </div>

      {ticket.type === "Limit" ? (
        <>
          <div className={styles.label}>Limit Price</div>
          <input
            className={styles.limitInput}
            value={ticket.limit}
            onChange={handleLimitPx}
            placeholder={last.toFixed(2)}
          />
        </>
      ) : null}

      <div className={styles.summary}>
        <SummaryRow label="Est. Cost" value={cost} />
        <SummaryRow label="Buying Power" value={BUYING_POWER} />
        <SummaryRow label="Time in Force" value="Day" dim />
      </div>

      <button
        type="button"
        className={styles.submit}
        data-side={ticket.side === "Buy" ? "buy" : "sell"}
        onClick={api.submit}
      >
        {ticket.side === "Buy" ? "BUY " : "SELL "}
        {sel}
      </button>

      {api.flashMsg != null ? (
        <div className={styles.flash}>✓ {api.flashMsg}</div>
      ) : null}
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  dim?: boolean;
}

function SummaryRow(props: SummaryRowProps): ReactElement {
  const { label, value, dim = false } = props;

  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={styles.summaryValue} data-dim={String(dim)}>
        {value}
      </span>
    </div>
  );
}
