import { firstValueFrom, from, NEVER, Observable, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type {
  EquityFillSignal,
  ExecutionOutcome,
  Presenters,
} from "@rtc/core-api";
import { createPrice, createQuote, EURUSD } from "@rtc/core-contract";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  ConnectionStatus,
  type CurrencyPair,
  DRIVE_STAGGER_MS,
  type EquityInstrument,
  ExecutionStatus,
  type MarketDataPort,
  PreferencesSimulator,
  type Price,
  type RfqEvent,
  WORKSPACE_PERSIST_DEBOUNCE_MS,
} from "@rtc/domain";
import type { DriveBatchV1, JarvisEvent, PanelSpecV1 } from "@rtc/shared";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { JarvisPort } from "#/adapters/jarvisPort";
import { type AppPorts, createSimulatorPorts } from "#/adapters/portFactory";
import { type CoreSeams, createApp, type WorkspaceSeam } from "#/composition";
import { createDefaultLayoutPort } from "#/layout/defaultLayoutPort";
import type { AnimationIntent } from "#/presenters/AnimationDirector";
import {
  createEqWorkspaceMachine,
  createLayoutMachine,
  createWorkspaceNavMachine,
} from "#/presenters/index";

describe("createApp — core seams (strangler phase)", () => {
  it("a supplied eqWorkspace is the one a Jarvis drive batch mutates; the app's own stays where it was", async () => {
    const seam = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    const { presenters } = createApp(
      createPorts({ jarvis: createSelectingJarvisPort("MSFT") }),
      { eqWorkspace: seam },
    );
    const before = await firstValueFrom(presenters.eqWorkspace.state$);

    presenters.jarvis.intents.send("select MSFT");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect((await firstValueFrom(seam.state$)).sel).toBe("MSFT");
    expect((await firstValueFrom(presenters.eqWorkspace.state$)).sel).toBe(
      before.sel,
    );
    presenters.jarvis.dispose();
    seam.dispose();
  });

  it("with no seam the drive batch mutates the app's own eqWorkspace, as before", async () => {
    const { presenters } = createApp(
      createPorts({ jarvis: createSelectingJarvisPort("MSFT") }),
    );

    presenters.jarvis.intents.send("select MSFT");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect((await firstValueFrom(presenters.eqWorkspace.state$)).sel).toBe(
      "MSFT",
    );
    presenters.jarvis.dispose();
  });

  it("a supplied workspaceNav is the one a Jarvis switchTab mutates; the app's own stays on fx", async () => {
    const seam = createWorkspaceNavMachine();
    const { presenters } = createApp(
      createPorts({ jarvis: createSwitchingJarvisPort("credit") }),
      { workspaceNav: seam },
    );

    presenters.jarvis.intents.send("go to credit");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect((await firstValueFrom(seam.state$)).activeTab).toBe("credit");
    expect(
      (await firstValueFrom(presenters.workspaceNav.state$)).activeTab,
    ).toBe("fx");
    presenters.jarvis.dispose();
    seam.dispose();
  });

  it("a panel docked after the seam nav moved docks into the SEAM's active tab, not the app's own", async () => {
    const seam = createWorkspaceNavMachine();
    const { presenters } = createApp(
      createPorts({ jarvis: createSpawningJarvisPort("jarvis-1") }),
      { workspaceNav: seam },
    );
    seam.intents.switchTab("credit");
    presenters.jarvis.intents.send("spawn a panel");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    presenters.dockPanel("jarvis-1");

    expect(
      await firstValueFrom(presenters.dockedPanelIdsFor("credit")),
    ).toEqual(["jarvis-1"]);
    expect(await firstValueFrom(presenters.dockedPanelIdsFor("fx"))).toEqual(
      [],
    );
    presenters.jarvis.dispose();
    seam.dispose();
  });

  it("with no workspaceNav seam the switchTab mutates the app's own nav, as before", async () => {
    const { presenters } = createApp(
      createPorts({ jarvis: createSwitchingJarvisPort("credit") }),
    );

    presenters.jarvis.intents.send("go to credit");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(
      (await firstValueFrom(presenters.workspaceNav.state$)).activeTab,
    ).toBe("credit");
    presenters.jarvis.dispose();
  });

  it("a supplied workspace factory gets the app's Jarvis events, and the driver drives the workspace it returns", async () => {
    const received: JarvisEvent[] = [];
    const seam = createFakeWorkspaceSeam();
    const { presenters } = createApp(
      createPorts({
        jarvis: createCommandingJarvisPort([
          { kind: "layout", op: "maximize", tab: "fx", panelId: "fx-rates" },
          { kind: "dockPanel", panelId: "jarvis-1" },
        ]),
      }),
      {
        workspace: (jarvisEvents$: Observable<JarvisEvent>): WorkspaceSeam => {
          jarvisEvents$.subscribe((event) => {
            received.push(event);
          });
          return seam.workspace;
        },
      },
    );

    presenters.jarvis.intents.send("arrange my desk");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2 * DRIVE_STAGGER_MS + 100);
    });

    expect(
      received.some((event) => {
        return event.type === "command";
      }),
    ).toBe(true);
    expect(
      (await firstValueFrom(seam.workspace.layoutFor("fx").state$)).maximized,
    ).toBe("fx-rates");
    expect(seam.docked).toEqual(["jarvis-1"]);
    expect(
      (await firstValueFrom(presenters.layoutFor("fx").state$)).maximized,
    ).toBeNull();
    presenters.jarvis.dispose();
  });

  it("with a workspace seam the app's own workspace stays idle: no panels folded, no workspace write", async () => {
    const seam = createFakeWorkspaceSeam();
    const ports = createPorts({
      jarvis: createSpawningJarvisPort("jarvis-1"),
    });

    const { presenters } = createApp(ports, {
      workspace: () => {
        return seam.workspace;
      },
    });

    presenters.jarvis.intents.send("spawn a panel");
    presenters.layoutFor("fx").intents.maximize("fx-rates");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, WORKSPACE_PERSIST_DEBOUNCE_MS + 150);
    });

    expect(await firstValueFrom(presenters.jarvisPanels.panels$)).toEqual([]);
    expect(await firstValueFrom(ports.preferences.workspaceLayout$())).toBe(
      null,
    );
    presenters.jarvis.dispose();
  });

  it("with a workspace seam the app's own panels restore nothing from a stored docked payload", async () => {
    const seedPorts = createPorts({
      jarvis: createSpawningJarvisPort("jarvis-1"),
    });
    const seedApp = createApp(seedPorts);
    seedApp.presenters.jarvis.intents.send("spawn a panel");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    seedApp.presenters.dockPanel("jarvis-1");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, WORKSPACE_PERSIST_DEBOUNCE_MS + 150);
    });
    const stored = await firstValueFrom(
      seedPorts.preferences.workspaceLayout$(),
    );
    expect(stored).toContain("jarvis-1");
    seedApp.presenters.jarvis.dispose();

    const preferences = new PreferencesSimulator();
    preferences.setWorkspaceLayout(stored);
    const unseamed = createApp(createPorts({ preferences }));
    expect(
      (await firstValueFrom(unseamed.presenters.jarvisPanels.panels$)).map(
        (row) => {
          return row.panelId;
        },
      ),
    ).toEqual(["jarvis-1"]);

    const seam = createFakeWorkspaceSeam();
    const seamed = createApp(createPorts({ preferences }), {
      workspace: () => {
        return seam.workspace;
      },
    });
    expect(
      await firstValueFrom(seamed.presenters.jarvisPanels.panels$),
    ).toEqual([]);
  });

  it("with no workspace seam the same layout change IS written — the idle check above is not vacuous", async () => {
    const ports = createPorts({});
    const { presenters } = createApp(ports);

    presenters.layoutFor("fx").intents.maximize("fx-rates");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, WORKSPACE_PERSIST_DEBOUNCE_MS + 150);
    });

    expect(await firstValueFrom(ports.preferences.workspaceLayout$())).not.toBe(
      null,
    );
  });

  it("with nativeJarvis the app's own Jarvis family never reaches the wire: no availability request, no history source, no narration ask, no workspace write", async () => {
    const rig = createStandDownRig({ nativeJarvis: true });

    rig.pushAnomaly();
    rig.presenters.layoutFor("fx").intents.maximize("fx-rates");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, WORKSPACE_PERSIST_DEBOUNCE_MS + 150);
    });

    expect(rig.calls).toEqual({ ask: 0, availability: 0, history: 0 });
    expect(await firstValueFrom(rig.ports.preferences.workspaceLayout$())).toBe(
      null,
    );
    rig.presenters.jarvis.dispose();
  });

  it("with nativeJarvis a turn through the app's own jarvis spawns no panel and drives nothing — its folds read no events", async () => {
    const spawning = createPorts({
      jarvis: createSpawningJarvisPort("jarvis-1"),
    });

    const commanding = createPorts({
      jarvis: createCommandingJarvisPort([
        { kind: "switchTab", tab: "credit" },
      ]),
    });
    const spawner = createApp(spawning, { nativeJarvis: true });
    const driver = createApp(commanding, { nativeJarvis: true });

    spawner.presenters.jarvis.intents.send("spawn a panel");
    driver.presenters.jarvis.intents.send("go to credit");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(
      await firstValueFrom(spawner.presenters.jarvisPanels.panels$),
    ).toEqual([]);
    expect(
      (await firstValueFrom(driver.presenters.jarvisDriver.state$)).lastBatch,
    ).toEqual([]);
    spawner.presenters.jarvis.dispose();
    driver.presenters.jarvis.dispose();
  });

  it("without nativeJarvis the same app DOES reach the wire — the stand-down check above is not vacuous", async () => {
    const rig = createStandDownRig({});

    rig.pushAnomaly();
    rig.presenters.layoutFor("fx").intents.maximize("fx-rates");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, WORKSPACE_PERSIST_DEBOUNCE_MS + 150);
    });

    expect(rig.calls).toEqual({ ask: 1, availability: 1, history: 1 });
    expect(
      await firstValueFrom(rig.ports.preferences.workspaceLayout$()),
    ).not.toBe(null);
    rig.presenters.jarvis.dispose();
  });

  it("a supplied equityFills$ drives the ticket fill intent", () => {
    const fills$ = new Subject<EquityFillSignal>();
    const { presenters } = createApp(createPorts({}), { equityFills$: fills$ });
    const intents: AnimationIntent[] = [];
    const sub = presenters.animationDirector
      .intentsFor("ticket:AAPL")
      .subscribe((intent) => {
        intents.push(intent);
      });

    fills$.next({ symbol: "AAPL" });

    expect(intents).toEqual([{ target: "ticket:AAPL", kind: "fill" }]);
    sub.unsubscribe();
  });

  it("every other AnimationDirector source is a seam too: a supplied executions$, rfqEvents$ and connectionStatus$ each drive their intent", () => {
    const executions$ = new Subject<ExecutionOutcome>();
    const rfqEvents$ = new Subject<RfqEvent>();
    const connectionStatus$ = new Subject<ConnectionStatus>();
    const { presenters } = createApp(createPorts({}), {
      executions$,
      rfqEvents$,
      connectionStatus$,
    });
    const intents: AnimationIntent[] = [];
    const subs = ["tile:EURUSD", "rfq:7", "banner:connection"].map((target) => {
      return presenters.animationDirector
        .intentsFor(target)
        .subscribe((intent) => {
          // The simulator's own ticks land on the tile target as well.
          if (intent.kind !== "tickUp" && intent.kind !== "tickDown") {
            intents.push(intent);
          }
        });
    });

    executions$.next({ symbol: "EURUSD", status: ExecutionStatus.Done });
    rfqEvents$.next({
      type: "quoteAccepted",
      payload: createQuote({ rfqId: 7 }),
    });
    // The director skips the replayed CURRENT status and animates changes.
    connectionStatus$.next(ConnectionStatus.CONNECTED);
    connectionStatus$.next(ConnectionStatus.DISCONNECTED);

    expect(intents).toEqual([
      { target: "tile:EURUSD", kind: "fill" },
      { target: "rfq:7", kind: "fill" },
      { target: "banner:connection", kind: "connectionChange" },
    ]);

    for (const sub of subs) {
      sub.unsubscribe();
    }
  });

  it("with pairs$, priceFor and watchlist$ supplied, this app's own readers open none of those three ports", async () => {
    const opened = { pairs: 0, prices: 0, watchlist: 0 };
    const simulated = createPorts({});
    const prices$ = new Subject<Price>();
    const { presenters } = createApp(
      {
        ...simulated,
        referenceData: {
          getCurrencyPairs: () => {
            return new Observable<readonly CurrencyPair[]>(() => {
              opened.pairs += 1;
            });
          },
        },
        pricing: {
          getPriceUpdates: () => {
            return new Observable<never>(() => {
              opened.prices += 1;
            });
          },
          getPriceHistory: () => {
            return NEVER;
          },
          getRfqQuote: () => {
            return NEVER;
          },
        },
        marketData: new Proxy(simulated.marketData, {
          get: (target: MarketDataPort, property: string | symbol): unknown => {
            if (property === "watchlist") {
              return () => {
                return new Observable<readonly EquityInstrument[]>(() => {
                  opened.watchlist += 1;
                });
              };
            }

            const member: unknown = Reflect.get(target, property, target);
            return typeof member === "function" ? member.bind(target) : member;
          },
        }),
      },
      {
        pairs$: of([EURUSD]),
        priceFor: () => {
          return prices$;
        },
        watchlist$: of([MSFT_INSTRUMENT]),
      },
    );
    const ticks: AnimationIntent[] = [];
    const sub = presenters.animationDirector
      .intentsFor("tile:EURUSD")
      .subscribe((intent) => {
        ticks.push(intent);
      });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    prices$.next(createPrice("EURUSD", 1.1));
    prices$.next(createPrice("EURUSD", 1.2));

    expect(ticks).toEqual([{ target: "tile:EURUSD", kind: "tickUp" }]);
    // Seeded from the SUPPLIED roster, synchronously, at composition.
    expect((await firstValueFrom(presenters.eqWorkspace.state$)).sel).toBe(
      "MSFT",
    );
    expect(opened).toEqual({ pairs: 0, prices: 0, watchlist: 0 });
    sub.unsubscribe();
    presenters.jarvis.dispose();
  });
});

