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
    "1. %s → %s: the new core is signed in, connected, ticking, and holds the trade",
    async (from, to) => {
      const harness = createHostHarness(buildBrowserPorts(), from);
      const a = harness.current();
      a.presenters.auth.login(USER, PASSWORD);
      await waitFor(a.presenters.auth.state$, isAuthenticated, "A signs in");
      const pair = await waitForFirstPair(a);
      const before = await waitFor(
        a.presenters.priceStream.price$(pair),
        isAnyPrice,
        "A's first price",
      );
      const tradeId = await executeTrade(a, pair, before);

      await swapAndSettle(harness.host, to);
      const b = harness.current();

      expect(b.impl).toBe(to);
      expect(b.generation).toBe(2);
      await waitFor(b.presenters.auth.state$, isAuthenticated, "B signed in");
      await waitFor(
        b.presenters.connection.status$,
        isConnected,
        "B connected",
      );
      const ticks = await waitForTicks(
        b.presenters.priceStream.price$(pair),
        before,
      );
      expect(ticks.length).toBe(2);
      expect(ticks[1].creationTimestamp).toBeGreaterThan(
        before.creationTimestamp,
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

  it.each(ROTATION)(
    "2. %s → %s while the browser is offline: the connection matches fresh ports",
    async (from, to) => {
      const harness = createHostHarness(buildBrowserPorts(), from);
      const a = harness.current();
      await signIn(a);
      const heard = recordStatuses(a.presenters.connection.status$);
      await waitForStatus(heard, ConnectionStatus.CONNECTED);

      window.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(STEP_MS);

      // Positive witness: the running core heard the browser go offline.
      expect(heard.values.at(-1)).toBe(ConnectionStatus.OFFLINE_DISCONNECTED);
      heard.stop();
      await swapAndSettle(harness.host, to);
      const swapped = await recordStatusesFor(
        harness.current().presenters.connection.status$,
      );
      const fresh = await recordFreshStatuses(to);

      expect(swapped.length).toBeGreaterThan(0);
      expect(swapped).toEqual(fresh);
    },
  );

  it.each(ROTATION)(
    "3. %s → %s with a reconnect intent in flight: the connection matches fresh ports",
    async (from, to) => {
      const harness = createHostHarness(buildBrowserPorts(), from);
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

      // Positive witness: the outgoing core heard the intent.
      expect(heard.values.slice(heardBefore)).toEqual([
        ConnectionStatus.CONNECTING,
        ConnectionStatus.CONNECTED,
      ]);
      heard.stop();
      const swapped = await recordStatusesFor(
        harness.current().presenters.connection.status$,
      );
      const fresh = await recordFreshStatuses(to);

      expect(swapped.length).toBeGreaterThan(0);
      expect(swapped).toEqual(fresh);
    },
  );

  it("4. five swaps around the three cores leave no port subscription behind", async () => {
    const tally = createTalliedPorts(buildBrowserPorts());
    const harness = createHostHarness(tally.ports, "rxjs");
    await signIn(harness.current());
    const pair = await waitForFirstPair(harness.current());

    const warmFirst = await warm(harness.current(), pair);
    const whileWarm = tally.live();
    await release(warmFirst);
    const baseline = tally.live();

    // Positive witness: the tally sees the warm set's port subscriptions.
    expect(whileWarm).toBeGreaterThan(baseline);

    const route: readonly CoreImpl[] = [
      "async",
      "effect",
      "rxjs",
      "effect",
      "async",
    ];
    const afterRelease: number[] = [];
    const warmCounts: number[] = [];

    for (const impl of route) {
      await swapAndSettle(harness.host, impl);
      expect(harness.current().impl).toBe(impl);
      const warmed = await warm(harness.current(), pair);
      warmCounts.push(tally.live());
      await release(warmed);
      afterRelease.push(tally.live());
    }

    for (const count of warmCounts) {
      expect(count).toBeGreaterThan(baseline);
    }

    expect(afterRelease).toEqual(
      route.map(() => {
        return baseline;
      }),
    );
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

/** A started host over `ports` with no-op UI effects: `mount` keeps the
 * composition, every other effect does nothing, and time is the fake clock. */
function createHostHarness(ports: AppPorts, initial: CoreImpl): HostHarness {
  let mounted: Composition | null = null;

  const host = createCoreHost({
    ports,
    initial: { impl: initial, core: trackApps(CORES[initial]) },
    load: (impl: CoreImpl): Promise<CoreFactory> => {
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

  return (found as Found<T>).value;
}

/** Two prices from the new core, both stamped after `before`, the second
 * after the first: the stream is live on the new core, not replayed. */
async function waitForTicks(
  price$: Stream<Price>,
  before: Price,
): Promise<readonly Price[]> {
  const ticks: Price[] = [];
  await waitFor(
    price$,
    (price) => {
      const last = ticks.at(-1) ?? before;

      if (price.creationTimestamp > last.creationTimestamp) {
        ticks.push(price);
      }

      return ticks.length === 2;
    },
    "two fresh prices on the new core",
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

/** The fixed stream set the leak witness opens on each composition. */
async function warm(
  app: Composition,
  pair: CurrencyPair,
): Promise<readonly Subscription[]> {
  const subscriptions = [
    app.presenters.connection.status$.subscribe(() => {}),
    app.presenters.currencyPairs.pairs$.subscribe(() => {}),
    app.presenters.priceStream.price$(pair).subscribe(() => {}),
    app.presenters.blotter.trades$.subscribe(() => {}),
    app.presenters.analytics.position$.subscribe(() => {}),
    app.presenters.rfqs.rfqs$.subscribe(() => {}),
    app.presenters.dealers.list$.subscribe(() => {}),
    app.presenters.positions.positions$.subscribe(() => {}),
    app.presenters.ordersBlotter.orders$.subscribe(() => {}),
    app.presenters.eventLog.events$.subscribe(() => {}),
    app.presenters.sessions.sessions$.subscribe(() => {}),
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

interface TalliedPorts {
  readonly ports: AppPorts;
  /** Subscriptions to a port's streams that are open right now. */
  live(): number;
}

/** `ports` with every method that answers an Observable wrapped in a
 * subscribe / finalize counter. */
function createTalliedPorts(ports: AppPorts): TalliedPorts {
  let open = 0;

  function tally<T>(source$: Observable<T>): Observable<T> {
    return new Observable<T>((subscriber) => {
      open += 1;
      const inner = source$.subscribe(subscriber);

      return (): void => {
        open -= 1;
        inner.unsubscribe();
      };
    });
  }

  function wrapPort<P extends object>(port: P): P {
    return new Proxy(port, {
      get: (target: P, key: string | symbol): unknown => {
        const value: unknown = Reflect.get(target, key, target);

        if (typeof value !== "function") {
          return value;
        }

        return (...args: unknown[]): unknown => {
          const result: unknown = value.apply(target, args);
          return isObservable(result) ? tally(result) : result;
        };
      },
    });
  }

  const wrapped = Object.fromEntries(
    Object.entries(ports).map(([name, port]) => {
      return [
        name,
        typeof port === "object" && port !== null && !Array.isArray(port)
          ? wrapPort(port)
          : port,
      ];
    }),
  ) as unknown as AppPorts;

  return {
    ports: wrapped,
    live: () => {
      return open;
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
