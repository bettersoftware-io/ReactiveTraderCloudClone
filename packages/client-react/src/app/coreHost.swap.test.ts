/**
 * The hot swap's integration tier: the real browser ports (simulator mode),
 * the three real application cores and the real core host. The UI is out of
 * the picture — `mount` / `unmount` only capture the `Composition` the host
 * hands over — so what is under test is whether a core composed over ports
 * another core already used behaves like one composed over fresh ports
 * (spec 2026-10-05-core-hot-swap-design.md). The host's own sequence is
 * pinned with fake cores in `coreHost.test.ts`.
 *
 * Everything runs on fake timers: the simulators, the host's cover and
 * macrotask waits, and every core's scheduling all follow them, so each wait
 * below advances the clock in steps until the awaited value is seen.
 */
import { isObservable, Observable, type Subscription } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { asyncCore } from "@rtc/client-core-async";
import { effectCore } from "@rtc/client-core-effect";
import { rxjsCore } from "@rtc/client-core-rxjs";
import type {
  App,
  AppPorts,
  AuthViewState,
  CoreFactory,
  CoreImpl,
  Stream,
} from "@rtc/core-api";
import {
  type ConnectionEvent,
  ConnectionStatus,
  type CurrencyPair,
  Direction,
  IDLE_TIMEOUT_MS,
  type Price,
} from "@rtc/domain";

import { buildBrowserPorts } from "./buildBrowserPorts";
import {
  type Composition,
  type CoreHost,
  type CoreHostState,
  createCoreHost,
} from "./coreHost";

/** Every ordered pair of distinct cores. */
const PAIRS: readonly (readonly [CoreImpl, CoreImpl])[] = [
  ["rxjs", "async"],
  ["rxjs", "effect"],
  ["async", "rxjs"],
  ["async", "effect"],
  ["effect", "rxjs"],
  ["effect", "async"],
];

/** Each core once as the swap's source and once as its target. */
const ROTATION: readonly (readonly [CoreImpl, CoreImpl])[] = [
  ["rxjs", "effect"],
  ["async", "rxjs"],
  ["effect", "async"],
];