interface StandDownCalls {
  ask: number;
  availability: number;
  history: number;
}

interface StandDownRig {
  readonly ports: AppPorts;
  readonly presenters: Presenters;
  readonly calls: StandDownCalls;
  /** A jittered baseline long enough to fill the detector, then one spread
   * spike — one anomaly under `STAND_DOWN_NARRATOR_CONFIG`. */
  readonly pushAnomaly: () => void;
}

/** An app over a jarvis port that counts every wire-facing call, with the
 * narrator switched on and a tiny detector window, reading prices from a
 * supplied `priceFor` seam the rig drives. */
function createStandDownRig(extraSeams: CoreSeams): StandDownRig {
  const calls: StandDownCalls = { ask: 0, availability: 0, history: 0 };
  const prices$ = new Subject<Price>();
  const ports = createPorts({
    preferences: new PreferencesSimulator({ jarvisNarrator: "on" }),
    narratorConfig: STAND_DOWN_NARRATOR_CONFIG,
    jarvis: {
      ask: () => {
        calls.ask += 1;
        return NEVER;
      },
      confirm: () => {
        // unused by these tests
      },
      availability$: () => {
        calls.availability += 1;
        return NEVER;
      },
      setHistorySource: () => {
        calls.history += 1;
      },
    },
  });

  const { presenters } = createApp(ports, {
    ...extraSeams,
    pairs$: of([EURUSD]),
    priceFor: () => {
      return prices$;
    },
  });

  return {
    ports,
    presenters,
    calls,
    pushAnomaly: () => {
      for (let i = 0; i < STAND_DOWN_NARRATOR_CONFIG.minWindowFill; i++) {
        const halfSpread = i % 2 === 0 ? 0.00009 : 0.00011;
        prices$.next(createSpreadPrice(halfSpread));
      }

      prices$.next(createSpreadPrice(0.025));
    },
  };
}

