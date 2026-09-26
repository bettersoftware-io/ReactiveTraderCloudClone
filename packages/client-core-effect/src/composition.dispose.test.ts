import { Effect, Stream } from "effect";
import { NEVER, Observable } from "rxjs";
import { describe, expect, it } from "vitest";

import { createSimulatorPorts, InMemorySessionStore } from "@rtc/client-core";
import type { AppPorts } from "@rtc/core-api";
import {
  AuthSimulator,
  type CurrencyPair,
  PreferencesSimulator,
} from "@rtc/domain";

import { streamToStream } from "#/bridge/out";
import { type ComposedApp, composeApp } from "#/composition";

// What every core promises of `dispose()` — no port stream stays subscribed,
// the transport gate is released, a second call resolves — is the
// `@rtc/core-contract` `dispose` suite, run by `coreContract.test.ts`. This
// file keeps what only this core's mechanism can show.
describe("composition teardown", () => {
  it("dispose() interrupts stream fibers forked into the app's scope", async () => {
    const { app, host } = composeApp(createPorts());
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

  it("dispose() closes the host scope: a retained singleton's port is released", async () => {
    // Counted rather than probed with `observed`: the count is the whole
    // witness. This core's own `NarratorMachine` (in the Jarvis family)
    // reads `pairs$` from construction, so the retained singleton holds the
    // port from composition on — one subscription.
    let subscribers = 0;
    const roster = new Observable<readonly CurrencyPair[]>(() => {
      subscribers += 1;

      return (): void => {
        subscribers -= 1;
      };
    });

    const { app } = composeApp({
      ...createPorts(),
      referenceData: {
        getCurrencyPairs: () => {
          return roster;
        },
      },
    });
    await tick();
    expect(subscribers).toBe(1);
    const sub = app.presenters.currencyPairs.pairs$.subscribe(() => {});
    await tick();
    expect(subscribers).toBe(1);
    // Retained: the last unsubscribe does NOT end the period …
    sub.unsubscribe();
    await tick();
    expect(subscribers).toBe(1);
    // … only the host scope does.
    await app.dispose();
    await tick();
    expect(subscribers).toBe(0);
  });

  it("an intent on a workspace singleton after dispose() is a silent no-op (ruling 13)", async () => {
    const { app } = composeApp(createPorts());
    await app.dispose();
    await tick();

    // The behavioural promise: a late click — a panel still mounted while
    // the app tears down — must not throw at the caller.
    //
    // MEASURED which mechanism carries it, by swapping `createChildHost`'s
    // runner for the parent's `ManagedRuntime` and re-running: this case
    // stays GREEN. `app.dispose()` closes the host scope before disposing
    // the runtime, and the child scope's finalizer marks the machine
    // disposed, so the intent is refused at that guard and never reaches a
    // runtime at all. The DEFAULT runtime is the second line of defence,
    // for an intent that arrives before the finalizer has run; the witness
    // for THAT is `bridge/out.test.ts`'s "createChildHost() still runs an
    // effect after the parent ManagedRuntime is disposed", which the same
    // swap turns red.
    expect(() => {
      app.presenters.eqWorkspace.intents.select("MSFT");
    }).not.toThrow();
    expect(() => {
      app.presenters.eqDrawings.intents.setTool("hline");
    }).not.toThrow();
    await tick();
  });

  it("ONE runSync: composeApp builds the whole Layer graph without an async boundary", async () => {
    // An async Layer build would surface here as `runSync` throwing
    // `AsyncFiberException` — the witness that the graph stays synchronous.
    let composed: ComposedApp | null = null;
    expect(() => {
      composed = composeApp(createPorts());
    }).not.toThrow();
    await (composed as ComposedApp | null)?.app.dispose();
  });
});

function createPorts(): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({ demo: "demo" }),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: {
      events: () => {
        return NEVER;
      },
    },
  };
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
