import { useSyncExternalStore } from "react";
import { EMPTY, of, throwError, type Observable } from "rxjs";
import type { BehaviorSubject } from "rxjs";
import type {
  CurrencyPair,
  ExecuteTradeInput,
  ExecuteTradeResult,
  RfqQuoteResult,
  QuoteRequest,
} from "@rtc/domain";
import type { AppHooks } from "../../../../src/ui/hooks/createAppHooks";
import { useMachine } from "../../../../src/ui/hooks/useMachine";
import { createTileExecutionMachine } from "../../../../src/app/presenters/TileExecutionMachine";
import { createRfqTileMachine } from "../../../../src/app/presenters/RfqTileMachine";
import type { World } from "../shared/harness/world";

/** Subscribe a React component to a BehaviorSubject; re-render on each emission. */
function useSubject<T>(subject: BehaviorSubject<T>): T {
  return useSyncExternalStore(
    (onChange) => {
      const sub = subject.subscribe(onChange);
      return () => sub.unsubscribe();
    },
    () => subject.getValue(),
  );
}

/** Build a reactive AppHooks backed by the neutral World. */
export function reactHooks(world: World): AppHooks {
  const s = world.sources;
  return {
    // Parametric query hooks: each call subscribes to the World's per-key
    // subject, so a tile reading usePrice("EURUSD") re-renders only when that
    // symbol is pushed — faithfully mirroring @react-rxjs `bind`'s per-argument
    // streams (presenters.priceStream.price$(pair), priceHistory.history$(sym)).
    usePrice: (pair: CurrencyPair) => useSubject(world.priceFor(pair.symbol)),
    usePriceHistory: (symbol: string) => useSubject(world.historyFor(symbol)),
    useQuotesForRfq: (rfqId: number) => useSubject(world.quotesForRfq(rfqId)),
    // Nullary query hooks: reactive, re-render on push.
    useTrades: () => useSubject(s.useTrades),
    useAnalytics: () => useSubject(s.useAnalytics),
    useRfqs: () => useSubject(s.useRfqs),
    useAllQuotes: () => useSubject(s.useAllQuotes),
    useCurrencyPairs: () => useSubject(s.useCurrencyPairs),
    useInstruments: () => useSubject(s.useInstruments),
    useDealers: () => useSubject(s.useDealers),
    useConnectionStatus: () => useSubject(s.useConnectionStatus),
    // Commands: record input, emit canned result (or error to drive catch paths).
    useExecuteTrade: () => (input: ExecuteTradeInput) => {
      world.commands.executeTrade.push(input);
      if (world.results.executeTradeThrows) {
        return throwError(() => new Error("execute failed")) as Observable<ExecuteTradeResult>;
      }
      const result = world.results.executeTrade;
      return result ? of(result) : (EMPTY as Observable<ExecuteTradeResult>);
    },
    useCreateRfq: () => (input) => {
      world.commands.createRfq.push(input);
      return of(world.results.createRfq ?? 0);
    },
    // Void commands: record input and emit a single value so the consuming
    // component's `firstValueFrom(...)` resolves (an empty Observable would
    // reject with EmptyError and skip the post-await state transition).
    useAcceptQuote: () => (quoteId: number) => {
      world.commands.acceptQuote.push(quoteId);
      return of(undefined) as Observable<void>;
    },
    useCancelRfq: () => (rfqId: number) => {
      world.commands.cancelRfq.push(rfqId);
      return of(undefined) as Observable<void>;
    },
    usePassQuote: () => (quoteId: number) => {
      world.commands.passQuote.push(quoteId);
      return of(undefined) as Observable<void>;
    },
    useQuoteRfq: () => (request: QuoteRequest) => {
      world.commands.quoteRfq.push(request);
      return of(undefined) as Observable<void>;
    },
    useRequestRfqQuote: () => (symbol: string, pipsPosition: number) => {
      world.commands.requestRfqQuote.push({ symbol, pipsPosition });
      if (world.results.requestRfqQuoteThrows) {
        return throwError(() => new Error("rfq failed")) as Observable<RfqQuoteResult>;
      }
      const result = world.results.requestRfqQuote;
      return result ? of(result) : (EMPTY as Observable<RfqQuoteResult>);
    },
    // Machine: the REAL createTileExecutionMachine, driven by a World-backed
    // execute command that records inputs and emits the canned result (or errors
    // to drive the timeout-confirmation path), faithfully exercising the
    // relocated lifecycle through the same useMachine bridge the app uses.
    useTileExecution: (pair: CurrencyPair) =>
      useMachine(() =>
        createTileExecutionMachine(pair, {
          execute: (input: ExecuteTradeInput) => {
            world.commands.executeTrade.push(input);
            if (world.results.executeTradeThrows) {
              return throwError(() => new Error("execute failed")) as Observable<ExecuteTradeResult>;
            }
            const result = world.results.executeTrade;
            return result ? of(result) : (EMPTY as Observable<ExecuteTradeResult>);
          },
        }),
      ),
    // Machine: the REAL createRfqTileMachine, driven by a World-backed
    // request-quote command that records inputs and emits the canned result (or
    // errors to drive the rejected path), exercising the relocated RFQ lifecycle
    // through the same useMachine bridge the app uses.
    useRfqTile: (pair: CurrencyPair) =>
      useMachine(() =>
        createRfqTileMachine(pair, {
          requestQuote: (symbol: string, pipsPosition: number) => {
            world.commands.requestRfqQuote.push({ symbol, pipsPosition });
            if (world.results.requestRfqQuoteThrows) {
              return throwError(() => new Error("rfq failed")) as Observable<RfqQuoteResult>;
            }
            const result = world.results.requestRfqQuote;
            return result ? of(result) : (EMPTY as Observable<RfqQuoteResult>);
          },
        }),
      ),
  };
}
