import { firstValueFrom } from "rxjs";
import { filter, take } from "rxjs/operators";
import { afterEach, vi } from "vitest";

import { defined } from "../__testUtils__/defined.js";
import { describeWorkflowPortContract } from "../ports/__contracts__/WorkflowPortContract.js";
import type { RfqEvent } from "../ports/workflowPort.js";
import { CreditRfqSimulator } from "./CreditRfqSimulator.js";
import { DEALERS_CATALOG } from "./DealerSimulator.js";

afterEach(() => {
  return vi.useRealTimers();
});

describeWorkflowPortContract("CreditRfqSimulator", () => {
  // makeHarness() is called once per it() — fresh simulator and fake timers each time.
  vi.useFakeTimers();
  const port = new CreditRfqSimulator(DEALERS_CATALOG);

  /**
   * Creates an RFQ using dealerId=0 (J.P. Morgan) and returns the
   * auto-generated rfqId plus the first quoteId emitted by the simulator.
   */
  async function createRfqAndGetQuoteId(): Promise<number> {
    const events$ = port.events();
    const quoteCreatedPromise = firstValueFrom(
      events$.pipe(
        filter((e: RfqEvent) => {
          return e.type === "quoteCreated";
        }),
        take(1),
      ),
    );

    await firstValueFrom(
      port.createRfq({
        instrumentId: 1,
        dealerIds: [defined(DEALERS_CATALOG[0]).id],
        quantity: 1000,
        direction: "Buy" as never,
        expirySecs: 60,
      }),
    );
    await vi.advanceTimersByTimeAsync(0);

    const event = await quoteCreatedPromise;
    return (event as QuoteCreatedEvent).payload.id;
  }

  return {
    port,
    driver: {
      // Invariant 1: ackCreateRfq — createRfq is synchronous inside defer+of;
      // advancing timers by 0 drains any pending microtasks.
      ackCreateRfq: async () => {
        await vi.advanceTimersByTimeAsync(0);
      },

      // Invariant 2: trigger an rfqCreated event on the live Subject.
      emitCreatedEvent: async (_rfqId: number) => {
        void port
          .createRfq({
            instrumentId: 1,
            dealerIds: [defined(DEALERS_CATALOG[0]).id],
            quantity: 1000,
            direction: "Buy" as never,
            expirySecs: 60,
          })
          .subscribe();
        await vi.advanceTimersByTimeAsync(0);
      },

      // Invariant 3: emit a quoteAccepted event.
      // Steps: createRfq → capture quoteId → quote (give it a price) → accept.
      emitAcceptedEvent: async () => {
        const quoteId = await createRfqAndGetQuoteId();
        // Move the quote to pendingWithPrice so accept() can proceed
        await firstValueFrom(port.quote({ quoteId, price: 100 }));
        await vi.advanceTimersByTimeAsync(0);
        // Accept the quote — simulator emits quoteAccepted on events$
        await firstValueFrom(port.accept(quoteId));
        await vi.advanceTimersByTimeAsync(0);
      },

      ackAccept: async () => {
        await vi.advanceTimersByTimeAsync(0);
      },
    },
    teardown: () => {
      return vi.useRealTimers();
    },
  };
});

interface QuoteCreatedEvent {
  type: "quoteCreated";
  payload: { id: number };
}
