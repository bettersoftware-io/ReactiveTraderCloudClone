// packages/client-core/src/composition.coreContract.test.ts
//
// The RxJS core's runner for `@rtc/core-contract` — the ONE file in this
// package that executes the paradigm-neutral behavioural contract. The
// suites themselves live in `@rtc/core-contract` and know nothing about
// this core; this file supplies the base `AppPorts` (domain simulators +
// in-memory stores, the same construction as `composition.dispose.test.ts`)
// and the factories under test. A second or third core gets a file exactly
// like this one and nothing else changes.

import {
  type CoreHarness,
  describeCoreContract,
  scriptPorts,
} from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { AppPorts } from "#/adapters/portFactory";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { createApp, createMachineFactories, reconnect$ } from "#/composition";

function makeRxjsHarness(): CoreHarness {
  const base: AppPorts = {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator({}),
      auth: new AuthSimulator({ demo: "pw" }),
      sessionStore: new InMemorySessionStore(),
    }),
    // The RxJS core's user-initiated reconnect intent is a module-level
    // Subject that the browser port factories merge into connectionEvents;
    // the harness mirrors that merge so `commands.reconnect()` is observable.
    connectionEvents: {
      events: () => {
        return reconnect$;
      },
    },
  };
  const { ports, driver, teardown } = scriptPorts(base);
  const app = createApp(ports);
  return {
    app,
    machines: createMachineFactories(app.presenters),
    driver,
    teardown: async () => {
      await app.dispose();
      teardown();
    },
  };
}

describeCoreContract("rxjs", makeRxjsHarness);
