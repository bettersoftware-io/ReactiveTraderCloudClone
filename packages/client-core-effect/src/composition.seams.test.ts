import { firstValueFrom, Observable, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createSimulatorPorts,
  InMemorySessionStore,
  type JarvisEvent,
  type JarvisPort,
  reconnect$,
} from "@rtc/client-core";
import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { composeWithBase } from "#/composition";

// `composeWithBase` builds the RxJS base app with `CoreSeams` pointing at
// THIS core's own workspace and fills. Without that, the base's Jarvis
// driver would mutate a workspace nothing renders and the base's animation
// director would never hear a fill placed through the native blotter —
// both invisible to the per-member contract, which only ever looks at one
// app's presenters.

describe("composeWithBase — core seams", () => {
  it("a Jarvis drive batch mutates THIS core's eqWorkspace, and the base's own stays where it was", async () => {
    const composed = composeWithBase(
      createPorts({ jarvis: createSelectingJarvisPort("MSFT") }),
    );

    try {
      const before = await firstValueFrom(
        composed.base.presenters.eqWorkspace.state$,
      );
      composed.app.presenters.jarvis.intents.send("select MSFT");
      await waitForDrive();
      expect(
        (await firstValueFrom(composed.app.presenters.eqWorkspace.state$)).sel,
      ).toBe("MSFT");
      expect(
        (await firstValueFrom(composed.base.presenters.eqWorkspace.state$)).sel,
      ).toBe(before.sel);
    } finally {
      await composed.app.dispose();
    }
  });

  it("the base animation director hears a fill placed through the NATIVE ordersBlotter", async () => {
    const scripted = createScriptedOrders();
    const composed = composeWithBase(createPorts({ orders: scripted.port }));

    try {
      const intents: unknown[] = [];
      const sub = composed.base.presenters.animationDirector
        .intentsFor("ticket:AAPL")
        .subscribe((intent: unknown) => {
          intents.push(intent);
        });

      const placed = composed.app.presenters.ordersBlotter
        .place(REQUEST)
        .subscribe(() => {});
      await settle();
      scripted.emit(createFilledOrder());
      await settle();
      expect(intents).toEqual([{ target: "ticket:AAPL", kind: "fill" }]);
      sub.unsubscribe();
      placed.unsubscribe();
    } finally {
      await composed.app.dispose();
    }
  });
});

const REQUEST: PlaceOrderRequest = {
  symbol: "AAPL",
  side: "buy",
  type: "market",
  qty: 100,
};

/** An `OrderPort` whose `place` lifecycle this test drives. Copied rather
 * than imported: a test file may not reach across another package's test
 * tree. */
interface ScriptedOrders {
  port: OrderPort;
  emit: (order: EquityOrder) => void;
}

function createScriptedOrders(): ScriptedOrders {
  const live: Subject<EquityOrder>[] = [];

  return {
    port: {
      place: (): Observable<EquityOrder> => {
        return new Observable<EquityOrder>((subscriber) => {
          const lifecycle = new Subject<EquityOrder>();
          live.push(lifecycle);
          const inner = lifecycle.subscribe(subscriber);

          return () => {
            inner.unsubscribe();
            const at = live.indexOf(lifecycle);

            if (at >= 0) {
              live.splice(at, 1);
            }
          };
        });
      },
      cancel: (): Observable<void> => {
        return of(undefined);
      },
      orders: (): Observable<readonly EquityOrder[]> => {
        return of<readonly EquityOrder[]>([]);
      },
    },
    emit: (order: EquityOrder) => {
      live[0]?.next(order);
    },
  };
}

function createFilledOrder(): EquityOrder {
  return {
    id: "ord-1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "filled",
    filledQty: 100,
    createdAt: 0,
  };
}

/** A `JarvisPort` whose `ask()` replies with one drive batch selecting
 * `symbol` in the equities workspace. */
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

function createPorts(overrides: Partial<AppPorts>): AppPorts {
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
    ...overrides,
  };
}

/** The Jarvis machine's reply pipeline runs on real timers (the scripted
 * brain's typed-reveal pacing), so this waits on the wall clock rather
 * than a scheduler turn. */
function waitForDrive(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 50);
  });
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 2; turn += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
