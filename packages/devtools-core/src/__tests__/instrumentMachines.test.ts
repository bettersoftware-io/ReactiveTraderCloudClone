import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import type { InstrumentableMachine } from "../instrument/machines";
import { instrumentMachineFactories } from "../instrument/machines";

describe("instrumentMachineFactories", () => {
  it("returns same-shape factories whose machines still work", () => {
    const hub = new DevtoolsHub();
    const { factories, disposeSpy, submitSpy } = makeFactories();
    const wrapped = instrumentMachineFactories(factories, hub);
    const machine = wrapped.orderTicket("AAPL");
    machine.intents.submit("arg");
    expect(submitSpy).toHaveBeenCalledWith("arg");
    machine.dispose();
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it("registers lifecycle with the hub", () => {
    const hub = new DevtoolsHub();
    const created = vi.spyOn(hub, "machineCreated");
    const disposed = vi.spyOn(hub, "machineDisposed");
    const intent = vi.spyOn(hub, "machineIntent");
    const { factories } = makeFactories();
    const machine = instrumentMachineFactories(factories, hub).orderTicket(
      "AAPL",
    );
    expect(created).toHaveBeenCalledWith(
      "orderTicket",
      ["AAPL"],
      expect.anything(),
      expect.anything(),
    );
    machine.intents.submit();
    expect(intent).toHaveBeenCalledWith(expect.any(String), "submit", []);
    machine.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it("still delegates the intent when hub logging throws", () => {
    const hub = new DevtoolsHub();
    vi.spyOn(hub, "machineIntent").mockImplementation(() => {
      throw new Error("boom");
    });
    const { factories, submitSpy } = makeFactories();
    const machine = instrumentMachineFactories(factories, hub).orderTicket("A");
    expect(() => {
      return machine.intents.submit();
    }).not.toThrow();
    expect(submitSpy).toHaveBeenCalledOnce();
  });

  it("does not throw when a factory returns a machine whose .intents is undefined (misconfigured factory)", () => {
    const hub = new DevtoolsHub();
    const state$ = new BehaviorSubject({ phase: "editing" });
    const dispose = vi.fn();
    const factories = {
      // Structurally NOT a machine — `intents` is missing. `state$`/`dispose`
      // are present so `hub.machineCreated` succeeds and the intents loop is
      // reached and throws on `Object.entries(undefined)`.
      broken: (): InstrumentableMachine => {
        return { state$, dispose } as unknown as InstrumentableMachine;
      },
    };

    const wrapped = instrumentMachineFactories(factories, hub);

    let machine: InstrumentableMachine | undefined;
    expect(() => {
      machine = wrapped.broken();
    }).not.toThrow();

    // Falls back to the raw, unwrapped machine rather than crashing the
    // composition root.
    expect(machine?.state$).toBe(state$);
  });
});

interface OrderTicketState {
  symbol: string;
  phase: string;
}

interface OrderTicketMachine {
  state$: BehaviorSubject<OrderTicketState>;
  intents: { submit: (...args: unknown[]) => void };
  dispose: () => void;
}

interface Factories {
  factories: { orderTicket: (symbol: string) => OrderTicketMachine };
  disposeSpy: ReturnType<typeof vi.fn>;
  submitSpy: ReturnType<typeof vi.fn>;
}

function makeFactories(): Factories {
  const disposeSpy = vi.fn();
  const submitSpy = vi.fn();
  const factories = {
    orderTicket: (symbol: string): OrderTicketMachine => {
      return {
        state$: new BehaviorSubject({ symbol, phase: "editing" }),
        intents: { submit: submitSpy },
        dispose: disposeSpy,
      };
    },
  };
  return { factories, disposeSpy, submitSpy };
}
