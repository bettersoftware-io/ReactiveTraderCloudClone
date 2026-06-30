import { useCallback, useState, useSyncExternalStore } from "react";
import type { BehaviorSubject } from "rxjs";
import { EMPTY, type Observable, of, throwError } from "rxjs";

import type {
  CreateRfqInput,
  CurrencyPair,
  ExecuteTradeInput,
  ExecuteTradeResult,
  RfqQuoteResult,
  ThemeSkin,
  ViewMode,
} from "@rtc/domain";
import { nextThemeModePreference, resolveThemeMode } from "@rtc/domain";

import {
  createDefaultLayoutPort,
  type WorkspaceTab,
} from "@rtc/client-core";
import { createBootSequenceMachine } from "@rtc/client-core";
import { createLayoutMachine } from "@rtc/client-core";
import { createNotionalMachine } from "@rtc/client-core";
import { createOrderTicketMachine } from "@rtc/client-core";
import { createRfqCountdownMachine } from "@rtc/client-core";
import type {
  RfqSubmissionState,
  TicketSubmissionState,
} from "@rtc/client-core";
import { createRfqTileMachine } from "@rtc/client-core";
import { createRowHighlightMachine } from "@rtc/client-core";
import { createStaleFlagMachine } from "@rtc/client-core";
import { createTileExecutionMachine } from "@rtc/client-core";
import type { ViewModel } from "#/ui/viewModel/createViewModel";
import { useMachine } from "#/ui/viewModel/useMachine";

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

/** Build a reactive ViewModel backed by the neutral World. */
export function reactViewModel(world: World): ViewModel {
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
    // Command: record the reconnect invocation so contract specs can assert
    // "clicking Reconnect fires the command exactly once".
    useReconnect: () => {
      return () => {
        world.commands.reconnect += 1;
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
    // Global theme mode: reactive view backed by the World subject. The subject
    // holds the stored PREFERENCE (dark | light | system); `mode` is resolved for
    // painting and `cycle` advances the preference through the seam (mirroring the
    // PreferencesPort's replay-current themeMode$ stream). The harness has no OS
    // media query, so "system" resolves deterministically to dark.
    useThemePreference: () => {
      const modePreference = useSubject(world.themeMode);
      return {
        mode: resolveThemeMode(modePreference, true),
        modePreference,
        cycle: () => {
          // Read the current value (not the captured one) so rapid clicks each
          // advance from the true state, mirroring the real presenter's cycle().
          return world.themeMode.next(
            nextThemeModePreference(world.themeMode.getValue()),
          );
        },
      };
    },
    // Global theme skin: reactive view backed by the World subject; setSkin pushes
    // back so a change through the seam repaints the skin (mirroring the
    // PreferencesPort's replay-current themeSkin$ stream).
    useThemeSkinPreference: () => {
      const skin = useSubject(world.themeSkin);
      return {
        skin,
        setSkin: (next: ThemeSkin) => {
          return world.themeSkin.next(next);
        },
      };
    },
    // Animated background: reactive boolean backed by the World subject; setEnabled
    // /toggle push back so a click through the seam flips the rendered flag, and
    // each written value is recorded so a spec can assert the seam was written
    // (e.g. PreferencesModal's animated-bg toggle → animatedBackgroundSets [true]).
    useAnimatedBackground: () => {
      const enabled = useSubject(world.animatedBackground);
      return {
        enabled,
        setEnabled: (on: boolean) => {
          world.commands.animatedBackgroundSets.push(on);
          world.animatedBackground.next(on);
        },
        toggle: () => {
          const next = !enabled;
          world.commands.animatedBackgroundSets.push(next);
          world.animatedBackground.next(next);
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
    // Session lock: reactive state backed by the World subject; lock/unlock push
    // back so the seam transition re-renders the overlay. unlock (re-authenticate)
    // also records the invocation so specs can assert "AUTHENTICATE fires once".
    useSession: () => {
      const state = useSubject(world.session);
      return {
        state,
        lock: () => {
          world.commands.sessionLock += 1;
          world.session.next({
            ...world.session.getValue(),
            locked: true,
          });
        },
        unlock: () => {
          world.commands.sessionUnlock += 1;
          world.session.next({ ...world.session.getValue(), locked: false });
        },
      };
    },
    // Per-RFQ countdown: the REAL createRfqCountdownMachine, exercising the
    // relocated countdown logic through the same useMachine bridge the app uses.
    // Contract specs drive the countdown with fake timers.
    useRfqCountdown: (creationTimestamp: number, totalMs: number) => {
      return useMachine(() => {
        return createRfqCountdownMachine(creationTimestamp, totalMs);
      }).state;
    },
    // Animation intents: backed by the World's per-target intent subject so the
    // AnimationIntents.contract.spec can push synthetic intents and assert the
    // data-anim mapping without wiring a real AnimationDirector.
    useAnimationIntents: (target: string) => {
      return useSubject(world.intentFor(target));
    },
    useLayout: (tab: WorkspaceTab) => {
      return useMachine(() => {
        return createLayoutMachine(createDefaultLayoutPort(tab));
      });
    },
    // Boot sequence: no contract spec exercises the boot sequence in Phase 2;
    // use the REAL machine with a fixed "core" variant and noop advance so it
    // compiles and disposes cleanly without touching real preferences.
    useBootSequence: (onDone: () => void) => {
      return useMachine(() => {
        return createBootSequenceMachine({
          variant: "core",
          advance: () => {},
          onDone,
        });
      });
    },
    // Equities: reactive views backed by the World's shared streams (watchlist /
    // orders / positions) and per-symbol subjects (quote / candles / depth) — so a
    // spec seeding `equities: { watchlist, quotes, orders, … }` re-renders the
    // subscribing panel, mirroring the real createViewModel binds.
    useWatchlist: () => {
      return useSubject(world.watchlist);
    },
    useEquityQuote: (symbol: string) => {
      return useSubject(world.equityQuoteFor(symbol));
    },
    useCandles: (symbol: string) => {
      return useSubject(world.candlesFor(symbol));
    },
    useDepth: (symbol: string) => {
      return useSubject(world.depthFor(symbol));
    },
    useEquityOrders: () => {
      return useSubject(world.equityOrders);
    },
    useEquityPositions: () => {
      return useSubject(world.equityPositions);
    },
    // Machine: the REAL createOrderTicketMachine, driven by a World-backed place()
    // that returns the lifecycle Subject. A spec drives setQty/submit through the
    // ticket's intents (editing→submitting), then pushOrderLifecycle emits
    // working/partiallyFilled/filled orders — exercising the relocated place
    // lifecycle through the same useMachine bridge the app uses.
    useOrderTicket: (defaultSymbol: string) => {
      return useMachine(() => {
        return createOrderTicketMachine({
          place: () => {
            return world.orderLifecycle.asObservable();
          },
          defaultSymbol,
        });
      });
    },
    // Admin / telemetry (Phase 5): World-backed fakes that re-render subscribing
    // components when the test pushes new data. The incident fake mirrors the real
    // IncidentMachine's connection-status asymmetry via world.injectIncident.
    useMetrics: () => {
      return useSubject(world.metrics$);
    },
    useTopology: () => {
      return useSubject(world.topology$);
    },
    useEventLog: () => {
      return useSubject(world.eventLog$);
    },
    useSessions: () => {
      return useSubject(world.sessions$);
    },
    useIncident: () => {
      const state = useSubject(world.incidentState$);
      return {
        state,
        inject: (kind: Parameters<typeof world.injectIncident>[0]) => {
          world.injectIncident(kind);
        },
        clear: () => {
          world.clearIncident();
        },
      };
    },
  };
}
