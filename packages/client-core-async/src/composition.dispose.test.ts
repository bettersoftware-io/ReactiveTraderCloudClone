import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createSimulatorPorts,
  InMemorySessionStore,
  reconnect$,
} from "@rtc/client-core";
import type { StoredSession } from "@rtc/core-api";
import { scriptPorts } from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator, ROSTER } from "@rtc/domain";

import { composeWithBase } from "#/composition";

describe("composeWithBase — app lifetime", () => {
  // `currencyPairs` and `analytics` are deliberately NOT asserted here: the
  // RxJS BASE app this core still composes over subscribes both eagerly at
  // construction (the narrator machine and the AnimationDirector read
  // `pairs$` and `position$`), so the scripted port stays observed after
  // `app.dispose()` for a reason that has nothing to do with this core. The
  // release of those two is witnessed directly, without the base in the
  // way, in `src/presenters/warmSingletons.test.ts`.
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
    const { app } = composeWithBase(ports);

    try {
      expect(driver.transportCalls()).toEqual(["connect"]);
      await app.dispose();
      app.presenters.auth.logout();
      expect(driver.transportCalls()).toEqual(["connect"]);
    } finally {
      teardown();
    }
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
    return { app: composeWithBase(ports).app, driver, teardown };
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
        return reconnect$;
      },
    },
  };
}

type Composed = {
  app: ReturnType<typeof composeWithBase>["app"];
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