const STAND_DOWN_NARRATOR_CONFIG = { windowSize: 8, minWindowFill: 4 };

function createSpreadPrice(halfSpread: number): Price {
  return {
    ...createPrice("EURUSD", 1.1),
    bid: 1.1 - halfSpread,
    ask: 1.1 + halfSpread,
  };
}

function createPorts(overrides: Partial<AppPorts>): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: new ConnectionEventsSimulator(),
    ...overrides,
  };
}

/** A JarvisPort whose ask() replies with one drive batch selecting `symbol`
 * in the equities workspace. */
function createSelectingJarvisPort(symbol: string): JarvisPort {
  return {
    ask: (): Observable<JarvisEvent> => {
      return of<JarvisEvent>({
        type: "command",
        batch: { v: 1, commands: [{ kind: "eqSelect", symbol }] },
      });
    },
    confirm: (): void => {
      // unused by these tests
    },
  };
}

/** A JarvisPort whose ask() spawns one floating desk panel, `panelId`. */
function createSpawningJarvisPort(panelId: string): JarvisPort {
  return {
    ask: (): Observable<JarvisEvent> => {
      const turn: readonly JarvisEvent[] = [
        { type: "panel", panelId, spec: PANEL_SPEC },
        { type: "done" },
      ];
      return from(turn);
    },
    confirm: (): void => {
      // unused by these tests
    },
  };
}

