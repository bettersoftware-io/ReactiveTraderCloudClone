import { state } from "@rx-state/core";
import type { World } from "@ui-contract/harness/world";
import type { BehaviorSubject } from "rxjs";
import { EMPTY, type Observable, of, throwError } from "rxjs";
import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";

import type {
  RfqSubmissionState,
  TicketSubmissionState,
  WorkspaceTab,
} from "@rtc/client-core";
import {
  createBootSequenceMachine,
  createDefaultLayoutPort,
  createLayoutMachine,
  createNotionalMachine,
  createOrderTicketMachine,
  createRfqCountdownMachine,
  createRfqTileMachine,
  createRowHighlightMachine,
  createStaleFlagMachine,
  createTileExecutionMachine,
} from "@rtc/client-core";
import type {
  AmbientStyle,
  CandleTimeframe,
  CreateRfqInput,
  CreditRfqFilter,
  CurrencyPair,
  EqBlotterView,
  EqWatchlistSort,
  ExecuteTradeInput,
  ExecuteTradeResult,
  PlaceOrderRequest,
  RfqQuoteResult,
  ThemeSkin,
  ViewMode,
} from "@rtc/domain";
import {
  nextEqWatchlistSort,
  nextThemeModePreference,
  resolveThemeMode,
} from "@rtc/domain";
import type { ViewModel } from "@rtc/solid-bindings";
import { useMachine } from "@rtc/solid-bindings";
import { toSignal } from "@rtc/solid-bindings/toSignal";

/** Mirror of RfqsPresenter's presenter-local redirect delay. The contract spec
 * drives this with fake timers (advanceTimersByTimeAsync(1500)), so the fake
 * schedules onRedirect via a REAL setTimeout — preserving the exact timing the
 * spec asserts, instead of redirecting instantly. Same constant as the react
 * driver's viewModelFromWorld.ts. */
const REDIRECT_DELAY_MS = 1500;

/** Return shape of the `useRfqSubmission` fake below — named so the function
 * signature stays free of an inline object return type. */
interface UseRfqSubmissionFake {
  state: Accessor<RfqSubmissionState>;
  submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => void;
}

/** Return shape of the `useTicketSubmission` fake below — named for the same
 * reason as UseRfqSubmissionFake. */
interface UseTicketSubmissionFake {
  state: Accessor<TicketSubmissionState>;
  submitPrice: (quoteId: number, price: number) => void;
  pass: (quoteId: number) => void;
}

/** Wrap a warm (BehaviorSubject-backed) World stream as a Solid accessor.
 * `state()` (from `@rx-state/core`) turns any Observable into the
 * `StateObservable` `@rtc/solid-bindings/toSignal` requires — the same
 * "hot-observable → accessor" idiom `@rtc/solid-bindings`'s own
 * `createViewModel.ts` uses everywhere (e.g. `toSignal(state(presenters.
 * priceStream.price$(pair), null))`), applied here to World subjects instead
 * of real presenters. A World subject is always warm (BehaviorSubject emits
 * its current value synchronously on subscribe), so the passed default is
 * only ever a type-level fallback, never actually served. */
function wrapSubject<T>(subject: BehaviorSubject<T>): Accessor<T> {
  return toSignal(state(subject, subject.getValue()));
}

/** Build a reactive ViewModel backed by the neutral World — the Solid
 * counterpart of the react driver's `reactViewModel`. Member-by-member this
 * mirrors that file (same World, same machine factories, same command
 * bookkeeping); only the accessor mechanics differ: React re-renders the
 * whole hook body on each `useSyncExternalStore` push, Solid instead hands
 * back a stable `Accessor` per member (`wrapSubject`/`toSignal`) that stays
 * reactive across the member's whole lifetime without re-invoking this
 * factory. */
