import type { Accessor, JSX } from "solid-js";
import { Match, Switch } from "solid-js";

import type { RfqState, RfqTileIntents } from "@rtc/client-core";
import {
  type CurrencyPair,
  Direction,
  type Price,
  PriceMovementType,
} from "@rtc/domain";

import { RfqCountdown } from "./RfqCountdown";

import styles from "./TileRfq.module.css";

export function TileRfq(props: TileRfqProps): JSX.Element {
  function handleAccept(direction: Direction): void {
    // Capture the quote BEFORE accepting: accept() resets the machine to init
    // and no longer returns the quote synchronously.
    const quote = props.rfqState.state().quote;
    props.rfqState.accept();

    if (!quote) {
      return;
    }

    // Create a synthetic Price to pass to execution
    const syntheticPrice = {
      symbol: props.pair.symbol,
      bid: quote.bid,
      ask: quote.ask,
      mid: (quote.bid + quote.ask) / 2,
      valueDate: new Date().toISOString().slice(0, 10),
      creationTimestamp: Date.now(),
      movementType: PriceMovementType.NONE,
      spread: "0",
    } satisfies Price;
    props.onExecute(direction, syntheticPrice, props.notional);
  }

  // No init branch: the RFQ-initiation affordance is the compact ⚡ RFQ chip
  // in the tile header's pair row (TileHeader), not an extra bottom row.
  return (
    <Switch>
      <Match when={props.rfqState.state().status === "requested"}>
        <div class={styles.requestedWrapper}>
          <div class={styles.awaitingText}>Awaiting Price...</div>
          <button
            type="button"
            onClick={props.rfqState.cancel}
            class={styles.cancelButton}
          >
            Cancel RFQ
          </button>
        </div>
      </Match>
      <Match
        when={
          props.rfqState.state().status === "received" &&
          props.rfqState.state().quote
        }
      >
        <div class={styles.receivedWrapper}>
          <div class={styles.quoteRow}>
            <button
              type="button"
              onClick={() => {
                return handleAccept(Direction.Sell);
              }}
              class={styles.sellQuoteButton}
            >
              Sell{" "}
              {formatPrice(
                props.rfqState.state().quote?.bid ?? 0,
                props.pair.ratePrecision,
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                return handleAccept(Direction.Buy);
              }}
              class={styles.buyQuoteButton}
            >
              Buy{" "}
              {formatPrice(
                props.rfqState.state().quote?.ask ?? 0,
                props.pair.ratePrecision,
              )}
            </button>
          </div>
          <RfqCountdown
            remainingMs={props.rfqState.state().remainingMs}
            totalMs={props.rfqState.state().quote?.timeoutMs ?? 0}
          />
          <button
            type="button"
            onClick={props.rfqState.reject}
            class={styles.rejectButton}
          >
            Reject
          </button>
        </div>
      </Match>
      <Match when={props.rfqState.state().status === "rejected"}>
        <div class={styles.rejectedText}>Quote expired</div>
      </Match>
    </Switch>
  );
}

/** The machine result the tile passes down: current state (accessor,
 * re-emitted fresh per tick) plus the RFQ intents. */
export type TileRfqState = { state: Accessor<RfqState> } & RfqTileIntents;

interface TileRfqProps {
  pair: CurrencyPair;
  rfqState: TileRfqState;
  onExecute: (direction: Direction, price: Price, notional: number) => void;
  notional: number;
}

function formatPrice(value: number, ratePrecision: number): string {
  return value.toFixed(ratePrecision);
}
