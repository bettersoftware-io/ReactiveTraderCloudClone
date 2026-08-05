import {
  firstValueFrom,
  type Observable,
  of,
  config as rxjsConfig,
} from "rxjs";
import { describe, expect, it } from "vitest";

import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";
import type { JarvisEvent } from "@rtc/shared";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { JarvisPort } from "#/adapters/jarvisPort";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { createApp, createMachineFactories } from "#/composition";

describe("composition — jarvis wiring", () => {
  it("app.presenters.jarvis starts with the greeting entry and the default skin", async () => {
    const { presenters } = createApp({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
    });

    const state = await firstValueFrom(presenters.jarvis.state$);

    expect(state.entries.length).toBe(1);
    expect(state.skin).toBe("singularity");

    presenters.jarvis.dispose();
  });

  it("intents.setSkin round-trips through the preferences port", async () => {
    const preferences = new PreferencesSimulator();
    const { presenters } = createApp({
      ...createSimulatorPorts({
        preferences,
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
    });

    presenters.jarvis.intents.setSkin("reactor");

    const state = await firstValueFrom(presenters.jarvis.state$);
    expect(state.skin).toBe("reactor");
    expect(await firstValueFrom(preferences.jarvisSkin$())).toBe("reactor");

    presenters.jarvis.dispose();
  });

  it("a jarvis.events$ source error never surfaces on presenters.jarvisPanels.panels$ or presenters.jarvisDriver.state$ (the catchError guards composing jarvisPanels/jarvisDriver in composition.ts)", async () => {
    const { presenters } = createApp({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
      // A JarvisPort whose ask() throws synchronously — concatMap turns that
      // into a synchronous error on JarvisMachine's shared turnItems$, which
      // both presenters.jarvis.state$ AND presenters.jarvis.events$ derive
      // from. Without composition.ts's catchError guard on events$,
      // createJarvisPanelsMachine's/createJarvisDriverMachine's events$
      // input is TERMINAL on error (both machines' own doc), so this error
      // would kill panels$'s AND the driver's fold too.
      jarvis: explodingJarvisPort(),
    });

    let panelsErrored = false;
    const sub = presenters.jarvisPanels.panels$.subscribe({
      error: () => {
        panelsErrored = true;
      },
    });

    let driverErrored = false;
    const driverSub = presenters.jarvisDriver.state$.subscribe({
      error: () => {
        driverErrored = true;
      },
    });

    // JarvisMachine.ts's OWN `state$` warm subscription (createJarvisMachine,
    // outside this task's scope) has no error handler of its own, so the
    // SAME exploding ask() also trips a companion, pre-existing RxJS
    // "unhandled error" report — scheduled via a macrotask (RxJS's
    // `reportUnhandledError`), not synchronous, and NOT what this test is
    // pinning. Capture it deliberately (rather than let it become a stray
    // uncaught exception that fails the whole run) so this test's pass/fail
    // reflects only the composition.ts guards it's named for.
    const capturedUnhandledErrors: unknown[] = [];
    const originalOnUnhandledError = rxjsConfig.onUnhandledError;

    rxjsConfig.onUnhandledError = (err: unknown): void => {
      capturedUnhandledErrors.push(err);
    };

    try {
      presenters.jarvis.intents.send("hello, sir");

      expect(panelsErrored).toBe(false);
      expect(driverErrored).toBe(false);

      // Let the scheduled companion report (see above) land before
      // restoring the default handler.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(capturedUnhandledErrors).toHaveLength(1);
    } finally {
      rxjsConfig.onUnhandledError = originalOnUnhandledError;
    }

    sub.unsubscribe();
    driverSub.unsubscribe();
    presenters.jarvis.dispose();
  });

  // RESOLVED (Task 10): `jarvisDriver`'s `layout` dep is now
  // `Presenters.layoutFor`, a memoized per-tab singleton also exposed as
  // `createMachineFactories`'s `layout` field (composition.ts) — a "layout"
  // DriveCommand is therefore observable through the SAME instance the
  // mounted UI reads. `JarvisDriverDeps.layout`'s shape was unchanged by the
  // swap, per the Task 6 review's deferral note.
  it("a driven 'layout' command leaves the SAME tab's machine (read back through the composition-level machine factory) observably maximized", async () => {
    const { presenters } = createApp({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
      jarvis: layoutDrivingJarvisPort(),
    });

    presenters.jarvis.intents.send("maximize the equities chart");

    // The driver's batch-first command applies immediately, but still
    // through a REAL (non-virtual) scheduler here — give it a macrotask.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    const layout = createMachineFactories(presenters).layout("equities");
    const state = await firstValueFrom(layout.state$);

    expect(state.maximized).toBe("eq-chart");

    presenters.jarvis.dispose();
  });
});

function explodingJarvisPort(): JarvisPort {
  return {
    ask: (): Observable<JarvisEvent> => {
      throw new Error("boom — simulated ask() failure");
    },
    confirm: (): void => {
      // unused by this test
    },
  };
}

/** A JarvisPort whose ask() replies with a single "command" event driving a
 * `layout: maximize` DriveCommand at the equities tab's "eq-chart" panel —
 * used only by the deferral-artifact test above. */
function layoutDrivingJarvisPort(): JarvisPort {
  return {
    ask: (): Observable<JarvisEvent> => {
      return of<JarvisEvent>({
        type: "command",
        batch: {
          v: 1,
          commands: [
            {
              kind: "layout",
              op: "maximize",
              tab: "equities",
              panelId: "eq-chart",
            },
          ],
        },
      });
    },
    confirm: (): void => {
      // unused by this test
    },
  };
}
