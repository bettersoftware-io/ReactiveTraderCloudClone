import {
  firstValueFrom,
  type Observable,
  of,
  config as rxjsConfig,
} from "rxjs";
import { describe, expect, it, vi } from "vitest";

import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";
import type { JarvisEvent, PanelSpecV1 } from "@rtc/shared";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { JarvisAvailability, JarvisPort } from "#/adapters/jarvisPort";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { createApp, createMachineFactories } from "#/composition";
import { DRIVE_STAGGER_MS } from "#/presenters/JarvisDriverMachine";

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

  it("reads availability from any jarvis port that offers availability$, not only a WsJarvisAdapter", async () => {
    const sim = createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    });

    const jarvis = {
      ask: sim.jarvis.ask.bind(sim.jarvis),
      confirm: sim.jarvis.confirm.bind(sim.jarvis),
      availability$: (): Observable<JarvisAvailability> => {
        return of(createUnavailable());
      },
    };

    const { presenters } = createApp({
      ...sim,
      jarvis,
      connectionEvents: new ConnectionEventsSimulator(),
    });

    const state = await firstValueFrom(presenters.jarvis.state$);

    expect(state.available).toBe(false);

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
      jarvis: createExplodingJarvisPort(),
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
      jarvis: createLayoutDrivingJarvisPort(),
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

  // commands.reportDetachedPanels is the Dockview bridge's session-only
  // "these panels live outside the grid" channel; the driver reads it per
  // command and REFUSES maximize/collapse/expand on a detached panel, which
  // the transcript then explains. Proves the whole seam: command → registry
  // → driver → recordDriveOutcome fold, with the layout machine untouched.
  it("a driven 'layout' maximize on a panel reported detached is refused: the layout machine is untouched and the transcript says why", async () => {
    const { presenters, commands } = createApp({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
      jarvis: createLayoutDrivingJarvisPort(),
    });

    commands.reportDetachedPanels("equities", ["eq-chart"]);
    presenters.jarvis.intents.send("maximize the equities chart");

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    const layout = createMachineFactories(presenters).layout("equities");
    const layoutState = await firstValueFrom(layout.state$);
    expect(layoutState.maximized).toBeNull();

    const jarvisState = await firstValueFrom(presenters.jarvis.state$);
    expect(
      jarvisState.entries.some((entry) => {
        return (
          entry.text ===
          "can't maximize: eq-chart is floating or popped out — dock it first"
        );
      }),
    ).toBe(true);

    presenters.jarvis.dispose();
  });

  // Task 10 follow-up ruling: jarvisDriver.outcomes$ is wired into
  // jarvis.intents.recordDriveOutcome (composition.ts, right after
  // jarvisDriver is built) — proves the WHOLE seam end to end, not just
  // JarvisDriverMachine.test.ts's outcomes$ unit tests or
  // JarvisMachine.test.ts's recordDriveOutcome fold unit tests in isolation.
  it("a driven dock of a live panel whose id collides with a workspace panel is refused in the transcript, never reported applied", async () => {
    const { presenters } = createApp({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
      jarvis: createCollidingDockJarvisPort(),
    });

    presenters.jarvis.intents.send("dock the rates panel");

    // A batch's first command is applied on a zero-delay timer — still a
    // macrotask on the real scheduler at this composition level.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    const state = await firstValueFrom(presenters.jarvis.state$);

    expect(state.entries.at(-1)?.text).toBe(
      "can't dockPanel: fx-rates collides with a workspace panel id",
    );
    expect(await firstValueFrom(presenters.jarvisPanels.dockedPanels$)).toEqual(
      [],
    );

    presenters.jarvis.dispose();
  });

  it("a command batch through createApp yields 'drive: <kind>' transcript entries for APPLIED commands only", async () => {
    // Fake timers, installed before composition: the second command is
    // staggered DRIVE_STAGGER_MS behind the first, and on real timers a slow
    // runner could read the transcript before it had run — the absence of its
    // entry would then prove nothing. The driver's lastBatch below is the
    // positive witness that it DID run (and was skipped).
    vi.useFakeTimers();

    try {
      const { presenters } = createApp({
        ...createSimulatorPorts({
          preferences: new PreferencesSimulator(),
          auth: new AuthSimulator({}),
          sessionStore: new InMemorySessionStore(),
        }),
        connectionEvents: new ConnectionEventsSimulator(),
        jarvis: createMixedOutcomeDrivingJarvisPort(),
      });

      presenters.jarvis.intents.send("switch to equities and select ZZZZZZ");
      await vi.advanceTimersByTimeAsync(DRIVE_STAGGER_MS);

      const driver = await firstValueFrom(presenters.jarvisDriver.state$);
      expect(
        driver.lastBatch.map((outcome) => {
          return outcome.status;
        }),
      ).toEqual(["applied", "skipped"]);

      const state = await firstValueFrom(presenters.jarvis.state$);
      const driveEntryTexts = state.entries
        .filter((entry) => {
          return entry.text.startsWith("drive: ");
        })
        .map((entry) => {
          return entry.text;
        });

      expect(driveEntryTexts).toEqual(["drive: switchTab"]);

      presenters.jarvis.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

function createUnavailable(): JarvisAvailability {
  return { available: false, brains: [], defaultBrain: "scripted", gate: null };
}

/** Spawns a live desk panel whose id collides with the static "fx-rates"
 * panel, then drives a dock of it. */
function createCollidingDockJarvisPort(): JarvisPort {
  const spawn: JarvisEvent = {
    type: "panel",
    panelId: "fx-rates",
    spec: COLLIDING_PANEL_SPEC,
  };

  const dock: JarvisEvent = {
    type: "command",
    batch: { v: 1, commands: [{ kind: "dockPanel", panelId: "fx-rates" }] },
  };

  return {
    ask: (): Observable<JarvisEvent> => {
      return of(spawn, dock);
    },
    confirm: (): void => {
      // unused by this test
    },
  };
}

const COLLIDING_PANEL_SPEC: PanelSpecV1 = {
  v: 1,
  title: "Rates",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};

function createExplodingJarvisPort(): JarvisPort {
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
function createLayoutDrivingJarvisPort(): JarvisPort {
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

/** A JarvisPort whose ask() replies with a single "command" event driving a
 * two-command batch: an applied `switchTab` and a skipped `eqSelect`
 * (unknown symbol) — used only by the recordDriveOutcome wiring test above. */
function createMixedOutcomeDrivingJarvisPort(): JarvisPort {
  return {
    ask: (): Observable<JarvisEvent> => {
      return of<JarvisEvent>({
        type: "command",
        batch: {
          v: 1,
          commands: [
            { kind: "switchTab", tab: "equities" },
            { kind: "eqSelect", symbol: "ZZZZZZ" },
          ],
        },
      });
    },
    confirm: (): void => {
      // unused by this test
    },
  };
}
