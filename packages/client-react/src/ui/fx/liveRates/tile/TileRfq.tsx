import type { ReactElement } from "react";

import type { RfqState, RfqTileIntents } from "@rtc/client-core";
import {
  type CurrencyPair,
  Direction,
  type Price,
  PriceMovementType,
} from "@rtc/domain";

import { RfqCountdown } from "./RfqCountdown";

import styles from "./TileRfq.module.css";

export function TileRfq({
  pair,
  rfqState,
  onExecute,
  notional,
}: TileRfqProps): ReactElement | null {
  const { state } = rfqState;

  function handleAccept(direction: Direction): void {
    // Capture the quote BEFORE accepting: accept() resets the machine to init
    // and no longer returns the quote synchronously.
    const quote = state.quote;
    rfqState.accept();
    if (!quote) return;
    // Create a synthetic Price to pass to execution
    const syntheticPrice = {
      symbol: pair.symbol,
      bid: quote.bid,
      ask: quote.ask,
      mid: (quote.bid + quote.ask) / 2,
      valueDate: new Date().toISOString().slice(0, 10),
      creationTimestamp: Date.now(),
      movementType: PriceMovementType.NONE,
      spread: "0",
    } satisfies Price;
    onExecute(direction, syntheticPrice, notional);
  }

  // No init branch: the RFQ-initiation affordance is the compact ⚡ RFQ chip
  // in the tile header's pair row (TileHeader), not an extra bottom row.
  if (state.status === "requested") {
    return (
      <div className={styles.requestedWrapper}>
        <div className={styles.awaitingText}>Awaiting Price...</div>
        <button
          type="button"
          onClick={rfqState.cancel}
          className={styles.cancelButton}
        >
          Cancel RFQ
        </button>
      </div>
    );
  }

  if (state.status === "received" && state.quote) {
    return (
      <div className={styles.receivedWrapper}>
        <div className={styles.quoteRow}>
          <button
            type="button"
            onClick={() => {
              return handleAccept(Direction.Sell);
            }}
            className={styles.sellQuoteButton}
          >
            Sell {formatPrice(state.quote.bid, pair.ratePrecision)}
          </button>
          <button
            type="button"
            onClick={() => {
              return handleAccept(Direction.Buy);
            }}
            className={styles.buyQuoteButton}
          >
            Buy {formatPrice(state.quote.ask, pair.ratePrecision)}
          </button>
        </div>
        <RfqCountdown
          remainingMs={state.remainingMs}
          totalMs={state.quote.timeoutMs}
        />
        <button
          type="button"
          onClick={rfqState.reject}
          className={styles.rejectButton}
        >
          Reject
        </button>
      </div>
    );
  }

  if (state.status === "rejected") {
    return <div className={styles.rejectedText}>Quote expired</div>;
  }

  return null;
}

/** The machine result the tile passes down: current state plus the RFQ intents. */
export type TileRfqState = { state: RfqState } & RfqTileIntents;

interface TileRfqProps {
  pair: CurrencyPair;
  rfqState: TileRfqState;
  onExecute: (direction: Direction, price: Price, notional: number) => void;
  notional: number;
}

function formatPrice(value: number, ratePrecision: number): string {
  return value.toFixed(ratePrecision);
}
