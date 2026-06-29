import {
  filter,
  map,
  merge,
  type Observable,
  pairwise,
  shareReplay,
  skip,
  switchMap,
} from "rxjs";

import {
  type ConnectionStatus,
  type CurrencyPair,
  ExecutionStatus,
  type Price,
  type Quote,
  type Rfq,
  type RfqEvent,
  RfqState,
} from "@rtc/domain";

import type { EquityFillSignal } from "./OrdersBlotterPresenter";
import type { ExecutionOutcome } from "./TradeExecutionPresenter";

// Kept local (not exported) in Phase 0: nothing outside this module consumes
// AnimationKind yet, and knip is a hard gate that bans dead exports (Task 8
// precedent: unexport until a consumer arrives). It is re-exported as part of
// the public AnimationIntent contract in Phase 3 when tiles map intents → CSS.
type AnimationKind =
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
  readonly pairs$: Observable<readonly CurrencyPair[]>;

  /** Returns the live price stream for a given pair (from PriceStreamPresenter). */
  readonly priceFor: (pair: CurrencyPair) => Observable<Price>;

  readonly connectionStatus$: Observable<ConnectionStatus>;

  /** Emits an outcome for every subscribed FX trade execution attempt. */
  readonly executions$: Observable<ExecutionOutcome>;

  /** Raw RfqEvent stream for credit workflow animation signals. */
  readonly rfqEvents$: Observable<RfqEvent>;

  /** Emits { symbol } for each equity order fill (from OrdersBlotterPresenter). */
  readonly equityFills$: Observable<EquityFillSignal>;
}

/** Narrows RfqEvent to rfqClosed variants for type-safe filter predicates. */
interface RfqClosedEvent {
  readonly type: "rfqClosed";
  readonly payload: Rfq;
}

/** Narrows RfqEvent to quoteAccepted variants for type-safe filter predicates. */
interface RfqQuoteAcceptedEvent {
  readonly type: "quoteAccepted";
  readonly payload: Quote;
}

function isExpiredRfqClosed(e: RfqEvent): e is RfqClosedEvent {
  return e.type === "rfqClosed" && e.payload.state === RfqState.Expired;
}

function isQuoteAccepted(e: RfqEvent): e is RfqQuoteAcceptedEvent {
  return e.type === "quoteAccepted";
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
export class AnimationDirector {
  private readonly all$: Observable<AnimationIntent>;

  constructor(deps: AnimationDirectorDeps) {
    const ticks$ = deps.pairs$.pipe(
      switchMap((pairs) => {
        return merge(
          ...pairs.map((pair) => {
            return deps.priceFor(pair).pipe(
              map((price) => {
                return price.mid;
              }),
              pairwise(),
              map(([prev, next]): AnimationIntent => {
                return {
                  target: `tile:${pair.symbol}`,
                  kind: next >= prev ? "tickUp" : "tickDown",
                };
              }),
            );
          }),
        );
      }),
    );

    const fxExec$ = deps.executions$.pipe(
      map(({ symbol, status }): AnimationIntent => {
        return {
          target: `tile:${symbol}`,
          kind: status === ExecutionStatus.Done ? "fill" : "reject",
        };
      }),
    );

    const creditExpiry$ = deps.rfqEvents$.pipe(
      filter(isExpiredRfqClosed),
      map((e): AnimationIntent => {
        return { target: `rfq:${e.payload.id}`, kind: "expiry" };
      }),
    );

    const creditFill$ = deps.rfqEvents$.pipe(
      filter(isQuoteAccepted),
      map((e): AnimationIntent => {
        return { target: `rfq:${e.payload.rfqId}`, kind: "fill" };
      }),
    );

    const connection$ = deps.connectionStatus$.pipe(
      skip(1), // ignore the replayed current status; animate only real changes
      map((): AnimationIntent => {
        return { target: "banner:connection", kind: "connectionChange" };
      }),
    );

    const equityFill$ = deps.equityFills$.pipe(
      map(({ symbol }): AnimationIntent => {
        return { target: `ticket:${symbol}`, kind: "fill" };
      }),
    );

    this.all$ = merge(
      ticks$,
      fxExec$,
      creditExpiry$,
      creditFill$,
      connection$,
      equityFill$,
    ).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  intentsFor(target: string): Observable<AnimationIntent> {
    return this.all$.pipe(
      filter((intent) => {
        return intent.target === target;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
