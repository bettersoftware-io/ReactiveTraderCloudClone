import { BehaviorSubject, merge, Observable, Subject } from "rxjs";

import type { AppPorts, ColorSchemeSource, Stream } from "@rtc/core-api";
import type {
  AnalyticsPort,
  BlotterPort,
  ConnectionEvent,
  ConnectionEventsPort,
  CurrencyPair,
  ExecutionPort,
  ExecutionRequest,
  PositionUpdates,
  PreferencesPort,
  PriceTick,
  PricingPort,
  ReferenceDataPort,
  Trade,
} from "@rtc/domain";

/** A port method name the discipline suite can count — the `$`-suffixed
 * stream methods of `PreferencesPort`, plus the app-lifetime methods the
 * harness supplies itself: `connectionEvents.events`,
 * `colorScheme.prefersDark$`, and the three FX singletons every core calls
 * once at construction. `pricing.getPriceUpdates` is deliberately NOT here:
 * a per-key stream is opened per warm period through the use case's
 * `defer`, in the RxJS core as in the others. */
export type PortMethodName =
  | Extract<keyof PreferencesPort, `${string}$`>
  | "connectionEvents.events"
  | "colorScheme.prefersDark$"
  | "referenceData.getCurrencyPairs"
  | "blotter.getTradeStream"
  | "analytics.getAnalytics";

/** Wrap a port so every method call is counted by name. A Proxy rather than
 * a spread: a class port's methods live on its prototype, which a spread
 * drops. The `get` trap only INSTALLS the counting wrapper; the count
 * happens inside that wrapper, on invocation — so a property read that is
 * never called does not count, and the witness is calls, not reads. */
