import { useCallback } from "react";
import { Direction, CREDIT_QUANTITY_MULTIPLIER } from "@rtc/domain";
import { useServices } from "../../services/service-provider";

interface CreateRfqParams {
  instrumentId: number;
  dealerIds: number[];
  quantity: number; // raw user input (will be multiplied)
  direction: Direction;
}

export function useCreateRfq() {
  const { workflow } = useServices();

  const createRfq = useCallback(
    async (params: CreateRfqParams): Promise<number> => {
      return workflow.createRfq({
        instrumentId: params.instrumentId,
        dealerIds: params.dealerIds,
        quantity: params.quantity * CREDIT_QUANTITY_MULTIPLIER,
        direction: params.direction,
        expirySecs: 120,
      });
    },
    [workflow],
  );

  return createRfq;
}