export function solidViewModel(world: World): ViewModel {
  const s = world.sources;

  // Stable per-mount signals backing the two hand-rolled submission fakes
  // below (NewRfqPanel / TradeTicket haven't grown a real app-layer machine
  // yet — mirrors the react driver's useState-backed fakes). `useRfqSubmission`
  // / `useTicketSubmission` are each called once per component instance that
  // reads them (a plain function call, unlike React's per-render hook
  // bookkeeping), so a fresh `createSignal` per call is the correct Solid
  // shape — the same "factory runs once" reasoning `useMachine` documents.
  function useRfqSubmission(): UseRfqSubmissionFake {
    const [submissionState, setSubmissionState] =
      createSignal<RfqSubmissionState>({ status: "editing" });

    function submit(
      input: CreateRfqInput,
      onRedirect: (rfqId: number) => void,
    ): void {
      world.commands.createRfq.push(input);
      setSubmissionState({ status: "submitting" });

      // Mirror the real machine, where submitting is emitted synchronously and
      // confirmed only arrives after the async create-RFQ RPC resolves. With no
      // seeded result the submission stays in flight; when a result IS seeded
      // the fake confirms in the same tick (editing → confirmed) as before.
      const rfqId = world.results.createRfq;

      if (rfqId === undefined) {
        return;
      }

      setSubmissionState({ status: "confirmed", rfqId });
      setTimeout(() => {
        onRedirect(rfqId);
        setSubmissionState({ status: "editing" });
      }, REDIRECT_DELAY_MS);
    }

    return { state: submissionState, submit };
  }

  function useTicketSubmission(): UseTicketSubmissionFake {
    const [ticketState, setTicketState] = createSignal<TicketSubmissionState>({
      submitted: false,
    });

    function submitPrice(quoteId: number, price: number): void {
      world.commands.quoteRfq.push({ quoteId, price });
      setTicketState({ submitted: true });
    }

    function pass(quoteId: number): void {
      world.commands.passQuote.push(quoteId);
      setTicketState({ submitted: true });
    }

    return { state: ticketState, submitPrice, pass };
  }

  return {
    // Parametric query streams: each call wraps the World's per-key subject,
    // so a tile reading usePrice("EURUSD") re-renders only when that symbol
    // is pushed — mirroring the real ViewModel's `state()`-factory binds.
    usePrice: (pair: CurrencyPair) => {
      return wrapSubject(world.priceFor(pair.symbol));
    },
    usePriceHistory: (symbol: string) => {
      return wrapSubject(world.historyFor(symbol));
    },
    useQuotesForRfq: (rfqId: number) => {
      return wrapSubject(world.quotesForRfq(rfqId));
    },
    // Nullary query streams.
    useTrades: () => {
      return wrapSubject(s.useTrades);
    },
    // New-trade flagging lives in the presenter (not pinned by contract
    // specs); the fake reports no rows as new.
    useNewTradeIds: () => {
      const empty: ReadonlySet<number> = new Set();

      return () => {
        return empty;
      };
    },
    // The Activity feed's live/seed split and receipt-time stamping live in
    // the presenter (BlotterPresenter.activity$, not pinned by contract
    // specs) — specs inject the already-derived entries directly, the same
    // way they inject useTrades.
    useActivity: () => {
      return wrapSubject(s.useActivity);
    },
    useAnalytics: () => {
      return wrapSubject(s.useAnalytics);
    },
    useRfqs: () => {
      return wrapSubject(s.useRfqs);
    },
    useAllQuotes: () => {
      return wrapSubject(s.useAllQuotes);
    },
    useCurrencyPairs: () => {
      return wrapSubject(s.useCurrencyPairs);
    },
    useInstruments: () => {
      return wrapSubject(s.useInstruments);
    },
    useDealers: () => {
      return wrapSubject(s.useDealers);
    },
    useConnectionStatus: () => {
      return wrapSubject(s.useConnectionStatus);
    },
    // Commands: record input, resolve once — mirrors the real bridge's
    // `firstValueFrom` shape without needing a presenter Observable.
    useAcceptQuote: () => {
      return async (quoteId: number) => {
        world.commands.acceptQuote.push(quoteId);
      };
    },
    useCancelRfq: () => {
      return async (rfqId: number) => {
        world.commands.cancelRfq.push(rfqId);
      };
    },
    useReconnect: () => {
      return () => {
        world.commands.reconnect += 1;
      };
    },
    // Machines: the REAL createTileExecutionMachine, driven by a World-backed
    // execute() dep that records inputs and emits the canned result (or errors
    // to drive the timeout-confirmation path) — exercising the relocated
    // lifecycle through the same useMachine bridge the app uses.
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
    // request-quote dep, exercising the relocated RFQ lifecycle through the
    // same useMachine bridge the app uses.
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
    // Intent-free derived flags: the REAL createStaleFlagMachine, sourced
    // from the World's connection-status subject and the per-key price /
    // analytics subjects.
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
    // Intent-free derived flag: the REAL createRowHighlightMachine — the
    // contract spec drives the 3s fade with fake timers, exercised through
    // the same useMachine bridge the app uses.
    useRowHighlight: (isNew: boolean) => {
      return useMachine(() => {
        return createRowHighlightMachine(isNew);
      }).state;
    },
    // Machine: the REAL createNotionalMachine.
    useNotional: (defaultNotional: number) => {
      return useMachine(() => {
        return createNotionalMachine(defaultNotional);
      });
    },
    // Submission machine fakes (see the two closures defined above this
    // return block).
    useRfqSubmission,
    useTicketSubmission,
    // Global throughput: reactive view backed by the World subject; setValue
    // records the value and optimistically echoes it into the view
    // (mirroring the presenter's immediate echo).
    useThroughput: () => {
      const view = wrapSubject(world.throughput);
      return {
        value: () => {
          return view().value;
        },
        loading: () => {
          return view().loading;
        },
        message: () => {
          return view().message;
        },
        setValue: (value: number) => {
          world.throughputSets.push(value);
          world.setThroughputView({ value });
        },
      };
    },
    // Global theme mode: reactive view backed by the World subject. The
    // subject holds the stored PREFERENCE (dark | light | system); `mode` is
    // resolved for painting and `cycle` advances the preference through the
    // seam. The harness has no OS media query, so "system" resolves
    // deterministically to dark.
    useThemePreference: () => {
      const modePreference = wrapSubject(world.themeMode);
      return {
        mode: () => {
          return resolveThemeMode(modePreference(), true);
        },
        modePreference,
        cycle: () => {
          // Read the CURRENT value (not a captured one) so rapid clicks each
          // advance from the true state, mirroring the real presenter's cycle().
          world.themeMode.next(
            nextThemeModePreference(world.themeMode.getValue()),
          );
        },
      };
    },
    // Global theme skin: reactive view backed by the World subject; setSkin
    // pushes back so a change through the seam repaints the skin.
    useThemeSkinPreference: () => {
      return {
        skin: wrapSubject(world.themeSkin),
        setSkin: (next: ThemeSkin) => {
          world.themeSkin.next(next);
        },
      };
    },
    // Animated background: reactive boolean backed by the World subject;
    // setEnabled/toggle push back, and each written value is recorded so a
    // spec can assert the seam was written.
    useAnimatedBackground: () => {
      const enabled = wrapSubject(world.animatedBackground);
      return {
        enabled,
        setEnabled: (on: boolean) => {
          world.commands.animatedBackgroundSets.push(on);
          world.animatedBackground.next(on);
        },
        toggle: () => {
          const next = !enabled();
          world.commands.animatedBackgroundSets.push(next);
          world.animatedBackground.next(next);
        },
      };
    },
    // Power saver: reactive boolean backed by the World subject;
    // setEnabled/toggle push back so a click through the seam flips the
    // rendered flag, and each written value is recorded, mirroring
    // useAnimatedBackground.
    usePowerSaver: () => {
      const enabled = wrapSubject(world.powerSaver);
      return {
        enabled,
        setEnabled: (on: boolean) => {
          world.commands.powerSaverSets.push(on);
          world.powerSaver.next(on);
        },
        toggle: () => {
          const next = !enabled();
          world.commands.powerSaverSets.push(next);
          world.powerSaver.next(next);
        },
      };
    },
    // Ambient style: reactive view backed by the World subject (mirrors
    // useThemeSkinPreference above); setStyle pushes back so a click through
    // the seam (PreferencesModal's "Ambient style" segment) flips the
    // rendered AmbientBackground branch. Mirrors the react driver's
    // useAmbientStyle exactly.
    useAmbientStyle: () => {
      return {
        style: wrapSubject(world.ambientStyle),
        setStyle: (next: AmbientStyle) => {
          world.ambientStyle.next(next);
        },
      };
    },
    // Global view-mode: reactive view backed by the World subject; setViewMode
    // pushes back so a toggle through the seam flips the rendered mode.
    useViewModePreference: () => {
      return {
        viewMode: wrapSubject(world.viewMode),
        setViewMode: (next: ViewMode) => {
          world.viewMode.next(next);
        },
      };
    },
    // Credit RFQs filter: reactive view backed by the World subject.
    useCreditRfqFilterPreference: () => {
      return {
        filter: wrapSubject(world.creditRfqFilter),
        setFilter: (next: CreditRfqFilter) => {
          world.setCreditRfqFilter(next);
        },
      };
    },
    // Equities watchlist sort: reactive view backed by the World subject;
    // cycle() reads the CURRENT value (not a captured one) so rapid clicks
    // each advance from the true state.
    useEqWatchlistSort: () => {
      const sort = wrapSubject(world.eqWatchlistSort);
      return {
        sort,
        setSort: (next: EqWatchlistSort) => {
          world.eqWatchlistSort.next(next);
        },
        cycle: () => {
          world.eqWatchlistSort.next(
            nextEqWatchlistSort(world.eqWatchlistSort.getValue()),
          );
        },
      };
    },
    // Equities blotter tab: reactive view backed by the World subject.
    useEqBlotterView: () => {
      return {
        view: wrapSubject(world.eqBlotterView),
        setView: (next: EqBlotterView) => {
          world.eqBlotterView.next(next);
        },
      };
    },
    // Auth: reactive state backed by the World subject; login/unlock/lock/logout
    // push back so the seam transition re-renders LoginScreen/LockScreen, mirroring
    // AuthPresenter's lifecycle just closely enough for component specs.
    useAuth: () => {
      const authState = wrapSubject(world.auth);
      return {
        state: authState,
        login: (username: string, password: string) => {
          world.commands.authLoginArgs.push([username, password]);
        },
        unlock: (password: string) => {
          world.commands.authUnlock += 1;
          world.commands.authUnlockArgs.push(password);
          world.auth.next({
            ...world.auth.getValue(),
            locked: false,
            error: null,
          });
        },
        lock: () => {
          world.commands.authLock += 1;
          world.auth.next({ ...world.auth.getValue(), locked: true });
        },
        logout: () => {
          world.commands.authLogout += 1;
          world.auth.next({
            status: "unauthenticated",
            user: null,
            locked: false,
            error: null,
          });
        },
      };
    },
    // Boot gate: reactive visibility backed by the World subject; reboot
    // re-raises (recorded so a spec can assert "⟳ Reboot HUD fires once"),
    // dismiss lowers — mirroring the real BootGatePresenter seam.
    useBootGate: () => {
      const visible = wrapSubject(world.bootGate);
      return {
        visible,
        reboot: () => {
          world.commands.bootReboot += 1;
          world.bootGate.next(true);
        },
        dismiss: () => {
          world.bootGate.next(false);
        },
      };
    },
    // Per-RFQ countdown: the REAL createRfqCountdownMachine, exercising the
    // relocated countdown logic through the same useMachine bridge the app
    // uses. Contract specs drive the countdown with fake timers.
    useRfqCountdown: (creationTimestamp: number, totalMs: number) => {
      return useMachine(() => {
        return createRfqCountdownMachine(creationTimestamp, totalMs);
      }).state;
    },
    // Animation intents: backed by the World's per-target intent subject so
    // the AnimationIntents.contract.spec can push synthetic intents and
    // assert the data-anim mapping without wiring a real AnimationDirector.
    useAnimationIntents: (target: string) => {
      return wrapSubject(world.intentFor(target));
    },
    useLayout: (tab: WorkspaceTab) => {
      return useMachine(() => {
        return createLayoutMachine(createDefaultLayoutPort(tab));
      });
    },
    // Boot sequence: no contract spec exercises the boot sequence beyond its
    // own BootSequence.contract.spec.ts (Task 9); use the REAL machine with a
    // fixed "core" variant and noop advance so it compiles and disposes
    // cleanly without touching real preferences.
    useBootSequence: (onDone: () => void) => {
      return useMachine(() => {
        return createBootSequenceMachine({
          variant: "core",
          advance: (): void => {},
          onDone,
        });
      });
    },
    // Equities: reactive views backed by the World's shared streams
    // (watchlist / orders / positions) and per-symbol subjects
    // (quote / candles / depth).
    useWatchlist: () => {
      return wrapSubject(world.watchlist);
    },
    useEquityQuote: (symbol: string) => {
      return wrapSubject(world.equityQuoteFor(symbol));
    },
    useCandles: (symbol: string, _timeframe?: CandleTimeframe) => {
      return wrapSubject(world.candlesFor(symbol));
    },
    useDepth: (symbol: string) => {
      return wrapSubject(world.depthFor(symbol));
    },
    useEquityOrders: () => {
      return wrapSubject(world.equityOrders);
    },
    useEquityPositions: () => {
      return wrapSubject(world.equityPositions);
    },
    // Machine: the REAL createOrderTicketMachine, driven by a World-backed
    // place() that returns the lifecycle Subject.
    useOrderTicket: (defaultSymbol: string) => {
      return useMachine(() => {
        return createOrderTicketMachine({
          place: (req: PlaceOrderRequest) => {
            world.commands.placedOrderRequests.push(req);
            return world.orderLifecycle.asObservable();
          },
          defaultSymbol,
        });
      });
    },
    // Eq workspace: the REAL createEqWorkspaceMachine, one shared instance
    // for the whole World (world.eqWorkspace) — its `state$` is already a
    // warm StateObservable (see @rtc/client-core's Machine interface), so it
    // is read directly with `toSignal`, exactly like `@rtc/solid-bindings`'s
    // own createViewModel reads `presenters.eqWorkspace.state$` — NOT a
    // per-mount useMachine, so every component reading useEqWorkspace()
    // through this World observes the same selection/open-tabs/timeframe.
    useEqWorkspace: () => {
      return {
        state: toSignal(world.eqWorkspace.state$),
        select: world.eqWorkspace.intents.select,
        closeTab: world.eqWorkspace.intents.closeTab,
        setTimeframe: world.eqWorkspace.intents.setTimeframe,
      };
    },
    // Admin / telemetry: World-backed fakes that re-render subscribing
    // components when the test pushes new data. The incident fake mirrors
    // the real IncidentMachine's connection-status asymmetry via
    // world.injectIncident.
    useMetrics: () => {
      const view = wrapSubject(world.metrics$);
      return {
        throughput: () => {
          return view().throughput;
        },
        latency: () => {
          return view().latency;
        },
        errorRate: () => {
          return view().errorRate;
        },
      };
    },
    useTopology: () => {
      return wrapSubject(world.topology$);
    },
    useEventLog: () => {
      return wrapSubject(world.eventLog$);
    },
    useSessions: () => {
      return wrapSubject(world.sessions$);
    },
    useSessionCountSeries: () => {
      return wrapSubject(world.sessionCountSeries$);
    },
    useIncident: () => {
      return {
        state: wrapSubject(world.incidentState$),
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
