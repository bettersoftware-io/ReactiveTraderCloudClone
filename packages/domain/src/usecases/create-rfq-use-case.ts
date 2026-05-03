import type { WorkflowPort, CreateRfqRequest } from "../ports/workflowPort.js";
import type { Direction } from "../fx/trade.js";
import { CREDIT_QUANTITY_MULTIPLIER } from "../credit/rfq.js";

export const RFQ_DEFAULT_EXPIRY_SECS = 120;

export interface CreateRfqInput {
  readonly instrumentId: number;
  readonly dealerIds: readonly number[];
  /** UI-scale quantity. Multiplied by CREDIT_QUANTITY_MULTIPLIER before sending to the port. */
  readonly quantity: number;
  readonly direction: Direction;
  readonly expirySecs?: number;
}

export class CreateRfqUseCase {
  constructor(private readonly workflow: WorkflowPort) {}

  async execute(input: CreateRfqInput): Promise<number> {
    const request: CreateRfqRequest = {
      instrumentId: input.instrumentId,
      dealerIds: [...input.dealerIds],
      quantity: input.quantity * CREDIT_QUANTITY_MULTIPLIER,
      direction: input.direction,
      expirySecs: input.expirySecs ?? RFQ_DEFAULT_EXPIRY_SECS,
    };
    return this.workflow.createRfq(request);
  }
}
