import { useSyncExternalStore } from "react";
import { EMPTY, of, type Observable } from "rxjs";
import type { BehaviorSubject } from "rxjs";
import type {
  ExecuteTradeInput,
  ExecuteTradeResult,
  RfqQuoteResult,
  QuoteRequest,
} from "@rtc/domain";
import type { AppHooks } from "../../../../src/ui/hooks/createAppHooks";
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
    // Parametric query hooks are not exercised by the current slice.
    usePrice: () => null,
    usePriceHistory: () => [],
    useQuotesForRfq: () => [],
    // Nullary query hooks: reactive, re-render on push.
    useTrades: () => useSubject(s.useTrades),
    useAnalytics: () => useSubject(s.useAnalytics),
    useRfqs: () => useSubject(s.useRfqs),
    useAllQuotes: () => useSubject(s.useAllQuotes),
    useCurrencyPairs: () => useSubject(s.useCurrencyPairs),
    useInstruments: () => useSubject(s.useInstruments),
    useDealers: () => useSubject(s.useDealers),
    useConnectionStatus: () => useSubject(s.useConnectionStatus),
    // Commands: record input, emit canned result.
    useExecuteTrade: () => (_input: ExecuteTradeInput) => EMPTY as Observable<ExecuteTradeResult>,
    useCreateRfq: () => (input) => {
      world.commands.createRfq.push(input);
      return of(world.results.createRfq ?? 0);
    },
    useAcceptQuote: () => (_quoteId: number) => EMPTY as Observable<void>,
    useCancelRfq: () => (_rfqId: number) => EMPTY as Observable<void>,
    usePassQuote: () => (_quoteId: number) => EMPTY as Observable<void>,
    useQuoteRfq: () => (_request: QuoteRequest) => EMPTY as Observable<void>,
    useRequestRfqQuote: () => (_symbol: string, _pipsPosition: number) => EMPTY as Observable<RfqQuoteResult>,
  };
}
