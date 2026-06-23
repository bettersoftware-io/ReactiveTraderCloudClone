import { useCallback, useState, useSyncExternalStore } from "react";
import type { BehaviorSubject } from "rxjs";
import { EMPTY, type Observable, of, throwError } from "rxjs";

import type {
  CreateRfqInput,
  CurrencyPair,
  ExecuteTradeInput,
  ExecuteTradeResult,
  RfqQuoteResult,
  Theme,
  ViewMode,
} from "@rtc/domain";

import { createNotionalMachine } from "#/app/presenters/NotionalMachine";
import type {
  RfqSubmissionState,
  TicketSubmissionState,
} from "#/app/presenters/RfqsPresenter";
import { createRfqTileMachine } from "#/app/presenters/RfqTileMachine";
import { createRowHighlightMachine } from "#/app/presenters/RowHighlightMachine";
import { createStaleFlagMachine } from "#/app/presenters/StaleFlagMachine";
import { createTileExecutionMachine } from "#/app/presenters/TileExecutionMachine";
import type { AppHooks } from "#/ui/hooks/createAppHooks";
import { useMachine } from "#/ui/hooks/useMachine";

import type { World } from "../shared/harness/world";

/** Mirror of RfqsPresenter's presenter-local redirect delay. The contract spec
 * drives this with fake timers (advanceTimersByTimeAsync(1500)), so the fake
 * schedules onRedirect via a REAL setTimeout — preserving the exact timing the
 * spec asserts, instead of redirecting instantly. */
const REDIRECT_DELAY_MS = 1500;