describe("hot swap over the real browser ports", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false });
    vi.stubEnv("VITE_DEV_AUTH", JSON.stringify({ [USER]: PASSWORD }));
    // buildBrowserPorts announces its data source on every call.
    vi.spyOn(console, "info").mockImplementation(() => {});
    localStorage.clear();
  });

  afterEach(async () => {
    await disposeAll();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each(PAIRS)(
    "1. %s → %s: the new core is signed in, connected, ticking live, and holds the trade",
    async (from, to) => {
      const harness = createHostHarness(buildBrowserPorts(), from);
      const a = harness.current();
      a.presenters.auth.login(USER, PASSWORD);
      await waitFor(a.presenters.auth.state$, isAuthenticated, "A signs in");
      const pair = await waitForFirstPair(a);
      const price = await waitFor(
        a.presenters.priceStream.price$(pair),
        isAnyPrice,
        "A's first price",
      );
      const tradeId = await executeTrade(a, pair, price);

      await swapAndSettle(harness.host, to);
      // Every price stamped before this instant could be a replay (a cached
      // latest, or the simulator's seeded history); only a later one is live.
      const swappedAt = Date.now();
      const b = harness.current();

      expect(b.impl).toBe(to);
      expect(b.generation).toBe(2);
      await waitFor(b.presenters.auth.state$, isAuthenticated, "B signed in");
      await waitFor(
        b.presenters.connection.status$,
        isConnected,
        "B connected",
      );
      const ticks = await waitForLiveTicks(
        b.presenters.priceStream.price$(pair),
        swappedAt,
      );
      expect(ticks[0].creationTimestamp).toBeGreaterThan(swappedAt);
      expect(ticks[1].creationTimestamp).toBeGreaterThan(
        ticks[0].creationTimestamp,
      );
      const trades = await waitFor(
        b.presenters.blotter.trades$,
        (list) => {
          return list.some((trade) => {
            return trade.tradeId === tradeId;
          });
        },
        `B's blotter holds trade ${tradeId}`,
      );
      expect(
        trades.map((trade) => {
          return trade.tradeId;
        }),
      ).toContain(tradeId);
    },
  );

  // A fresh composition cannot know the browser is already offline either:
  // the browser adapter listens for `online` / `offline` and never reads
  // `navigator.onLine` at subscribe time (a pre-existing gap of boot, tracked
  // in docs/STATUS.md). So the comparison below only proves the swap carries
  // no stale offline state; the follow-up events prove B is wired to the
  // browser, and the ledger that A no longer is.
  // A's recording is released before the swap, as the host's unmount releases
  // the UI's: a consumer that keeps a stream keeps its port subscription on
  // two of the three cores, and the host never does.
  it.each(ROTATION)(
    "2. %s → %s after an offline event: B starts as fresh ports would, then follows offline and online, and A's connection subscription is closed",
    async (from, to) => {
      const ledger = createConnectionLedger(buildBrowserPorts());
      const harness = createHostHarness(ledger.ports, from, {
        beforeLoad: ledger.markSwapStart,
      });
      const a = harness.current();
      await signIn(a);
      const heardByA = recordStatuses(a.presenters.connection.status$);
      await waitForStatus(heardByA, ConnectionStatus.CONNECTED);

      window.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(STEP_MS);

      // Positive witnesses: the running core heard the browser go offline,
      // through a connection subscription the ledger sees open.
      expect(heardByA.values.at(-1)).toBe(
        ConnectionStatus.OFFLINE_DISCONNECTED,
      );
      expect(ledger.liveEarly()).toBeGreaterThan(0);
      heardByA.stop();
      await swapAndSettle(harness.host, to);

      expect(ledger.liveEarly()).toBe(0);

      const heardByB = recordStatuses(
        harness.current().presenters.connection.status$,
      );
      await vi.advanceTimersByTimeAsync(OBSERVE_MS);
      const swapped = [...heardByB.values];
      const fresh = await recordFreshStatuses(to);

      expect(swapped.length).toBeGreaterThan(0);
      expect(swapped).toEqual(fresh);

      window.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(STEP_MS);
      expect(heardByB.values.at(-1)).toBe(
        ConnectionStatus.OFFLINE_DISCONNECTED,
      );

      window.dispatchEvent(new Event("online"));
      await waitForStatus(heardByB, ConnectionStatus.CONNECTED);
      heardByB.stop();
      expect(ledger.liveEarly()).toBe(0);
    },
  );

  it.each(ROTATION)(
    "3. %s → %s with a reconnect intent in flight: no connection event from before the swap reaches the new core, and its connection matches fresh ports",
    async (from, to) => {
      const ledger = createConnectionLedger(buildBrowserPorts());
      const harness = createHostHarness(ledger.ports, from, {
        beforeLoad: ledger.markSwapStart,
      });
      const a = harness.current();
      await signIn(a);
      const heard = recordStatuses(a.presenters.connection.status$);
      await waitForStatus(heard, ConnectionStatus.CONNECTED);
      // Idle out, so the Reconnect intent has a disconnection to recover.
      await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
      expect(heard.values.at(-1)).toBe(ConnectionStatus.IDLE_DISCONNECTED);
      const heardBefore = heard.values.length;

      a.commands.reconnect();
      // No clock advance between the intent and the swap: on the Effect core
      // the intent is still queued for the fold when the swap begins.
      await swapAndSettle(harness.host, to);

      // Positive witnesses: the outgoing core folded the intent, and the
      // ledger saw the intent reach the outgoing core's subscription.
      expect(heard.values.slice(heardBefore)).toEqual([
        ConnectionStatus.CONNECTING,
        ConnectionStatus.CONNECTED,
      ]);
      heard.stop();
      expect(ledger.earlyEvents().map(typeOf)).toContain("reconnect");

      const swapped = await recordStatusesFor(
        harness.current().presenters.connection.status$,
      );

      // Positive witness: the ledger sees the new core's own subscription,
      // which hears the gateway connect.
      expect(ledger.lateEvents().map(typeOf)).toContain("gatewayConnected");
      expect(ledger.lateEvents().map(typeOf)).not.toContain("reconnect");

      const fresh = await recordFreshStatuses(to);

      expect(swapped.length).toBeGreaterThan(0);
      expect(swapped).toEqual(fresh);
    },
  );

  it("4. five swaps around the three cores leave no port subscription behind, method by method", async () => {
    const tally = createTalliedPorts(buildBrowserPorts());
    const harness = createHostHarness(tally.ports, "rxjs");
    await signIn(harness.current());
    const pair = await waitForFirstPair(harness.current());

    const warmFirst = await warm(harness.current(), pair);
    const whileWarm = tally.live();
    await release(warmFirst);
    const baseline = tally.live();

    // Positive witness: the warm set opens port subscriptions of its own,
    // on several distinct port methods, and the tally sees each of them.
    expect(
      Object.keys(gainedOver(baseline, whileWarm)).length,
    ).toBeGreaterThanOrEqual(MIN_WARMED_METHODS);

    const route: readonly CoreImpl[] = [
      "async",
      "effect",
      "rxjs",
      "effect",
      "async",
    ];

    for (const impl of route) {
      await swapAndSettle(harness.host, impl);
      expect(harness.current().impl).toBe(impl);
      const warmed = await warm(harness.current(), pair);
      expect(
        Object.keys(gainedOver(baseline, tally.live())).length,
      ).toBeGreaterThanOrEqual(MIN_WARMED_METHODS);
      await release(warmed);
      expect({ impl, live: tally.live() }).toEqual({ impl, live: baseline });
    }
  });
});

