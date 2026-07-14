import { BehaviorSubject } from "rxjs";
import { vi } from "vitest";

interface FakeOrderTicketIntents {
  submit: (...args: unknown[]) => void;
}

/** Fake shared-machine presenter (manifest `{ machine: true }`), structurally
 * matching `InstrumentableMachine`. */
export class FakeOrderTicket {
  state$ = new BehaviorSubject({ phase: "editing" });

  intents: FakeOrderTicketIntents = { submit: vi.fn() };

  dispose: () => void = vi.fn();
}
