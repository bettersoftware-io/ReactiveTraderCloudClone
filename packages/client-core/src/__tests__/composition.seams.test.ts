import { firstValueFrom, NEVER, Observable, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EquityFillSignal, ExecutionOutcome } from "@rtc/core-api";
import { createPrice, createQuote, EURUSD } from "@rtc/core-contract";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  ConnectionStatus,
  type CurrencyPair,
  type EquityInstrument,
  ExecutionStatus,
  type MarketDataPort,
  PreferencesSimulator,
  type Price,
  type RfqEvent,
} from "@rtc/domain";
import type { JarvisEvent } from "@rtc/shared";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { JarvisPort } from "#/adapters/jarvisPort";
import { type AppPorts, createSimulatorPorts } from "#/adapters/portFactory";
import { createApp } from "#/composition";
import type { AnimationIntent } from "#/presenters/AnimationDirector";
import {
  createEqWorkspaceMachine,
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
