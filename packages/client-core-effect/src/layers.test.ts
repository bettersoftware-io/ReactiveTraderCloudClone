import { Effect, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createSimulatorPorts,
  InMemorySessionStore,
  reconnect$,
} from "@rtc/client-core";
import {
  AuthSimulator,
  type CurrencyPair,
  KNOWN_CURRENCY_PAIRS,
  type MarketDataPort,
  type PreferencesPort,
  PreferencesSimulator,
} from "@rtc/domain";

import { buildAppLayer, nativePresentersEffect } from "#/layers";
import { HostTag } from "#/services";

describe("buildAppLayer", () => {
  it("resolves every native presenter in ONE synchronous runSync, and builds PowerSaverLive and WatchlistLive exactly ONCE each for both the record and their dependents", () => {
    // `powerSaverLevel$()` is called once per `createPowerSaverPresenter`, at
    // construction — so its call count IS the number of `PowerSaverLive`
    // instances the build made. This is the witness the memoisation claim
    // needs: comparing `presenters.powerSaver` against `PowerSaverTag`
    // cannot fail, since both are read out of the same finished Context, and
    // a second instance built inside the `dependent` sub-graph would be
    // hidden behind its `Layer.provide` rather than showing up there.
    // `marketData.watchlist()` is the same witness for `WatchlistLive`,
    // which slice 4 puts in exactly that position: merged into the app AND
    // provided to `EqWorkspaceLive`, so `presenters.watchlist` has to be the
    // instance `eqWorkspace` seeded from.
    const counted = createCountingPreferences(new PreferencesSimulator({}));
    const ports = createCountingMarketData(createPorts(counted.preferences));
    const runtime = ManagedRuntime.make(buildAppLayer(ports.ports));

    // ONE runSync, and a synchronous one: an async Layer build would throw
    // `AsyncFiberException` out of this call.
    const { presenters, host } = runtime.runSync(
      Effect.all({ presenters: nativePresentersEffect, host: HostTag }),
    );
    expect(Object.keys(presenters)).toHaveLength(46);
    expect(host.scope).toBeDefined();
    expect(counted.powerSaverLevelCalls()).toBe(1);
    expect(ports.watchlistCalls()).toBe(1);
    // Opening a conflated fold subscribes the gate through `fromPort`, which
    // re-subscribes the Observable the ONE presenter captured rather than
    // calling the port again.
    const sub = presenters.priceStream?.price$(EURUSD).subscribe(() => {});
    expect(counted.powerSaverLevelCalls()).toBe(1);
    sub?.unsubscribe();
    return runtime.dispose();
  });
});

interface CountingPreferences {
  preferences: PreferencesPort;
  /** How many times the build has called `powerSaverLevel$()`. */
  powerSaverLevelCalls: () => number;
}

/** Count `powerSaverLevel$()` calls without losing the rest of the port. A
 * Proxy rather than a spread: a class port's methods live on its prototype,
 * which a spread drops. The count happens on INVOCATION, inside the wrapper,
 * so a property read that is never called does not register. */
function createCountingPreferences(base: PreferencesPort): CountingPreferences {
  let calls = 0;

  return {
    preferences: new Proxy(base, {
      get: (
        target: PreferencesPort,
        property: string | symbol,
        receiver: unknown,
      ) => {
        const value = Reflect.get(target, property, receiver);

        if (property === "powerSaverLevel$" && typeof value === "function") {
          return (...args: unknown[]): unknown => {
            calls += 1;
            return Reflect.apply(value, target, args);
          };
        }

        return value;
      },
    }),
    powerSaverLevelCalls: () => {
      return calls;
    },
  };
}

interface CountingMarketData {
  ports: AppPorts;
  /** How many times the build has called `marketData.watchlist()`. */
  watchlistCalls: () => number;
}

/** Count `marketData.watchlist()` calls without losing the rest of the
 * port — the same invocation-counting Proxy as the preferences one above. */
function createCountingMarketData(base: AppPorts): CountingMarketData {
  let calls = 0;

  return {
    ports: {
      ...base,
      marketData: new Proxy(base.marketData, {
        get: (
          target: MarketDataPort,
          property: string | symbol,
          receiver: unknown,
        ) => {
          const value = Reflect.get(target, property, receiver);

          if (property === "watchlist" && typeof value === "function") {
            return (...args: unknown[]): unknown => {
              calls += 1;
              return Reflect.apply(value, target, args);
            };
          }

          return value;
        },
      }),
    },
    watchlistCalls: () => {
      return calls;
    },
  };
}

/** `createSimulatorPorts` supplies the transport ports only — the
 * connection-event port is the app's own, as every runner builds it. */
function createPorts(preferences: PreferencesPort): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences,
      auth: new AuthSimulator({ demo: "pw" }),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: {
      events: () => {
        return reconnect$;
      },
    },
  };
}

function findPair(symbol: string): CurrencyPair {
  const pair = KNOWN_CURRENCY_PAIRS.find((candidate) => {
    return candidate.symbol === symbol;
  });

  if (pair === undefined) {
    throw new Error(`${symbol} is not a known currency pair`);
  }

  return pair;
}

const EURUSD = findPair("EURUSD");
