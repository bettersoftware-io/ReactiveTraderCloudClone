import type { Observable } from "rxjs";
import { firstValueFrom, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type AnimationIntent,
  createSimulatorPorts,
  InMemorySessionStore,
  type JarvisEvent,
  type JarvisPort,
  reconnect$,
} from "@rtc/client-core";
import type { AppPorts } from "@rtc/core-api";
import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { composeWithBase } from "#/composition";

describe("composeWithBase — core seams", () => {
  it("a Jarvis drive batch selecting a symbol lands on the app's NATIVE eqWorkspace, not the base's own", async () => {
    const { app, base } = composeWithBase(
      createPorts({ jarvis: createSelectingJarvisPort("MSFT") }),
    );

    try {
      const before = await firstValueFrom(base.presenters.eqWorkspace.state$);
      app.presenters.jarvis.intents.send("select MSFT");
      await settle();

      const afterApp = await firstValueFrom(app.presenters.eqWorkspace.state$);
      const afterBase = await firstValueFrom(
        base.presenters.eqWorkspace.state$,
      );
      expect(afterApp.sel).toBe("MSFT");
      expect(afterBase.sel).toBe(before.sel);
    } finally {
      await app.dispose();
    }
  });

  it("a fill placed through the NATIVE ordersBlotter.place reaches the base's own animationDirector", async () => {
    const orders$ = new Subject<EquityOrder>();
    const orders: OrderPort = {
      place: (): Observable<EquityOrder> => {
        return orders$;
      },
      cancel: (): Observable<void> => {
        return new Subject<void>();
      },
      orders: (): Observable<readonly EquityOrder[]> => {
        return of([]);
      },
    };
    const { app } = composeWithBase(createPorts({ orders }));

    try {
      const intents: AnimationIntent[] = [];
      const sub = app.presenters.animationDirector
        .intentsFor("ticket:AAPL")
        .subscribe((intent: AnimationIntent) => {
          intents.push(intent);
        });

      const placed = app.presenters.ordersBlotter
        .place(REQUEST)
        .subscribe(() => {});
      await settle();
      orders$.next(createFilledOrder());
      await settle();

      expect(intents).toEqual([{ target: "ticket:AAPL", kind: "fill" }]);
      sub.unsubscribe();
      placed.unsubscribe();
    } finally {
      await app.dispose();
    }
  });
});

const REQUEST: PlaceOrderRequest = {
  symbol: "AAPL",
  side: "buy",
  type: "market",
  qty: 100,
};

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

function createPorts(overrides: Partial<AppPorts>): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({}),
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

/** A JarvisPort whose ask() replies with one drive batch selecting `symbol`
 * in the equities workspace — copied from
 * `packages/client-core/src/__tests__/composition.seams.test.ts` (test
 * files may not import across packages' test trees). */
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

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}
