import type { Observable } from "rxjs";
import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import { instrumentMachineFactories } from "../instrument/machines";

describe("wrapped intents threaded to the hub", () => {
  it("stores the same (live) wrapped-intents object the app receives", () => {
    const hub = new DevtoolsHub();
    let capturedIntents: Readonly<Record<string, unknown>> | undefined;

    // Intercept the fourth machineCreated argument.
    const realMachineCreated = hub.machineCreated.bind(hub);

    hub.machineCreated = (
      kind: string,
      args: readonly unknown[],
      state$: Observable<unknown>,
      intents?: Readonly<Record<string, unknown>>,
    ): string => {
      capturedIntents = intents;

      return realMachineCreated(kind, args, state$, intents);
    };

    const state$ = new Subject<string>();
    const submitCalls: unknown[][] = [];
    const factories = {
      orderTicket: (_symbol: string) => {
        return {
          state$,
          intents: {
            submit: (...args: unknown[]): void => {
              submitCalls.push(args);
            },
          },
          dispose: (): void => {},
        };
      },
    };

    const machine = instrumentMachineFactories(factories, hub).orderTicket("A");

    // The hub captured the SAME object the app got back, and it is populated.
    expect(capturedIntents).toBe(machine.intents);
    expect(typeof (capturedIntents as Record<string, unknown>).submit).toBe(
      "function",
    );

    // Calling the hub-held reference runs the real intent.
    (capturedIntents as unknown as SubmitIntent).submit("via-hub");
    expect(submitCalls).toEqual([["via-hub"]]);
  });
});

interface SubmitIntent {
  submit: (a: string) => void;
}