/** Every app composed by a test, disposed in `afterEach`. The host has
 * already disposed all but the running one; `App.dispose()` is idempotent. */
const composedApps: App[] = [];

async function disposeAll(): Promise<void> {
  const apps = composedApps.splice(0);

  for (const app of apps) {
    await app.dispose();
  }
}

interface HostHarness {
  readonly host: CoreHost;
  current(): Composition;
}

interface HostHarnessOptions {
  /** Runs when the host starts loading the next core: the swap has begun. */
  readonly beforeLoad?: () => void;
}

/** A started host over `ports` with no-op UI effects: `mount` keeps the
 * composition, every other effect does nothing, and time is the fake clock. */
function createHostHarness(
  ports: AppPorts,
  initial: CoreImpl,
  options: HostHarnessOptions = {},
): HostHarness {
  let mounted: Composition | null = null;

  const host = createCoreHost({
    ports,
    initial: { impl: initial, core: trackApps(CORES[initial]) },
    load: (impl: CoreImpl): Promise<CoreFactory> => {
      options.beforeLoad?.();
      return Promise.resolve(trackApps(CORES[impl]));
    },
    instrument: (core: CoreFactory, app: App) => {
      return {
        presenters: app.presenters,
        machineFactories: core.createMachineFactories(app.presenters),
      };
    },
    endComposition: () => {},
    mount: (composition: Composition): void => {
      mounted = composition;
    },
    unmount: () => {
      mounted = null;
    },
    publish: () => {},
    persist: () => {
      return true;
    },
    stripCoreParam: () => {},
    info: () => {},
    warn: (message: string): void => {
      throw new Error(`unexpected host warning: ${message}`);
    },
    onFatal: (error: unknown): void => {
      throw error;
    },
    cover: { enterMs: 0, holdMs: 0, exitMs: 0 },
    sleep: delayBy,
    nextMacrotask: () => {
      return delayBy(0);
    },
  });

  host.start();

  return {
    host,
    current: (): Composition => {
      if (mounted === null) {
        throw new Error("no composition is mounted");
      }

      return mounted;
    },
  };
}

/** The same core, recording every app it composes so `afterEach` can
 * dispose whichever one is still running. */
function trackApps(core: CoreFactory): CoreFactory {
  return {
    createApp: (ports: AppPorts): App => {
      const app = core.createApp(ports);
      composedApps.push(app);
      return app;
    },
    createMachineFactories: core.createMachineFactories,
  };
}