const PANEL_SPEC: PanelSpecV1 = {
  v: 1,
  title: "P&L overview",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};

/** A JarvisPort whose ask() replies with one drive batch switching to
 * `tab`. */
function createSwitchingJarvisPort(
  tab: "fx" | "credit" | "equities",
): JarvisPort {
  return {
    ask: (): Observable<JarvisEvent> => {
      return of<JarvisEvent>({
        type: "command",
        batch: { v: 1, commands: [{ kind: "switchTab", tab }] },
      });
    },
    confirm: (): void => {
      // unused by these tests
    },
  };
}

const MSFT_INSTRUMENT: EquityInstrument = {
  symbol: "MSFT",
  name: "Microsoft",
  exchange: "NASDAQ",
};

/** A JarvisPort whose ask() replies with one drive batch of `commands`. */
function createCommandingJarvisPort(
  commands: DriveBatchV1["commands"],
): JarvisPort {
  return {
    ask: (): Observable<JarvisEvent> => {
      return of<JarvisEvent>({
        type: "command",
        batch: { v: 1, commands },
      });
    },
    confirm: (): void => {
      // unused by these tests
    },
  };
}

interface FakeWorkspaceSeam {
  readonly workspace: WorkspaceSeam;
  readonly docked: string[];
}

/** A stand-in native workspace: one real `fx` layout machine, a dock that
 * records its calls, and a roster that knows exactly `jarvis-1`. */
function createFakeWorkspaceSeam(): FakeWorkspaceSeam {
  const layout = createLayoutMachine(createDefaultLayoutPort("fx"));
  const docked: string[] = [];
  return {
    docked,
    workspace: {
      layoutFor: () => {
        return layout;
      },
      dockPanel: (panelId: string) => {
        docked.push(panelId);
        return true;
      },
      undockPanel: () => {
        // unused by these tests
      },
      dismissPanel: () => {
        // unused by these tests
      },
      livePanelIds$: of(["jarvis-1"]),
      dockedPanelIds$: of([]),
      detachedPanelIds: () => {
        return [];
      },
    },
  };
}
