import { NEVER } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-core";
import type { App } from "@rtc/core-api";
import { scriptPorts } from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { createApp } from "#/composition";

// What every core promises of `dispose()` — no port stream stays subscribed,
// the transport gate is released, a second call resolves — is the
// `@rtc/core-contract` `dispose` suite, run by `coreContract.test.ts`. This
// file keeps what only this core's mechanism can show.
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
    // This suite never exercises reconnect/incident — inert is enough to
    // satisfy AppPorts now that TransportPorts omits both connectionEvents
    // and connectionIntents together (ADR-006 Follow-up 5).
    connectionIntents: {
      reconnect: () => {},
      injectIncident: () => {},
    },
  };
}

type Composed = {
  app: App;
  driver: ReturnType<typeof scriptPorts>["driver"];
  teardown: () => void;
};
