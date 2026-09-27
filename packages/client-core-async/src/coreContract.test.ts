// packages/client-core-async/src/coreContract.test.ts
//
// The async core's runner for `@rtc/core-contract` — the ONE file in this
// package that executes the paradigm-neutral behavioural contract. It is the
// twin of `packages/client-core/src/composition.coreContract.test.ts`: same
// base `AppPorts` construction (domain simulators + in-memory stores), same
// suites, a different `createApp`/`createMachineFactories` pair and a
// different label.

import { NEVER } from "rxjs";

import {
  type AppPorts,
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-core";
import {
  type CoreHarness,
  describeCoreContract,
  type HarnessSeed,
  scriptPorts,
} from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { createApp, createMachineFactories } from "#/composition";

function createAsyncHarness(seed?: HarnessSeed): CoreHarness {
  const base: Omit<AppPorts, "connectionIntents"> = {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator({}),
      auth: new AuthSimulator({ demo: "pw" }),
      sessionStore: new InMemorySessionStore(),
    }),
    // No connection source of its own: `scriptPorts` supplies
    // `connectionIntents` and merges what the core pushes through it
    // (`commands.reconnect()`, `presenters.incident`'s intents) into the
    // stream the core observes, as a client's port builder does.
    connectionEvents: {
      events: () => {
        return NEVER;
      },
    },
  };
  const { ports, driver, teardown } = scriptPorts(base, seed);
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

describeCoreContract("async", createAsyncHarness);
