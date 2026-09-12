import type {
  ConnectionStatus,
  CurrencyPair,
  Price,
  RfqEvent,
} from "@rtc/domain";

import type { EquityFillSignal } from "#/presenters/ordersBlotter";
import type { ExecutionOutcome } from "#/presenters/tradeExecution";
import type { Stream } from "#/stream";

export type AnimationKind =
  | "tickUp"
  | "tickDown"
  | "fill"
  | "reject"
  | "expiry"
  | "newRow"
  | "connectionChange";

export interface AnimationIntent {
  readonly target: string;
  readonly kind: AnimationKind;
}

export interface AnimationDirectorDeps {
  /** Emits the current list of active currency pairs (from CurrencyPairsPresenter). */
  readonly pairs$: Stream<readonly CurrencyPair[]>;

  /** Returns the live price stream for a given pair (from PriceStreamPresenter). */
  readonly priceFor: (pair: CurrencyPair) => Stream<Price>;

  readonly connectionStatus$: Stream<ConnectionStatus>;

  /** Emits an outcome for every subscribed FX trade execution attempt. */
  readonly executions$: Stream<ExecutionOutcome>;

  /** Raw RfqEvent stream for credit workflow animation signals. */
  readonly rfqEvents$: Stream<RfqEvent>;

  /** Emits { symbol } for each equity order fill (from OrdersBlotterPresenter). */
  readonly equityFills$: Stream<EquityFillSignal>;
}

/**
 * Neutral app-layer presenter. Subscribes to domain streams and emits animation
 * INTENTS ({ target, kind }); NO DOM access — the dumb UI maps an intent to a
 * `data-anim` attribute / Motion One call.
 *
 * Produces:
 * - tile:${symbol}      → tickUp / tickDown  (FX price tick, mid up/down)
 * - tile:${symbol}      → fill / reject      (FX trade execution outcome)
 * - rfq:${rfqId}        → expiry             (credit RFQ expired)
 * - rfq:${rfqId}        → fill               (credit quote accepted)
 * - banner:connection   → connectionChange   (connection-status change)
 * - ticket:${symbol}    → fill               (equity order filled)
 */
export interface AnimationDirector {
  intentsFor(target: string): Stream<AnimationIntent>;
}
