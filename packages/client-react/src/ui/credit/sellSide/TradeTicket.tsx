import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";

import { type Instrument, type Quote, type Rfq, RfqState } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./TradeTicket.module.css";

export function TradeTicket({
  rfq,
  quote,
  instrument,
}: TradeTicketProps): ReactElement {
  const { useTicketSubmission, useAnimationIntents } = useViewModel();
  // App-layer machine: submit-price / pass flow + the submitted flag. The
  // component keeps only the price draft + parseFloat guard below.
  const anim = useAnimationIntents(`rfq:${rfq.id}`);
  const ticket = useTicketSubmission();
  const { submitPrice, pass } = ticket;
  const [price, setPrice] = useState("");
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
    <div
      className={styles.ticket}
      data-active={rfq.state === RfqState.Open ? "true" : "false"}
      data-anim={anim?.kind === "fill" ? "fill" : undefined}
    >
      <div>
        <div className={styles.instrumentName}>
          {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
        </div>
        <div className={styles.instrumentMeta}>
          {instrument?.cusip} | {rfq.direction} | Qty:{" "}
          {rfq.quantity.toLocaleString()}
        </div>
      </div>

      {hasResponded || submitted ? (
        <div className={styles.respondedText}>
          {quote.state.type === "passed"
            ? "Passed"
            : quote.state.type === "pendingWithPrice"
              ? `Quoted: $${quote.state.price}`
              : rfq.state === RfqState.Cancelled
                ? "RFQ Cancelled"
                : rfq.state === RfqState.Expired
                  ? "RFQ Expired"
                  : "Responded"}
        </div>
      ) : isActive ? (
        <div className={styles.inputRow}>
          <input
            type="number"
            data-testid="trade-ticket-price"
            value={price}
            onChange={(e: ChangeEvent<HTMLInputElement>): void => {
              setPrice(e.target.value);
            }}
            placeholder="Price"
            className={styles.priceInput}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!price}
            data-can-submit={price ? "true" : "false"}
            className={styles.submitBtn}
          >
            Submit
          </button>
          <button type="button" onClick={handlePass} className={styles.passBtn}>
            Pass
          </button>
        </div>
      ) : (
        <div className={styles.closedText}>
          {rfq.state === RfqState.Cancelled
            ? "Cancelled"
            : rfq.state === RfqState.Expired
              ? "Expired"
              : "Closed"}
        </div>
      )}
    </div>
  );
}

interface TradeTicketProps {
  rfq: Rfq;
  quote: Quote;
  instrument: Instrument | undefined;
}
