import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
  reconnect$,
} from "@rtc/client-core";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { streamToStream } from "#/bridge/out";
import { composeWithBase } from "#/composition";

describe("composition teardown", () => {
  it("dispose() interrupts stream fibers forked into the app's scope", async () => {
    const { app, host } = composeWithBase(makePorts());
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
    const { app } = composeWithBase(makePorts());
    await expect(app.dispose()).resolves.toBeUndefined();
    await expect(app.dispose()).resolves.toBeUndefined();
  });
});

function makePorts(): Parameters<typeof composeWithBase>[0] {
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
