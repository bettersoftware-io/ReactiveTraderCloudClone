import { Effect, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createSimulatorPorts,
  InMemorySessionStore,
  reconnect$,
} from "@rtc/client-core";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import {
  buildAppLayer,
  nativePresentersEffect,
  PowerSaverTag,
  PriceStreamTag,
} from "#/layers";
import { HostTag } from "#/services";

describe("buildAppLayer", () => {
  it("resolves every native presenter in ONE synchronous runSync, and priceStream gates on the SAME powerSaver instance the record exposes", () => {
    const runtime = ManagedRuntime.make(buildAppLayer(createPorts()));
    const { presenters, powerSaver, host } = runtime.runSync(
      Effect.all({
        presenters: nativePresentersEffect,
        powerSaver: PowerSaverTag,
        host: HostTag,
      }),
    );
    expect(presenters.powerSaver).toBe(powerSaver);
    expect(presenters.priceStream).toBe(runtime.runSync(PriceStreamTag));
    expect(Object.keys(presenters)).toHaveLength(22);
    expect(host.scope).toBeDefined();
    return runtime.dispose();
  });
});

/** `createSimulatorPorts` supplies the transport ports only — the
 * connection-event port is the app's own, as every runner builds it. */
function createPorts(): AppPorts {
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
