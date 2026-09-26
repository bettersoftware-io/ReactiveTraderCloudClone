import { Effect, Stream } from "effect";
import { Observable } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
  reconnect$,
} from "@rtc/client-core";
import type { AppPorts, StoredSession } from "@rtc/core-api";
import {
  countInto,
  createTally,
  EURUSD,
  type SubscriptionTally,
  scriptPorts,
} from "@rtc/core-contract";
import {
  AuthSimulator,
  type CurrencyPair,
  PreferencesSimulator,
  ROSTER,
} from "@rtc/domain";

import { streamToStream } from "#/bridge/out";
import { type ComposedApp, composeApp } from "#/composition";

describe("composition teardown", () => {
  it("releases every port subscription it holds on dispose, with no base app behind it", async () => {
    const counted = createCountingSimulatorPorts();
    const { app } = composeApp(counted.ports);
    const sub = app.presenters.priceStream.price$(EURUSD).subscribe(() => {});
    sub.unsubscribe();
    // A positive witness first: composition holds SOME port stream open,
    // so a zero after dispose() is a release, not a counter nobody fed.
    expect(counted.liveSubscriptions()).toBeGreaterThan(0);
    await app.dispose();
    expect(counted.liveSubscriptions()).toBe(0);
  });

  it("dispose() releases the transport gate: a later sign-out does not disconnect", async () => {
    const { ports, driver, teardown } = scriptPorts(createPorts(), {
      transport: true,
      session: createStoredSession(),
    });
    const { app } = composeApp(ports);

    try {
      expect(driver.transportCalls()).toEqual(["connect"]);
      await app.dispose();
      app.presenters.auth.logout();
      expect(driver.transportCalls()).toEqual(["connect"]);
    } finally {
      teardown();
    }
  });

  it("dispose() interrupts stream fibers forked into the app's scope", async () => {
    const { app, host } = composeApp(createPorts());
    let interrupted = false;
    const never = Stream.fromEffect(
      Effect.never.pipe(
        Effect.onInterrupt(() => {
          return Effect.sync(() => {
            interrupted = true;
          });
        }),
      ),
    );

    streamToStream(host, never).subscribe(() => {});
    await tick();
    expect(interrupted).toBe(false);

    await app.dispose();
    await tick();
    expect(interrupted).toBe(true);
  });

  it("dispose() resolves when called twice", async () => {
    const { app } = composeApp(createPorts());
    await expect(app.dispose()).resolves.toBeUndefined();
    await expect(app.dispose()).resolves.toBeUndefined();
  });

  it("dispose() closes the host scope: a retained singleton's port is released", async () => {
    // Counted rather than probed with `observed`: the count is the whole
    // witness. This core's own `NarratorMachine` (in the Jarvis family)
    // reads `pairs$` from construction, so the retained singleton holds the
    // port from composition on — one subscription.
    let subscribers = 0;
    const roster = new Observable<readonly CurrencyPair[]>(() => {
      subscribers += 1;

      return (): void => {
        subscribers -= 1;
      };
    });

    const { app } = composeApp({
      ...createPorts(),
      referenceData: {
        getCurrencyPairs: () => {
          return roster;
        },
      },
    });
    await tick();
    expect(subscribers).toBe(1);
    const sub = app.presenters.currencyPairs.pairs$.subscribe(() => {});
    await tick();
    expect(subscribers).toBe(1);
    // Retained: the last unsubscribe does NOT end the period …
    sub.unsubscribe();
    await tick();
    expect(subscribers).toBe(1);
    // … only the host scope does.
    await app.dispose();
    await tick();
    expect(subscribers).toBe(0);
  });

  it("an intent on a workspace singleton after dispose() is a silent no-op (ruling 13)", async () => {
    const { app } = composeApp(createPorts());
    await app.dispose();
    await tick();

    // The behavioural promise: a late click — a panel still mounted while
    // the app tears down — must not throw at the caller.
    //
    // MEASURED which mechanism carries it, by swapping `createChildHost`'s
    // runner for the parent's `ManagedRuntime` and re-running: this case
    // stays GREEN. `app.dispose()` closes the host scope before disposing
    // the runtime, and the child scope's finalizer marks the machine
    // disposed, so the intent is refused at that guard and never reaches a
    // runtime at all. The DEFAULT runtime is the second line of defence,
    // for an intent that arrives before the finalizer has run; the witness
    // for THAT is `bridge/out.test.ts`'s "createChildHost() still runs an
    // effect after the parent ManagedRuntime is disposed", which the same
    // swap turns red.
    expect(() => {
      app.presenters.eqWorkspace.intents.select("MSFT");
    }).not.toThrow();
    expect(() => {
      app.presenters.eqDrawings.intents.setTool("hline");
    }).not.toThrow();
    await tick();
  });

  it("ONE runSync: composeApp builds the whole Layer graph without an async boundary", async () => {
    // An async Layer build would surface here as `runSync` throwing
    // `AsyncFiberException` — the witness that the graph stays synchronous.
    let composed: ComposedApp | null = null;
    expect(() => {
      composed = composeApp(createPorts());
    }).not.toThrow();
    await (composed as ComposedApp | null)?.app.dispose();
  });
});

function createPorts(): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({ demo: "demo" }),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: {
      events: () => {
        return reconnect$;
      },
    },
  };
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function createStoredSession(): StoredSession {
  const [first] = ROSTER;

  return {
    token: "t",
    user: first.user,
    username: first.username,
    exp: Date.now() + 3_600_000,
  };
}

interface CountingPorts {
  ports: AppPorts;
  /** Subscriptions currently open on ANY stream ANY port method returned. */
  liveSubscriptions(): number;
}

/** The simulator ports with every stream a port method returns counted into
 * one tally — whoever subscribes (a native member, or anything composed
 * behind it) shows up in `liveSubscriptions()`. */
function createCountingSimulatorPorts(): CountingPorts {
  const tally = createTally();
  const base = createPorts();
  const ports = Object.fromEntries(
    Object.entries(base).map(([name, port]) => {
      return [name, countEveryStream(port, tally)];
    }),
  ) as unknown as AppPorts;

  return {
    ports,
    liveSubscriptions: () => {
      return tally.live;
    },
  };
}

/** `port` with each method's Observable result counted into `tally`. A
 * Proxy, so prototype methods (the simulators') are wrapped too; non-object
 * members (and arrays such as `metricControls`) pass through. */
function countEveryStream(port: unknown, tally: SubscriptionTally): unknown {
  if (typeof port !== "object" || port === null || Array.isArray(port)) {
    return port;
  }

  return new Proxy(port, {
    get: (target: object, property: string | symbol): unknown => {
      const member: unknown = Reflect.get(target, property, target);

      if (typeof member !== "function") {
        return member;
      }

      return (...args: unknown[]): unknown => {
        const result: unknown = Reflect.apply(member, target, args);

        return isStream(result) ? countInto(result, tally) : result;
      };
    },
  });
}

function isStream(value: unknown): value is Observable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "subscribe" in value &&
    typeof value.subscribe === "function"
  );
}
