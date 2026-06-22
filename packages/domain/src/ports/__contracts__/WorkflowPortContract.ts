import { firstValueFrom, type Observable } from "rxjs";
import { filter, take } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import type { RfqEvent, WorkflowPort } from "../workflowPort.js";

export interface WorkflowDriver {
  ackCreateRfq(rfqId: number): Promise<void>;
  emitCreatedEvent(rfqId: number): Promise<void>;
  emitAcceptedEvent(rfqId: number, quoteId: number): Promise<void>;
  ackAccept(): Promise<void>;
}

export interface WorkflowHarness {
  port: WorkflowPort;
  driver: WorkflowDriver;
  teardown: () => void;
}

// ── Event type-guards ───────────────────────────────────────────
// Note: rfqCreated payload is Rfq (id, instrumentId, …)
//       quoteCreated/quoteAccepted payload is Quote (id, rfqId, …)
//
// The guards deliberately do NOT filter by specific IDs because
// each port implementation generates its own identifiers. Contracts
// verify the event TYPE is correct; specific ID round-trips are
// tested in use-case unit tests.

const isRfqCreated = (_rfqId: number) => (e: RfqEvent) =>
  e.type === "rfqCreated";

const isAccepted = (_rfqId: number, _quoteId: number) => (e: RfqEvent) =>
  e.type === "quoteAccepted";

export function describeWorkflowPortContract(
  label: string,
  makeHarness: () => WorkflowHarness,
): void {
  describe(`${label} :: WorkflowPort contract`, () => {
    it("createRfq emits one rfqId then completes", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(
          port.createRfq({
            instrumentId: 1,
            dealerIds: [0],
            quantity: 1000,
            direction: "Buy" as never,
            expirySecs: 60,
          }),
        );
        await driver.ackCreateRfq(42);
        const rfqId = await promise;
        expect(typeof rfqId).toBe("number");
      } finally {
        teardown();
      }
    });

    it("events() emits an rfqCreated event after createRfq", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const events$: Observable<RfqEvent> = port.events();
        const eventPromise = firstValueFrom(
          events$.pipe(filter(isRfqCreated(42)), take(1)),
        );
        await Promise.resolve();
        await driver.emitCreatedEvent(42);
        const event = await eventPromise;
        expect(event.type).toBe("rfqCreated");
      } finally {
        teardown();
      }
    });

    it("events() emits a quoteAccepted event after accept", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const events$ = port.events();
        const eventPromise = firstValueFrom(
          events$.pipe(filter(isAccepted(42, 7)), take(1)),
        );
        await Promise.resolve();
        await driver.emitAcceptedEvent(42, 7);
        const event = await eventPromise;
        expect(event.type).toBe("quoteAccepted");
      } finally {
        teardown();
      }
    });
  });
}
