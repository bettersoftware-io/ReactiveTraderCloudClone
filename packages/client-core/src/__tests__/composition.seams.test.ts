import { firstValueFrom, type Observable, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EquityFillSignal } from "@rtc/core-api";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";
import type { JarvisEvent } from "@rtc/shared";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { JarvisPort } from "#/adapters/jarvisPort";
import { type AppPorts, createSimulatorPorts } from "#/adapters/portFactory";
import { createApp } from "#/composition";
import type { AnimationIntent } from "#/presenters/AnimationDirector";
import { createEqWorkspaceMachine } from "#/presenters/index";

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