/** Subscribe a React component to a BehaviorSubject; re-render on each emission. */
function useSubject<T>(subject: BehaviorSubject<T>): T {
  return useSyncExternalStore(
    (onChange) => {
      const sub = subject.subscribe(onChange);

      return () => {
        return sub.unsubscribe();
      };
    },
    () => {
      return subject.getValue();
    },
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
    usePrice: (pair: CurrencyPair) => {
      return useSubject(world.priceFor(pair.symbol));
    },
    usePriceHistory: (symbol: string) => {
      return useSubject(world.historyFor(symbol));
    },
    useQuotesForRfq: (rfqId: number) => {
      return useSubject(world.quotesForRfq(rfqId));
    },
    // Nullary query hooks: reactive, re-render on push.
    useTrades: () => {
      return useSubject(s.useTrades);
    },
    // New-trade flagging lives in the presenter (not pinned by contract specs);
    // the fake reports no rows as new.
    useNewTradeIds: () => {
      return new Set<number>();
    },
    useAnalytics: () => {
      return useSubject(s.useAnalytics);
    },
    useRfqs: () => {
      return useSubject(s.useRfqs);
    },
    useAllQuotes: () => {
      return useSubject(s.useAllQuotes);
    },
    useCurrencyPairs: () => {
      return useSubject(s.useCurrencyPairs);
    },
    useInstruments: () => {
      return useSubject(s.useInstruments);
    },
    useDealers: () => {
      return useSubject(s.useDealers);
    },
    useConnectionStatus: () => {
      return useSubject(s.useConnectionStatus);
    },
    // Command: record input and resolve undefined so the consuming component's
    // `await` proceeds to its post-await state transition.
    useAcceptQuote: () => {
      return async (quoteId: number) => {
        world.commands.acceptQuote.push(quoteId);
      };
    },
    // Machine: the REAL createTileExecutionMachine, driven by a World-backed
    // execute command that records inputs and emits the canned result (or errors
    // to drive the timeout-confirmation path), faithfully exercising the
    // relocated lifecycle through the same useMachine bridge the app uses.
    useTileExecution: (pair: CurrencyPair) => {
      return useMachine(() => {
        return createTileExecutionMachine(pair, {
          execute: (input: ExecuteTradeInput) => {
            world.commands.executeTrade.push(input);

            if (world.results.executeTradeThrows) {
              return throwError(() => {
                return new Error("execute failed");
              }) as Observable<ExecuteTradeResult>;
            }

            const result = world.results.executeTrade;
            return result
              ? of(result)
              : (EMPTY as Observable<ExecuteTradeResult>);
          },
        });
      });
    },
    // Machine: the REAL createRfqTileMachine, driven by a World-backed
    // request-quote command that records inputs and emits the canned result (or
    // errors to drive the rejected path), exercising the relocated RFQ lifecycle
    // through the same useMachine bridge the app uses.
    useRfqTile: (pair: CurrencyPair) => {
      return useMachine(() => {
        return createRfqTileMachine(pair, {
          requestQuote: (symbol: string, pipsPosition: number) => {
            world.commands.requestRfqQuote.push({ symbol, pipsPosition });

            if (world.results.requestRfqQuoteThrows) {
              return throwError(() => {
                return new Error("rfq failed");
              }) as Observable<RfqQuoteResult>;
            }

            const result = world.results.requestRfqQuote;
            return result ? of(result) : (EMPTY as Observable<RfqQuoteResult>);
          },
        });
      });
    },
    // Intent-free derived flags: the REAL createStaleFlagMachine, sourced from
    // the World's connection-status subject and the per-key price / analytics
    // subjects — so disconnect/reconnect/new-value pushed onto the World drives
    // the relocated stale logic through the same useMachine bridge the app uses.
    useStaleFlag: (pair: CurrencyPair) => {
      return useMachine(() => {
        return createStaleFlagMachine({
          status$: s.useConnectionStatus,
          value$: world.priceFor(pair.symbol),
        });
      }).state;
    },
    useAnalyticsStaleFlag: () => {
      return useMachine(() => {
        return createStaleFlagMachine({
          status$: s.useConnectionStatus,
          value$: s.useAnalytics,
        });
      }).state;
    },
    // Intent-free derived flag: the REAL createRowHighlightMachine. The contract
    // spec drives the 3s fade with fake timers, so the real RxJS timer(HIGHLIGHT_MS)
    // is driven by the spec's advanceTimersByTime through the same useMachine bridge
    // the app uses — preserving the exact fade timing.
    useRowHighlight: (isNew: boolean) => {
      return useMachine(() => {
        return createRowHighlightMachine(isNew);
      }).state;
    },
    // Machine: the REAL createNotionalMachine, exercising the relocated notional
    // logic through the same useMachine bridge the app uses.
    useNotional: (defaultNotional: number) => {
      return useMachine(() => {
        return createNotionalMachine(defaultNotional);
      });
    },
    // Submission machine fake: stateful per-mount store that records the RFQ to
    // world.commands.createRfq, flips editing→submitting→confirmed, and schedules
    // onRedirect via a REAL setTimeout(REDIRECT_DELAY_MS) so the spec's fake-timer
    // advance drives the redirect with the same timing as the real RxJS timer.
    useRfqSubmission: () => {
      const [submissionState, setSubmissionState] =
        useState<RfqSubmissionState>({
          status: "editing",
        });
      const submit = useCallback(
        (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => {
          world.commands.createRfq.push(input);
          setSubmissionState({ status: "submitting" });
          // Mirror the real machine, where submitting is emitted synchronously
          // and confirmed only arrives after the async create-RFQ RPC resolves.
          // With no seeded result the submission stays in flight, so a spec can
          // observe the transient "Submitting…" render; when a result IS seeded
          // the fake confirms in the same tick (editing→confirmed) as before.
          const rfqId = world.results.createRfq;
          if (rfqId === undefined) return;
          setSubmissionState({ status: "confirmed", rfqId });
          setTimeout(() => {
            return onRedirect(rfqId);
          }, REDIRECT_DELAY_MS);
        },
        [],
      );
      return { state: submissionState, submit };
    },
    // Ticket submission machine fake: stateful per-mount store that records the
    // quote/pass command to world.commands.* and flips submitted:true, mirroring
    // the relocated submit-price / pass flow.
    useTicketSubmission: () => {
      const [ticketState, setTicketState] = useState<TicketSubmissionState>({
        submitted: false,
      });
      const submitPrice = useCallback((quoteId: number, price: number) => {
        world.commands.quoteRfq.push({ quoteId, price });
        setTicketState({ submitted: true });
      }, []);
      const pass = useCallback((quoteId: number) => {
        world.commands.passQuote.push(quoteId);
        setTicketState({ submitted: true });
      }, []);
      return { state: ticketState, submitPrice, pass };
    },
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
    // Global theme: reactive view backed by the World subject; setTheme/toggle
    // push back so a click through the seam flips the rendered theme (mirroring
    // the PreferencesPort's replay-current theme$ stream).
    useThemePreference: () => {
      const theme = useSubject(world.theme);
      return {
        theme,
        setTheme: (next: Theme) => {
          return world.theme.next(next);
        },
        toggle: () => {
          return world.theme.next(theme === "dark" ? "light" : "dark");
        },
      };
    },
    // Global view-mode: reactive view backed by the World subject; setViewMode
    // pushes back so a toggle through the seam flips the rendered mode.
    useViewModePreference: () => {
      const viewMode = useSubject(world.viewMode);
      return {
        viewMode,
        setViewMode: (next: ViewMode) => {
          return world.viewMode.next(next);
        },
      };
    },
  };
}
