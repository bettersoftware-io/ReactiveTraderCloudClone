// packages/client-core/src/composition.coreContract.test.ts
//
// The RxJS core's runner for `@rtc/core-contract` — the ONE file in this
// package that executes the paradigm-neutral behavioural contract. The
// suites themselves live in `@rtc/core-contract` and know nothing about
// this core; this file supplies the base `AppPorts` (domain simulators +
// in-memory stores, the same construction as `composition.dispose.test.ts`)
// and the factories under test. A second or third core gets a file exactly
// like this one and nothing else changes.

import { NEVER } from "rxjs";

import {
  type CoreHarness,
  describeCoreContract,
  type HarnessSeed,
  scriptPorts,
} from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { AppPorts } from "#/adapters/portFactory";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { createApp, createMachineFactories } from "#/composition";

function createRxjsHarness(seed?: HarnessSeed): CoreHarness {
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

describeCoreContract("rxjs", createRxjsHarness);
