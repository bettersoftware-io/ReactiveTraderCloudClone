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
import { createStaleFlagMachine } from "../../../../src/app/presenters/StaleFlagMachine";
import { createNotionalMachine } from "../../../../src/app/presenters/NotionalMachine";
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
    // Commands: record input, resolve the canned result (or reject to drive the
    // consuming component's catch path). Async so the component's `await` runs.
    useExecuteTrade: () => async (input: ExecuteTradeInput) => {
      world.commands.executeTrade.push(input);
      if (world.results.executeTradeThrows) {
        throw new Error("execute failed");
      }
      return (world.results.executeTrade ?? ({} as ExecuteTradeResult));
    },
    useCreateRfq: () => async (input) => {
      world.commands.createRfq.push(input);
      return world.results.createRfq ?? 0;
    },
    // Void commands: record input and resolve undefined so the consuming
    // component's `await` proceeds to its post-await state transition.
    useAcceptQuote: () => async (quoteId: number) => {
      world.commands.acceptQuote.push(quoteId);
    },
    useCancelRfq: () => async (rfqId: number) => {
      world.commands.cancelRfq.push(rfqId);
    },
    usePassQuote: () => async (quoteId: number) => {
      world.commands.passQuote.push(quoteId);
    },
    useQuoteRfq: () => async (request: QuoteRequest) => {
      world.commands.quoteRfq.push(request);
    },
    useRequestRfqQuote: () => async (symbol: string, pipsPosition: number) => {
      world.commands.requestRfqQuote.push({ symbol, pipsPosition });
      if (world.results.requestRfqQuoteThrows) {
        throw new Error("rfq failed");
      }
      return (world.results.requestRfqQuote ?? ({} as RfqQuoteResult));
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
    // Intent-free derived flags: the REAL createStaleFlagMachine, sourced from
    // the World's connection-status subject and the per-key price / analytics
    // subjects — so disconnect/reconnect/new-value pushed onto the World drives
    // the relocated stale logic through the same useMachine bridge the app uses.
    useStaleFlag: (pair: CurrencyPair) =>
      useMachine(() =>
        createStaleFlagMachine({
          status$: s.useConnectionStatus,
          value$: world.priceFor(pair.symbol),
        }),
      ).state,
    useAnalyticsStaleFlag: () =>
      useMachine(() =>
        createStaleFlagMachine({
          status$: s.useConnectionStatus,
          value$: s.useAnalytics,
        }),
      ).state,
    // Machine: the REAL createNotionalMachine, exercising the relocated notional
    // logic through the same useMachine bridge the app uses.
    useNotional: (defaultNotional: number) =>
      useMachine(() => createNotionalMachine(defaultNotional)),
    // Global throughput: reactive view backed by the World subject; setValue
    // records the value and optimistically echoes it into the view (mirroring
    // the presenter's immediate echo), so the panel reflects the edit at once.
    useThroughput: () => {
      const view = useSubject(world.throughput);
      return {
        ...view,
        setValue: (value: number) => {
          world.throughputSets.push(value);
          world.setThroughputView({ value });
        },
      };
    },
  };
}
