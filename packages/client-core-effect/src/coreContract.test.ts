// packages/client-core-effect/src/coreContract.test.ts
//
// The Effect-TS core's runner for `@rtc/core-contract` — the ONE file in this
// package that executes the paradigm-neutral behavioural contract. It is the
// twin of `packages/client-core/src/composition.coreContract.test.ts`: same
// base `AppPorts` construction (domain simulators + in-memory stores), same
// suites, a different `createApp`/`createMachineFactories` pair and a
// different label.

import { merge } from "rxjs";

import {
  type AppPorts,
  createSimulatorPorts,
  InMemorySessionStore,
  incident$,
  reconnect$,
} from "@rtc/client-core";
import {
  type CoreHarness,
  describeCoreContract,
  type HarnessSeed,
  scriptPorts,
} from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { createApp, createMachineFactories } from "#/composition";

function createEffectHarness(seed?: HarnessSeed): CoreHarness {
  const base: AppPorts = {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator({}),
      auth: new AuthSimulator({ demo: "pw" }),
      sessionStore: new InMemorySessionStore(),
    }),
    // Mirrors the RxJS runner: the user-initiated reconnect intent is a
    // module-level Subject the browser port factories merge into
    // connectionEvents, and the incident machine's connection-event sink,
    // which the browser port factories merge the same way, so the harness
    // merges both too — otherwise `commands.reconnect()` and
    // `presenters.incident`'s intents would be unobservable.
    connectionEvents: {
      events: () => {
        return merge(reconnect$, incident$);
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

describeCoreContract("effect", createEffectHarness);