function countCalls<P extends object>(
  port: P,
  counts: Map<string, number>,
  prefix = "",
): P {
  return new Proxy(port, {
    get: (target: P, property: string | symbol, receiver: unknown) => {
      const value = Reflect.get(target, property, receiver);

      if (typeof value === "function" && typeof property === "string") {
        return (...args: unknown[]) => {
          const key = `${prefix}${property}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return Reflect.apply(value, target, args);
        };
      }

      return value;
    },
  });
}

/** One execution the core has SUBSCRIBED and the driver has not yet settled. */
interface PendingExecution {
  readonly request: ExecutionRequest;
  readonly result: Subject<Trade>;
}

export interface ScriptedDriver {
  /** Push one connection event into the stream the core observes. */
  emitConnection(event: ConnectionEvent): void;
  /** Error the connection-event stream the core observes — a real source
   * failure, not a domain event, so it reaches `Collected.errors` rather
   * than folding into a status value. Terminal, like the Subject it drives:
   * a later `emitConnection`/`failConnection` is a no-op after this. */
  failConnection(error: unknown): void;
  /** The merged connection-event stream the core sees — includes whatever
   * the runner's base port carries (e.g. the RxJS core's `reconnect$`). */
  connectionEvents$(): Stream<ConnectionEvent>;
  /** Flip the OS colour scheme the theme presenter resolves "system" against. */
  setPrefersDark(on: boolean): void;
  /** How many times the core has invoked this port method since the harness
   * was built — the "called once, at construction" discipline's witness. */
  portCalls(method: PortMethodName): number;
  /** Push one raw tick into `pricing.getPriceUpdates(tick.symbol)`. A tick
   * for a symbol nobody has subscribed reaches nobody. */
  tickPrice(tick: PriceTick): void;
  /** Error that symbol's price stream — terminal for its current subscribers;
   * the next `getPriceUpdates(symbol)` subscription gets a fresh Subject. */
  failPrice(symbol: string, error: unknown): void;
  /** Whether the core currently holds a subscription to that symbol's price
   * stream — the teardown-on-last-unsubscribe witness for per-key streams. */
  priceObserved(symbol: string): boolean;
  /** Push the currency-pair roster into `referenceData.getCurrencyPairs()`. */
  emitPairs(pairs: readonly CurrencyPair[]): void;
  pairsObserved(): boolean;
  /** Push one blotter snapshot into `blotter.getTradeStream()`. */
  emitTrades(trades: readonly Trade[]): void;
  tradesObserved(): boolean;
  /** Push one position update into `analytics.getAnalytics(_)`. */
  emitPosition(update: PositionUpdates): void;
  positionObserved(): boolean;
  /** Every execution request the core has subscribed and the driver has not
   * settled, oldest first. A call of `executeTrade` that nobody subscribed
   * is not here — laziness is the core's property, witnessed through this. */
  pendingExecutions(): readonly ExecutionRequest[];
  /** Settle the OLDEST pending execution with this trade (next + complete).
   * A no-op when nothing is pending. */
  resolveExecution(trade: Trade): void;
  /** Error the OLDEST pending execution. A no-op when nothing is pending. */
  failExecution(error: unknown): void;
}

export interface ScriptedPorts {
  ports: AppPorts;
  driver: ScriptedDriver;
  teardown(): void;
}

/** Wrap a runner-supplied `AppPorts` so the suites can drive connection
 * events, the colour scheme and the five FX ports deterministically. The
 * FX ports are REPLACED, not merged: the base simulators tick on real,
 * random timers a suite cannot assert against. Everything else in `base` is
 * passed through untouched — the runner decides what backs it. */
export function scriptPorts(base: AppPorts): ScriptedPorts {
  const connection$ = new Subject<ConnectionEvent>();
  const prefersDark$ = new BehaviorSubject<boolean>(false);
  const calls = new Map<string, number>();
  const preferences = countCalls(base.preferences, calls);
  const prices = new Map<string, Subject<PriceTick>>();
  const pairs$ = new Subject<readonly CurrencyPair[]>();
  const trades$ = new Subject<readonly Trade[]>();
  const position$ = new Subject<PositionUpdates>();
  const pending: PendingExecution[] = [];

  // Built ONCE, and handed to both the core (through `connectionEvents`) and
  // the suites (through `driver.connectionEvents$()`), so the two can never
  // observe different merge instances. Rebuilding it per call would be
  // observationally equivalent only while every runner's base port is hot
  // (client-core's `reconnect$` is a bare Subject); against a base port that
  // returns a cold per-subscribe stream, the reconnect suite would go green
  // on a stream the core never saw. The consequence — `base.connectionEvents
  // .events()` is called once here rather than once per subscription — is the
  // intended semantics: one shared stream.
  const events$ = merge(base.connectionEvents.events(), connection$);

  // The ports the harness supplies itself are outside `countCalls`' Proxy,
  // so they count their own calls — on invocation, exactly as the wrapper
  // does.
  function recordCall(method: PortMethodName): void {
    calls.set(method, (calls.get(method) ?? 0) + 1);
  }

  /** The live Subject for a symbol — replaced after a failure, so the next
   * subscription starts clean (a terminated Subject would replay its error). */
  function priceSubject(symbol: string): Subject<PriceTick> {
    const existing = prices.get(symbol);

    if (existing !== undefined && !existing.closed && !existing.hasError) {
      return existing;
    }

    const fresh = new Subject<PriceTick>();
    prices.set(symbol, fresh);
    return fresh;
  }

  function settlePending(settle: (result: Subject<Trade>) => void): void {
    const oldest = pending.shift();

    if (oldest !== undefined) {
      settle(oldest.result);
    }
  }

  const connectionEvents: ConnectionEventsPort = {
    events: (): Observable<ConnectionEvent> => {
      recordCall("connectionEvents.events");
      return events$;
    },
  };

  const colorScheme: ColorSchemeSource = {
    prefersDark$: (): Observable<boolean> => {
      recordCall("colorScheme.prefersDark$");
      return prefersDark$;
    },
  };

  const pricing: PricingPort = {
    // Deferred so each SUBSCRIPTION resolves the live Subject: after a
    // `failPrice` the replacement is what a fresh warm period gets.
    getPriceUpdates: (symbol: string): Observable<PriceTick> => {
      return new Observable<PriceTick>((subscriber) => {
        return priceSubject(symbol).subscribe(subscriber);
      });
    },
    getPriceHistory: (symbol: string): Observable<readonly PriceTick[]> => {
      return base.pricing.getPriceHistory(symbol);
    },
    getRfqQuote: (symbol: string, pipsPosition: number) => {
      return base.pricing.getRfqQuote(symbol, pipsPosition);
    },
  };

  const referenceData: ReferenceDataPort = {
    getCurrencyPairs: (): Observable<readonly CurrencyPair[]> => {
      recordCall("referenceData.getCurrencyPairs");
      return pairs$;
    },
  };

  const blotter: BlotterPort = {
    getTradeStream: (): Observable<readonly Trade[]> => {
      recordCall("blotter.getTradeStream");
      return trades$;
    },
  };

  const analytics: AnalyticsPort = {
    getAnalytics: (): Observable<PositionUpdates> => {
      recordCall("analytics.getAnalytics");
      return position$;
    },
  };

  const execution: ExecutionPort = {
    // The request becomes pending when the core SUBSCRIBES, not when it
    // calls: a `defer`, so "lazy until subscribed" is the core's property.
    executeTrade: (request: ExecutionRequest): Observable<Trade> => {
      return new Observable<Trade>((subscriber) => {
        const entry: PendingExecution = {
          request,
          result: new Subject<Trade>(),
        };
        pending.push(entry);
        const inner = entry.result.subscribe(subscriber);

        return () => {
          inner.unsubscribe();
          const index = pending.indexOf(entry);

          if (index >= 0) {
            pending.splice(index, 1);
          }
        };
      });
    },
  };

  return {
    ports: {
      ...base,
      preferences,
      connectionEvents,
      colorScheme,
      pricing,
      referenceData,
      blotter,
      analytics,
      execution,
    },
    driver: {
      emitConnection: (event: ConnectionEvent) => {
        connection$.next(event);
      },
      failConnection: (error: unknown) => {
        connection$.error(error);
      },
      connectionEvents$: () => {
        return events$;
      },
      setPrefersDark: (on: boolean) => {
        prefersDark$.next(on);
      },
      portCalls: (method: PortMethodName) => {
        return calls.get(method) ?? 0;
      },
      tickPrice: (tick: PriceTick) => {
        prices.get(tick.symbol)?.next(tick);
      },
      failPrice: (symbol: string, error: unknown) => {
        prices.get(symbol)?.error(error);
      },
      priceObserved: (symbol: string) => {
        return prices.get(symbol)?.observed ?? false;
      },
      emitPairs: (next: readonly CurrencyPair[]) => {
        pairs$.next(next);
      },
      pairsObserved: () => {
        return pairs$.observed;
      },
      emitTrades: (next: readonly Trade[]) => {
        trades$.next(next);
      },
      tradesObserved: () => {
        return trades$.observed;
      },
      emitPosition: (update: PositionUpdates) => {
        position$.next(update);
      },
      positionObserved: () => {
        return position$.observed;
      },
      pendingExecutions: () => {
        return pending.map((entry) => {
          return entry.request;
        });
      },
      resolveExecution: (trade: Trade) => {
        settlePending((result) => {
          result.next(trade);
          result.complete();
        });
      },
      failExecution: (error: unknown) => {
        settlePending((result) => {
          result.error(error);
        });
      },
    },
    teardown: () => {
      connection$.complete();
      prefersDark$.complete();

      for (const subject of prices.values()) {
        subject.complete();
      }

      pairs$.complete();
      trades$.complete();
      position$.complete();

      for (const entry of pending.splice(0)) {
        entry.result.complete();
      }
    },
  };
}
