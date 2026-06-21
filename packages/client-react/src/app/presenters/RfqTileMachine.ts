import {
  type CurrencyPair,
  REJECTED_DISPLAY_MS,
  RFQ_TIMEOUT_MS,
  type RfqQuoteResult,
} from "@rtc/domain";
import { type DefaultedStateObservable, state } from "@rx-state/core";
import { concat, merge, type Observable, of, Subject, timer } from "rxjs";
import {
  catchError,
  map,
  switchMap,
  take,
  takeUntil,
  takeWhile,
} from "rxjs/operators";
import type { Machine } from "./machine";

/** The RFQ quote lifecycle of a single tile, relocated out of the old
 * useRfqState + useRfqQuote React hooks. TileRfq reads this state. */
export type RfqStatus = "init" | "requested" | "received" | "rejected";

export interface RfqQuote {
  bid: number;
  ask: number;
  timeoutMs: number;
}

export interface RfqState {
  status: RfqStatus;
  quote: RfqQuote | null;
  remainingMs: number;
}

export interface RfqTileDeps {
  /** The request-quote command (RfqQuotePresenter.requestQuote), injected so
   * timing is controllable in tests. */
  requestQuote: (
    symbol: string,
    pipsPosition: number,
  ) => Observable<RfqQuoteResult>;
}

export interface RfqTileIntents {
  requestQuote: () => void;
  cancel: () => void;
  reject: () => void;
  accept: () => void;
}

/** How often the received-quote countdown ticks. Presenter-local — a UI cadence
 * concern, not a domain constant. */
const COUNTDOWN_INTERVAL_MS = 100;

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };
const REQUESTED: RfqState = {
  status: "requested",
  quote: null,
  remainingMs: 0,
};
const REJECTED: RfqState = { status: "rejected", quote: null, remainingMs: 0 };

export function createRfqTileMachine(
  pair: CurrencyPair,
  deps: RfqTileDeps,
): Machine<RfqState, RfqTileIntents> {
  const requestQuote$ = new Subject<void>();
  const cancel$ = new Subject<void>();
  const reject$ = new Subject<void>();
  const accept$ = new Subject<void>();

  // rejected → hold REJECTED_DISPLAY_MS → init.
  const rejectedRun = (): Observable<RfqState> =>
    concat(of(REJECTED), timer(REJECTED_DISPLAY_MS).pipe(map(() => INIT)));

  // received → countdown ticking every COUNTDOWN_INTERVAL_MS; when it reaches
  // zero, fall through to rejectedRun. Deterministic under TestScheduler because
  // remaining is derived from the timer index, not Date.now().
  const receivedFlow = (quote: RfqQuote): Observable<RfqState> => {
    const ticks$ = timer(0, COUNTDOWN_INTERVAL_MS).pipe(
      map(
        (i): RfqState => ({
          status: "received",
          quote,
          remainingMs: RFQ_TIMEOUT_MS - i * COUNTDOWN_INTERVAL_MS,
        }),
      ),
      // Emit each received tick while time remains; stop (exclusive) at <= 0.
      takeWhile((s) => s.remainingMs > 0, false),
    );
    return concat(ticks$, rejectedRun());
  };

  // One RFQ run: requested → (received-countdown | rejected) with the user
  // intents (cancel/accept/reject) able to interrupt. Each intent is guarded at
  // the call site so the corresponding Subject only fires from its valid state;
  // takeUntil tears the active flow down the moment any of them fires.
  const runs$ = requestQuote$.pipe(
    switchMap(() => {
      const quoteFlow$ = deps.requestQuote(pair.symbol, pair.pipsPosition).pipe(
        switchMap((r) =>
          receivedFlow({ bid: r.bid, ask: r.ask, timeoutMs: RFQ_TIMEOUT_MS }),
        ),
        catchError(() => rejectedRun()),
      );

      const active$ = concat(of(REQUESTED), quoteFlow$);

      return merge(
        active$.pipe(takeUntil(merge(cancel$, accept$, reject$))),
        // cancel (from requested) and accept (from received) both reset to init.
        merge(cancel$, accept$).pipe(
          take(1),
          map(() => INIT),
        ),
        // reject (from received) shows the rejected hold, then resets to init.
        reject$.pipe(
          take(1),
          switchMap(() => rejectedRun()),
        ),
      );
    }),
  );

  const state$: DefaultedStateObservable<RfqState> = state(runs$, INIT);
  // state(obs, default) yields a DefaultedStateObservable whose getValue() is
  // synchronous and returns RfqState directly — used below to guard intents on
  // the current status.
  const current = (): RfqState => state$.getValue();

  // Keep state$ warm so it carries its default before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      requestQuote: () => {
        if (current().status === "init") requestQuote$.next();
      },
      cancel: () => {
        if (current().status === "requested") cancel$.next();
      },
      reject: () => {
        if (current().status === "received") reject$.next();
      },
      accept: () => {
        if (current().status === "received") accept$.next();
      },
    },
    dispose: () => {
      requestQuote$.complete();
      cancel$.complete();
      reject$.complete();
      accept$.complete();
      warm.unsubscribe();
    },
  };
}
