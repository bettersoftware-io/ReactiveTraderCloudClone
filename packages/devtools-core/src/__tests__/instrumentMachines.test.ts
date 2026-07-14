import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
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
