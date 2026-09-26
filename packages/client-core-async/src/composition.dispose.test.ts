import { BehaviorSubject, NEVER } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-core";
import type { App, StoredSession } from "@rtc/core-api";
import {
  countEveryPortStream,
  createTally,
  EURUSD,
  scriptPorts,
} from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator, ROSTER } from "@rtc/domain";

import { createApp } from "#/composition";

describe("createApp — app lifetime", () => {
  it("blotter.trades$ holds its port subscription across zero subscribers and is released by dispose()", async () => {
    const { app, driver, teardown } = createComposed();

    try {
      app.presenters.blotter.trades$.subscribe(() => {}).unsubscribe();
      // Warm across zero subscribers: the `retainUntil` signal, not the
      // refCount, is what holds the port.
      expect(driver.tradesObserved()).toBe(true);
      await app.dispose();
      expect(driver.tradesObserved()).toBe(false);
    } finally {
      teardown();
    }
  });

  it("dispose() releases the transport gate: a later sign-out does not disconnect", async () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts(), {
      transport: true,
      session: createStoredSession(),
    });
    const app = createApp(ports);

    try {
      expect(driver.transportCalls()).toEqual(["connect"]);
      await app.dispose();
      app.presenters.auth.logout();
      expect(driver.transportCalls()).toEqual(["connect"]);
    } finally {
      teardown();
    }
  });

  it("releases every port subscription it holds on dispose, with no base app behind it", async () => {
    const counted = createCountingSimulatorPorts();
    const app = createApp(counted.ports);
    const sub = app.presenters.priceStream.price$(EURUSD).subscribe(() => {});
    sub.unsubscribe();
    // A positive witness first: composition holds SOME port stream open,
    // so a zero after dispose() is a release, not a counter nobody fed.
    expect(counted.liveSubscriptions()).toBeGreaterThan(0);
    await app.dispose();
    expect(counted.liveSubscriptions()).toBe(0);
  });

  it("dispose() twice is safe", async () => {
    const { app, teardown } = createComposed();

    try {
      await app.dispose();
      await app.dispose();
    } finally {
      teardown();
    }
  });

  function createComposed(): Composed {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    return { app: createApp(ports), driver, teardown };
  }
});

function createBasePorts(): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator({}),
      auth: new AuthSimulator({ demo: "pw" }),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: {
      events: () => {
        return NEVER;
      },
    },
  };
}

type Composed = {
  app: App;
  driver: ReturnType<typeof scriptPorts>["driver"];
  teardown: () => void;
};

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

/** The simulator ports (plus a colour-scheme source, so the optional port is
 * counted too) with every stream a port method returns counted into one
 * tally. */
function createCountingSimulatorPorts(): CountingPorts {
  const tally = createTally();
  const ports = countEveryPortStream(
    {
      ...createBasePorts(),
      colorScheme: {
        prefersDark$: () => {
          return new BehaviorSubject(false);
        },
      },
    },
    tally,
  );

  return {
    ports,
    liveSubscriptions: () => {
      return tally.live;
    },
  };
}