function delayBy(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Runs `swapTo` to completion on the fake clock and checks it landed. */
async function swapAndSettle(host: CoreHost, impl: CoreImpl): Promise<void> {
  let done = false;
  const swapped = host.swapTo(impl).then(() => {
    done = true;
  });

  for (let elapsed = 0; !done && elapsed < BUDGET_MS; elapsed += STEP_MS) {
    await vi.advanceTimersByTimeAsync(STEP_MS);
  }

  await swapped;
  expect(await waitFor(host.state$, isRunning, `the swap to ${impl}`)).toEqual({
    phase: "running",
    impl,
  });
}

/** A value a wait has accepted (boxed, so an accepted `undefined` counts). */
interface Found<T> {
  readonly value: T;
}

/** Advances the fake clock until `source$` emits a value `accept` takes, and
 * answers that value; fails the test when the budget runs out first. */
async function waitFor<T>(
  source$: Stream<T>,
  accept: (value: T) => boolean,
  label: string,
): Promise<T> {
  let found: Found<T> | null = null;
  const subscription = source$.subscribe((value) => {
    if (found === null && accept(value)) {
      found = { value };
    }
  });

  try {
    for (
      let elapsed = 0;
      found === null && elapsed < BUDGET_MS;
      elapsed += STEP_MS
    ) {
      await vi.advanceTimersByTimeAsync(STEP_MS);
    }
  } finally {
    subscription.unsubscribe();
  }

  if (found === null) {
    throw new Error(`timed out waiting for ${label}`);
  }

  // TypeScript cannot see the closure's assignment, so it narrows `found`
  // to `null` (and then `never`) here; the cast restores the declared type.
  return (found as Found<T>).value;
}

/** Two prices stamped after `since`, each after the one before: ticks the
 * new core produced live, since a replayed price predates `since`. */
async function waitForLiveTicks(
  price$: Stream<Price>,
  since: number,
): Promise<readonly Price[]> {
  const ticks: Price[] = [];
  await waitFor(
    price$,
    (price) => {
      const after = ticks.at(-1)?.creationTimestamp ?? since;

      if (price.creationTimestamp > after) {
        ticks.push(price);
      }

      return ticks.length === 2;
    },
    "two live prices on the new core",
  );
  return ticks;
}

async function signIn(app: Composition): Promise<void> {
  app.presenters.auth.login(USER, PASSWORD);
  await waitFor(app.presenters.auth.state$, isAuthenticated, "sign-in");
}

async function waitForFirstPair(app: Composition): Promise<CurrencyPair> {
  const pairs = await waitFor(
    app.presenters.currencyPairs.pairs$,
    (list) => {
      return list.length > 0;
    },
    "the currency pairs",
  );
  return pairs[0];
}

async function executeTrade(
  app: Composition,
  pair: CurrencyPair,
  price: Price,
): Promise<number> {
  const result = await waitFor(
    app.presenters.execution.execute({
      pair,
      direction: Direction.Buy,
      price,
      notional: 1_234_567,
    }),
    (outcome) => {
      return String(outcome.status) !== "Pending";
    },
    "the trade's execution",
  );
  return result.trade.tradeId;
}

interface StatusRecording {
  readonly values: ConnectionStatus[];
  stop(): void;
}

function recordStatuses(status$: Stream<ConnectionStatus>): StatusRecording {
  const values: ConnectionStatus[] = [];
  const subscription: Subscription = status$.subscribe((status) => {
    values.push(status);
  });

  return {
    values,
    stop: () => {
      subscription.unsubscribe();
    },
  };
}

async function waitForStatus(
  recording: StatusRecording,
  status: ConnectionStatus,
): Promise<void> {
  for (
    let elapsed = 0;
    recording.values.at(-1) !== status && elapsed < BUDGET_MS;
    elapsed += STEP_MS
  ) {
    await vi.advanceTimersByTimeAsync(STEP_MS);
  }

  expect(recording.values.at(-1)).toBe(status);
}

/** Every status `status$` emits from subscription through `OBSERVE_MS`. */
async function recordStatusesFor(
  status$: Stream<ConnectionStatus>,
): Promise<readonly ConnectionStatus[]> {
  const recording = recordStatuses(status$);
  await vi.advanceTimersByTimeAsync(OBSERVE_MS);
  recording.stop();
  return recording.values;
}

/** The same recording from `impl` composed over fresh ports — the page a
 * reload would give, signed in through the session the swap kept. */
async function recordFreshStatuses(
  impl: CoreImpl,
): Promise<readonly ConnectionStatus[]> {
  const app = trackApps(CORES[impl]).createApp(buildBrowserPorts());
  await waitFor(app.presenters.auth.state$, isAuthenticated, "fresh sign-in");
  return recordStatusesFor(app.presenters.connection.status$);
}

/** The fixed stream set the leak witness opens on each composition: one
 * stream per screen of the app, each reaching the ports lazily. */
async function warm(
  app: Composition,
  pair: CurrencyPair,
): Promise<readonly Subscription[]> {
  const presenters = app.presenters;
  const symbol = pair.symbol;
  const equity = "AAPL";
  const subscriptions = [
    presenters.connection.status$.subscribe(() => {}),
    presenters.currencyPairs.pairs$.subscribe(() => {}),
    presenters.priceStream.price$(pair).subscribe(() => {}),
    presenters.priceHistory.history$(symbol).subscribe(() => {}),
    presenters.blotter.trades$.subscribe(() => {}),
    presenters.analytics.position$.subscribe(() => {}),
    presenters.rfqs.rfqs$.subscribe(() => {}),
    presenters.dealers.list$.subscribe(() => {}),
    presenters.instruments.list$.subscribe(() => {}),
    presenters.watchlist.watchlist$.subscribe(() => {}),
    presenters.watchlist.quote$(equity).subscribe(() => {}),
    presenters.depth.depth$(equity).subscribe(() => {}),
    presenters.equityPriceHistory.history$(equity).subscribe(() => {}),
    presenters.positions.positions$.subscribe(() => {}),
    presenters.ordersBlotter.orders$.subscribe(() => {}),
    presenters.throughputMetric.samples$.subscribe(() => {}),
    presenters.latencyMetric.samples$.subscribe(() => {}),
    presenters.errorRateMetric.samples$.subscribe(() => {}),
    presenters.topology.topology$.subscribe(() => {}),
    presenters.eventLog.events$.subscribe(() => {}),
    presenters.sessions.sessions$.subscribe(() => {}),
    presenters.jarvisUsage.usage$.subscribe(() => {}),
  ];
  await vi.advanceTimersByTimeAsync(OBSERVE_MS);
  return subscriptions;
}

async function release(subscriptions: readonly Subscription[]): Promise<void> {
  for (const subscription of subscriptions) {
    subscription.unsubscribe();
  }

  await vi.advanceTimersByTimeAsync(OBSERVE_MS);
}

/** The `port.method` entries of `warmed` that hold more live subscriptions
 * than `baseline`, with how many more. */
function gainedOver(
  baseline: LiveSubscriptions,
  warmed: LiveSubscriptions,
): LiveSubscriptions {
  return Object.fromEntries(
    Object.entries(warmed)
      .map(([key, count]): [string, number] => {
        return [key, count - (baseline[key] ?? 0)];
      })
      .filter(([, gained]) => {
        return gained > 0;
      }),
  );
}

function isAuthenticated(state: AuthViewState): boolean {
  return state.status === "authenticated";
}

function isConnected(status: ConnectionStatus): boolean {
  return status === ConnectionStatus.CONNECTED;
}

function isAnyPrice(): boolean {
  return true;
}

function isRunning(state: CoreHostState): boolean {
  return state.phase === "running";
}

function typeOf(event: ConnectionEvent): ConnectionEvent["type"] {
  return event.type;
}

/** Live subscriptions per `port.method`; methods with none are left out. */
type LiveSubscriptions = Readonly<Record<string, number>>;

interface TalliedPorts {
  readonly ports: AppPorts;
  /** Subscriptions to each port method's streams open right now. */
  live(): LiveSubscriptions;
}

/**
 * `ports` with every method that answers an Observable wrapped in a
 * subscribe / finalize counter, kept per `port.method`.
 *
 * What it does not see: a port property that IS an Observable (none exist
 * today), a method one object deeper than a port, a port that is an array
 * (`metricControls`), and a stream answered as a Promise or AsyncIterable.
 */
function createTalliedPorts(ports: AppPorts): TalliedPorts {
  const open = new Map<string, number>();

  function count(key: string, delta: number): void {
    open.set(key, (open.get(key) ?? 0) + delta);
  }

  function tally<T>(key: string, source$: Observable<T>): Observable<T> {
    return new Observable<T>((subscriber) => {
      count(key, 1);
      const inner = source$.subscribe(subscriber);

      return (): void => {
        count(key, -1);
        inner.unsubscribe();
      };
    });
  }

  function wrapPort<P extends object>(name: string, port: P): P {
    return new Proxy(port, {
      get: (target: P, key: string | symbol): unknown => {
        const value: unknown = Reflect.get(target, key, target);

        if (typeof value !== "function") {
          return value;
        }

        return (...args: unknown[]): unknown => {
          const result: unknown = value.apply(target, args);
          return isObservable(result)
            ? tally(`${name}.${String(key)}`, result)
            : result;
        };
      },
    });
  }

  const wrapped = Object.fromEntries(
    Object.entries(ports).map(([name, port]) => {
      return [
        name,
        typeof port === "object" && port !== null && !Array.isArray(port)
          ? wrapPort(name, port)
          : port,
      ];
    }),
  ) as unknown as AppPorts;

  return {
    ports: wrapped,
    live: () => {
      return Object.fromEntries(
        [...open.entries()].filter(([, live]) => {
          return live > 0;
        }),
      );
    },
  };
}

interface ConnectionLedger {
  readonly ports: AppPorts;
  /** From now on, every new subscription to the connection events is late. */
  markSwapStart(): void;
  /** Events delivered to subscriptions opened before `markSwapStart`. */
  earlyEvents(): readonly ConnectionEvent[];
  /** Events delivered to subscriptions opened after it. */
  lateEvents(): readonly ConnectionEvent[];
  /** Subscriptions opened before `markSwapStart` that are still open. */
  liveEarly(): number;
}

/** `ports` whose `connectionEvents` records what each subscription is
 * delivered, split by whether it was opened before or after the swap began,
 * and counts the early subscriptions still open. */
function createConnectionLedger(ports: AppPorts): ConnectionLedger {
  const early: ConnectionEvent[] = [];
  const late: ConnectionEvent[] = [];
  let swapStarted = false;
  let liveEarly = 0;

  return {
    ports: {
      ...ports,
      connectionEvents: {
        events: (): Observable<ConnectionEvent> => {
          return new Observable<ConnectionEvent>((subscriber) => {
            const isEarly = !swapStarted;
            const ledger = isEarly ? early : late;

            if (isEarly) {
              liveEarly += 1;
            }

            const inner = ports.connectionEvents.events().subscribe({
              next: (event: ConnectionEvent): void => {
                ledger.push(event);
                subscriber.next(event);
              },
              error: (error: unknown): void => {
                subscriber.error(error);
              },
              complete: (): void => {
                subscriber.complete();
              },
            });

            return (): void => {
              if (isEarly) {
                liveEarly -= 1;
              }

              inner.unsubscribe();
            };
          });
        },
      },
    },
    markSwapStart: () => {
      swapStarted = true;
    },
    earlyEvents: () => {
      return early;
    },
    lateEvents: () => {
      return late;
    },
    liveEarly: () => {
      return liveEarly;
    },
  };
}

const CORES: Readonly<Record<CoreImpl, CoreFactory>> = {
  rxjs: rxjsCore,
  async: asyncCore,
  effect: effectCore,
};

const USER = "astark";

const PASSWORD = "mcdc2026";

/** The fake-clock step a wait advances by, and how far it may go in all. */
const STEP_MS = 50;

const BUDGET_MS = 20_000;

/** How long a connection status is recorded for a comparison. */
const OBSERVE_MS = 2_000;

/** How many distinct port methods the warm set must add subscriptions to. */
const MIN_WARMED_METHODS = 3;
