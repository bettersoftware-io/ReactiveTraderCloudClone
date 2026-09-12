// packages/client-core-async/src/coreContract.test.ts
//
// The async core's runner for `@rtc/core-contract` — the ONE file in this
// package that executes the paradigm-neutral behavioural contract. It is the
// twin of `packages/client-core/src/composition.coreContract.test.ts`: same
// base `AppPorts` construction (domain simulators + in-memory stores), same
// suites, a different `createApp`/`createMachineFactories` pair and a
// different label.

import {
  type AppPorts,
  createSimulatorPorts,
  InMemorySessionStore,
  reconnect$,
} from "@rtc/client-core";
import {
  type CoreHarness,
  describeCoreContract,
  scriptPorts,
} from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { createApp, createMachineFactories } from "#/composition";

function makeAsyncHarness(): CoreHarness {
  const base: AppPorts = {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator({}),
      auth: new AuthSimulator({ demo: "pw" }),
      sessionStore: new InMemorySessionStore(),
    }),
    // Mirrors the RxJS runner: the user-initiated reconnect intent is a
    // module-level Subject the browser port factories merge into
    // connectionEvents, so the harness merges it too — otherwise
    // `commands.reconnect()` would be unobservable.
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

describeCoreContract("async", makeAsyncHarness);
