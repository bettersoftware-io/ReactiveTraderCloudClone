import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import { CREDIT_QUANTITY_MULTIPLIER } from "../credit/rfq.js";
import { Direction } from "../fx/trade.js";
import type { CreateRfqRequest, WorkflowPort } from "../ports/workflowPort.js";
import {
  CreateRfqUseCase,
  RFQ_DEFAULT_EXPIRY_SECS,
} from "./CreateRfqUseCase.js";

function stubWorkflow(): {
  port: WorkflowPort;
  lastRequest: { current: CreateRfqRequest | null };
} {
  const lastRequest = { current: null as CreateRfqRequest | null };
  const port: WorkflowPort = {
    events: () => {
      throw new Error("not used");
    },
    createRfq: (request) => {
      lastRequest.current = request;
      return of(42);
    },
    cancelRfq: () => of(undefined),
    quote: () => of(undefined),
    pass: () => of(undefined),
    accept: () => of(undefined),
  };
  return { port, lastRequest };
}

describe("CreateRfqUseCase", () => {
  it("multiplies the input quantity by CREDIT_QUANTITY_MULTIPLIER and applies default expiry", async () => {
    const { port, lastRequest } = stubWorkflow();
    const useCase = new CreateRfqUseCase(port);

    const id = await firstValueFrom(
      useCase.execute({
        instrumentId: 7,
        dealerIds: [1, 2, 3],
        quantity: 100,
        direction: Direction.Buy,
      }),
    );

    expect(id).toBe(42);
    expect(lastRequest.current).toEqual({
      instrumentId: 7,
      dealerIds: [1, 2, 3],
      quantity: 100 * CREDIT_QUANTITY_MULTIPLIER,
      direction: Direction.Buy,
      expirySecs: RFQ_DEFAULT_EXPIRY_SECS,
    });
  });

  it("accepts an explicit expirySecs override", async () => {
    const { port, lastRequest } = stubWorkflow();
    const useCase = new CreateRfqUseCase(port);

    await firstValueFrom(
      useCase.execute({
        instrumentId: 7,
        dealerIds: [1],
        quantity: 50,
        direction: Direction.Sell,
        expirySecs: 60,
      }),
    );

    expect(lastRequest.current?.expirySecs).toBe(60);
  });
});
