import { useCallback } from "react";
import { type Direction, CreateRfqUseCase } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export interface CreateRfqParams {
  instrumentId: number;
  dealerIds: number[];
  quantity: number;
  direction: Direction;
}

export function useCreateRfq(): (params: CreateRfqParams) => Promise<number> {
  const { workflow } = useServices();
  return useCallback(
    (params) => new CreateRfqUseCase(workflow).execute(params),
    [workflow],
  );
}
