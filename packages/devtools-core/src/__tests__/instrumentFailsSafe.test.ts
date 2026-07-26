import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import { instrumentMachineFactories } from "../instrument/machines";
import { instrumentPresenters } from "../instrument/presenters";

// The whole devtools design rests on one promise: instrumentation is
// transparent to the app. These branches are where that promise is kept —
// every one of them is a `catch` or a type guard whose failure would surface as
// a broken APP, not a broken inspector. Nothing else in the suite reaches them.

describe("instrumentMachineFactories — failure is transparent", () => {
  it("hands back the raw machine when the hub throws on registration", () => {
    const hub = new DevtoolsHub();
    const boom = vi.spyOn(hub, "machineCreated").mockImplementation(() => {
      throw new Error("hub is broken");
    });
    const submit = vi.fn();

    const wrapped = instrumentMachineFactories(
      {
        orderTicket: (_symbol: string) => {
          return {
            state$: new BehaviorSubject({ ok: true }),
            intents: { submit },
            dispose: () => {},
          };
        },
      },
      hub,
    );

    const machine = wrapped.orderTicket("AAPL");

    // A throwing hub must not take the app's machine with it.
    expect(boom).toHaveBeenCalled();
    machine.intents.submit("arg");
    expect(submit).toHaveBeenCalledWith("arg");
  });

  it("passes a non-function intent through untouched", () => {
    const hub = new DevtoolsHub();
    const notAFunction = { nested: "value" };

    const wrapped = instrumentMachineFactories(
      {
        orderTicket: (_symbol: string) => {
          return {
            state$: new BehaviorSubject({}),
            intents: { submit: vi.fn(), config: notAFunction },
            dispose: () => {},
          };
        },
      },
      hub,
    );

    // Wrapping a non-callable would turn a data field into a broken thunk.
    expect(wrapped.orderTicket("AAPL").intents.config).toBe(notAFunction);
  });
});

describe("instrumentPresenters — hostile shapes", () => {
  it("falls back to an arity label when the args cannot be stringified", () => {
    const hub = new DevtoolsHub();
    const registerStream = vi.spyOn(hub, "registerStream");
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    const instrumented = instrumentPresenters(
      {
        prices: {
          price$: (_arg: unknown) => {
            return new BehaviorSubject(1);
          },
        },
      },
      { prices: { methods: ["price$"] } },
      hub,
    );

    instrumented.prices.price$(circular);

    // JSON.stringify throws on a cycle; without the catch, calling a presenter
    // with a self-referencing argument would throw inside the APP.
    expect(registerStream).toHaveBeenCalled();
  });

  it("skips manifest entries whose presenter member is not an object", () => {
    const hub = new DevtoolsHub();

    const instrumented = instrumentPresenters(
      { notAPresenter: 42 as unknown as object },
      { notAPresenter: { props: ["anything$"] } },
      hub,
    );

    expect(instrumented.notAPresenter).toBe(42);
  });
});
