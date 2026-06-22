import { useCallback } from "react";

import {
  type CurrencyPair,
  Direction,
  type Price,
  PriceMovementType,
} from "@rtc/domain";

import type { RfqState, RfqTileIntents } from "#/app/presenters/RfqTileMachine";

import { RfqCountdown } from "./RfqCountdown";

import styles from "./TileRfq.module.css";

/** The machine result the tile passes down: current state plus the RFQ intents. */
export type TileRfqState = { state: RfqState } & RfqTileIntents;

interface TileRfqProps {
  pair: CurrencyPair;
  rfqState: TileRfqState;
  onRequestQuote: () => void;
  onExecute: (direction: Direction, price: Price, notional: number) => void;
  notional: number;
}

function formatPrice(value: number, ratePrecision: number): string {
  return value.toFixed(ratePrecision);
}

export function TileRfq({
  pair,
  rfqState,
  onRequestQuote,
  onExecute,
  notional,
}: TileRfqProps) {
  const { state } = rfqState;

  const handleAccept = useCallback(
    (direction: Direction) => {
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
    },
    [rfqState, state.quote, pair, onExecute, notional],
  );

  if (state.status === "init") {
    return (
      <button
        type="button"
        onClick={onRequestQuote}
        className={styles.initiateButton}
      >
        Initiate RFQ
      </button>
    );
  }

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
